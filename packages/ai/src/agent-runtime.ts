import { randomUUID } from "node:crypto";
import { can, assertBudget, requiresCheckpoint } from "@oryon/core";
import { AgentRunStepSchema, type AgentToolDefinition } from "@oryon/contracts/agents-automation";
import { AgentRepository, GraphRepository, PermissionRepository, WorkObjectRepository } from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";

export type AgentExecutionResult = { state: "SUCCEEDED" | "WAITING" | "FAILED" | "CANCELLED"; output: unknown; checkpointRequired?: boolean };

type PlannedTool = { toolKey: string; input: Record<string, unknown>; sensitive?: boolean };

type RollbackEntry = { toolKey: string; input: Record<string, unknown>; rollback: Record<string, unknown> };

const db = getPrisma();
const agents = new AgentRepository(db);
const permissions = new PermissionRepository();
const work = new WorkObjectRepository(db);
const graph = new GraphRepository(db);

const WRITE_TOOLS = new Set(["work_object.create", "work_object.update", "work_object.status", "graph.edge.create"]);

function readTools(tools: AgentToolDefinition[]): string {
	return tools.map((tool) => `${tool.key}: ${tool.description}${tool.sensitive ? " [SENSITIVE]" : ""}`).join("\n");
}

async function planWithModel(agent: Awaited<ReturnType<AgentRepository["findById"]>>, input: Record<string, unknown>): Promise<PlannedTool[]> {
	const apiKey = process.env.ORYON_AI_API_KEY;
	const model = process.env.ORYON_AI_MODEL;
	if (!apiKey || !model || !agent) return Array.isArray(input.toolCalls) ? (input.toolCalls as PlannedTool[]) : [];
	const allowed = new Set(agent.tools.map((tool) => tool.key));
	const instructions = `You are an OryonOS enterprise agent. Return ONLY JSON array of tool calls. Use only declared tools. Tool call shape: {"toolKey":"...","input":{...}}.\nDeclared tools:\n${readTools(agent.tools)}\nTask input:${JSON.stringify(input)}`;
	const response = await fetch(`${(process.env.ORYON_AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: instructions }] }) });
	if (!response.ok) throw new Error(`AI_PROVIDER_${response.status}`);
	const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
	const content = payload.choices?.[0]?.message?.content;
	if (!content) return [];
	const parsed = JSON.parse(content) as unknown;
	const calls = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { tools?: unknown }).tools) ? (parsed as { tools: unknown[] }).tools : [];
	return calls.flatMap((call) => {
		if (typeof call !== "object" || call === null) return [];
		const value = call as Record<string, unknown>;
		const toolKey = typeof value.toolKey === "string" ? value.toolKey : "";
		const toolInput = value.input;
		if (!allowed.has(toolKey) || typeof toolInput !== "object" || toolInput === null || Array.isArray(toolInput)) return [];
		return [{ toolKey, input: toolInput as Record<string, unknown> }];
	});
}

function toolDefinition(agent: NonNullable<Awaited<ReturnType<AgentRepository["findById"]>>>, key: string): AgentToolDefinition {
	const found = agent.tools.find((tool) => tool.key === key) as AgentToolDefinition | undefined;
	if (!found) throw new Error("TOOL_NOT_ALLOWED");
	return found;
}

async function executeTool(orgId: string, principalId: string, actorId: string, agent: NonNullable<Awaited<ReturnType<AgentRepository["findById"]>>>, call: PlannedTool): Promise<{ output: unknown; read?: unknown; write?: unknown; rollback?: RollbackEntry }> {
	const definition = toolDefinition(agent, call.toolKey);
	const resource = { orgId, type: call.toolKey.startsWith("work_object.") ? "work_object" : call.toolKey.startsWith("graph.") ? "edge" : call.toolKey, id: typeof call.input.id === "string" ? call.input.id : "__collection__", workspaceId: typeof call.input.workspaceId === "string" ? call.input.workspaceId : null, projectId: null, ownerId: null, teamId: null, classification: null };
	const snapshot = await permissions.getSnapshot(orgId, principalId, resource.type, resource.id, null);
	if (!can({ orgId, ...snapshot }, resource, WRITE_TOOLS.has(call.toolKey) ? "update" : "read").allowed) throw new Error("PERMISSION_DENIED");
	if (call.toolKey === "work_object.get") {
		if (typeof call.input.id !== "string") throw new Error("VALIDATION_FAILED");
		const row = await work.findById(orgId, call.input.id);
		if (!row) throw new Error("NOT_FOUND");
		return { output: { id: row.id, title: row.title, description: row.description, status: row.status, priority: row.priority, ownerId: row.ownerId, workspaceId: row.workspaceId, classification: row.classification }, read: { type: "work_object", id: row.id } };
	}
	if (call.toolKey === "work_object.create") {
		const id = await work.create(orgId, actorId, call.input as never);
		return { output: { id }, write: { type: "work_object", id }, rollback: { toolKey: call.toolKey, input: { id }, rollback: { operation: "work_object.soft_delete", id } } };
	}
	if (call.toolKey === "work_object.update" || call.toolKey === "work_object.status") {
		if (typeof call.input.id !== "string") throw new Error("VALIDATION_FAILED");
		const before = await work.findById(orgId, call.input.id);
		if (!before) throw new Error("NOT_FOUND");
		const patch = { ...call.input } as Record<string, unknown>;
		delete patch.id;
		await work.update(orgId, actorId, call.input.id, patch as never);
		const rollbackPatch: Record<string, unknown> = { title: before.title, description: before.description, status: before.status, priority: before.priority, ownerId: before.ownerId, workspaceId: before.workspaceId, startAt: before.startAt?.toISOString() ?? null, dueAt: before.dueAt?.toISOString() ?? null, progress: before.progress, probability: before.probability, externalRef: before.externalRef, severity: before.severity, classification: before.classification, tags: before.tags, customFields: before.customFields };
		return { output: { id: call.input.id, updated: true }, write: { type: "work_object", id: call.input.id }, rollback: { toolKey: call.toolKey, input: { id: call.input.id }, rollback: { operation: "work_object.update", id: call.input.id, patch: rollbackPatch } } };
	}
	if (call.toolKey === "work_object.list") {
		const rows = await work.list({ orgId, workspaceId: typeof call.input.workspaceId === "string" ? call.input.workspaceId : undefined, typeKey: typeof call.input.typeKey === "string" ? call.input.typeKey : undefined, status: typeof call.input.status === "string" ? call.input.status : undefined, ownerId: typeof call.input.ownerId === "string" ? call.input.ownerId : undefined, limit: typeof call.input.limit === "number" ? call.input.limit : 50 });
		return { output: rows.map((row) => ({ id: row.id, title: row.title, status: row.status, priority: row.priority, ownerId: row.ownerId })) };
	}
	if (call.toolKey === "graph.traverse") {
		if (typeof call.input.rootId !== "string") throw new Error("VALIDATION_FAILED");
		const result = await graph.traverse(orgId, { rootType: "work_object", rootId: call.input.rootId, depth: typeof call.input.depth === "number" ? call.input.depth : 3, direction: call.input.direction === "in" || call.input.direction === "both" ? call.input.direction : "out", relation: typeof call.input.relation === "string" ? call.input.relation : "*", includeTimeline: Boolean(call.input.includeTimeline) });
		return { output: result, read: { type: "work_object", id: call.input.rootId } };
	}
	throw new Error("TOOL_NOT_IMPLEMENTED");
}

export async function executeAgentRun(orgId: string, runId: string): Promise<AgentExecutionResult> {
	const run = await agents.findRun(orgId, runId);
	if (!run) throw new Error("NOT_FOUND");
	const agent = run.agent;
	const steps = (run.stepsJson as unknown[]).slice();
	const toolCalls = (run.toolCallsJson as unknown[]).slice();
	const readResources = (run.readResources as unknown[]).slice();
	const writtenResources = (run.writtenResources as unknown[]).slice();
	const rollbackEntries: RollbackEntry[] = Array.isArray(run.outputJson) ? [] : ((run.outputJson as { rollback?: RollbackEntry[] } | null)?.rollback ?? []);
	const planned = await planWithModel(agent, run.inputJson as Record<string, unknown>);
	steps.push(AgentRunStepSchema.parse({ index: steps.length, kind: "PLAN", status: "SUCCEEDED", startedAt: run.startedAt.toISOString(), finishedAt: new Date().toISOString(), output: planned }));
	for (const plannedCall of planned) {
		const definition = toolDefinition(agent, plannedCall.toolKey);
		const sensitive = Boolean(plannedCall.sensitive || definition.sensitive || WRITE_TOOLS.has(plannedCall.toolKey));
		const callId = randomUUID();
		toolCalls.push({ id: callId, toolKey: plannedCall.toolKey, status: "PLANNED", sensitive, input: plannedCall.input, output: null, startedAt: null, finishedAt: null, error: null });
		if (requiresCheckpoint(agent.checkpointPolicy, sensitive)) {
			const index = toolCalls.length - 1;
			(toolCalls[index] as Record<string, unknown>).status = "WAITING_APPROVAL";
			steps.push(AgentRunStepSchema.parse({ index: steps.length, kind: "CHECKPOINT", toolKey: plannedCall.toolKey, status: "WAITING", startedAt: new Date().toISOString(), finishedAt: null, input: plannedCall.input }));
			await agents.appendRunState(orgId, runId, { state: "WAITING", checkpointState: "WAITING", steps, toolCalls, readResources, writtenResources, output: { rollback: rollbackEntries } });
			return { state: "WAITING", checkpointRequired: true, output: { runId, toolKey: plannedCall.toolKey } };
		}
		const index = toolCalls.length - 1;
		(toolCalls[index] as Record<string, unknown>).status = "RUNNING";
		(toolCalls[index] as Record<string, unknown>).startedAt = new Date().toISOString();
		await agents.appendRunState(orgId, runId, { steps, toolCalls, readResources, writtenResources, output: { rollback: rollbackEntries } });
		try {
			const result = await executeTool(orgId, agent.principalId, run.triggeredBy ?? agent.principalId, agent, plannedCall);
			(toolCalls[index] as Record<string, unknown>).status = "SUCCEEDED";
			(toolCalls[index] as Record<string, unknown>).output = result.output;
			(toolCalls[index] as Record<string, unknown>).finishedAt = new Date().toISOString();
			if (result.read) readResources.push(result.read);
			if (result.write) writtenResources.push(result.write);
			if (result.rollback) rollbackEntries.push(result.rollback);
			steps.push(AgentRunStepSchema.parse({ index: steps.length, kind: "TOOL", toolKey: plannedCall.toolKey, status: "SUCCEEDED", startedAt: (toolCalls[index] as { startedAt: string }).startedAt, finishedAt: new Date().toISOString(), input: plannedCall.input, output: result.output }));
			await agents.appendRunState(orgId, runId, { steps, toolCalls, readResources, writtenResources, output: { rollback: rollbackEntries } });
		} catch (error) {
			(toolCalls[index] as Record<string, unknown>).status = "FAILED";
			(toolCalls[index] as Record<string, unknown>).error = error instanceof Error ? error.message : "TOOL_FAILED";
			(toolCalls[index] as Record<string, unknown>).finishedAt = new Date().toISOString();
			await agents.appendRunState(orgId, runId, { state: "FAILED", steps, toolCalls, readResources, writtenResources, output: { rollback: rollbackEntries }, finishedAt: new Date() });
			return { state: "FAILED", output: { error: error instanceof Error ? error.message : "TOOL_FAILED" } };
		}
	}
	await agents.appendRunState(orgId, runId, { state: "SUCCEEDED", steps, toolCalls, readResources, writtenResources, output: { rollback: rollbackEntries }, rollbackToken: randomUUID(), finishedAt: new Date() });
	return { state: "SUCCEEDED", output: { runId, writtenResources } };
}

export async function rollbackAgentRun(orgId: string, actorId: string, runId: string): Promise<void> {
	const run = await agents.findRun(orgId, runId);
	if (!run) throw new Error("NOT_FOUND");
	if (run.state === "ROLLED_BACK") return;
	const entries = ((run.outputJson as { rollback?: RollbackEntry[] } | null)?.rollback ?? []).slice().reverse();
	for (const entry of entries) {
		if (entry.rollback.operation === "work_object.soft_delete" && typeof entry.rollback.id === "string") await work.softDelete(orgId, actorId, entry.rollback.id);
		if (entry.rollback.operation === "work_object.update" && typeof entry.rollback.id === "string" && typeof entry.rollback.patch === "object" && entry.rollback.patch !== null) await work.update(orgId, actorId, entry.rollback.id, entry.rollback.patch as never);
	}
	await agents.appendRunState(orgId, runId, { state: "ROLLED_BACK", rolledBackAt: new Date(), finishedAt: new Date() });
}

export function validateAgentBudget(capCents: bigint | null, spentCents: bigint, nextCostCents: bigint): void { assertBudget(capCents, spentCents, nextCostCents); }
