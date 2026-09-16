import { z } from "zod";

export const WorkObjectCommentSchema = z.object({
  id: z.string().min(1),
  objectId: z.string().min(1),
  parentId: z.string().nullable(),
  authorId: z.string().min(1),
  authorName: z.string().min(1),
  bodyText: z.string().min(1),
  mentions: z.array(z.string()),
  isInternal: z.boolean(),
  resolvedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const WorkObjectCommentCreateInputSchema = z.object({
  bodyText: z.string().trim().min(1).max(20000),
  parentId: z.string().min(1).nullable().optional(),
  mentions: z.array(z.string().min(1)).max(50).default([]),
  isInternal: z.boolean().default(false),
});

export const WorkObjectAttachmentSchema = z.object({
  id: z.string().min(1),
  fileId: z.string().min(1),
  objectId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.string().regex(/^\d+$/),
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
});

export const WorkObjectAttachmentCreateInputSchema = z.object({
  fileId: z.string().min(1),
});

export const WorkObjectHistoryEventSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["DOMAIN_EVENT", "STATUS_TRANSITION"]),
  name: z.string().min(1),
  actorId: z.string().nullable(),
  fromStatus: z.string().nullable(),
  toStatus: z.string().nullable(),
  comment: z.string().nullable(),
  occurredAt: z.string().datetime({ offset: true }),
});

export const WorkObjectHistoryResponseSchema = z.array(WorkObjectHistoryEventSchema);

export type WorkObjectComment = z.infer<typeof WorkObjectCommentSchema>;
export type WorkObjectCommentCreateInput = z.infer<typeof WorkObjectCommentCreateInputSchema>;
export type WorkObjectAttachment = z.infer<typeof WorkObjectAttachmentSchema>;
export type WorkObjectAttachmentCreateInput = z.infer<typeof WorkObjectAttachmentCreateInputSchema>;
export type WorkObjectHistoryEvent = z.infer<typeof WorkObjectHistoryEventSchema>;
