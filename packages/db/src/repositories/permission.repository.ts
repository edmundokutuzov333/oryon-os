import type { PermissionClassification, PermissionGrant, PermissionRoleBinding, PermissionSubject } from "@oryon/contracts/permissions";
import { getPrisma } from "../index.js";
import { withOrgContext } from "../tenant.js";

export type PermissionSnapshot = { subject: PermissionSubject; roles: PermissionRoleBinding[]; grants: PermissionGrant[]; classification: PermissionClassification | null };
export type ExternalExposureRow = { resourceType: string; resourceId: string; externalPrincipals: number; fieldMasked: boolean; expiresAt: Date | null };

export class PermissionRepository {
	private readonly db = getPrisma();
	async getSnapshot(orgId: string, userId: string, resourceType: string, resourceId: string, classificationKey?: string | null): Promise<PermissionSnapshot> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const user = await tx.user.findFirst({ where: { id: userId, orgId, deletedAt: null }, include: { teamMembers: { select: { teamId: true } }, channelMembers: { select: { channelId: true } }, roleBindings: { include: { role: { select: { permissions: true } } } } } });
			if (!user) throw new Error("UNAUTHENTICATED");
			const [grants, classification] = await Promise.all([tx.accessGrant.findMany({ where: { orgId, resourceType, resourceId } }), classificationKey ? tx.classificationLabel.findFirst({ where: { orgId, key: classificationKey } }) : Promise.resolve(null)]);
			return { subject: { id: user.id, type: user.type, email: user.email, teamIds: user.teamMembers.map((membership) => membership.teamId), channelIds: user.channelMembers.map((membership) => membership.channelId) }, roles: user.roleBindings.map((binding) => ({ permissions: binding.role.permissions, scopeType: binding.scopeType, scopeId: binding.scopeId, expiresAt: binding.expiresAt?.toISOString() ?? null })), grants: grants.map((grant) => ({ resourceType: grant.resourceType, resourceId: grant.resourceId, principalId: grant.principalId, teamId: grant.teamId, externalEmail: grant.externalEmail, level: grant.level, fieldMask: grant.fieldMask, expiresAt: grant.expiresAt?.toISOString() ?? null, revokedAt: grant.revokedAt?.toISOString() ?? null })), classification: classification ? { key: classification.key, rank: classification.rank, blocksExternal: classification.blocksExternal, blocksAi: classification.blocksAi, blocksDownload: classification.blocksDownload, watermark: classification.watermark } : null };
		});
	}
	async listExternalExposure(orgId: string): Promise<ExternalExposureRow[]> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const rows = await tx.accessGrant.findMany({ where: { orgId, externalEmail: { not: null }, revokedAt: null }, select: { resourceType: true, resourceId: true, fieldMask: true, expiresAt: true } }); const grouped = new Map<string, ExternalExposureRow>();
			for (const row of rows) { const key = `${row.resourceType}:${row.resourceId}`; const current = grouped.get(key); if (current) { current.externalPrincipals += 1; current.fieldMasked ||= row.fieldMask.length > 0; } else grouped.set(key, { resourceType: row.resourceType, resourceId: row.resourceId, externalPrincipals: 1, fieldMasked: row.fieldMask.length > 0, expiresAt: row.expiresAt }); }
			return [...grouped.values()];
		});
	}
	async createRole(orgId: string, input: { key: string; name: string; description?: string; permissions: string[] }): Promise<{ id: string }> { return withOrgContext(this.db, orgId, async (tx) => { const role = await tx.role.create({ data: { orgId, key: input.key, name: input.name, ...(input.description === undefined ? {} : { description: input.description }), permissions: input.permissions, isSystem: false } }); return { id: role.id }; }); }
	async bindRole(orgId: string, actorId: string, input: { roleId: string; principalId: string; scopeType: "ORG" | "WORKSPACE" | "TEAM" | "PROJECT" | "OBJECT"; scopeId?: string | null; expiresAt?: string | null }): Promise<{ id: string }> { return withOrgContext(this.db, orgId, async (tx) => { const binding = await tx.roleBinding.create({ data: { orgId, roleId: input.roleId, principalId: input.principalId, scopeType: input.scopeType, scopeId: input.scopeId ?? null, grantedBy: actorId, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } }); return { id: binding.id }; }); }
	async revokeRoleBinding(orgId: string, actorId: string, id: string): Promise<{ id: string }> { return withOrgContext(this.db, orgId, async (tx) => { const binding = await tx.roleBinding.findFirst({ where: { id, orgId } }); if (!binding) throw new Error("NOT_FOUND"); await tx.roleBinding.delete({ where: { id } }); return { id }; }); }
	async createGrant(orgId: string, actorId: string, input: { resourceType: string; resourceId: string; principalId?: string | null; teamId?: string | null; externalEmail?: string | null; level: "VIEW" | "COMMENT" | "EDIT" | "MANAGE" | "OWNER"; fieldMask: string[]; reason?: string; expiresAt?: string | null }): Promise<{ id: string }> { return withOrgContext(this.db, orgId, async (tx) => { const grant = await tx.accessGrant.create({ data: { orgId, resourceType: input.resourceType, resourceId: input.resourceId, principalId: input.principalId ?? null, teamId: input.teamId ?? null, externalEmail: input.externalEmail ?? null, level: input.level, fieldMask: input.fieldMask, grantedBy: actorId, ...(input.reason === undefined ? {} : { reason: input.reason }), expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } }); return { id: grant.id }; }); }
	async revokeGrant(orgId: string, actorId: string, id: string): Promise<{ id: string }> { return withOrgContext(this.db, orgId, async (tx) => { const grant = await tx.accessGrant.findFirst({ where: { id, orgId, revokedAt: null } }); if (!grant) throw new Error("NOT_FOUND"); await tx.accessGrant.update({ where: { id }, data: { revokedAt: new Date() } }); return { id }; }); }
}
