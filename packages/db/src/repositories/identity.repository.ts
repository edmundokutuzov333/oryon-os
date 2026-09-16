import type { Prisma } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";
import { getPrisma } from "../index.js";

export class IdentityRepository {
	private readonly db = getPrisma();

	findActiveUserByEmail(orgId: string, email: string) {
		return withOrgContext(this.db, orgId, async (tx) =>
			tx.user.findFirst({
				where: { orgId, email: email.toLowerCase(), deletedAt: null, status: "ACTIVE" },
			}),
		);
	}

	async markAuthenticated(orgId: string, userId: string, sessionId: string): Promise<void> {
		await withOrgContext(this.db, orgId, async (tx) => {
			const now = new Date();
			await tx.user.updateMany({
				where: { id: userId, orgId, deletedAt: null },
				data: { emailVerified: now, lastSeenAt: now, presence: "ONLINE" },
			});
			await appendDomainEvent(tx, {
				orgId,
				name: "identity.session.created",
				version: 1,
				actorId: userId,
				actorType: "MEMBER",
				subjectType: "User",
				subjectId: userId,
				payload: { sessionId } satisfies Prisma.InputJsonValue,
			});
		});
	}

	getContext(orgId: string, userId: string) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const [user, organization, workspaces, memberships] = await Promise.all([
				tx.user.findFirst({ where: { id: userId, orgId, deletedAt: null } }),
				tx.organization.findFirst({ where: { id: orgId, deletedAt: null } }),
				tx.workspace.findMany({ where: { orgId, deletedAt: null }, orderBy: { name: "asc" } }),
				tx.teamMember.findMany({
					where: { orgId, userId },
					include: { team: true },
					orderBy: { joinedAt: "asc" },
				}),
			]);
			return { user, organization, workspaces, memberships };
		});
	}
}
