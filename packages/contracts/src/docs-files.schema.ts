import { z } from "zod";

export const PageKindSchema = z.enum(["DOC", "WIKI", "CANVAS", "DATABASE_VIEW", "BRIEF", "NOTE"]);
export const PagePermissionSchema = z.object({ read: z.boolean(), create: z.boolean(), update: z.boolean(), delete: z.boolean(), share: z.boolean(), export: z.boolean(), manage: z.boolean() });
export const PageSchema = z.object({
  id: z.string().min(1), orgId: z.string().min(1), workspaceId: z.string().nullable(), parentPageId: z.string().nullable(), title: z.string().min(1), icon: z.string().nullable(), coverUrl: z.string().nullable(), contentYjsBase64: z.string().base64().nullable(), contentJson: z.unknown().nullable(), contentText: z.string().nullable(), kind: PageKindSchema, ownerId: z.string().nullable(), classification: z.string().nullable(), verifiedAt: z.string().datetime({ offset: true }).nullable(), verifiedBy: z.string().nullable(), reviewEveryDays: z.number().int().positive().nullable(), nextReviewAt: z.string().datetime({ offset: true }).nullable(), publishedSlug: z.string().nullable(), publishedAt: z.string().datetime({ offset: true }).nullable(), indexable: z.boolean(), position: z.string(), updatedAt: z.string().datetime({ offset: true }), createdAt: z.string().datetime({ offset: true }), permissions: PagePermissionSchema });
export const PageCreateInputSchema = z.object({ title: z.string().trim().min(1).max(300), workspaceId: z.string().min(1).nullable().optional(), parentPageId: z.string().min(1).nullable().optional(), kind: PageKindSchema.optional(), ownerId: z.string().min(1).nullable().optional(), classification: z.string().min(1).nullable().optional() });
export const PageUpdateInputSchema = z.object({ title: z.string().trim().min(1).max(300).optional(), parentPageId: z.string().min(1).nullable().optional(), icon: z.string().max(20).nullable().optional(), coverUrl: z.string().url().nullable().optional(), contentJson: z.unknown().nullable().optional(), contentText: z.string().max(500000).nullable().optional(), contentYjsBase64: z.string().base64().nullable().optional(), classification: z.string().min(1).nullable().optional(), reviewEveryDays: z.number().int().positive().max(3650).nullable().optional(), nextReviewAt: z.string().datetime({ offset: true }).nullable().optional(), indexable: z.boolean().optional(), publishedSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180).nullable().optional() });
export const PageVersionSchema = z.object({ id: z.string(), pageId: z.string(), version: z.number().int().positive(), summary: z.string().nullable(), authorId: z.string(), snapshotBytes: z.string(), createdAt: z.string().datetime({ offset: true }) });
export const PageVersionListSchema = z.array(PageVersionSchema);
export const PagePublishInputSchema = z.object({ publishedSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180), publish: z.boolean().default(true) });
export const FileUploadIntentInputSchema = z.object({ name: z.string().trim().min(1).max(255), mimeType: z.string().min(1).max(200), sizeBytes: z.number().int().positive().max(536870912), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const FileUploadIntentSchema = z.object({ uploadId: z.string(), fileId: z.string(), storageKey: z.string(), uploadUrl: z.string().url(), expiresIn: z.number().int().positive() });
export const FileCompleteInputSchema = z.object({ uploadId: z.string().min(1), name: z.string().trim().min(1).max(255), mimeType: z.string().min(1).max(200), sizeBytes: z.number().int().positive(), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/), classification: z.string().min(1).nullable().optional(), tags: z.array(z.string().min(1).max(80)).max(100).optional() });
export const FileAssetSchema = z.object({ id: z.string(), name: z.string(), mimeType: z.string(), sizeBytes: z.string(), storageKey: z.string(), version: z.number().int().positive(), classification: z.string().nullable(), checksumSha256: z.string(), createdAt: z.string().datetime({ offset: true }), downloadUrl: z.string().url().nullable(), permissions: z.object({ read: z.boolean(), update: z.boolean(), export: z.boolean(), delete: z.boolean() }) });
export const FileSearchQuerySchema = z.object({ q: z.string().trim().min(1).max(200), limit: z.coerce.number().int().min(1).max(50).default(20) });
export const FileSearchResultSchema = z.object({ pages: z.array(PageSchema), files: z.array(FileAssetSchema) });

export type Page = z.infer<typeof PageSchema>;
export type PageCreateInput = z.infer<typeof PageCreateInputSchema>;
export type PageUpdateInput = z.infer<typeof PageUpdateInputSchema>;
export type PageVersion = z.infer<typeof PageVersionSchema>;
export type PagePublishInput = z.infer<typeof PagePublishInputSchema>;
export type FileUploadIntentInput = z.infer<typeof FileUploadIntentInputSchema>;
export type FileCompleteInput = z.infer<typeof FileCompleteInputSchema>;
export type FileAsset = z.infer<typeof FileAssetSchema>;
