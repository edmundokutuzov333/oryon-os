import { proxyActivities } from "@temporalio/workflow";

const { executeWorkflowActivity } = proxyActivities<{
	executeWorkflowActivity(orgId: string, workflowRunId: string): Promise<void>;
}>({ startToCloseTimeout: "30 minutes", retry: { maximumAttempts: 3 } });

export async function runOryonWorkflow(
	orgId: string,
	workflowRunId: string,
): Promise<void> {
	await executeWorkflowActivity(orgId, workflowRunId);
}
