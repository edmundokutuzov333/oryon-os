import { randomUUID } from "node:crypto";
import { assertBudget, can, requiresCheckpoint } from "@oryon/core";
import {
	AgentRunStepSchema,
	AgentToolDefinitionSchema,
	type AgentToolDefinition,
} from "@oryon/contracts/agents-automation";
import type { GraphRelation } from "@oryon/contracts/graph";
import {
	AgentRepository,
	GraphRepository,
	PermissionRepository,
	WorkObjectRepository,
} from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";

export type AgentExecutionResult = {
	state: "SUCCEEDED" | "WAITING" | "FAILED" | "CANCELLED";
	output: unknown;
	checkpointRequired?: boolean;
};
type PlannedTool = {
	toolKey: string;
	input: Record<string, unknown>;
	sensitive?: boolean;
};
type RollbackEntry = {
	toolKey: string;
	input: Record<string, unknown>;
	rollback: Record<string, unknown>;
};
const db = getPrisma();
const agents = new AgentRepository(db);
const permissions = new PermissionRepository();
const work = new WorkObjectRepository(db);
const graph = new GraphRepository(db);
const WRITE_TOOLS = new Set([
	"work_object.create",
	"work_object.update",
	"work_object.status",
	"graph.edge.create",
]);
function agentTools(value: unknown): AgentToolDefinition[] {
	return AgentToolDefinitionSchema.array().parse(value);
}
function toolDefinition(
	agent: NonNullable<Awaited<ReturnType<AgentRepository["findById"]>>>,
	key: string,
): AgentToolDefinition {
	const found = agentTools(agent.tools).find((tool) => tool.key === key);
	if (!found) throw new Error("TOOL_NOT_ALLOWED");
	return found;
}
function readTools(tools: AgentToolDefinition[]): string {
	return tools
		.map(
			(tool) =>
				`${tool.key}: ${tool.description}${tool.sensitive ? " [SENSITIVE]" : ""}`,
		)
		.join("\n");
}
async function planWithModel(
	agent: Awaited<ReturnType<AgentRepository["findById"]>>,
	input: Record<string, unknown>,
): Promise<PlannedTool[]> {
	if (!agent) return [];
	const tools = agentTools(agent.tools);
	const allowed = new Set(tools.map((tool) => tool.key));
	const key = process.env.ORYON_AI_API_KEY;
	const model = process.env.ORYON_AI_MODEL;
	if (!key || !model) {
		if (!Array.isArray(input.toolCalls)) return [];
		return input.toolCalls.flatMap((value) => {
			if (typeof value !== "object" || value === null) return [];
			const call = value as Record<string, unknown>;
			if (
				typeof call.toolKey !== "string" ||
				!allowed.has(call.toolKey) ||
				typeof call.input !== "object" ||
				call.input === null ||
				Array.isArray(call.input)
			)
				return [];
			return [
				{
					toolKey: call.toolKey,
					input: call.input as Record<string, unknown>,
					sensitive:
						typeof call.sensitive === "boolean" ? call.sensitive : undefined,
				},
			];
		});
	}
	const base = (
		process.env.ORYON_AI_BASE_URL ?? "https://api.openai.com/v1"
	).replace(/\/$/, "");
	const response = await fetch(`${base}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${key}`,
		},
		body: JSON.stringify({
			model,
			temperature: 0,
			response_format: { type: "json_object" },
			messages: [
				{
					role: "system",
					content: `${agent.systemPrompt}\n\nReturn JSON object {"tools":[{"toolKey":"...","input":{}}]}. Use only declared tools.\n${readTools(tools)}`,
				},
				{ role: "user", content: JSON.stringify(input) },
			],
		}),
	});
	if (!response.ok) throw new Error(`AI_PROVIDER_${response.status}`);
	const payload = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const content = payload.choices?.[0]?.message?.content;
	if (!content) return [];
	const parsed = JSON.parse(content) as unknown;
	const calls =
		typeof parsed === "object" &&
		parsed !== null &&
		Array.isArray((parsed as { tools?: unknown }).tools)
			? (parsed as { tools: unknown[] }).tools
			: [];
	return calls.flatMap((value) => {
		if (typeof value !== "object" || value === null) return [];
		const call = value as Record<string, unknown>;
		const toolKey = typeof call.toolKey === "string" ? call.toolKey : "";
		const inputValue = call.input;
		if (
			!allowed.has(toolKey) ||
			typeof inputValue !== "object" ||
			inputValue === null ||
			Array.isArray(inputValue)
		)
			return [];
		return [{ toolKey, input: inputValue as Record<string, unknown> }];
	});
}
export async function executeAgentTool(
	orgId: string,
	principalId: string,
	actorId: string,
	agentId: string,
	call: PlannedTool,
): Promise<{
	output: unknown;
	read?: unknown;
	write?: unknown;
	rollback?: RollbackEntry;
}> {
	const agent = await agents.findById(orgId, agentId);
	if (!agent) throw new Error("NOT_FOUND");
	const definition = toolDefinition(agent, call.toolKey);
	const isWrite = WRITE_TOOLS.has(call.toolKey);
	const resource = {
		orgId,
		type: call.toolKey.startsWith("work_object.")
			? "work_object"
			: call.toolKey.startsWith("graph.")
				? "edge"
				: call.toolKey,
		id: typeof call.input.id === "string" ? call.input.id : "__collection__",
		workspaceId:
			typeof call.input.workspaceId === "string"
				? call.input.workspaceId
				: null,
		projectId: null,
		ownerId: null,
		teamId: null,
		classification: null,
	};
	const snapshot = await permissions.getSnapshot(
		orgId,
		principalId,
		resource.type,
		resource.id,
		null,
	);
	if (
		!can({ orgId, ...snapshot }, resource, isWrite ? "update" : "read").allowed
	)
		throw new Error("PERMISSION_DENIED");
	if (
		definition.inputSchema &&
		Object.keys(definition.inputSchema).some(
			(key) =>
				definition.inputSchema[key] === "required" &&
				call.input[key] === undefined,
		)
	)
		throw new Error("VALIDATION_FAILED");
	if (call.toolKey === "work_object.get") {
		if (typeof call.input.id !== "string") throw new Error("VALIDATION_FAILED");
		const row = await work.findById(orgId, call.input.id);
		if (!row) throw new Error("NOT_FOUND");
		return {
			output: {
				id: row.id,
				title: row.title,
				description: row.description,
				status: row.status,
				priority: row.priority,
				ownerId: row.ownerId,
				workspaceId: row.workspaceId,
				classification: row.classification,
			},
			read: { type: "work_object", id: row.id },
		};
	}
	if (call.toolKey === "work_object.list") {
		const rows = await work.list({
			orgId,
			workspaceId:
				typeof call.input.workspaceId === "string"
					? call.input.workspaceId
					: undefined,
			typeKey:
				typeof call.input.typeKey === "string" ? call.input.typeKey : undefined,
			status:
				typeof call.input.status === "string" ? call.input.status : undefined,
			ownerId:
				typeof call.input.ownerId === "string" ? call.input.ownerId : undefined,
			limit: typeof call.input.limit === "number" ? call.input.limit : 50,
		});
		return {
			output: rows.map((row) => ({
				id: row.id,
				title: row.title,
				status: row.status,
				priority: row.priority,
				ownerId: row.ownerId,
			})),
			read: { type: "work_object", id: "__collection__" },
		};
	}
	if (call.toolKey === "work_object.create") {
		const id = await work.create(orgId, actorId, call.input as never);
		return {
			output: { id },
			write: { type: "work_object", id },
			rollback: {
				toolKey: call.toolKey,
				input: { id },
				rollback: { operation: "work_object.soft_delete", id },
			},
		};
	}
	if (
		call.toolKey === "work_object.update" ||
		call.toolKey === "work_object.status"
	) {
		if (typeof call.input.id !== "string") throw new Error("VALIDATION_FAILED");
		const before = await work.findById(orgId, call.input.id);
		if (!before) throw new Error("NOT_FOUND");
		const patch = { ...call.input };
		delete patch.id;
		await work.update(orgId, actorId, call.input.id, patch as never);
		const rollbackPatch = {
			title: before.title,
			description: before.description,
			status: before.status,
			priority: before.priority,
			ownerId: before.ownerId,
			workspaceId: before.workspaceId,
			startAt: before.startAt?.toISOString() ?? null,
			dueAt: before.dueAt?.toISOString() ?? null,
			progress: before.progress,
			probability: before.probability,
			externalRef: before.externalRef,
			severity: before.severity,
			classification: before.classification,
			tags: before.tags,
			customFields: before.customFields,
		};
		return {
			output: { id: call.input.id, updated: true },
			write: { type: "work_object", id: call.input.id },
			rollback: {
				toolKey: call.toolKey,
				input: { id: call.input.id },
				rollback: {
					operation: "work_object.update",
					id: call.input.id,
					patch: rollbackPatch,
				},
			},
		};
	}
	if (call.toolKey === "graph.traverse") {
		if (typeof call.input.rootId !== "string")
			throw new Error("VALIDATION_FAILED");
		const result = await graph.traverse(orgId, {
			rootType: "work_object",
			rootId: call.input.rootId,
			depth:
				typeof call.input.depth === "number"
					? Math.min(call.input.depth, 10)
					: 3,
			direction:
				call.input.direction === "in" || call.input.direction === "both"
					? call.input.direction
					: "out",
			relation: (typeof call.input.relation === "string"
				? call.input.relation
				: "*") as GraphRelation | "*",
			includeTimeline: Boolean(call.input.includeTimeline),
		});
		return {
			output: result,
			read: { type: "work_object", id: call.input.rootId },
		};
	}
	throw new Error("TOOL_NOT_IMPLEMENTED");
}
export async function executeAgentRun(
	orgId: string,
	runId: string,
): Promise<AgentExecutionResult> {
	const run = await agents.findRun(orgId, runId);
	if (!run) throw new Error("NOT_FOUND");
	const agent = run.agent;
	const steps: unknown[] = (
		Array.isArray(run.stepsJson) ? run.stepsJson : []
	).slice();
	const toolCalls: unknown[] = (
		Array.isArray(run.toolCallsJson) ? run.toolCallsJson : []
	).slice();
	const readResources: unknown[] = (
		Array.isArray(run.readResources) ? run.readResources : []
	).slice();
	const writtenResources: unknown[] = (
		Array.isArray(run.writtenResources) ? run.writtenResources : []
	).slice();
	const rollbackEntries: RollbackEntry[] = (
		(run.outputJson as { rollback?: RollbackEntry[] } | null)?.rollback ?? []
	).slice();
	const planned = await planWithModel(
		agent,
		run.inputJson as Record<string, unknown>,
	);
	if (planned.length === 0) {
		const now = new Date().toISOString();
		steps.push(
			AgentRunStepSchema.parse({
				index: steps.length,
				kind: "OUTPUT",
				status: "SUCCEEDED",
				startedAt: now,
				finishedAt: now,
				output: { completed: true },
			}),
		);
		await agents.appendRunState(orgId, runId, {
			state: "SUCCEEDED",
			steps,
			toolCalls,
			readResources,
			writtenResources,
			output: { rollback: rollbackEntries, result: { completed: true } },
			rollbackToken: randomUUID(),
			finishedAt: new Date(),
			costCents: run.costCents ?? null,
		});
		return { state: "SUCCEEDED", output: { completed: true } };
	}
	let checkpointConsumed = run.checkpointState === "APPROVED";
	let spent = run.costCents ?? 0n;
	const stepCost = BigInt(process.env.ORYON_AGENT_TOOL_COST_CENTS ?? "1");
	const planStarted = new Date().toISOString();
	steps.push(
		AgentRunStepSchema.parse({
			index: steps.length,
			kind: "PLAN",
			status: "SUCCEEDED",
			startedAt: planStarted,
			finishedAt: new Date().toISOString(),
			output: planned,
		}),
	);
	for (const call of planned) {
		const definition = toolDefinition(agent, call.toolKey);
		const sensitive = Boolean(
			call.sensitive || definition.sensitive || WRITE_TOOLS.has(call.toolKey),
		);
		const existing = toolCalls.find(
			(entry) =>
				typeof entry === "object" &&
				entry !== null &&
				(entry as Record<string, unknown>).toolKey === call.toolKey &&
				JSON.stringify((entry as Record<string, unknown>).input) ===
					JSON.stringify(call.input),
		) as Record<string, unknown> | undefined;
		if (existing?.status === "SUCCEEDED") continue;
		const target =
			existing ??
			({
				id: randomUUID(),
				toolKey: call.toolKey,
				status: "PLANNED",
				sensitive,
				input: call.input,
				output: null,
				startedAt: null,
				finishedAt: null,
				error: null,
			} as Record<string, unknown>);
		if (!existing) toolCalls.push(target);
		if (
			!checkpointConsumed &&
			requiresCheckpoint(agent.checkpointPolicy, sensitive)
		) {
			target.status = "WAITING_APPROVAL";
			const now = new Date().toISOString();
			steps.push(
				AgentRunStepSchema.parse({
					index: steps.length,
					kind: "CHECKPOINT",
					toolKey: call.toolKey,
					status: "WAITING",
					startedAt: now,
					finishedAt: null,
					input: call.input,
				}),
			);
			await agents.appendRunState(orgId, runId, {
				state: "WAITING",
				checkpointState: "WAITING",
				steps,
				toolCalls,
				readResources,
				writtenResources,
				output: { rollback: rollbackEntries },
				costCents: spent,
			});
			return {
				state: "WAITING",
				checkpointRequired: true,
				output: { runId, toolKey: call.toolKey },
			};
		}
		checkpointConsumed = false;
		assertBudget(agent.budgetCapCents, spent, stepCost);
		target.status = "RUNNING";
		target.startedAt = new Date().toISOString();
		await agents.appendRunState(orgId, runId, {
			state: "RUNNING",
			checkpointState: null,
			steps,
			toolCalls,
			readResources,
			writtenResources,
			output: { rollback: rollbackEntries },
			costCents: spent + stepCost,
		});
		try {
			const result = await executeAgentTool(
				orgId,
				agent.principalId,
				run.triggeredBy ?? agent.principalId,
				agent.id,
				call,
			);
			spent += stepCost;
			target.status = "SUCCEEDED";
			target.output = result.output;
			target.finishedAt = new Date().toISOString();
			if (result.read) readResources.push(result.read);
			if (result.write) writtenResources.push(result.write);
			if (result.rollback) rollbackEntries.push(result.rollback);
			steps.push(
				AgentRunStepSchema.parse({
					index: steps.length,
					kind: "TOOL",
					toolKey: call.toolKey,
					status: "SUCCEEDED",
					startedAt: String(target.startedAt),
					finishedAt: new Date().toISOString(),
					input: call.input,
					output: result.output,
				}),
			);
			await agents.appendRunState(orgId, runId, {
				steps,
				toolCalls,
				readResources,
				writtenResources,
				output: { rollback: rollbackEntries },
				costCents: spent,
			});
		} catch (error) {
			target.status = "FAILED";
			target.error = error instanceof Error ? error.message : "TOOL_FAILED";
			target.finishedAt = new Date().toISOString();
			await agents.appendRunState(orgId, runId, {
				state: "FAILED",
				steps,
				toolCalls,
				readResources,
				writtenResources,
				output: { rollback: rollbackEntries },
				costCents: spent,
				finishedAt: new Date(),
			});
			return { state: "FAILED", output: { error: target.error } };
		}
	}
	await agents.appendRunState(orgId, runId, {
		state: "SUCCEEDED",
		steps,
		toolCalls,
		readResources,
		writtenResources,
		output: { rollback: rollbackEntries, result: { completed: true } },
		rollbackToken: randomUUID(),
		finishedAt: new Date(),
		costCents: spent,
	});
	return { state: "SUCCEEDED", output: { runId, writtenResources } };
}
export async function rollbackAgentRun(
	orgId: string,
	actorId: string,
	runId: string,
): Promise<void> {
	const run = await agents.findRun(orgId, runId);
	if (!run) throw new Error("NOT_FOUND");
	if (run.state === "ROLLED_BACK") return;
	const entries = (
		(run.outputJson as { rollback?: RollbackEntry[] } | null)?.rollback ?? []
	)
		.slice()
		.reverse();
	for (const entry of entries) {
		if (
			entry.rollback.operation === "work_object.soft_delete" &&
			typeof entry.rollback.id === "string"
		)
			await work.softDelete(orgId, actorId, entry.rollback.id);
		if (
			entry.rollback.operation === "work_object.update" &&
			typeof entry.rollback.id === "string" &&
			typeof entry.rollback.patch === "object" &&
			entry.rollback.patch !== null
		)
			await work.update(
				orgId,
				actorId,
				entry.rollback.id,
				entry.rollback.patch as never,
			);
	}
	await agents.appendRunState(orgId, runId, {
		state: "ROLLED_BACK",
		rolledBackAt: new Date(),
		finishedAt: new Date(),
	});
}
export function validateAgentBudget(
	capCents: bigint | null,
	spentCents: bigint,
	nextCostCents: bigint,
): void {
	assertBudget(capCents, spentCents, nextCostCents);
}
