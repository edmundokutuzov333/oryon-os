import { CommunicationRepository } from "./communication.repository.js";
import { withOrgContext } from "../tenant.js";
import type { PrismaClient } from "../generated/client.js";

export class CommunicationEnhancedRepository extends CommunicationRepository {
	private readonly database: PrismaClient;

	constructor(db: PrismaClient) {
		super(db);
		this.database = db;
	}

	async listChannelsDetailed(orgId: string, userId: string) {
		return withOrgContext(this.database, orgId, async (tx) => {
			const memberships = await tx.channelMember.findMany({
				where: { orgId, userId, channel: { archivedAt: null } },
				include: { channel: true },
			});
			const result = [];
			for (const membership of memberships) {
				const [memberCount, unreadCount] = await Promise.all([
					tx.channelMember.count({
						where: { orgId, channelId: membership.channelId },
					}),
					tx.message.count({
						where: {
							orgId,
							channelId: membership.channelId,
							deletedAt: null,
							...(membership.lastReadAt
								? { createdAt: { gt: membership.lastReadAt } }
								: {}),
						},
					}),
				]);
				result.push({
					channel: membership.channel,
					memberCount,
					unreadCount,
					lastReadAt: membership.lastReadAt,
				});
			}
			return result.sort((a, b) =>
				a.channel.name.localeCompare(b.channel.name),
			);
		});
	}

	async markChannelRead(orgId: string, userId: string, channelId: string) {
		return withOrgContext(this.database, orgId, async (tx) => {
			const membership = await tx.channelMember.findFirst({
				where: { orgId, channelId, userId },
			});
			if (!membership) throw new Error("NOT_FOUND");
			const lastReadAt = new Date();
			await tx.channelMember.update({
				where: { id: membership.id },
				data: { lastReadAt },
			});
			return { channelId, lastReadAt };
		});
	}

	async listPeople(orgId: string, query: string | undefined, limit: number) {
		return withOrgContext(this.database, orgId, (tx) =>
			tx.user.findMany({
				where: {
					orgId,
					status: "ACTIVE",
					deletedAt: null,
					...(query
						? {
								OR: [
									{ name: { contains: query, mode: "insensitive" } },
									{ displayName: { contains: query, mode: "insensitive" } },
									{ email: { contains: query, mode: "insensitive" } },
								],
							}
						: {}),
				},
				select: {
					id: true,
					name: true,
					displayName: true,
					avatarUrl: true,
					presence: true,
					email: true,
				},
				orderBy: [{ displayName: "asc" }, { name: "asc" }],
				take: Math.min(Math.max(limit, 1), 50),
			}),
		);
	}
}
