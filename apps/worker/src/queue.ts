import { Queue, Worker, type Job } from "bullmq";
import { executeAgentRun } from "@oryon/ai";
import { executeWorkflowRun } from "./workflow-engine.js";

const connection = { host: process.env.REDIS_HOST ?? "localhost", port: Number(process.env.REDIS_PORT ?? "6379") };
export const agentRunQueue = new Queue("oryon.agent-runs", { connection });
export const workflowRunQueue = new Queue("oryon.workflow-runs", { connection });

type RunPayload = { orgId: string; runId: string };

export function startQueueWorkers(): { close: () => Promise<void> } {
	const agentWorker = new Worker<RunPayload>("oryon.agent-runs", async (job: Job<RunPayload>) => executeAgentRun(job.data.orgId, job.data.runId), { connection, concurrency: Number(process.env.ORYON_AGENT_CONCURRENCY ?? "4") });
	const workflowWorker = new Worker<RunPayload>("oryon.workflow-runs", async (job: Job<RunPayload>) => executeWorkflowRun(job.data.orgId, job.data.runId), { connection, concurrency: Number(process.env.ORYON_WORKFLOW_CONCURRENCY ?? "4") });
	return { close: async () => { await agentWorker.close(); await workflowWorker.close(); await agentRunQueue.close(); await workflowRunQueue.close(); } };
}

export async function enqueueAgentRun(orgId: string, runId: string): Promise<void> { await agentRunQueue.add("agent.run", { orgId, runId }, { jobId: `agent:${orgId}:${runId}`, removeOnComplete: 1000, removeOnFail: 1000, attempts: 3, backoff: { type: "exponential", delay: 1000 } }); }
export async function enqueueWorkflowRun(orgId: string, runId: string): Promise<void> { await workflowRunQueue.add("workflow.run", { orgId, runId }, { jobId: `workflow:${orgId}:${runId}`, removeOnComplete: 1000, removeOnFail: 1000, attempts: 3, backoff: { type: "exponential", delay: 1000 } }); }
