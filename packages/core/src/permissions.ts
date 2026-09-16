import type { PermissionAction, PermissionClassification, PermissionDecision, PermissionEvaluateInput, PermissionEvaluation, PermissionGrant, PermissionResource, PermissionRoleBinding, PermissionSubject } from "@oryon/contracts/permissions";

export type PermissionPolicyContext = {
	orgId: string;
	subject: PermissionSubject;
	roles: PermissionRoleBinding[];
	grants: PermissionGrant[];
	classification: PermissionClassification | null;
};

const ACTIONS: PermissionAction[] = ["read", "create", "update", "delete", "comment", "manage", "share", "export", "use_ai", "use_external", "view_as"];
const LEVEL_ACTIONS: Record<PermissionGrant["level"], readonly PermissionAction[]> = {
	VIEW: ["read"],
	COMMENT: ["read", "comment"],
	EDIT: ["read", "comment", "update"],
	MANAGE: ["read", "comment", "update", "delete", "manage", "share", "export"],
	OWNER: ["read", "comment", "update", "delete", "manage", "share", "export"],
};

function notExpired(expiresAt: string | null, now: Date): boolean {
	return expiresAt === null || new Date(expiresAt).getTime() > now.getTime();
}

function scopeMatches(binding: PermissionRoleBinding, resource: PermissionResource, subject: PermissionSubject): boolean {
	switch (binding.scopeType) {
		case "ORG": return binding.scopeId === resource.orgId || binding.scopeId === null;
		case "WORKSPACE": return binding.scopeId === resource.workspaceId;
		case "PROJECT": return binding.scopeId === resource.projectId;
		case "OBJECT": return binding.scopeId === resource.id;
		case "TEAM": return binding.scopeId !== null && subject.teamIds.includes(binding.scopeId);
		default: return false;
	}
}

function permissionStringMatches(permission: string, resourceType: string, action: PermissionAction): boolean {
	if (permission === "*") return true;
	const normalized = permission.toLowerCase();
	return normalized === action || normalized === `${resourceType.toLowerCase()}:*` || normalized === `${resourceType.toLowerCase()}:${action}`;
}

function roleAllows(roles: PermissionRoleBinding[], resource: PermissionResource, subject: PermissionSubject, action: PermissionAction, now: Date) {
	for (const role of roles) {
		if (!notExpired(role.expiresAt, now) || !scopeMatches(role, resource, subject)) continue;
		if (role.permissions.some((permission) => permissionStringMatches(permission, resource.type, action))) return { allowed: true, matchedBy: `role:${role.scopeType.toLowerCase()}` };
	}
	return { allowed: false, matchedBy: null as string | null };
}

function grantMatches(grant: PermissionGrant, resource: PermissionResource, subject: PermissionSubject, now: Date): boolean {
	if (grant.resourceType !== resource.type || grant.resourceId !== resource.id || grant.revokedAt !== null || !notExpired(grant.expiresAt, now)) return false;
	return grant.principalId === subject.id || (grant.teamId !== null && subject.teamIds.includes(grant.teamId)) || (grant.externalEmail !== null && grant.externalEmail === subject.email);
}

function grantAllows(grants: PermissionGrant[], resource: PermissionResource, subject: PermissionSubject, action: PermissionAction, now: Date) {
	for (const grant of grants) {
		if (!grantMatches(grant, resource, subject, now)) continue;
		if (action === "use_external" && grant.externalEmail !== null) return { allowed: true, matchedBy: "grant:external_email" };
		if (action === "use_ai" && (grant.level === "MANAGE" || grant.level === "OWNER")) return { allowed: true, matchedBy: `grant:${grant.level.toLowerCase()}` };
		if ((LEVEL_ACTIONS[grant.level] ?? []).includes(action)) return { allowed: true, matchedBy: `grant:${grant.level.toLowerCase()}` };
	}
	return { allowed: false, matchedBy: null as string | null };
}

function baseDecision(context: PermissionPolicyContext, resource: PermissionResource, action: PermissionAction, now: Date): PermissionDecision {
	if (resource.orgId !== context.orgId || context.subject.id.length === 0) return { allowed: false, effect: "deny", action, reason: "org_mismatch", matchedBy: null };
	if (context.classification?.blocksExternal && action === "use_external") return { allowed: false, effect: "deny", action, reason: "classification_blocks_external", matchedBy: `classification:${context.classification.key}` };
	if (context.classification?.blocksAi && action === "use_ai") return { allowed: false, effect: "deny", action, reason: "classification_blocks_ai", matchedBy: `classification:${context.classification.key}` };
	if (context.classification?.blocksDownload && action === "export") return { allowed: false, effect: "deny", action, reason: "classification_blocks_download", matchedBy: `classification:${context.classification.key}` };
	if (action === "use_external" || action === "use_ai") {
		const grant = grantAllows(context.grants, resource, context.subject, action, now);
		if (grant.allowed) return { allowed: true, effect: "allow", action, reason: "explicit_grant", matchedBy: grant.matchedBy };
		const role = roleAllows(context.roles, resource, context.subject, action, now);
		if (role.allowed) return { allowed: true, effect: "allow", action, reason: "role_policy", matchedBy: role.matchedBy };
		return { allowed: false, effect: "deny", action, reason: "exposure_not_granted", matchedBy: null };
	}
	if (resource.ownerId === context.subject.id && ["read", "comment", "update", "delete", "manage", "share", "export"].includes(action)) return { allowed: true, effect: "allow", action, reason: "resource_owner", matchedBy: "owner" };
	const grant = grantAllows(context.grants, resource, context.subject, action, now);
	if (grant.allowed) return { allowed: true, effect: "allow", action, reason: "explicit_grant", matchedBy: grant.matchedBy };
	const role = roleAllows(context.roles, resource, context.subject, action, now);
	if (role.allowed) return { allowed: true, effect: "allow", action, reason: "role_policy", matchedBy: role.matchedBy };
	if (action === "read" && context.subject.type === "MEMBER" && resource.workspaceId !== null) return { allowed: true, effect: "allow", action, reason: "member_workspace_baseline", matchedBy: "membership" };
	return { allowed: false, effect: "deny", action, reason: "no_matching_policy", matchedBy: null };
}

function fieldAccess(fields: string[], grants: PermissionGrant[], subject: PermissionSubject, resource: PermissionResource, now: Date) {
	const result: Record<string, "visible" | "masked" | "hidden"> = Object.fromEntries(fields.map((field) => [field, "visible"]));
	for (const grant of grants) {
		if (!grantMatches(grant, resource, subject, now)) continue;
		for (const field of grant.fieldMask) if (field in result) result[field] = "masked";
	}
	return result;
}

export function can(context: PermissionPolicyContext, resource: PermissionResource, action: PermissionAction, now = new Date()): PermissionDecision {
	return baseDecision(context, resource, action, now);
}

export function evaluatePermissions(context: PermissionPolicyContext, input: PermissionEvaluateInput, now = new Date()): PermissionEvaluation {
	const resource = input.resource;
	const decisions = ACTIONS.map((action) => baseDecision(context, resource, action, now));
	const permissions = Object.fromEntries(decisions.map((decision) => [decision.action, decision.allowed])) as Record<PermissionAction, boolean>;
	const external = can(context, resource, "use_external", now);
	const ai = can(context, resource, "use_ai", now);
	const exportDecision = can(context, resource, "export", now);
	return {
		resource,
		permissions: { read: permissions.read, create: permissions.create, update: permissions.update, delete: permissions.delete, comment: permissions.comment, manage: permissions.manage, share: permissions.share, export: permissions.export, use_ai: permissions.use_ai, use_external: permissions.use_external, view_as: permissions.view_as },
		decisions,
		exposure: {
			external: { allowed: input.external && external.allowed, reason: input.external ? external.reason : "not_requested" },
			ai: { allowed: input.ai && ai.allowed, reason: input.ai ? ai.reason : "not_requested" },
			export: { allowed: exportDecision.allowed, reason: exportDecision.reason },
			watermark: context.classification?.watermark ?? false,
			fieldAccess: fieldAccess(input.fields, context.grants, context.subject, resource, now),
		},
		principal: context.subject,
	};
}

export function maskFields<T extends Record<string, unknown>>(value: T, fieldAccess: Record<string, "visible" | "masked" | "hidden">): Partial<T> {
	const output: Partial<T> = {};
	for (const [key, state] of Object.entries(fieldAccess)) {
		if (!(key in value) || state === "hidden") continue;
		output[key as keyof T] = state === "masked" ? ("••••••" as T[keyof T]) : value[key] as T[keyof T];
	}
	return output;
}
