import { Prisma, type PrismaClient } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";
import type { WorkflowCreateInput, WorkflowRunInput } from "@oryon/contracts/agents-automation";

export class AutomationRepository {
	constructor(private readonly db: PrismaClient) {}

	async list(orgId: string) {
		return withOrgContext(this.db, orgId, (tx) => tx.workflow.findMany({ where: { orgId }, orderBy: { name: "asc" } }));
	}

	async findById(orgId: string, id: string) {
		return withOrgContext(this.db, orgId, (tx) => tx.workflow.findFirst({ where: { id, orgId } }));
	}

	async create(orgId: string, actorId: string, input: WorkflowCreateInput): Promise<{ id: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const row = await tx.workflow.create({ data: { orgId, key: input.key, name: input.name, description: input.description ?? null, triggerJson: input.trigger as Prisma.InputJsonValue, stepsJson: input.steps as Prisma.InputJsonValue, state: "DRAFT", version: 1, createdBy: actorId } });
			await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Workflow", subjectId: row.id, name: "workflow.created", payload: { key: row.key, name: row.name } as Prisma.InputJsonValue });
			return { id: row.id };
		});
	}

	async setState(orgId: string, actorId: string, id: string, state: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED"): Promise<void> {
		await withOrgContext(this.db, orgId, async (tx) => {
			const current = await tx.workflow.findFirst({ where: { id, orgId } });
			if (!current) throw new Error("NOT_FOUND");
			await tx.workflow.update({ where: { id }, data: { state } });
			await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Workflow", subjectId: id, name: "workflow.state.changed", payload: { from: current.state, to: state } as Prisma.InputJsonValue });
		});
	}

	async createRun(orgId: string, actorId: string | null, workflowId: string, input: WorkflowRunInput, correlationId?: string): Promise<{ id: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const workflow = await tx.workflow.findFirst({ where: { id: workflowId, orgId, state: "ACTIVE" } });
			if (!workflow) throw new Error("NOT_FOUND");
			const row = await tx.workflowRun.create({ data: { orgId, workflowId, triggerEventId: input.triggerEventId ?? null, inputJson: input.input as Prisma.InputJsonValue, state: "RUNNING", stepLogJson: [] } });
			await appendDomainEvent(tx, { orgId, actorId: actorId ?? undefined, actorType: actorId ? "MEMBER" : "SERVICE_ACCOUNT", subjectType: "WorkflowRun", subjectId: row.id, name: "workflow.run.created", correlationId, payload: { workflowId, triggerEventId: input.triggerEventId ?? null } as Prisma.InputJsonValue });
			return { id: row.id };
		});
	}

	async findRun(orgId: string, id: string) {
		return withOrgContext(this.db, orgId, (tx) => tx.workflowRun.findFirst({ where: { id, orgId }, include: { workflow: true } }));
	}

	async updateRun(orgId: string, id: string, patch: { state?: "RUNNING" | "WAITING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "ROLLED_BACK"; stepLog?: unknown; error?: unknown; waitingOnApprovalId?: string | null; finishedAt?: Date | null }): Promise<void> {
		await withOrgContext(this.db, orgId, async (tx) => {
			const data: Prisma.WorkflowRunUpdateInput = {};
			if (patch.state !== undefined) data.state = patch.state;
			if (patch.stepLog !== undefined) data.stepLogJson = patch.stepLog as Prisma.InputJsonValue;
			if (patch.error !== undefined) data.errorJson = patch.error === null ? Prisma.JsonNull : patch.error as Prisma.InputJsonValue;
			if (patch.waitingOnApprovalId !== undefined) data.waitingOnApprovalId = patch.waitingOnApprovalId;
			if (patch.finishedAt !== undefined) data.finishedAt = patch.finishedAt;
			await tx.workflowRun.update({ where: { id }, data });
		});
	}
}
