import type { FastifyInstance, FastifyRequest } from "fastify";
import {
	DomainKeySchema,
	DomainTemplateActionResponseSchema,
	DomainTemplateInstallResponseSchema,
	DomainTemplateManifestSchema,
	DomainTemplateSummarySchema,
} from "@oryon/contracts/domain-templates";
import { can } from "@oryon/core";
import {
	DomainTemplateRepository,
	PermissionRepository,
} from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";

const templates = new DomainTemplateRepository(getPrisma());
const permissions = new PermissionRepository();

function headerString(
	request: FastifyRequest,
	name: string,
): string | undefined {
	const value = request.headers[name];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function orgIdOf(request: FastifyRequest): string {
	const value = headerString(request, "x-oryon-org");
	if (!value) throw new Error("ORG_HEADER_MISSING");
	return value;
}

function tokenOf(
	request: FastifyRequest,
): { token: string; mode: "bearer" | "session" } | undefined {
	const bearer = headerString(request, "authorization");
	if (bearer?.startsWith("Bearer "))
		return { token: bearer.slice(7).trim(), mode: "bearer" };
	const rawCookie = headerString(request, "cookie");
	if (!rawCookie) return undefined;
	for (const part of rawCookie.split(";")) {
		const separator = part.indexOf("=");
		if (separator > 0 && part.slice(0, separator).trim() === AUTH_COOKIE_NAME)
			return {
				token: decodeURIComponent(part.slice(separator + 1).trim()),
				mode: "session",
			};
	}
	return undefined;
}

async function currentUser(request: FastifyRequest, orgId: string) {
	const auth = tokenOf(request);
	if (!auth) throw new Error("UNAUTHENTICATED");
	const session = await authenticate(auth.token, auth.mode);
	if (session.orgId !== orgId) throw new Error("UNAUTHENTICATED");
	return session;
}

function idempotency(request: FastifyRequest): void {
	if (!headerString(request, "idempotency-key"))
		throw new Error("IDEMPOTENCY_KEY_MISSING");
}

function envelope(request: FastifyRequest, data: unknown) {
	return { data, meta: { requestId: request.id, durationMs: 0 } };
}

function errorEnvelope(
	request: FastifyRequest,
	code: string,
	status: number,
	message: string,
) {
	return {
		error: { code, httpStatus: status, message, requestId: request.id },
	};
}

function failure(request: FastifyRequest, error: unknown) {
	const message =
		error instanceof Error ? error.message : "Domain template operation failed";
	const map: Record<string, { code: string; status: number }> = {
		ORG_HEADER_MISSING: { code: "ORG_HEADER_MISSING", status: 400 },
		UNAUTHENTICATED: { code: "UNAUTHENTICATED", status: 401 },
		PERMISSION_DENIED: { code: "PERMISSION_DENIED", status: 403 },
		IDEMPOTENCY_KEY_MISSING: { code: "VALIDATION_FAILED", status: 400 },
		DOMAIN_TEMPLATE_NOT_FOUND: { code: "NOT_FOUND", status: 404 },
		ORG_NOT_FOUND: { code: "NOT_FOUND", status: 404 },
		DOMAIN_TEMPLATE_TYPE_CONFLICT: { code: "VALIDATION_FAILED", status: 409 },
	};
	const result = map[message] ?? { code: "VALIDATION_FAILED", status: 400 };
	return replyForFailure(request, result.code, result.status, message);
}

function replyForFailure(
	request: FastifyRequest,
	code: string,
	status: number,
	message: string,
) {
	return { status, body: errorEnvelope(request, code, status, message) };
}

function templateCollectionResource(orgId: string) {
	return {
		orgId,
		type: "object_type_def",
		id: orgId,
		workspaceId: null,
		projectId: null,
		ownerId: null,
		teamId: null,
		classification: null,
	};
}

async function assertAccess(
	request: FastifyRequest,
	orgId: string,
	action: "read" | "manage",
) {
	const current = await currentUser(request, orgId);
	const snapshot = await permissions.getSnapshot(
		orgId,
		current.userId,
		"object_type_def",
		orgId,
	);
	const decision = can(
		{ orgId, ...snapshot },
		templateCollectionResource(orgId),
		action,
	);
	if (!decision.allowed) throw new Error("PERMISSION_DENIED");
	return current;
}

export async function registerDomainTemplateRoutes(
	app: FastifyInstance,
): Promise<void> {
	app.get("/v1/domain-templates", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			await assertAccess(request, orgId, "read");
			const result = (await templates.list(orgId)).map((item) =>
				DomainTemplateSummarySchema.parse(item),
			);
			return reply.send(envelope(request, result));
		} catch (error) {
			const result = failure(request, error);
			return reply.code(result.status).send(result.body);
		}
	});

	app.get("/v1/domain-templates/:key", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			await assertAccess(request, orgId, "read");
			const { key } = request.params as { key: string };
			const parsedKey = DomainKeySchema.parse(key);
			const template = await templates.find(orgId, parsedKey);
			if (!template) throw new Error("DOMAIN_TEMPLATE_NOT_FOUND");
			return reply.send(
				envelope(request, DomainTemplateManifestSchema.parse(template)),
			);
		} catch (error) {
			const result = failure(request, error);
			return reply.code(result.status).send(result.body);
		}
	});

	app.post("/v1/domain-templates/:key/install", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await assertAccess(request, orgId, "manage");
			const { key } = request.params as { key: string };
			const result = DomainTemplateInstallResponseSchema.parse(
				await templates.install(
					orgId,
					current.userId,
					DomainKeySchema.parse(key),
				),
			);
			return reply.code(200).send(envelope(request, result));
		} catch (error) {
			const result = failure(request, error);
			return reply.code(result.status).send(result.body);
		}
	});

	app.post("/v1/domain-templates/:key/deactivate", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await assertAccess(request, orgId, "manage");
			const { key } = request.params as { key: string };
			const result = DomainTemplateActionResponseSchema.parse(
				await templates.deactivate(
					orgId,
					current.userId,
					DomainKeySchema.parse(key),
				),
			);
			return reply.send(envelope(request, result));
		} catch (error) {
			const result = failure(request, error);
			return reply.code(result.status).send(result.body);
		}
	});
}
