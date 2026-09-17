import type { PermissionResource } from "@oryon/contracts/permissions";
import type { PrismaClient } from "../generated/client.js";
import { withOrgContext } from "../tenant.js";

export class ResourceRepository {
	constructor(private readonly db: PrismaClient) {}

	async resolve(
		orgId: string,
		type: string,
		id: string,
	): Promise<PermissionResource | null> {
		return withOrgContext(this.db, orgId, async (tx) => {
			switch (type) {
				case "work_object": {
					const row = await tx.workObject.findFirst({
						where: { orgId, id, deletedAt: null },
						select: { id: true, workspaceId: true, ownerId: true, classification: true },
					});
					return row ? this.resource(orgId, type, row.id, row.workspaceId, null, row.ownerId, null, row.classification) : null;
				}
				case "workspace": {
					const row = await tx.workspace.findFirst({
						where: { orgId, id, deletedAt: null },
						select: { id: true },
					});
					return row ? this.resource(orgId, type, row.id, row.id) : null;
				}
				case "page": {
					const row = await tx.page.findFirst({
						where: { orgId, id, deletedAt: null },
						select: { id: true, workspaceId: true, ownerId: true, classification: true },
					});
					return row ? this.resource(orgId, type, row.id, row.workspaceId, null, row.ownerId, null, row.classification) : null;
				}
				case "channel": {
					const row = await tx.channel.findFirst({
						where: { orgId, id, archivedAt: null },
						select: { id: true, workspaceId: true, createdBy: true, aiExcluded: true },
					});
					return row ? this.resource(orgId, type, row.id, row.workspaceId, null, row.createdBy, null, row.aiExcluded ? "AI_EXCLUDED" : null) : null;
				}
				case "meeting": {
					const row = await tx.meeting.findFirst({
						where: { orgId, id },
						select: { id: true, createdBy: true },
					});
					return row ? this.resource(orgId, type, row.id, null, null, row.createdBy) : null;
				}
				case "team": {
					const row = await tx.team.findFirst({
						where: { orgId, id, deletedAt: null },
						select: { id: true, leadUserId: true },
					});
					return row ? this.resource(orgId, type, row.id, null, null, row.leadUserId, row.id) : null;
				}
				case "user": {
					const row = await tx.user.findFirst({
						where: { orgId, id, deletedAt: null },
						select: { id: true },
					});
					return row ? this.resource(orgId, type, row.id, null, null, row.id) : null;
				}
				case "workflow": {
					const row = await tx.workflow.findFirst({
						where: { orgId, id },
						select: { id: true, createdBy: true },
					});
					return row ? this.resource(orgId, type, row.id, null, null, row.createdBy) : null;
				}
				case "agent": {
					const row = await tx.agent.findFirst({
						where: { orgId, id, deletedAt: null },
						select: { id: true, principalId: true },
					});
					return row ? this.resource(orgId, type, row.id, null, null, row.principalId) : null;
				}
				case "file": {
					const row = await tx.fileAsset.findFirst({
						where: { orgId, id, deletedAt: null },
						select: { id: true, uploadedBy: true, classification: true },
					});
					return row ? this.resource(orgId, type, row.id, null, null, row.uploadedBy, null, row.classification) : null;
				}
				case "data_base": {
					const row = await tx.dataBase.findFirst({
						where: { orgId, id },
						select: { id: true, workspaceId: true },
					});
					return row ? this.resource(orgId, type, row.id, row.workspaceId) : null;
				}
				case "data_record": {
					const row = await tx.dataRecord.findFirst({
						where: { orgId, id, deletedAt: null },
						select: { id: true, createdBy: true },
					});
					return row ? this.resource(orgId, type, row.id, null, null, row.createdBy) : null;
				}
				case "edge":
					return this.resource(orgId, type, id);
				default:
					return null;
			}
		});
	}

	collection(orgId: string, type: string, workspaceId: string | null = null): PermissionResource {
		return this.resource(orgId, type, "__collection__", workspaceId);
	}

	private resource(
		orgId: string,
		type: string,
		id: string,
		workspaceId: string | null = null,
		projectId: string | null = null,
		ownerId: string | null = null,
		teamId: string | null = null,
		classification: string | null = null,
	): PermissionResource {
		return {
			orgId,
			type,
			id,
			workspaceId,
			projectId,
			ownerId,
			teamId,
			classification,
		};
	}
}
