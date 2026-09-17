import { readFileSync, existsSync } from "node:fs";

const required = [
	"packages/contracts/src/agents-automation.schema.ts",
	"packages/core/src/agent-execution.ts",
	"packages/db/src/repositories/agent.repository.ts",
	"packages/db/src/repositories/automation.repository.ts",
	"packages/ai/src/agent-runtime.ts",
	"apps/api/src/agents.ts",
	"apps/worker/src/queue.ts",
	"apps/worker/src/workflow-engine.ts",
	"apps/worker/src/temporal-workflow.ts",
	"apps/worker/src/temporal-activities.ts",
	"apps/web/src/app/os/agents/AgentsStudio.tsx",
	"apps/web/src/app/os/automations/AutomationsStudio.tsx",
];
for (const path of required)
	if (!existsSync(path)) throw new Error(`Missing Phase 13 file: ${path}`);
const agentRuntime = readFileSync("packages/ai/src/agent-runtime.ts", "utf8");
const workflowEngine = readFileSync(
	"apps/worker/src/workflow-engine.ts",
	"utf8",
);
for (const token of [
	"requiresCheckpoint",
	"assertBudget",
	"rollbackAgentRun",
	"executeAgentTool",
])
	if (!agentRuntime.includes(token))
		throw new Error(`Agent runtime invariant missing: ${token}`);
for (const token of [
	"evaluateWorkflowCondition",
	"executeAgentRun",
	"executeAgentTool",
])
	if (!workflowEngine.includes(token))
		throw new Error(`Workflow runtime invariant missing: ${token}`);
console.log("Phase 13 static verification passed");
