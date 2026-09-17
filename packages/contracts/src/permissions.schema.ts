import { z } from "zod";

export const PermissionActionSchema = z.enum([
	"read",
	"create",
	"update",
	"delete",
	"comment",
	"manage",
	"share",
	"export",
	"use_ai",
	"use_external",
	"view_as",
]);
export const PermissionScopeSchema = z.enum([
	"ORG",
	"WORKSPACE",
	"TEAM",
	"PROJECT",
	"OBJECT",
]);
export const PermissionLevelSchema = z.enum([
	"VIEW",
	"COMMENT",
	"EDIT",
	"MANAGE",
	"OWNER",
]);
export const PermissionEffectSchema = z.enum(["allow", "deny"]);
export const FieldVisibilitySchema = z.enum(["visible", "masked", "hidden"]);
export const PermissionSubjectSchema = z.object({
	id: z.string().min(1),
	type: z.enum([
		"MEMBER",
		"GUEST",
		"CLIENT",
		"VENDOR",
		"AGENT",
		"SERVICE_ACCOUNT",
	]),
	email: z.string().email(),
	teamIds: z.array(z.string().min(1)).default([]),
	channelIds: z.array(z.string().min(1)).default([]),
	meetingIds: z.array(z.string().min(1)).default([]),
});
export const PermissionResourceSchema = z.object({
	orgId: z.string().min(1),
	type: z.string().min(1),
	id: z.string().min(1),
	workspaceId: z.string().min(1).nullable().default(null),
	projectId: z.string().min(1).nullable().default(null),
	ownerId: z.string().min(1).nullable().default(null),
	teamId: z.string().min(1).nullable().default(null),
	classification: z.string().min(1).nullable().default(null),
});
export const PermissionRoleBindingSchema = z.object({
	permissions: z.array(z.string().min(1)),
	scopeType: PermissionScopeSchema,
	scopeId: z.string().min(1).nullable(),
	expiresAt: z.string().datetime({ offset: true }).nullable(),
});
export const PermissionGrantSchema = z.object({
	resourceType: z.string().min(1),
	resourceId: z.string().min(1),
	principalId: z.string().min(1).nullable(),
	teamId: z.string().min(1).nullable(),
	externalEmail: z.string().email().nullable(),
	level: PermissionLevelSchema,
	fieldMask: z.array(z.string().min(1)),
	expiresAt: z.string().datetime({ offset: true }).nullable(),
	revokedAt: z.string().datetime({ offset: true }).nullable(),
});
export const PermissionClassificationSchema = z.object({
	key: z.string().min(1),
	rank: z.number().int(),
	blocksExternal: z.boolean(),
	blocksAi: z.boolean(),
	blocksDownload: z.boolean(),
	watermark: z.boolean(),
});
export const PermissionDecisionSchema = z.object({
	allowed: z.boolean(),
	effect: PermissionEffectSchema,
	action: PermissionActionSchema,
	reason: z.string().min(1),
	matchedBy: z.string().min(1).nullable(),
});
export const PermissionSetSchema = z.object({
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
export const FieldAccessSchema = z.record(z.string(), FieldVisibilitySchema);
export const PermissionExposureSchema = z.object({
	external: z.object({ allowed: z.boolean(), reason: z.string().min(1) }),
	ai: z.object({ allowed: z.boolean(), reason: z.string().min(1) }),
	export: z.object({ allowed: z.boolean(), reason: z.string().min(1) }),
	watermark: z.boolean(),
	fieldAccess: FieldAccessSchema,
});
export const PermissionEvaluationSchema = z.object({
	resource: PermissionResourceSchema,
	permissions: PermissionSetSchema,
	decisions: z.array(PermissionDecisionSchema),
	exposure: PermissionExposureSchema,
	principal: PermissionSubjectSchema,
});
export const PermissionEvaluateInputSchema = z.object({
	resource: PermissionResourceSchema,
	action: PermissionActionSchema.optional(),
	external: z.boolean().default(false),
	ai: z.boolean().default(false),
	fields: z.array(z.string().min(1)).default([]),
});
export const PermissionViewAsInputSchema = z.object({
	targetUserId: z.string().min(1),
	resource: PermissionResourceSchema,
	action: PermissionActionSchema.optional(),
	fields: z.array(z.string().min(1)).default([]),
	external: z.boolean().default(false),
	ai: z.boolean().default(false),
});
export const PermissionExposureReportSchema = z.object({
	generatedAt: z.string().datetime({ offset: true }),
	organizationId: z.string().min(1),
	resources: z.array(
		z.object({
			resourceType: z.string().min(1),
			resourceId: z.string().min(1),
			externalPrincipals: z.number().int().nonnegative(),
			aiAllowed: z.boolean(),
			externalAllowed: z.boolean(),
			fieldMasked: z.boolean(),
			watermark: z.boolean(),
			expiresAt: z.string().datetime({ offset: true }).nullable(),
		}),
	),
});
export const PermissionRoleCreateInputSchema = z.object({
	key: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
	permissions: z.array(z.string().min(1)),
});
export const PermissionRoleBindingCreateInputSchema = z.object({
	roleId: z.string().min(1),
	principalId: z.string().min(1),
	scopeType: PermissionScopeSchema,
	scopeId: z.string().min(1).nullable().optional(),
	expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export const PermissionGrantCreateInputSchema = z.object({
	resourceType: z.string().min(1),
	resourceId: z.string().min(1),
	principalId: z.string().min(1).nullable().optional(),
	teamId: z.string().min(1).nullable().optional(),
	externalEmail: z.string().email().nullable().optional(),
	level: PermissionLevelSchema,
	fieldMask: z.array(z.string().min(1)),
	reason: z.string().optional(),
	expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type PermissionAction = z.infer<typeof PermissionActionSchema>;
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;
export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;
export type PermissionEffect = z.infer<typeof PermissionEffectSchema>;
export type FieldVisibility = z.infer<typeof FieldVisibilitySchema>;
export type PermissionSubject = z.infer<typeof PermissionSubjectSchema>;
export type PermissionResource = z.infer<typeof PermissionResourceSchema>;
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;
export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;
export type PermissionRoleBinding = z.infer<typeof PermissionRoleBindingSchema>;
export type PermissionClassification = z.infer<
	typeof PermissionClassificationSchema
>;
export type PermissionSet = z.infer<typeof PermissionSetSchema>;
export type PermissionExposure = z.infer<typeof PermissionExposureSchema>;
export type PermissionEvaluateInput = z.infer<
	typeof PermissionEvaluateInputSchema
>;
export type PermissionViewAsInput = z.infer<typeof PermissionViewAsInputSchema>;
export type PermissionEvaluation = z.infer<typeof PermissionEvaluationSchema>;
export type PermissionRoleCreateInput = z.infer<
	typeof PermissionRoleCreateInputSchema
>;
export type PermissionRoleBindingCreateInput = z.infer<
	typeof PermissionRoleBindingCreateInputSchema
>;
export type PermissionGrantCreateInput = z.infer<
	typeof PermissionGrantCreateInputSchema
>;
