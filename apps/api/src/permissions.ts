import type { FastifyInstance, FastifyRequest } from "fastify";
import {
	PermissionEvaluateInputSchema,
	PermissionEvaluationSchema,
	PermissionExposureReportSchema,
	PermissionGrantCreateInputSchema,
	PermissionRoleBindingCreateInputSchema,
	PermissionRoleCreateInputSchema,
	PermissionViewAsInputSchema,
} from "@oryon/contracts/permissions";
import { can, evaluatePermissions } from "@oryon/core";
import { PermissionRepository } from "@oryon/db/repositories";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";

const permissions = new PermissionRepository();

function orgIdOf(request: FastifyRequest): string {
	const value = request.headers["x-oryon-org"];
	if (typeof value !== "string" || value.length === 0) throw new Error("ORG_HEADER_MISSING");
	return value;
}

function cookieValue(request: FastifyRequest): string | undefined {
	const raw = request.headers.cookie;
	if (typeof raw !== "string") return undefined;
	for (const item of raw.split(";")) {
		const separator = item.indexOf("=");
		if (separator < 0) continue;
		if (item.slice(0, separator).trim() === AUTH_COOKIE_NAME) return decodeURIComponent(item.slice(separator + 1).trim());
	}
	return undefined;
}

function bearerValue(request: FastifyRequest): string | undefined {
	const value = request.headers.authorization;
	if (typeof value !== "string" || !value.startsWith("Bearer ")) return undefined;
	return value.slice(7).trim();
}

async function actor(request: FastifyRequest, orgId: string) {
	const bearer = bearerValue(request);
	const token = bearer ?? cookieValue(request);
	if (!token) throw new Error("UNAUTHENTICATED");
	const session = await authenticate(token, bearer ? "bearer" : "session");
	if (session.orgId !== orgId) throw new Error("UNAUTHENTICATED");
	return session;
}

function idempotency(request: FastifyRequest): void {
	const value = request.headers["idempotency-key"];
	if (typeof value !== "string" || value.length === 0) throw new Error("IDEMPOTENCY_KEY_MISSING");
}

function orgResource(orgId: string) {
	return { orgId, type: "organization", id: orgId, workspaceId: null, projectId: null, ownerId: null, teamId: null, classification: null };
}

function envelope(request: FastifyRequest, data: unknown) {
	return { data, meta: { requestId: request.id, durationMs: 0 } };
}

function errorEnvelope(request: FastifyRequest, code: string, httpStatus: number, message: string) {
	return { error: { code, httpStatus, message, requestId: request.id } };
}

function statusFor(error: unknown): { code: string; status: number; message: string } {
	const message = error instanceof Error ? error.message : "Permission evaluation failed";
	if (message === "ORG_HEADER_MISSING") return { code: "ORG_HEADER_MISSING", status: 400, message };
	if (message === "IDEMPOTENCY_KEY_MISSING") return { code: "VALIDATION_FAILED", status: 400, message };
	if (message === "UNAUTHENTICATED") return { code: "UNAUTHENTICATED", status: 401, message };
	if (message === "permission_denied") return { code: "PERMISSION_DENIED", status: 403, message };
	return { code: "VALIDATION_FAILED", status: 400, message };
}

function denyUnless(orgId: string, session: { userId: string }, action: "manage" | "view_as") {
	return permissions.getSnapshot(orgId, session.userId, "organization", orgId).then((snapshot) => {
		const decision = can({ orgId, ...snapshot }, orgResource(orgId), action);
		if (!decision.allowed) throw new Error("permission_denied");
	});
}

export async function registerPermissionRoutes(app: FastifyInstance): Promise<void> {
	app.post("/v1/permissions/evaluate", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const input = PermissionEvaluateInputSchema.parse(request.body);
			if (input.resource.orgId !== orgId) throw new Error("permission_denied");
			const snapshot = await permissions.getSnapshot(orgId, session.userId, input.resource.type, input.resource.id, input.resource.classification);
			const result = PermissionEvaluationSchema.parse(evaluatePermissions({ orgId, ...snapshot }, input));
			return reply.send(envelope(request, result));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/permissions/view-as", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			await denyUnless(orgId, session, "view_as");
			const input = PermissionViewAsInputSchema.parse(request.body);
			if (input.resource.orgId !== orgId) throw new Error("permission_denied");
			const snapshot = await permissions.getSnapshot(orgId, input.targetUserId, input.resource.type, input.resource.id, input.resource.classification);
			const result = PermissionEvaluationSchema.parse(evaluatePermissions({ orgId, ...snapshot }, {
				resource: input.resource,
				external: input.external,
				ai: input.ai,
				fields: input.fields,
			}));
			return reply.send(envelope(request, result));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.get("/v1/permissions/exposure", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			await denyUnless(orgId, session, "manage");
			const rows = await permissions.listExternalExposure(orgId);
			const result = PermissionExposureReportSchema.parse({
				generatedAt: new Date().toISOString(),
				organizationId: orgId,
				resources: rows.map((row) => ({
					resourceType: row.resourceType,
					resourceId: row.resourceId,
					externalPrincipals: row.externalPrincipals,
					aiAllowed: false,
					externalAllowed: row.expiresAt === null || row.expiresAt.getTime() > Date.now(),
					fieldMasked: row.fieldMasked,
					watermark: false,
				})),
			});
			return reply.send(envelope(request, result));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/permissions/roles", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			await denyUnless(orgId, session, "manage");
			const input = PermissionRoleCreateInputSchema.parse(request.body);
			const result = await permissions.createRole(orgId, input);
			return reply.send(envelope(request, result));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/permissions/role-bindings", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			await denyUnless(orgId, session, "manage");
			const input = PermissionRoleBindingCreateInputSchema.parse(request.body);
			const result = await permissions.bindRole(orgId, session.userId, input);
			return reply.send(envelope(request, result));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/permissions/grants", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			await denyUnless(orgId, session, "manage");
			const input = PermissionGrantCreateInputSchema.parse(request.body);
			const result = await permissions.createGrant(orgId, session.userId, input);
			return reply.send(envelope(request, result));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});
}
