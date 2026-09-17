import { randomUUID } from "node:crypto";
import { generateHumanId, prepareWorkObjectCreate } from "@oryon/core";
import type {
	ChannelCreateInput,
	DirectChannelCreateInput,
	MessageConversionInput,
	MessageCreateInput,
	MessageUpdateInput,
	ReactionInput,
} from "@oryon/contracts/communication";
import type { ObjectTypeDefContract } from "@oryon/contracts/work-object";
import type { Prisma, PrismaClient } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";

function channelKey(name: string): string {
	return `${name
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")}-${randomUUID().slice(0, 8)}`;
}
function encodeCursor(value: { createdAt: Date; id: string }): string {
	return Buffer.from(
		JSON.stringify({ createdAt: value.createdAt.toISOString(), id: value.id }),
		"utf8",
	).toString("base64url");
}
function decodeCursor(
	cursor: string | undefined,
): { createdAt: Date; id: string } | null {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(
			Buffer.from(cursor, "base64url").toString("utf8"),
		) as { createdAt?: string; id?: string };
		if (!parsed.createdAt || !parsed.id) return null;
		const createdAt = new Date(parsed.createdAt);
		return Number.isNaN(createdAt.getTime())
			? null
			: { createdAt, id: parsed.id };
	} catch {
		return null;
	}
}

export class CommunicationRepository {
	private readonly db: PrismaClient;
	constructor(db: PrismaClient) {
		this.db = db;
	}

	async listChannels(orgId: string, userId: string) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const memberships = await tx.channelMember.findMany({
				where: { orgId, userId },
				include: { channel: true },
			});
			const channels = memberships
				.filter((row) => row.channel.archivedAt === null)
				.map((row) => row.channel);
			return channels.sort((a, b) => a.name.localeCompare(b.name));
		});
	}

	async createChannel(
		orgId: string,
		actorId: string,
		input: ChannelCreateInput,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			if (input.workspaceId) {
				const workspace = await tx.workspace.findFirst({
					where: { id: input.workspaceId, orgId, deletedAt: null },
					select: { id: true },
				});
				if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
			}
			const channel = await tx.channel.create({
				data: {
					orgId,
					workspaceId: input.workspaceId ?? null,
					key: channelKey(input.name),
					name: input.name,
					topic: input.topic ?? null,
					purpose: input.purpose ?? null,
					kind: input.kind,
					visibility: input.visibility,
					isShared: false,
					sharedWithOrgIds: [],
					linkedObjectId: input.linkedObjectId ?? null,
					createdBy: actorId,
				},
			});
			await tx.channelMember.create({
				data: {
					orgId,
					channelId: channel.id,
					userId: actorId,
					role: "OWNER",
					notification: "ALL",
				},
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Channel",
				subjectId: channel.id,
				name: "communication.channel.created",
				payload: {
					channelId: channel.id,
					name: channel.name,
					kind: channel.kind,
				},
			});
			return channel;
		});
	}

	async findDirectChannel(orgId: string, userIds: string[]) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const uniqueIds = [...new Set(userIds)].sort();
			const memberships = await tx.channelMember.findMany({
				where: {
					orgId,
					userId: { in: uniqueIds },
					channel: { kind: { in: ["DM", "GROUP_DM"] }, archivedAt: null },
				},
				include: {
					channel: { include: { members: { select: { userId: true } } } },
				},
			});
			return (
				memberships
					.map((row) => row.channel)
					.find(
						(channel) =>
							[...channel.members.map((member) => member.userId)]
								.sort()
								.join(",") === uniqueIds.join(","),
					) ?? null
			);
		});
	}

	async createDirectChannel(
		orgId: string,
		actorId: string,
		input: DirectChannelCreateInput,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const userIds = [...new Set([actorId, ...input.userIds])];
			const users = await tx.user.findMany({
				where: {
					orgId,
					id: { in: userIds },
					status: "ACTIVE",
					deletedAt: null,
				},
				select: { id: true },
			});
			if (users.length !== userIds.length) throw new Error("USER_NOT_FOUND");
			const kind = userIds.length === 2 ? "DM" : "GROUP_DM";
			const channel = await tx.channel.create({
				data: {
					orgId,
					key: channelKey(input.name ?? kind.toLowerCase()),
					name: input.name ?? "Conversa directa",
					topic: null,
					purpose: null,
					kind,
					visibility: "PRIVATE",
					isShared: false,
					sharedWithOrgIds: [],
					linkedObjectId: null,
					createdBy: actorId,
				},
			});
			await tx.channelMember.createMany({
				data: userIds.map((userId) => ({
					orgId,
					channelId: channel.id,
					userId,
					role: userId === actorId ? "OWNER" : "MEMBER",
					notification: "ALL",
				})),
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Channel",
				subjectId: channel.id,
				name: "communication.channel.created",
				payload: { channelId: channel.id, kind, userIds },
			});
			return channel;
		});
	}

	async getMembership(orgId: string, channelId: string, userId: string) {
		return withOrgContext(this.db, orgId, (tx) =>
			tx.channelMember.findFirst({
				where: { orgId, channelId, userId, channel: { archivedAt: null } },
				include: { channel: true },
			}),
		);
	}

	async listMessages(
		orgId: string,
		channelId: string,
		userId: string,
		limit: number,
		cursor?: string,
		parentId?: string | null,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const membership = await tx.channelMember.findFirst({
				where: { orgId, channelId, userId },
			});
			if (!membership) throw new Error("NOT_FOUND");
			const decoded = decodeCursor(cursor);
			const messages = await tx.message.findMany({
				where: {
					orgId,
					channelId,
					deletedAt: null,
					...(parentId === undefined ? { parentId: null } : { parentId }),
					...(decoded
						? {
								OR: [
									{ createdAt: { lt: decoded.createdAt } },
									{ createdAt: decoded.createdAt, id: { lt: decoded.id } },
								],
							}
						: {}),
				},
				include: {
					author: {
						select: {
							id: true,
							name: true,
							displayName: true,
							avatarUrl: true,
							presence: true,
						},
					},
					reactions: { select: { emoji: true, userId: true } },
				},
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				take: limit + 1,
			});
			const next = messages.length > limit ? messages[limit - 1] : null;
			return {
				messages: messages.slice(0, limit).reverse(),
				nextCursor: next
					? encodeCursor({ createdAt: next.createdAt, id: next.id })
					: null,
			};
		});
	}

	async catchUp(
		orgId: string,
		channelId: string,
		userId: string,
		since: Date | undefined,
		limit: number,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const membership = await tx.channelMember.findFirst({
				where: { orgId, channelId, userId },
			});
			if (!membership) throw new Error("NOT_FOUND");
			return tx.message.findMany({
				where: {
					orgId,
					channelId,
					deletedAt: null,
					...(since ? { createdAt: { gt: since } } : {}),
				},
				include: {
					author: {
						select: {
							id: true,
							name: true,
							displayName: true,
							avatarUrl: true,
							presence: true,
						},
					},
					reactions: { select: { emoji: true, userId: true } },
				},
				orderBy: [{ createdAt: "asc" }, { id: "asc" }],
				take: limit,
			});
		});
	}

	async createMessage(
		orgId: string,
		actorId: string,
		channelId: string,
		input: MessageCreateInput,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const membership = await tx.channelMember.findFirst({
				where: { orgId, channelId, userId: actorId },
			});
			if (!membership) throw new Error("NOT_FOUND");
			if (input.parentId) {
				const parent = await tx.message.findFirst({
					where: { orgId, channelId, id: input.parentId, deletedAt: null },
					select: { id: true },
				});
				if (!parent) throw new Error("PARENT_MESSAGE_NOT_FOUND");
			}
			if (input.mediaFileId) {
				const file = await tx.fileAsset.findFirst({
					where: { orgId, id: input.mediaFileId, deletedAt: null },
					select: { id: true },
				});
				if (!file) throw new Error("FILE_NOT_FOUND");
			}
			const message = await tx.message.create({
				data: {
					orgId,
					channelId,
					parentId: input.parentId ?? null,
					authorId: actorId,
					authorType: "MEMBER",
					bodyJson: {
						type: "doc",
						content: [
							{
								type: "paragraph",
								content: [{ type: "text", text: input.bodyText }],
							},
						],
					},
					bodyText: input.bodyText,
					mentions: [...new Set(input.mentions)],
					kind: input.kind,
					mediaFileId: input.mediaFileId ?? null,
				},
				include: {
					author: {
						select: {
							id: true,
							name: true,
							displayName: true,
							avatarUrl: true,
							presence: true,
						},
					},
					reactions: { select: { emoji: true, userId: true } },
				},
			});
			if (input.parentId)
				await tx.message.update({
					where: { id: input.parentId },
					data: { replyCount: { increment: 1 } },
				});
			for (const mentionedUserId of message.mentions) {
				if (mentionedUserId === actorId) continue;
				const target = await tx.channelMember.findFirst({
					where: { orgId, channelId, userId: mentionedUserId },
				});
				if (!target) continue;
				await tx.notification.create({
					data: {
						orgId,
						userId: mentionedUserId,
						kind: "MENTION",
						title: "Você foi mencionado",
						body: message.bodyText.slice(0, 240),
						targetType: "message",
						targetId: message.id,
						priority: "NORMAL",
						channels: ["IN_APP"],
					},
				});
			}
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Message",
				subjectId: message.id,
				name: "communication.message.created",
				payload: {
					channelId,
					parentId: message.parentId,
					mentions: message.mentions,
				},
			});
			return message;
		});
	}

	async updateMessage(
		orgId: string,
		actorId: string,
		messageId: string,
		input: MessageUpdateInput,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const current = await tx.message.findFirst({
				where: { orgId, id: messageId, deletedAt: null },
			});
			if (!current) throw new Error("NOT_FOUND");
			if (current.authorId !== actorId) throw new Error("PERMISSION_DENIED");
			const message = await tx.message.update({
				where: { id: messageId },
				data: {
					bodyText: input.bodyText,
					bodyJson: {
						type: "doc",
						content: [
							{
								type: "paragraph",
								content: [{ type: "text", text: input.bodyText }],
							},
						],
					},
					editedAt: new Date(),
				},
				include: {
					author: {
						select: {
							id: true,
							name: true,
							displayName: true,
							avatarUrl: true,
							presence: true,
						},
					},
					reactions: { select: { emoji: true, userId: true } },
				},
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Message",
				subjectId: messageId,
				name: "communication.message.updated",
				payload: { channelId: current.channelId },
			});
			return message;
		});
	}

	async softDeleteMessage(orgId: string, actorId: string, messageId: string) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const current = await tx.message.findFirst({
				where: { orgId, id: messageId, deletedAt: null },
				select: { id: true, channelId: true, authorId: true },
			});
			if (!current) throw new Error("NOT_FOUND");
			if (current.authorId !== actorId) throw new Error("PERMISSION_DENIED");
			await tx.message.update({
				where: { id: messageId },
				data: {
					deletedAt: new Date(),
					bodyText: "",
					bodyJson: { type: "doc", content: [] },
				},
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Message",
				subjectId: messageId,
				name: "communication.message.deleted",
				payload: { channelId: current.channelId },
			});
			return current;
		});
	}

	async addReaction(
		orgId: string,
		actorId: string,
		messageId: string,
		input: ReactionInput,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const message = await tx.message.findFirst({
				where: { orgId, id: messageId, deletedAt: null },
				select: { id: true, channelId: true },
			});
			if (!message) throw new Error("NOT_FOUND");
			const member = await tx.channelMember.findFirst({
				where: { orgId, channelId: message.channelId, userId: actorId },
			});
			if (!member) throw new Error("NOT_FOUND");
			const reaction = await tx.reaction.create({
				data: {
					orgId,
					messageId,
					targetType: "message",
					targetId: messageId,
					userId: actorId,
					emoji: input.emoji,
				},
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Reaction",
				subjectId: reaction.id,
				name: "communication.reaction.created",
				payload: { messageId, emoji: input.emoji },
			});
			return { channelId: message.channelId, reaction };
		});
	}

	async removeReaction(
		orgId: string,
		actorId: string,
		messageId: string,
		emoji: string,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const message = await tx.message.findFirst({
				where: { orgId, id: messageId, deletedAt: null },
				select: { id: true, channelId: true },
			});
			if (!message) throw new Error("NOT_FOUND");
			const reaction = await tx.reaction.findFirst({
				where: { orgId, messageId, userId: actorId, emoji },
			});
			if (!reaction) throw new Error("NOT_FOUND");
			await tx.reaction.delete({ where: { id: reaction.id } });
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Reaction",
				subjectId: reaction.id,
				name: "communication.reaction.deleted",
				payload: { messageId, emoji },
			});
			return { channelId: message.channelId, reactionId: reaction.id };
		});
	}

	async listNotifications(
		orgId: string,
		userId: string,
		unreadOnly: boolean,
		limit: number,
	) {
		return withOrgContext(this.db, orgId, (tx) =>
			tx.notification.findMany({
				where: { orgId, userId, ...(unreadOnly ? { readAt: null } : {}) },
				orderBy: { createdAt: "desc" },
				take: limit,
			}),
		);
	}

	async unreadCount(orgId: string, userId: string): Promise<number> {
		return withOrgContext(this.db, orgId, (tx) =>
			tx.notification.count({ where: { orgId, userId, readAt: null } }),
		);
	}

	async markNotificationRead(
		orgId: string,
		userId: string,
		notificationId: string,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const notification = await tx.notification.findFirst({
				where: { orgId, id: notificationId, userId },
			});
			if (!notification) throw new Error("NOT_FOUND");
			const updated = await tx.notification.update({
				where: { id: notificationId },
				data: { readAt: notification.readAt ?? new Date() },
			});
			return updated;
		});
	}

	async markAllNotificationsRead(orgId: string, userId: string) {
		return withOrgContext(this.db, orgId, (tx) =>
			tx.notification.updateMany({
				where: { orgId, userId, readAt: null },
				data: { readAt: new Date() },
			}),
		);
	}

	async convertMessageToWorkObject(
		orgId: string,
		actorId: string,
		messageId: string,
		input: MessageConversionInput,
	): Promise<{ messageId: string; workObjectId: string; edgeId: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const message = await tx.message.findFirst({
				where: { orgId, id: messageId, deletedAt: null },
				include: { channel: true },
			});
			if (!message) throw new Error("NOT_FOUND");
			const membership = await tx.channelMember.findFirst({
				where: { orgId, channelId: message.channelId, userId: actorId },
			});
			if (!membership) throw new Error("NOT_FOUND");
			const existing = await tx.edge.findFirst({
				where: {
					orgId,
					fromType: "message",
					fromId: message.id,
					toType: "work_object",
					relation: "DERIVED_FROM",
					deletedAt: null,
				},
			});
			if (existing) throw new Error("CONFLICT");
			const typeRow = await tx.objectTypeDef.findFirst({
				where: { orgId, key: input.typeKey },
			});
			if (!typeRow) throw new Error("OBJECT_TYPE_NOT_FOUND");
			const typeDef: ObjectTypeDefContract = {
				id: typeRow.id,
				key: typeRow.key,
				name: typeRow.name,
				pluralName: typeRow.pluralName,
				icon: typeRow.icon,
				isSystem: typeRow.isSystem,
				idPrefix: typeRow.idPrefix,
				schema: typeRow.schema as ObjectTypeDefContract["schema"],
				statusModel:
					typeRow.statusModel as ObjectTypeDefContract["statusModel"],
			};
			const prepared = prepareWorkObjectCreate(
				{
					typeKey: input.typeKey,
					workspaceId: input.workspaceId ?? null,
					title: input.title?.trim() || message.bodyText.slice(0, 500),
					description: message.bodyText,
					tags: [],
					customFields: {},
					priority: "NORMAL",
				},
				typeDef,
			);
			const workObjectId = randomUUID();
			const objectState = typeDef.statusModel.states.find(
				(state) => state.key === prepared.status,
			);
			if (!objectState) throw new Error("INVALID_STATUS");
			const object = await tx.workObject.create({
				data: {
					id: workObjectId,
					orgId,
					workspaceId:
						prepared.workspaceId ?? message.channel.workspaceId ?? null,
					typeKey: prepared.typeKey,
					typeDefId: typeRow.id,
					humanId: generateHumanId(workObjectId, typeRow.idPrefix),
					title: prepared.title,
					description: prepared.description ?? null,
					status: prepared.status,
					statusCategory: objectState.category,
					priority: prepared.priority ?? "NORMAL",
					ownerId: prepared.ownerId ?? actorId,
					parentObjectId: null,
					startAt: null,
					dueAt: null,
					progress: prepared.progress ?? 0,
					probability: null,
					secondaryDate: null,
					externalRef: `message:${message.id}`,
					severity: null,
					classification: null,
					tags: prepared.tags,
					customFields: JSON.parse(
						JSON.stringify(prepared.customFields),
					) as Prisma.InputJsonValue,
					createdBy: actorId,
				},
			});
			if (object.workspaceId)
				await tx.objectPlacement.create({
					data: {
						orgId,
						objectId: workObjectId,
						containerType: "WORKSPACE",
						containerId: object.workspaceId,
						position: "0",
						isPrimary: true,
					},
				});
			const edge = await tx.edge.create({
				data: {
					orgId,
					fromType: "message",
					fromId: message.id,
					toType: "work_object",
					toId: object.id,
					relation: "DERIVED_FROM",
					createdBy: actorId,
					metadata: {
						source: "communication.convert",
					} as Prisma.InputJsonValue,
				},
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Message",
				subjectId: message.id,
				name: "communication.message.converted",
				payload: { workObjectId: object.id, edgeId: edge.id },
			});
			return { messageId, workObjectId: object.id, edgeId: edge.id };
		});
	}
}
