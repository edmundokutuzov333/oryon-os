import { Client, Connection } from "@temporalio/client";
import { Worker as TemporalWorker } from "@temporalio/worker";
import { Worker as BullWorker } from "bullmq";
import { fileURLToPath } from "node:url";
import { AgentRepository, AutomationRepository } from "@oryon/db/repositories";
import { closePrisma, getPrisma } from "@oryon/db";
import { agentRunQueue, workflowRunQueue, enqueueAgentRun, enqueueWorkflowRun, startQueueWorkers } from "./queue.js";
import { activities } from "./temporal-activities.js";
import { runOryonWorkflow } from "./temporal-workflow.js";
import { WorkflowTriggerSchema } from "@oryon/contracts/agents-automation";

const db = getPrisma();
const agents = new AgentRepository(db);
const automation = new AutomationRepository(db);
const redisConnection = { host: process.env.REDIS_HOST ?? "localhost", port: Number(process.env.REDIS_PORT ?? "6379") };
const triggerQueue = new (await import("bullmq")).Queue("oryon.workflow-triggers", { connection: redisConnection });
const agentTriggerQueue = new (await import("bullmq")).Queue("oryon.agent-triggers", { connection: redisConnection });
let stopped = false;
const lastEventByOrg = new Map<string, number>();

async function pollRunnable(): Promise<void> {
	for (const orgId of await automation.listOrganizations()) {
		for (const run of await agents.listRunnable(orgId)) await enqueueAgentRun(orgId, run.id);
		for (const run of await automation.listRunnable(orgId)) await enqueueWorkflowRun(orgId, run.id);
	}
}

async function pollEvents(): Promise<void> {
	for (const orgId of await automation.listOrganizations()) {
		const since = new Date(lastEventByOrg.get(orgId) ?? Date.now() - 15000);
		const events = await automation.listRecentEvents(orgId, since);
		if (events.length > 0) lastEventByOrg.set(orgId, events[events.length - 1]?.createdAt.getTime() ?? Date.now());
		const workflows = await automation.listActiveEventWorkflows(orgId);
		for (const workflow of workflows) {
			const trigger = WorkflowTriggerSchema.parse(workflow.triggerJson);
			if (trigger.kind !== "EVENT") continue;
			for (const event of events.filter((item) => item.name === trigger.eventName)) {
				const existing = await automation.findRunByTriggerEvent(orgId, workflow.id, event.id);
				if (!existing) { const created = await automation.createRun(orgId, null, workflow.id, { input: event.payload as Record<string, unknown>, triggerEventId: event.id }, event.id); await enqueueWorkflowRun(orgId, created.id); }
			}
		}
	}
}

async function configureSchedules(): Promise<void> {
	for (const orgId of await automation.listOrganizations()) {
		for (const workflow of await automation.list(orgId)) {
			if (workflow.state !== "ACTIVE") continue;
			const trigger = WorkflowTriggerSchema.safeParse(workflow.triggerJson).data;
			if (trigger?.kind === "SCHEDULE") await triggerQueue.upsertJobScheduler(`workflow-schedule:${orgId}:${workflow.id}`, { pattern: trigger.cron }, { name: "workflow.schedule.trigger", data: { orgId, workflowId: workflow.id }, opts: { removeOnComplete: 1000, removeOnFail: 1000 } });
		}
		for (const agent of await agents.list(orgId)) if (agent.status === "ACTIVE" && agent.schedule) await agentTriggerQueue.upsertJobScheduler(`agent-schedule:${orgId}:${agent.id}`, { pattern: agent.schedule }, { name: "agent.schedule.trigger", data: { orgId, agentId: agent.id }, opts: { removeOnComplete: 1000, removeOnFail: 1000 } });
	}
}

async function startTemporal(): Promise<{ worker: TemporalWorker; client: Client } | null> {
	const address = process.env.TEMPORAL_ADDRESS;
	if (!address) return null;
	const connection = await Connection.connect({ address });
	const client = new Client({ connection });
	const worker = await TemporalWorker.create({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? "default", taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "oryon-agents", workflowsPath: fileURLToPath(new URL("./temporal-workflow.js", import.meta.url)), activities });
	return { worker, client };
}

async function main(): Promise<void> {
	const queueWorkers = startQueueWorkers();
	const temporal = await startTemporal();
	const workflowTriggerWorker = new BullWorker("oryon.workflow-triggers", async (job) => {
		const data = job.data as { orgId: string; workflowId: string };
		const created = await automation.createRun(data.orgId, null, data.workflowId, { input: {}, triggerEventId: null });
		if (temporal) await temporal.client.workflow.start(runOryonWorkflow, { taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "oryon-agents", workflowId: `workflow:${created.id}`, args: [data.orgId, created.id] }); else await enqueueWorkflowRun(data.orgId, created.id);
	}, { connection: redisConnection, concurrency: 4 });
	const agentTriggerWorker = new BullWorker("oryon.agent-triggers", async (job) => {
		const data = job.data as { orgId: string; agentId: string };
		const agent = await agents.findById(data.orgId, data.agentId);
		if (!agent) throw new Error("NOT_FOUND");
		const created = await agents.createRun(data.orgId, agent.principalId, data.agentId, { input: {}, triggerType: "SCHEDULE" });
		await enqueueAgentRun(data.orgId, created.id);
	}, { connection: redisConnection, concurrency: 4 });
	for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, async () => { if (stopped) return; stopped = true; await workflowTriggerWorker.close(); await agentTriggerWorker.close(); await queueWorkers.close(); await triggerQueue.close(); await agentTriggerQueue.close(); if (temporal) await temporal.worker.shutdown(); await closePrisma(); });
	let schedulesAt = 0;
	while (!stopped) {
		try { await pollRunnable(); await pollEvents(); if (Date.now() - schedulesAt > 60000) { await configureSchedules(); schedulesAt = Date.now(); } } catch (error) { console.error(error); }
		await new Promise((resolve) => setTimeout(resolve, Number(process.env.ORYON_AGENT_POLL_MS ?? "2000")));
	}
}
main().catch(async (error: unknown) => { console.error(error); await closePrisma(); process.exit(1); });
