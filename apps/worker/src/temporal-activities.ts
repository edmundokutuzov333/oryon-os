import { executeWorkflowRun } from "./workflow-engine.js";

export const activities = {
	executeWorkflowActivity: async (orgId: string, workflowRunId: string): Promise<void> => {
		await executeWorkflowRun(orgId, workflowRunId);
	},
};
