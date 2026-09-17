import { z } from "zod";

export const ApiKeyCreateInputSchema = z.object({
	label: z.string().trim().min(2).max(80),
	expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
});
export const ApiKeySummarySchema = z.object({
	id: z.string(),
	label: z.string(),
	prefix: z.string(),
	userId: z.string(),
	createdAt: z.string(),
	expiresAt: z.string().nullable(),
	revokedAt: z.string().nullable(),
});
export const ApiKeyCreatedSchema = ApiKeySummarySchema.extend({
	secret: z.string().min(20),
});
export const ApiKeyRevokeInputSchema = z.object({
	reason: z.string().trim().max(240).nullable().default(null),
});
export const ApiKeyRevokeResponseSchema = z.object({
	revoked: z.literal(true),
});
export const WebhookCreateInputSchema = z.object({
	url: z.string().url(),
	events: z.array(z.string().min(1).max(120)).min(1).max(100),
	description: z.string().trim().max(240).nullable().default(null),
});
export const WebhookUpdateInputSchema = z.object({
	url: z.string().url().optional(),
	events: z.array(z.string().min(1).max(120)).min(1).max(100).optional(),
	description: z.string().trim().max(240).nullable().optional(),
	active: z.boolean().optional(),
});
export const WebhookSummarySchema = z.object({
	id: z.string(),
	url: z.string().url(),
	events: z.array(z.string()),
	description: z.string().nullable(),
	active: z.boolean(),
	secretPreview: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export const WebhookTestResponseSchema = z.object({
	delivered: z.boolean(),
	statusCode: z.number().int().nullable(),
	durationMs: z.number().int().nonnegative(),
});
export const ImportWorkObjectItemSchema = z.object({
	typeKey: z.string().min(1).max(120),
	title: z.string().trim().min(1).max(500),
	description: z.string().max(50000).nullable().default(null),
	status: z.string().max(120).optional(),
	priority: z.enum(["LOWEST", "LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
	tags: z.array(z.string().max(80)).max(50).optional(),
	customFields: z.record(z.string(), z.unknown()).optional(),
	externalRef: z.string().max(500).nullable().optional(),
});
export const ImportWorkObjectsInputSchema = z.object({
	objects: z.array(ImportWorkObjectItemSchema).min(1).max(500),
});
export const ImportWorkObjectsResponseSchema = z.object({
	imported: z.number().int().nonnegative(),
	ids: z.array(z.string()),
});
export const ExportWorkObjectsInputSchema = z.object({
	typeKey: z.string().optional(),
	workspaceId: z.string().optional(),
	includeCustomFields: z.boolean().default(true),
	limit: z.coerce.number().int().min(1).max(200).default(200),
});
export const ExportWorkObjectSchema = z.object({
	id: z.string(),
	orgId: z.string(),
	workspaceId: z.string().nullable(),
	typeKey: z.string(),
	typeDefId: z.string(),
	humanId: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	status: z.string(),
	statusCategory: z.string(),
	priority: z.enum(["LOWEST", "LOW", "NORMAL", "HIGH", "URGENT"]),
	ownerId: z.string().nullable(),
	parentObjectId: z.string().nullable(),
	startAt: z.string().datetime({ offset: true }).nullable(),
	dueAt: z.string().datetime({ offset: true }).nullable(),
	completedAt: z.string().datetime({ offset: true }).nullable(),
	progress: z.number().nullable(),
	moneyAmount: z.string().nullable(),
	moneyCurrency: z.string().nullable(),
	probability: z.number().nullable(),
	secondaryDate: z.string().datetime({ offset: true }).nullable(),
	externalRef: z.string().nullable(),
	severity: z.string().nullable(),
	classification: z.string().nullable(),
	tags: z.array(z.string()),
	customFields: z.record(z.string(), z.unknown()).optional(),
	createdAt: z.string().datetime({ offset: true }),
	updatedAt: z.string().datetime({ offset: true }),
});
export const ExportWorkObjectsResponseSchema = z.object({
	exportedBy: z.string(),
	count: z.number().int().nonnegative(),
	objects: z.array(ExportWorkObjectSchema),
});
export const AuditQuerySchema = z.object({
	action: z.string().optional(),
	resourceType: z.string().optional(),
	resourceId: z.string().optional(),
	actorId: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(100),
});
export const AuditEntrySchema = z.object({
	id: z.string(),
	action: z.string(),
	resourceType: z.string(),
	resourceId: z.string(),
	actorId: z.string().nullable(),
	actorType: z.string(),
	decision: z.string(),
	reason: z.string().nullable(),
	createdAt: z.string(),
});
export const PlatformHealthSchema = z.object({
	status: z.enum(["ok", "degraded"]),
	service: z.literal("oryon-api"),
	version: z.string(),
	checks: z.object({
		database: z.enum(["ok", "error"]),
		openapi: z.literal("ok"),
		security: z.literal("ok"),
	}),
	timestamp: z.string(),
});
export const ReleaseManifestSchema = z.object({
	version: z.string(),
	phase: z.literal(15),
	apiVersion: z.literal("v1"),
	sdkVersion: z.string(),
	generatedAt: z.string(),
});
export type ApiKeyCreateInput = z.infer<typeof ApiKeyCreateInputSchema>;
export type ApiKeySummary = z.infer<typeof ApiKeySummarySchema>;
export type ApiKeyCreated = z.infer<typeof ApiKeyCreatedSchema>;
export type ApiKeyRevokeResponse = z.infer<typeof ApiKeyRevokeResponseSchema>;
export type WebhookCreateInput = z.infer<typeof WebhookCreateInputSchema>;
export type WebhookUpdateInput = z.infer<typeof WebhookUpdateInputSchema>;
export type WebhookSummary = z.infer<typeof WebhookSummarySchema>;
export type WebhookTestResponse = z.infer<typeof WebhookTestResponseSchema>;
export type ImportWorkObjectsInput = z.infer<
	typeof ImportWorkObjectsInputSchema
>;
export type ExportWorkObject = z.infer<typeof ExportWorkObjectSchema>;
export type ExportWorkObjectsInput = z.infer<
	typeof ExportWorkObjectsInputSchema
>;
export type ExportWorkObjectsResponse = z.infer<
	typeof ExportWorkObjectsResponseSchema
>;
export type AuditQuery = z.infer<typeof AuditQuerySchema>;
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export type PlatformHealth = z.infer<typeof PlatformHealthSchema>;
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;
