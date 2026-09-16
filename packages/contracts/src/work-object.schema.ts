import { z } from "zod";

export const WorkObjectStatusCategorySchema = z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"]);
export const WorkObjectPrioritySchema = z.enum(["LOWEST", "LOW", "NORMAL", "HIGH", "URGENT"]);
export const AssignmentRoleSchema = z.enum(["ASSIGNEE", "REVIEWER", "APPROVER", "FOLLOWER", "WATCHER"]);
export const ContainerTypeSchema = z.enum(["WORKSPACE", "PROJECT", "SPRINT", "CHANNEL", "DATABASE", "PORTFOLIO", "GOAL", "PIPELINE", "COMMUNITY"]);

export const ObjectFieldTypeSchema = z.enum(["TEXT", "NUMBER", "BOOLEAN", "DATE", "SELECT", "MULTI_SELECT", "USER", "OBJECT"]);

export const ObjectFieldDefSchema = z.object({
	key: z.string().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/),
	label: z.string().min(1).max(120),
	type: ObjectFieldTypeSchema,
	required: z.boolean().default(false),
	options: z.array(z.object({ key: z.string().min(1), label: z.string().min(1) })).optional(),
});

export const ObjectTypeSchemaConfig = z.object({
	fields: z.array(ObjectFieldDefSchema).default([]),
});

export const ObjectStatusDefSchema = z.object({
	key: z.string().min(1).max(60).regex(/^[a-z][a-z0-9_]*$/),
	label: z.string().min(1).max(120),
	category: WorkObjectStatusCategorySchema,
	order: z.number().int().nonnegative(),
});

export const ObjectStatusTransitionSchema = z.object({
	from: z.string().min(1),
	to: z.string().min(1),
});

export const ObjectStatusModelSchema = z.object({
	initial: z.string().min(1),
	states: z.array(ObjectStatusDefSchema).min(1),
	transitions: z.array(ObjectStatusTransitionSchema).default([]),
});

export const ObjectTypeDefSchema = z.object({
	id: z.string().min(1),
	key: z.string().min(1),
	name: z.string().min(1),
	pluralName: z.string().min(1),
	icon: z.string().nullable(),
	isSystem: z.boolean(),
	idPrefix: z.string().min(1),
	schema: ObjectTypeSchemaConfig,
	statusModel: ObjectStatusModelSchema,
});

export const WorkObjectResourceSchema = z.object({
	orgId: z.string().min(1),
	type: z.string().min(1),
	id: z.string().min(1),
	workspaceId: z.string().nullable(),
	projectId: z.string().nullable(),
	ownerId: z.string().nullable(),
	teamId: z.string().nullable(),
	classification: z.string().nullable(),
});

export const WorkObjectPermissionsSchema = z.object({
	read: z.boolean(),
	create: z.boolean(),
	update: z.boolean(),
	delete: z.boolean(),
	comment: z.boolean(),
	manage: z.boolean(),
	share: z.boolean(),
	export: z.boolean(),
	use_ai: z.boolean(),
	use_external: z.boolean(),
	view_as: z.boolean(),
});

export const WorkObjectResponseSchema = z.object({
	id: z.string().min(1),
	orgId: z.string().min(1),
	workspaceId: z.string().nullable(),
	typeKey: z.string().min(1),
	typeDefId: z.string().min(1),
	humanId: z.string().min(1),
	title: z.string().min(1),
	description: z.string().nullable(),
	status: z.string().min(1),
	statusCategory: WorkObjectStatusCategorySchema,
	priority: WorkObjectPrioritySchema,
	ownerId: z.string().nullable(),
	parentObjectId: z.string().nullable(),
	startAt: z.string().datetime({ offset: true }).nullable(),
	dueAt: z.string().datetime({ offset: true }).nullable(),
	completedAt: z.string().datetime({ offset: true }).nullable(),
	progress: z.number().int().min(0).max(100),
	moneyAmount: z.string().nullable(),
	moneyCurrency: z.string().nullable(),
	probability: z.number().int().min(0).max(100).nullable(),
	secondaryDate: z.string().datetime({ offset: true }).nullable(),
	externalRef: z.string().nullable(),
	severity: z.number().int().nullable(),
	classification: z.string().nullable(),
	tags: z.array(z.string()),
	customFields: z.record(z.string(), z.unknown()),
	assignments: z.array(z.object({ id: z.string(), userId: z.string().nullable(), agentId: z.string().nullable(), role: AssignmentRoleSchema, allocation: z.number().int().min(0).max(100).nullable() })),
	placements: z.array(z.object({ id: z.string(), containerType: ContainerTypeSchema, containerId: z.string(), sectionId: z.string().nullable(), position: z.string(), isPrimary: z.boolean() })),
	permissions: WorkObjectPermissionsSchema,
});

export const WorkObjectCreateInputSchema = z.object({
	typeKey: z.string().min(1),
	workspaceId: z.string().min(1).nullable().optional(),
	title: z.string().trim().min(1).max(500),
	description: z.string().max(20000).nullable().optional(),
	status: z.string().min(1).optional(),
	priority: WorkObjectPrioritySchema.optional(),
	ownerId: z.string().min(1).nullable().optional(),
	parentObjectId: z.string().min(1).nullable().optional(),
	startAt: z.string().datetime({ offset: true }).nullable().optional(),
	dueAt: z.string().datetime({ offset: true }).nullable().optional(),
	progress: z.number().int().min(0).max(100).optional(),
	moneyAmount: z.string().regex(/^\d+(\.\d{1,4})?$/).nullable().optional(),
	moneyCurrency: z.string().length(3).toUpperCase().nullable().optional(),
	probability: z.number().int().min(0).max(100).nullable().optional(),
	secondaryDate: z.string().datetime({ offset: true }).nullable().optional(),
	externalRef: z.string().max(500).nullable().optional(),
	severity: z.number().int().nullable().optional(),
	classification: z.string().min(1).nullable().optional(),
	tags: z.array(z.string().min(1).max(80)).max(100).default([]),
	customFields: z.record(z.string(), z.unknown()).default({}),
});

export const WorkObjectUpdateInputSchema = WorkObjectCreateInputSchema.partial().omit({ typeKey: true });

export const WorkObjectListQuerySchema = z.object({
	workspaceId: z.string().min(1).optional(),
	typeKey: z.string().min(1).optional(),
	status: z.string().min(1).optional(),
	ownerId: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const WorkObjectAssignmentCreateInputSchema = z.object({
	userId: z.string().min(1).nullable().optional(),
	agentId: z.string().min(1).nullable().optional(),
	role: AssignmentRoleSchema.default("ASSIGNEE"),
	allocation: z.number().int().min(0).max(100).nullable().optional(),
}).superRefine((value, ctx) => {
	if (!value.userId && !value.agentId) ctx.addIssue({ code: "custom", message: "Assignment must target a user or agent" });
	if (value.userId && value.agentId) ctx.addIssue({ code: "custom", message: "Assignment cannot target both user and agent" });
});

export const WorkObjectPlacementCreateInputSchema = z.object({
	containerType: ContainerTypeSchema,
	containerId: z.string().min(1),
	sectionId: z.string().min(1).nullable().optional(),
	position: z.string().regex(/^\d+(\.\d{1,10})?$/),
	isPrimary: z.boolean().default(false),
});

export const WorkObjectStatusInputSchema = z.object({
	status: z.string().min(1),
	comment: z.string().max(500).nullable().optional(),
});

export const WorkObjectTypeCreateInputSchema = z.object({
	key: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/),
	name: z.string().min(1).max(120),
	pluralName: z.string().min(1).max(120),
	icon: z.string().max(80).nullable().optional(),
	idPrefix: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/),
	schema: ObjectTypeSchemaConfig.default({ fields: [] }),
	statusModel: ObjectStatusModelSchema,
});

export type WorkObjectResponse = z.infer<typeof WorkObjectResponseSchema>;
export type WorkObjectCreateInput = z.infer<typeof WorkObjectCreateInputSchema>;
export type WorkObjectUpdateInput = z.infer<typeof WorkObjectUpdateInputSchema>;
export type WorkObjectListQuery = z.infer<typeof WorkObjectListQuerySchema>;
export type WorkObjectAssignmentCreateInput = z.infer<typeof WorkObjectAssignmentCreateInputSchema>;
export type WorkObjectPlacementCreateInput = z.infer<typeof WorkObjectPlacementCreateInputSchema>;
export type WorkObjectStatusInput = z.infer<typeof WorkObjectStatusInputSchema>;
export type WorkObjectTypeCreateInput = z.infer<typeof WorkObjectTypeCreateInputSchema>;
export type ObjectTypeDefContract = z.infer<typeof ObjectTypeDefSchema>;
