import type { FastifyRequest } from "fastify";
import { can } from "@oryon/core";
import type { PermissionAction, PermissionResource } from "@oryon/contracts/permissions";
import { PermissionRepository, ResourceRepository } from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";

const permissions = new PermissionRepository();
const resources = new ResourceRepository(getPrisma());

function header(request: FastifyRequest, name: string): string | undefined {
	const value = request.headers[name];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function organizationId(request: FastifyRequest): string {
	const value = header(request, "x-oryon-org");
	if (!value) throw new Error("ORG_HEADER_MISSING");
	return value;
}

function tokenFromRequest(request: FastifyRequest): { token: string; mode: "bearer" | "session" } {
	const authorization = header(request, "authorization");
	if (authorization?.startsWith("Bearer "))
		return { token: authorization.slice(7).trim(), mode: "bearer" };
	const cookie = header(request, "cookie");
	if (cookie) {
		for (const part of cookie.split(";")) {
			const separator = part.indexOf("=");
			if (separator > 0 && part.slice(0, separator).trim() === AUTH_COOKIE_NAME)
				return {
					token: decodeURIComponent(part.slice(separator + 1).trim()),
					mode: "session",
				};
		}
	}
	throw new Error("UNAUTHENTICATED");
}

export async function identityFromRequest(
	request: FastifyRequest,
	orgId = organizationId(request),
) {
	const token = tokenFromRequest(request);
	const identity = await authenticate(token.token, token.mode);
	if (identity.orgId !== orgId) throw new Error("UNAUTHENTICATED");
	return identity;
}

export async function resolvePermissionResource(
	orgId: string,
	type: string,
	id: string,
): Promise<PermissionResource> {
	if (id === "__collection__") return resources.collection(orgId, type);
	const resource = await resources.resolve(orgId, type, id);
	if (!resource) throw new Error("NOT_FOUND");
	return resource;
}

export async function authorizeRequest(
	request: FastifyRequest,
	action: PermissionAction,
	type: string,
	id: string,
) {
	const orgId = organizationId(request);
	const identity = await identityFromRequest(request, orgId);
	const resource = await resolvePermissionResource(orgId, type, id);
	const snapshot = await permissions.getSnapshot(
		orgId,
		identity.userId,
		type,
		id,
		resource.classification,
	);
	if (
		resource.workspaceId !== null &&
		!snapshot.subject.workspaceIds.includes(resource.workspaceId)
	)
		throw new Error("PERMISSION_DENIED");
	const decision = can({ orgId, ...snapshot }, resource, action);
	if (!decision.allowed) throw new Error("PERMISSION_DENIED");
	return { orgId, identity, resource, snapshot, decision };
}

export async function authorizeResource(
	orgId: string,
	userId: string,
	action: PermissionAction,
	type: string,
	id: string,
) {
	const resource = await resolvePermissionResource(orgId, type, id);
	const snapshot = await permissions.getSnapshot(
		orgId,
		userId,
		type,
		id,
		resource.classification,
	);
	if (
		resource.workspaceId !== null &&
		!snapshot.subject.workspaceIds.includes(resource.workspaceId)
	)
		throw new Error("PERMISSION_DENIED");
	const decision = can({ orgId, ...snapshot }, resource, action);
	if (!decision.allowed) throw new Error("PERMISSION_DENIED");
	return { resource, snapshot, decision };
}

export { permissions, resources };
