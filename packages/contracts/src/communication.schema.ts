import { z } from "zod";

const iso = z.string().datetime({ offset: true });
const principal = z.object({ id: z.string().min(1), name: z.string().min(1), displayName: z.string().nullable(), avatarUrl: z.string().url().nullable(), presence: z.enum(["ONLINE", "AWAY", "BUSY", "IN_MEETING", "FOCUS", "DND", "OFFLINE"]) });

export const ChannelKindSchema = z.enum(["TEXT", "FORUM", "VOICE", "STAGE", "ANNOUNCEMENT", "DM", "GROUP_DM"]);
export const MessageKindSchema = z.enum(["TEXT", "VOICE", "VIDEO", "FILE", "SYSTEM", "CANVAS", "POLL"]);
export const NotificationLevelSchema = z.enum(["ALL", "MENTIONS", "NONE"]);
export const ChannelRoleSchema = z.enum(["OWNER", "ADMIN", "MODERATOR", "MEMBER", "GUEST"]);

export const ChannelSchema = z.object({
  id: z.string().min(1), orgId: z.string().min(1), workspaceId: z.string().nullable(), key: z.string().min(1), name: z.string().min(1), topic: z.string().nullable(), purpose: z.string().nullable(), kind: ChannelKindSchema, visibility: z.enum(["PUBLIC", "ORG", "TEAM", "PRIVATE"]), isShared: z.boolean(), linkedObjectId: z.string().nullable(), archivedAt: iso.nullable(), createdAt: iso, memberCount: z.number().int().nonnegative(), unreadCount: z.number().int().nonnegative(), permissions: z.object({ read: z.boolean(), post: z.boolean(), manage: z.boolean() })
});

export const ChannelCreateInputSchema = z.object({ name: z.string().trim().min(1).max(120), topic: z.string().trim().max(300).nullable().optional(), purpose: z.string().trim().max(500).nullable().optional(), kind: ChannelKindSchema.default("TEXT"), workspaceId: z.string().min(1).nullable().optional(), visibility: z.enum(["PUBLIC", "ORG", "TEAM", "PRIVATE"]).default("ORG"), linkedObjectId: z.string().min(1).nullable().optional() });
export const DirectChannelCreateInputSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(25), name: z.string().trim().max(120).nullable().optional() });

export const MessageSchema = z.object({
  id: z.string().min(1), orgId: z.string().min(1), channelId: z.string().min(1), parentId: z.string().nullable(), authorId: z.string().min(1), authorType: z.enum(["MEMBER", "GUEST", "CLIENT", "VENDOR", "AGENT", "SERVICE_ACCOUNT"]), bodyText: z.string(), mentions: z.array(z.string()), kind: MessageKindSchema, mediaFileId: z.string().nullable(), replyCount: z.number().int().nonnegative(), resolvedAt: iso.nullable(), pinnedAt: iso.nullable(), editedAt: iso.nullable(), scheduledFor: iso.nullable(), createdAt: iso, author: principal, reactions: z.array(z.object({ emoji: z.string().min(1).max(32), count: z.number().int().positive(), reacted: z.boolean() })), permissions: z.object({ read: z.boolean(), update: z.boolean(), delete: z.boolean(), react: z.boolean(), reply: z.boolean(), convert: z.boolean() })
});
export const MessageCreateInputSchema = z.object({ bodyText: z.string().trim().min(1).max(20000), parentId: z.string().min(1).nullable().optional(), mentions: z.array(z.string().min(1)).max(50).default([]), kind: MessageKindSchema.default("TEXT"), mediaFileId: z.string().min(1).nullable().optional() });
export const MessageUpdateInputSchema = z.object({ bodyText: z.string().trim().min(1).max(20000) });
export const ReactionInputSchema = z.object({ emoji: z.string().trim().min(1).max(32) });
export const MessageListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().min(1).optional(), parentId: z.string().min(1).nullable().optional() });
export const CatchUpQuerySchema = z.object({ since: z.string().datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

export const NotificationSchema = z.object({ id: z.string().min(1), kind: z.string().min(1), title: z.string().min(1), body: z.string().nullable(), targetType: z.string().nullable(), targetId: z.string().nullable(), priority: z.enum(["LOWEST", "LOW", "NORMAL", "HIGH", "URGENT"]), readAt: iso.nullable(), archivedAt: iso.nullable(), deliverAt: iso, createdAt: iso });
export const NotificationListQuerySchema = z.object({ unreadOnly: z.coerce.boolean().default(false), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const MessageConversionInputSchema = z.object({ typeKey: z.string().min(1).default("task"), workspaceId: z.string().min(1).nullable().optional(), title: z.string().trim().max(500).optional() });
export const MessageConversionResponseSchema = z.object({ messageId: z.string().min(1), workObjectId: z.string().min(1), edgeId: z.string().min(1) });

export const CommunicationEventSchema = z.object({ event: z.enum(["message.created", "message.updated", "message.deleted", "reaction.updated", "notification.created", "channel.updated"]), channelId: z.string().nullable(), messageId: z.string().nullable(), notificationId: z.string().nullable(), payload: z.unknown() });

export type Channel = z.infer<typeof ChannelSchema>;
export type ChannelCreateInput = z.infer<typeof ChannelCreateInputSchema>;
export type DirectChannelCreateInput = z.infer<typeof DirectChannelCreateInputSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type MessageCreateInput = z.infer<typeof MessageCreateInputSchema>;
export type MessageUpdateInput = z.infer<typeof MessageUpdateInputSchema>;
export type ReactionInput = z.infer<typeof ReactionInputSchema>;
export type MessageListQuery = z.infer<typeof MessageListQuerySchema>;
export type CatchUpQuery = z.infer<typeof CatchUpQuerySchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;
export type MessageConversionInput = z.infer<typeof MessageConversionInputSchema>;
export type MessageConversionResponse = z.infer<typeof MessageConversionResponseSchema>;
