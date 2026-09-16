import { AgentRunInputSchema, AgentToolDefinitionSchema, WorkflowConditionSchema, WorkflowStepSchema, type WorkflowStep } from "@oryon/contracts/agents-automation";
import { evaluateWorkflowCondition, requiresCheckpoint } from "@oryon/core";
import { executeAgentRun, executeAgentTool } from "@oryon/ai";
import { AgentRepository, AutomationRepository } from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";

const db = getPrisma(); const automation = new AutomationRepository(db); const agents = new AgentRepository(db);
type StepLog = { id: string; status: "RUNNING" | "SUCCEEDED" | "SKIPPED" | "WAITING" | "FAILED"; startedAt: string; finishedAt: string | null; output?: unknown; error?: string; agentRunId?: string; approvalId?: string };
function steps(value: unknown): WorkflowStep[] { return WorkflowStepSchema.array().parse(value); }
function logs(value: unknown): StepLog[] { return Array.isArray(value) ? value.filter((item): item is StepLog => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).id === "string") : []; }
export async function executeWorkflowRun(orgId: string, workflowRunId: string): Promise<void> {
	const run = await automation.findRun(orgId, workflowRunId); if (!run) throw new Error("NOT_FOUND"); const definition = steps(run.workflow.stepsJson); const input = run.inputJson as Record<string, unknown>; const actorId = run.workflow.createdBy; const log = logs(run.stepLogJson);
	for (const step of definition) {
		const existing = log.find((entry) => entry.id === step.id); if (existing?.status === "SUCCEEDED" || existing?.status === "SKIPPED" || existing?.status === "WAITING") return;
		const startedAt = new Date().toISOString(); const current: StepLog = { id: step.id, status: "RUNNING", startedAt, finishedAt: null }; log.splice(0, log.length, ...log.filter((entry) => entry.id !== step.id), current); await automation.updateRun(orgId, workflowRunId, { state: "RUNNING", stepLog: log }, actorId);
		try {
			let output: unknown = null;
			if (step.type === "CONDITION") { if (!step.condition) throw new Error("VALIDATION_FAILED"); const condition = WorkflowConditionSchema.parse(step.condition); const matched = evaluateWorkflowCondition(condition, input); current.status = matched ? "SUCCEEDED" : "SKIPPED"; output = { matched }; }
			else if (step.type === "ACTION") {
				if (!step.action || !step.agentId) throw new Error("VALIDATION_FAILED"); const agent = await agents.findById(orgId, step.agentId); if (!agent) throw new Error("NOT_FOUND"); const tool = AgentToolDefinitionSchema.array().parse(agent.tools).find((item) => item.key === step.action?.toolKey); if (!tool) throw new Error("TOOL_NOT_ALLOWED"); const sensitive = Boolean(step.checkpoint || step.action.sensitive || tool.sensitive);
				if (requiresCheckpoint(agent.checkpointPolicy, sensitive)) { current.status = "WAITING"; current.approvalId = `${workflowRunId}:${step.id}`; await automation.updateRun(orgId, workflowRunId, { state: "WAITING", waitingOnApprovalId: current.approvalId, stepLog: log }, actorId); return; }
				const result = await executeAgentTool(orgId, agent.principalId, actorId, agent.id, { toolKey: step.action.toolKey, input: step.action.input }); output = result.output; current.status = "SUCCEEDED";
			} else if (step.type === "AGENT") {
				if (!step.agentId) throw new Error("VALIDATION_FAILED"); const created = await agents.createRun(orgId, actorId, step.agentId, AgentRunInputSchema.parse({ input, triggerType: "MANUAL" })); current.agentRunId = created.id; const result = await executeAgentRun(orgId, created.id); if (result.state === "WAITING") { current.status = "WAITING"; current.approvalId = created.id; await automation.updateRun(orgId, workflowRunId, { state: "WAITING", waitingOnApprovalId: created.id, stepLog: log }, actorId); return; } if (result.state !== "SUCCEEDED") throw new Error("AGENT_RUN_FAILED"); output = result.output; current.status = "SUCCEEDED";
			} else { current.status = "WAITING"; current.approvalId = `${workflowRunId}:${step.id}`; await automation.updateRun(orgId, workflowRunId, { state: "WAITING", waitingOnApprovalId: current.approvalId, stepLog: log }, actorId); return; }
			current.output = output; current.finishedAt = new Date().toISOString(); await automation.updateRun(orgId, workflowRunId, { stepLog: log }, actorId);
		} catch (error) { current.status = "FAILED"; current.error = error instanceof Error ? error.message : "WORKFLOW_STEP_FAILED"; current.finishedAt = new Date().toISOString(); await automation.updateRun(orgId, workflowRunId, { state: "FAILED", stepLog: log, error: { message: current.error }, finishedAt: new Date() }, actorId); return; }
	}
	await automation.updateRun(orgId, workflowRunId, { state: "SUCCEEDED", stepLog: log, waitingOnApprovalId: null, finishedAt: new Date() }, actorId);
}
