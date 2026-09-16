import { randomUUID } from "node:crypto";
import {
	generateHumanId,
	prepareWorkObjectCreate,
	transitionStatus,
	validateParent,
	validateWorkObjectUpdate,
} from "@oryon/core";
import type { ObjectTypeDefContract, WorkObjectAssignmentCreateInput, WorkObjectCreateInput, WorkObjectPlacementCreateInput, WorkObjectStatusInput, WorkObjectUpdateInput, WorkObjectTypeCreateInput } from "@oryon/contracts/work-object";
import type { Prisma, PrismaClient } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";

export interface WorkObjectListInput {
	readonly orgId: string;
	readonly workspaceId?: string;
	readonly typeKey?: string;
	readonly status?: string;
	readonly ownerId?: string;
	readonly limit?: number;
}

function typeDefContract(row: { id: string; key: string; name: string; pluralName: string; icon: string | null; isSystem: boolean; idPrefix: string; schema: Prisma.JsonValue; statusModel: Prisma.JsonValue }): ObjectTypeDefContract {
	return { id: row.id, key: row.key, name: row.name, pluralName: row.pluralName, icon: row.icon, isSystem: row.isSystem, idPrefix: row.idPrefix, schema: row.schema as ObjectTypeDefContract["schema"], statusModel: row.statusModel as ObjectTypeDefContract["statusModel"] };
}

export class WorkObjectRepository {
	private readonly db: PrismaClient;

	constructor(db: PrismaClient) {
		this.db = db;
	}

	async list(input: WorkObjectListInput) {
		const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
		return withOrgContext(this.db, input.orgId, async (tx) => {
			const where: Prisma.WorkObjectWhereInput = { orgId: input.orgId, deletedAt: null };
			if (input.workspaceId !== undefined) where.workspaceId = input.workspaceId;
			if (input.typeKey !== undefined) where.typeKey = input.typeKey;
			if (input.status !== undefined) where.status = input.status;
			if (input.ownerId !== undefined) where.ownerId = input.ownerId;
			return tx.workObject.findMany({ where, include: { assignments: true, placements: true }, orderBy: { updatedAt: "desc" }, take: limit });
		});
	}

	async findById(orgId: string, id: string) {
		return withOrgContext(this.db, orgId, (tx) => tx.workObject.findFirst({ where: { orgId, id, deletedAt: null }, include: { assignments: true, placements: true, typeDef: true } }));
	}

	async listTypeDefs(orgId: string) {
		return withOrgContext(this.db, orgId, (tx) => tx.objectTypeDef.findMany({ where: { orgId }, orderBy: { name: "asc" } }));
	}

	async findTypeDef(orgId: string, key: string) {
		return withOrgContext(this.db, orgId, (tx) => tx.objectTypeDef.findFirst({ where: { orgId, key } }));
	}

	async createTypeDef(orgId: string, actorId: string, input: WorkObjectTypeCreateInput): Promise<{ id: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const row = await tx.objectTypeDef.create({ data: { orgId, key: input.key, name: input.name, pluralName: input.pluralName, icon: input.icon ?? null, isSystem: false, idPrefix: input.idPrefix, schema: input.schema, statusModel: input.statusModel, defaultViews: [] } });
			await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "ObjectTypeDef", subjectId: row.id, name: "work_object.type.created", payload: { key: input.key, name: input.name } });
			return { id: row.id };
		});
	}

	async create(orgId: string, actorId: string, input: WorkObjectCreateInput): Promise<string> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const typeRow = await tx.objectTypeDef.findFirst({ where: { orgId, key: input.typeKey } });
			if (!typeRow) throw new Error("OBJECT_TYPE_NOT_FOUND");
			const typeDef = typeDefContract(typeRow);
			const prepared = prepareWorkObjectCreate(input, typeDef);
			const id = randomUUID();
			validateParent(id, prepared.parentObjectId);
			if (prepared.parentObjectId) {
				const parent = await tx.workObject.findFirst({ where: { orgId, id: prepared.parentObjectId, deletedAt: null }, select: { id: true } });
				if (!parent) throw new Error("PARENT_NOT_FOUND");
			}
			if (prepared.ownerId) {
				const owner = await tx.user.findFirst({ where: { orgId, id: prepared.ownerId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
				if (!owner) throw new Error("OWNER_NOT_FOUND");
			}
			const state = typeDef.statusModel.states.find((candidate) => candidate.key === prepared.status);
			if (!state) throw new Error("INVALID_STATUS");
			const object = await tx.workObject.create({ data: { id, orgId, workspaceId: prepared.workspaceId ?? null, typeKey: prepared.typeKey, typeDefId: typeRow.id, humanId: generateHumanId(id, typeRow.idPrefix), title: prepared.title, description: prepared.description ?? null, status: prepared.status, statusCategory: state.category, priority: prepared.priority ?? "NORMAL", ownerId: prepared.ownerId ?? null, parentObjectId: prepared.parentObjectId ?? null, startAt: prepared.startAt ? new Date(prepared.startAt) : null, dueAt: prepared.dueAt ? new Date(prepared.dueAt) : null, progress: prepared.progress ?? 0, moneyAmount: prepared.moneyAmount, moneyCurrency: prepared.moneyCurrency, probability: prepared.probability, secondaryDate: prepared.secondaryDate ? new Date(prepared.secondaryDate) : null, externalRef: prepared.externalRef, severity: prepared.severity, classification: prepared.classification, tags: prepared.tags, customFields: prepared.customFields, createdBy: actorId } });
			await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "WorkObject", subjectId: object.id, name: "work_object.created", payload: { typeKey: object.typeKey, humanId: object.humanId, title: object.title } });
			return object.id;
		});
	}

	async update(orgId: string, actorId: string, id: string, input: WorkObjectUpdateInput) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const current = await tx.workObject.findFirst({ where: { orgId, id, deletedAt: null }, include: { typeDef: true } });
			if (!current) throw new Error("NOT_FOUND");
			const typeDef = typeDefContract(current.typeDef);
			const mergedCustomFields = input.customFields ? { ...(current.customFields as Record<string, unknown>), ...input.customFields } : undefined;
			const validationInput = mergedCustomFields ? { ...input, customFields: mergedCustomFields } : input;
			validateWorkObjectUpdate(validationInput, typeDef, current.status);
			validateParent(current.id, input.parentObjectId);
			if (input.parentObjectId) {
				const parent = await tx.workObject.findFirst({ where: { orgId, id: input.parentObjectId, deletedAt: null }, select: { id: true } });
				if (!parent) throw new Error("PARENT_NOT_FOUND");
			}
			if (input.ownerId) {
				const owner = await tx.user.findFirst({ where: { orgId, id: input.ownerId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
				if (!owner) throw new Error("OWNER_NOT_FOUND");
			}
			let statusCategory = current.statusCategory;
			let completedAt = current.completedAt;
			if (input.status) {
				const transition = transitionStatus(typeDef.statusModel, current.status, { status: input.status });
				statusCategory = transition.statusCategory;
				completedAt = transition.statusCategory === "DONE" ? new Date() : null;
			}
			const data: Prisma.WorkObjectUpdateInput = { statusCategory, completedAt };
			if (input.title !== undefined) data.title = input.title;
			if (input.description !== undefined) data.description = input.description;
			if (input.status !== undefined) data.status = input.status;
			if (input.priority !== undefined) data.priority = input.priority;
			if (input.ownerId !== undefined) data.ownerId = input.ownerId;
			if (input.parentObjectId !== undefined) data.parentObjectId = input.parentObjectId;
			if (input.startAt !== undefined) data.startAt = input.startAt ? new Date(input.startAt) : null;
			if (input.dueAt !== undefined) data.dueAt = input.dueAt ? new Date(input.dueAt) : null;
			if (input.progress !== undefined) data.progress = input.progress;
			if (input.moneyAmount !== undefined) data.moneyAmount = input.moneyAmount;
			if (input.moneyCurrency !== undefined) data.moneyCurrency = input.moneyCurrency;
			if (input.probability !== undefined) data.probability = input.probability;
			if (input.secondaryDate !== undefined) data.secondaryDate = input.secondaryDate ? new Date(input.secondaryDate) : null;
			if (input.externalRef !== undefined) data.externalRef = input.externalRef;
			if (input.severity !== undefined) data.severity = input.severity;
			if (input.classification !== undefined) data.classification = input.classification;
			if (input.tags !== undefined) data.tags = input.tags;
			if (mergedCustomFields !== undefined) data.customFields = mergedCustomFields;
			const updated = await tx.workObject.update({ where: { id }, data, include: { assignments: true, placements: true, typeDef: true } });
			await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "WorkObject", subjectId: id, name: "work_object.updated", payload: { changed: Object.keys(data), status: updated.status } });
			return updated;
		});
	}

	async softDelete(orgId: string, actorId: string, id: string): Promise<void> {
		await withOrgContext(this.db, orgId, async (tx) => {
			const current = await tx.workObject.findFirst({ where: { orgId, id, deletedAt: null }, select: { id: true } });
			if (!current) throw new Error("NOT_FOUND");
			await tx.workObject.update({ where: { id }, data: { deletedAt: new Date() } });
			await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "WorkObject", subjectId: id, name: "work_object.deleted", payload: { id } });
		});
	}

	async assign(orgId: string, actorId: string, objectId: string, input: WorkObjectAssignmentCreateInput): Promise<{ id: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const object = await tx.workObject.findFirst({ where: { orgId, id: objectId, deletedAt: null }, select: { id: true } });
			if (!object) throw new Error("NOT_FOUND");
			if (input.userId) {
				const user = await tx.user.findFirst({ where: { orgId, id: input.userId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
				if (!user) throw new Error("USER_NOT_FOUND");
			} else if (input.agentId) {
				const agent = await tx.agent.findFirst({ where: { orgId, id: input.agentId, deletedAt: null }, select: { id: true } });
				if (!agent) throw new Error("AGENT_NOT_FOUND");
			}
			const assignment = await tx.assignment.create({ data: { orgId, objectId, userId: input.userId ?? null, agentId: input.agentId ?? null, role: input.role, allocation: input.allocation ?? null } });
			await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Assignment", subjectId: assignment.id, name: "work_object.assignment.created", payload: { objectId, userId: input.userId ?? null, agentId: input.agentId ?? null, role: input.role } });
			return { id: assignment.id };
		});
	}

	async removeAssignment(orgId: string, actorId: string, objectId: string, assignmentId: string): Promise<void> {
		await withOrgContext(this.db, orgId, async (tx) => {
			const assignment = await tx.assignment.findFirst({ where: { id: assignmentId, orgId, objectId } });
			if (!assignment) throw new Error("NOT_FOUND");
			await tx.assignment.delete({ where: { id: assignmentId } });
			await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Assignment", subjectId: assignmentId, name: "work_object.assignment.deleted", payload: { objectId } });
		});
	}

	async place(orgId: string, actorId: string, objectId: string, input: WorkObjectPlacementCreateInput): Promise<{ id: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const object = await tx.workObject.findFirst({ where: { orgId, id: objectId, deletedAt: null }, select: { id: true } });
			if (!object) throw new Error("NOT_FOUND");
			if (input.isPrimary) await tx.objectPlacement.updateMany({ where: { orgId, objectId }, data: { isPrimary: false } });
			const placement = await tx.objectPlacement.upsert({ where: { objectId_containerType_containerId: { objectId, containerType: input.containerType, containerId: input.containerId } }, create: { orgId, objectId, containerType: input.containerType, containerId: input.containerId, sectionId: input.sectionId ?? null, position: input.position, isPrimary: input.isPrimary }, update: { sectionId: input.sectionId ?? null, position: input.position, isPrimary: input.isPrimary } });
			await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "ObjectPlacement", subjectId: placement.id, name: "work_object.placement.upserted", payload: { objectId, containerType: input.containerType, containerId: input.containerId } });
			return { id: placement.id };
		});
	}

	async status(orgId: string, actorId: string, id: string, input: WorkObjectStatusInput) {
		return this.update(orgId, actorId, id, { status: input.status });
	}
}
