import type { FastifyInstance, FastifyRequest } from "fastify";
import {
	AgentCreateInputSchema,
	AgentPatchInputSchema,
	AgentRunInputSchema,
	AgentRunResponseSchema,
	AgentStatusUpdateSchema,
	AgentSummarySchema,
	CheckpointDecisionSchema,
	WorkflowCreateInputSchema,
	WorkflowRunInputSchema,
	WorkflowRunResponseSchema,
	WorkflowStateUpdateSchema,
	WorkflowSummarySchema,
} from "@oryon/contracts/agents-automation";
import { can } from "@oryon/core";
import {
	AgentRepository,
	AutomationRepository,
	PermissionRepository,
} from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";
import { rollbackAgentRun } from "@oryon/ai";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";

const db = getPrisma();
const agents = new AgentRepository(db);
const automation = new AutomationRepository(db);
const permissions = new PermissionRepository();
function header(request: FastifyRequest, name: string): string | undefined {
	const value = request.headers[name];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
function orgIdOf(request: FastifyRequest): string {
	const value = header(request, "x-oryon-org");
	if (!value) throw new Error("ORG_HEADER_MISSING");
	return value;
}
function idem(request: FastifyRequest): void {
	if (!header(request, "idempotency-key"))
		throw new Error("IDEMPOTENCY_KEY_MISSING");
}
function token(request: FastifyRequest): string | undefined {
	const bearer = header(request, "authorization");
	if (bearer?.startsWith("Bearer ")) return bearer.slice(7).trim();
	const raw = header(request, "cookie");
	if (!raw) return undefined;
	for (const part of raw.split(";")) {
		const index = part.indexOf("=");
		if (index > 0 && part.slice(0, index).trim() === AUTH_COOKIE_NAME)
			return decodeURIComponent(part.slice(index + 1).trim());
	}
	return undefined;
}
async function session(request: FastifyRequest, orgId: string) {
	const bearer = header(request, "authorization")?.startsWith("Bearer ")
		? "bearer"
		: "session";
	const value = token(request);
	if (!value) throw new Error("UNAUTHENTICATED");
	const current = await authenticate(value, bearer);
	if (current.orgId !== orgId) throw new Error("UNAUTHENTICATED");
	return current;
}
function envelope(request: FastifyRequest, data: unknown) {
	return { data, meta: { requestId: request.id, durationMs: 0 } };
}
function errorEnvelope(
	request: FastifyRequest,
	code: string,
	status: number,
	message: string,
) {
	return {
		error: { code, httpStatus: status, message, requestId: request.id },
	};
}
function failure(error: unknown): {
	code: string;
	status: number;
	message: string;
} {
	const message =
		error instanceof Error ? error.message : "Agent operation failed";
	const map: Record<string, { code: string; status: number }> = {
		ORG_HEADER_MISSING: { code: "ORG_HEADER_MISSING", status: 400 },
		IDEMPOTENCY_KEY_MISSING: { code: "VALIDATION_FAILED", status: 400 },
		UNAUTHENTICATED: { code: "UNAUTHENTICATED", status: 401 },
		PERMISSION_DENIED: { code: "PERMISSION_DENIED", status: 403 },
		NOT_FOUND: { code: "NOT_FOUND", status: 404 },
		CHECKPOINT_NOT_FOUND: { code: "NOT_FOUND", status: 404 },
		PRINCIPAL_NOT_FOUND: { code: "NOT_FOUND", status: 404 },
		TOOL_NOT_ALLOWED: { code: "PERMISSION_DENIED", status: 403 },
		TOOL_NOT_IMPLEMENTED: { code: "VALIDATION_FAILED", status: 400 },
		AI_BUDGET_EXCEEDED: { code: "AI_BUDGET_EXCEEDED", status: 402 },
	};
	const item = map[message] ?? { code: "VALIDATION_FAILED", status: 400 };
	return { ...item, message };
}
async function authorize(
	request: FastifyRequest,
	orgId: string,
	userId: string,
	type: string,
	id: string,
	action: "read" | "create" | "update" | "manage",
) {
	const snapshot = await permissions.getSnapshot(orgId, userId, type, id, null);
	const resource = {
		orgId,
		type,
		id,
		workspaceId: null,
		projectId: null,
		ownerId: null,
		teamId: null,
		classification: null,
	};
	if (!can({ orgId, ...snapshot }, resource, action).allowed)
		throw new Error("PERMISSION_DENIED");
}
function agentResponse(
	row: NonNullable<Awaited<ReturnType<AgentRepository["findById"]>>>,
) {
	return AgentSummarySchema.parse({
		id: row.id,
		key: row.key,
		name: row.name,
		description: row.description,
		principalId: row.principalId,
		modelPolicyId: row.modelPolicyId,
		knowledgeScope: row.knowledgeScope,
		tools: row.tools,
		triggers: row.triggers,
		schedule: row.schedule,
		checkpointPolicy: row.checkpointPolicy,
		budgetCapCents: row.budgetCapCents?.toString() ?? null,
		status: row.status,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	});
}
function runResponse(
	row: NonNullable<Awaited<ReturnType<AgentRepository["findRun"]>>>,
) {
	return AgentRunResponseSchema.parse({
		id: row.id,
		agentId: row.agentId,
		triggeredBy: row.triggeredBy,
		triggerType: row.triggerType,
		state: row.state,
		checkpointState: row.checkpointState,
		checkpointApproverId: row.checkpointApproverId,
		modelKey: row.modelKey,
		inputTokens: row.inputTokens,
		outputTokens: row.outputTokens,
		costCents: row.costCents?.toString() ?? null,
		rollbackToken: row.rollbackToken,
		rolledBackAt: row.rolledBackAt?.toISOString() ?? null,
		steps: row.stepsJson,
		toolCalls: row.toolCallsJson,
		readResources: row.readResources,
		writtenResources: row.writtenResources,
		output: row.outputJson,
		startedAt: row.startedAt.toISOString(),
		finishedAt: row.finishedAt?.toISOString() ?? null,
	});
}
function workflowResponse(
	row: NonNullable<Awaited<ReturnType<AutomationRepository["findById"]>>>,
) {
	return WorkflowSummarySchema.parse({
		id: row.id,
		key: row.key,
		name: row.name,
		description: row.description,
		trigger: row.triggerJson,
		steps: row.stepsJson,
		state: row.state,
		version: row.version,
		createdBy: row.createdBy,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	});
}
function workflowRunResponse(
	row: NonNullable<Awaited<ReturnType<AutomationRepository["findRun"]>>>,
) {
	return WorkflowRunResponseSchema.parse({
		id: row.id,
		workflowId: row.workflowId,
		triggerEventId: row.triggerEventId,
		state: row.state,
		input: row.inputJson,
		stepLog: row.stepLogJson,
		error: row.errorJson,
		waitingOnApprovalId: row.waitingOnApprovalId,
		startedAt: row.startedAt.toISOString(),
		finishedAt: row.finishedAt?.toISOString() ?? null,
	});
}

export async function registerAgentAutomationRoutes(
	app: FastifyInstance,
): Promise<void> {
	app.get("/v1/agents", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			await authorize(
				request,
				orgId,
				current.userId,
				"agent",
				"__collection__",
				"read",
			);
			return reply.send(
				envelope(request, (await agents.list(orgId)).map(agentResponse)),
			);
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.post("/v1/agents", async (request, reply) => {
		try {
			idem(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			await authorize(
				request,
				orgId,
				current.userId,
				"agent",
				"__collection__",
				"create",
			);
			const created = await agents.create(
				orgId,
				current.userId,
				AgentCreateInputSchema.parse(request.body),
			);
			const row = await agents.findById(orgId, created.id);
			if (!row) throw new Error("NOT_FOUND");
			return reply.code(201).send(envelope(request, agentResponse(row)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.patch("/v1/agents/:id", async (request, reply) => {
		try {
			idem(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const id = (request.params as { id: string }).id;
			await authorize(request, orgId, current.userId, "agent", id, "manage");
			await agents.update(
				orgId,
				current.userId,
				id,
				AgentPatchInputSchema.parse(request.body),
			);
			const row = await agents.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			return reply.send(envelope(request, agentResponse(row)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.post("/v1/agents/:id/status", async (request, reply) => {
		try {
			idem(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const id = (request.params as { id: string }).id;
			await authorize(request, orgId, current.userId, "agent", id, "manage");
			await agents.setStatus(
				orgId,
				current.userId,
				id,
				AgentStatusUpdateSchema.parse(request.body).status,
			);
			const row = await agents.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			return reply.send(envelope(request, agentResponse(row)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.post("/v1/agents/:id/runs", async (request, reply) => {
		try {
			idem(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const agentId = (request.params as { id: string }).id;
			await authorize(
				request,
				orgId,
				current.userId,
				"agent",
				agentId,
				"create",
			);
			const created = await agents.createRun(
				orgId,
				current.userId,
				agentId,
				AgentRunInputSchema.parse(request.body),
				request.id,
			);
			const row = await agents.findRun(orgId, created.id);
			if (!row) throw new Error("NOT_FOUND");
			return reply.code(202).send(envelope(request, runResponse(row)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.get("/v1/agent-runs/:id", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await agents.findRun(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(
				request,
				orgId,
				current.userId,
				"agent",
				row.agentId,
				"read",
			);
			return reply.send(envelope(request, runResponse(row)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.post("/v1/agent-runs/:id/checkpoint", async (request, reply) => {
		try {
			idem(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await agents.findRun(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(
				request,
				orgId,
				current.userId,
				"agent",
				row.agentId,
				"manage",
			);
			const input = CheckpointDecisionSchema.parse(request.body);
			await agents.checkpointDecision(
				orgId,
				current.userId,
				id,
				input.decision,
				input.comment,
			);
			const next = await agents.findRun(orgId, id);
			if (!next) throw new Error("NOT_FOUND");
			return reply.send(envelope(request, runResponse(next)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.post("/v1/agent-runs/:id/rollback", async (request, reply) => {
		try {
			idem(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await agents.findRun(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(
				request,
				orgId,
				current.userId,
				"agent",
				row.agentId,
				"manage",
			);
			await rollbackAgentRun(orgId, current.userId, id);
			const next = await agents.findRun(orgId, id);
			if (!next) throw new Error("NOT_FOUND");
			return reply.send(envelope(request, runResponse(next)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.get("/v1/workflows", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			await authorize(
				request,
				orgId,
				current.userId,
				"workflow",
				"__collection__",
				"read",
			);
			return reply.send(
				envelope(request, (await automation.list(orgId)).map(workflowResponse)),
			);
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.post("/v1/workflows", async (request, reply) => {
		try {
			idem(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			await authorize(
				request,
				orgId,
				current.userId,
				"workflow",
				"__collection__",
				"create",
			);
			const created = await automation.create(
				orgId,
				current.userId,
				WorkflowCreateInputSchema.parse(request.body),
			);
			const row = await automation.findById(orgId, created.id);
			if (!row) throw new Error("NOT_FOUND");
			return reply.code(201).send(envelope(request, workflowResponse(row)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.post("/v1/workflows/:id/state", async (request, reply) => {
		try {
			idem(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const id = (request.params as { id: string }).id;
			await authorize(request, orgId, current.userId, "workflow", id, "manage");
			await automation.setState(
				orgId,
				current.userId,
				id,
				WorkflowStateUpdateSchema.parse(request.body).state,
			);
			const row = await automation.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			return reply.send(envelope(request, workflowResponse(row)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.post("/v1/workflows/:id/runs", async (request, reply) => {
		try {
			idem(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const id = (request.params as { id: string }).id;
			await authorize(request, orgId, current.userId, "workflow", id, "create");
			const created = await automation.createRun(
				orgId,
				current.userId,
				id,
				WorkflowRunInputSchema.parse(request.body),
				request.id,
			);
			const row = await automation.findRun(orgId, created.id);
			if (!row) throw new Error("NOT_FOUND");
			return reply.code(202).send(envelope(request, workflowRunResponse(row)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.get("/v1/workflow-runs/:id", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await automation.findRun(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(
				request,
				orgId,
				current.userId,
				"workflow",
				row.workflowId,
				"read",
			);
			return reply.send(envelope(request, workflowRunResponse(row)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
	app.post("/v1/workflow-runs/:id/approve", async (request, reply) => {
		try {
			idem(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await automation.findRun(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(
				request,
				orgId,
				current.userId,
				"workflow",
				row.workflowId,
				"manage",
			);
			const input = CheckpointDecisionSchema.parse(request.body);
			await automation.updateRun(
				orgId,
				id,
				{
					state: input.decision === "APPROVE" ? "RUNNING" : "CANCELLED",
					waitingOnApprovalId: null,
				},
				current.userId,
			);
			const next = await automation.findRun(orgId, id);
			if (!next) throw new Error("NOT_FOUND");
			return reply.send(envelope(request, workflowRunResponse(next)));
		} catch (error) {
			const item = failure(error);
			return reply
				.code(item.status)
				.send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
}
