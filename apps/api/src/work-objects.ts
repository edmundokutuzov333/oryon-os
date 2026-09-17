import type { FastifyInstance, FastifyRequest } from "fastify";
import {
	ObjectStatusModelSchema,
	ObjectTypeDefSchema,
	WorkObjectAssignmentCreateInputSchema,
	WorkObjectCreateInputSchema,
	WorkObjectListQuerySchema,
	WorkObjectPlacementCreateInputSchema,
	WorkObjectResponseSchema,
	WorkObjectStatusInputSchema,
	WorkObjectTypeCreateInputSchema,
	WorkObjectUpdateInputSchema,
	type WorkObjectResponse,
} from "@oryon/contracts/work-object";
import { can, validateParent, validateStatusModel } from "@oryon/core";
import {
	PermissionRepository,
	WorkObjectRepository,
} from "@oryon/db/repositories";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";

const workObjects = new WorkObjectRepository(
	(await import("@oryon/db")).getPrisma(),
);
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

function bearer(request: FastifyRequest): string | undefined {
	const value = headerString(request, "authorization");
	return value?.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
}

function cookie(request: FastifyRequest): string | undefined {
	const raw = headerString(request, "cookie");
	if (!raw) return undefined;
	for (const part of raw.split(";")) {
		const separator = part.indexOf("=");
		if (separator > 0 && part.slice(0, separator).trim() === AUTH_COOKIE_NAME)
			return decodeURIComponent(part.slice(separator + 1).trim());
	}
	return undefined;
}

async function session(request: FastifyRequest, orgId: string) {
	const bearerToken = bearer(request);
	const token = bearerToken ?? cookie(request);
	if (!token) throw new Error("UNAUTHENTICATED");
	const value = await authenticate(token, bearerToken ? "bearer" : "session");
	if (value.orgId !== orgId) throw new Error("UNAUTHENTICATED");
	return value;
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

function errorResult(error: unknown): {
	code: string;
	status: number;
	message: string;
} {
	const message =
		error instanceof Error ? error.message : "Work object operation failed";
	if (message === "ORG_HEADER_MISSING")
		return { code: message, status: 400, message };
	if (message === "IDEMPOTENCY_KEY_MISSING")
		return { code: "VALIDATION_FAILED", status: 400, message };
	if (message === "UNAUTHENTICATED")
		return { code: message, status: 401, message };
	if (message === "PERMISSION_DENIED")
		return { code: message, status: 403, message };
	if (
		[
			"NOT_FOUND",
			"OBJECT_TYPE_NOT_FOUND",
			"PARENT_NOT_FOUND",
			"OWNER_NOT_FOUND",
			"USER_NOT_FOUND",
			"AGENT_NOT_FOUND",
		].includes(message)
	)
		return { code: "NOT_FOUND", status: 404, message };
	if (error instanceof Error && error.name === "WorkObjectDomainError")
		return { code: "VALIDATION_FAILED", status: 400, message };
	return { code: "VALIDATION_FAILED", status: 400, message };
}

function collectionResource(orgId: string, workspaceId: string | null) {
	return {
		orgId,
		type: "work_object",
		id: "__collection__",
		workspaceId,
		projectId: null,
		ownerId: null,
		teamId: null,
		classification: null,
	};
}

function objectResource(object: {
	orgId: string;
	id: string;
	workspaceId: string | null;
	ownerId: string | null;
	classification: string | null;
}) {
	return {
		orgId: object.orgId,
		type: "work_object",
		id: object.id,
		workspaceId: object.workspaceId,
		projectId: null,
		ownerId: object.ownerId,
		teamId: null,
		classification: object.classification,
	};
}

function permissionsFrom(
	snapshot: Awaited<ReturnType<PermissionRepository["getSnapshot"]>>,
	resource: ReturnType<typeof objectResource>,
) {
	const actions = [
		"read",
		"create",
		"update",
		"delete",
		"comment",
		"manage",
		"share",
		"export",
		"use_ai",
		"use_external",
		"view_as",
	] as const;
	return Object.fromEntries(
		actions.map((action) => [
			action,
			can({ orgId: resource.orgId, ...snapshot }, resource, action).allowed,
		]),
	) as WorkObjectResponse["permissions"];
}

async function toResponse(
	orgId: string,
	object: Awaited<ReturnType<WorkObjectRepository["findById"]>>,
	userId: string,
): Promise<WorkObjectResponse> {
	if (!object) throw new Error("NOT_FOUND");
	const resource = objectResource(object);
	const snapshot = await permissions.getSnapshot(
		orgId,
		userId,
		resource.type,
		resource.id,
		resource.classification,
	);
	const objectPermissions = permissionsFrom(snapshot, resource);
	if (!objectPermissions.read) throw new Error("NOT_FOUND");
	return WorkObjectResponseSchema.parse({
		id: object.id,
		orgId: object.orgId,
		workspaceId: object.workspaceId,
		typeKey: object.typeKey,
		typeDefId: object.typeDefId,
		humanId: object.humanId,
		title: object.title,
		description: object.description,
		status: object.status,
		statusCategory: object.statusCategory,
		priority: object.priority,
		ownerId: object.ownerId,
		parentObjectId: object.parentObjectId,
		startAt: object.startAt?.toISOString() ?? null,
		dueAt: object.dueAt?.toISOString() ?? null,
		completedAt: object.completedAt?.toISOString() ?? null,
		progress: object.progress,
		moneyAmount: object.moneyAmount?.toString() ?? null,
		moneyCurrency: object.moneyCurrency,
		probability: object.probability,
		secondaryDate: object.secondaryDate?.toISOString() ?? null,
		externalRef: object.externalRef,
		severity: object.severity,
		classification: object.classification,
		tags: object.tags,
		customFields: object.customFields as Record<string, unknown>,
		assignments: object.assignments.map((assignment) => ({
			id: assignment.id,
			userId: assignment.userId,
			agentId: assignment.agentId,
			role: assignment.role,
			allocation: assignment.allocation,
		})),
		placements: object.placements.map((placement) => ({
			id: placement.id,
			containerType: placement.containerType,
			containerId: placement.containerId,
			sectionId: placement.sectionId,
			position: placement.position.toString(),
			isPrimary: placement.isPrimary,
		})),
		permissions: objectPermissions,
	});
}

export async function registerWorkObjectRoutes(
	app: FastifyInstance,
): Promise<void> {
	app.get("/v1/object-types", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const snapshot = await permissions.getSnapshot(
				orgId,
				current.userId,
				"object_type_def",
				orgId,
			);
			const decision = can(
				{ orgId, ...snapshot },
				{
					orgId,
					type: "object_type_def",
					id: orgId,
					workspaceId: null,
					projectId: null,
					ownerId: null,
					teamId: null,
					classification: null,
				},
				"read",
			);
			if (!decision.allowed) throw new Error("NOT_FOUND");
			const rows = await workObjects.listTypeDefs(orgId);
			const result = rows.map((row) =>
				ObjectTypeDefSchema.parse({
					id: row.id,
					key: row.key,
					name: row.name,
					pluralName: row.pluralName,
					icon: row.icon,
					isSystem: row.isSystem,
					idPrefix: row.idPrefix,
					schema: row.schema,
					statusModel: row.statusModel,
				}),
			);
			return reply.send(envelope(request, result));
		} catch (error) {
			const current = errorResult(error);
			return reply
				.code(current.status)
				.send(
					errorEnvelope(request, current.code, current.status, current.message),
				);
		}
	});

	app.post("/v1/object-types", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const snapshot = await permissions.getSnapshot(
				orgId,
				current.userId,
				"object_type_def",
				orgId,
			);
			const resource = {
				orgId,
				type: "object_type_def",
				id: orgId,
				workspaceId: null,
				projectId: null,
				ownerId: null,
				teamId: null,
				classification: null,
			};
			if (!can({ orgId, ...snapshot }, resource, "manage").allowed)
				throw new Error("PERMISSION_DENIED");
			const input = WorkObjectTypeCreateInputSchema.parse(request.body);
			validateStatusModel(input.statusModel);
			const created = await workObjects.createTypeDef(
				orgId,
				current.userId,
				input,
			);
			return reply.code(201).send(envelope(request, created));
		} catch (error) {
			const current = errorResult(error);
			return reply
				.code(current.status)
				.send(
					errorEnvelope(request, current.code, current.status, current.message),
				);
		}
	});

	app.get("/v1/work-objects", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const query = WorkObjectListQuerySchema.parse(request.query);
			const collectionSnapshot = await permissions.getSnapshot(
				orgId,
				current.userId,
				"work_object",
				"__collection__",
			);
			const collectionDecision = can(
				{ orgId, ...collectionSnapshot },
				collectionResource(orgId, query.workspaceId ?? null),
				"read",
			);
			if (!collectionDecision.allowed) throw new Error("NOT_FOUND");
			const rows = await workObjects.list({ orgId, ...query });
			const result: WorkObjectResponse[] = [];
			for (const row of rows) {
				try {
					result.push(await toResponse(orgId, row as never, current.userId));
				} catch (error) {
					if (error instanceof Error && error.message === "NOT_FOUND") continue;
					throw error;
				}
			}
			return reply.send(envelope(request, result));
		} catch (error) {
			const current = errorResult(error);
			return reply
				.code(current.status)
				.send(
					errorEnvelope(request, current.code, current.status, current.message),
				);
		}
	});

	app.post("/v1/work-objects", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const input = WorkObjectCreateInputSchema.parse(request.body);
			const snapshot = await permissions.getSnapshot(
				orgId,
				current.userId,
				"work_object",
				"__collection__",
			);
			const resource = collectionResource(orgId, input.workspaceId ?? null);
			if (!can({ orgId, ...snapshot }, resource, "create").allowed)
				throw new Error("PERMISSION_DENIED");
			const id = await workObjects.create(orgId, current.userId, input);
			const created = await toResponse(
				orgId,
				await workObjects.findById(orgId, id),
				current.userId,
			);
			return reply.code(201).send(envelope(request, created));
		} catch (error) {
			const current = errorResult(error);
			return reply
				.code(current.status)
				.send(
					errorEnvelope(request, current.code, current.status, current.message),
				);
		}
	});

	app.get("/v1/work-objects/:id", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const { id } = request.params as { id: string };
			const object = await workObjects.findById(orgId, id);
			const result = await toResponse(orgId, object, current.userId);
			return reply.send(envelope(request, result));
		} catch (error) {
			const current = errorResult(error);
			return reply
				.code(current.message === "NOT_FOUND" ? 404 : current.status)
				.send(
					errorEnvelope(
						request,
						current.code,
						current.message === "NOT_FOUND" ? 404 : current.status,
						current.message,
					),
				);
		}
	});

	app.patch("/v1/work-objects/:id", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const { id } = request.params as { id: string };
			const input = WorkObjectUpdateInputSchema.parse(request.body);
			const object = await workObjects.findById(orgId, id);
			if (!object) throw new Error("NOT_FOUND");
			const snapshot = await permissions.getSnapshot(
				orgId,
				current.userId,
				"work_object",
				id,
				object.classification,
			);
			if (
				!can({ orgId, ...snapshot }, objectResource(object), "update").allowed
			)
				throw new Error("PERMISSION_DENIED");
			const updated = await workObjects.update(
				orgId,
				current.userId,
				id,
				input,
			);
			return reply.send(
				envelope(request, await toResponse(orgId, updated, current.userId)),
			);
		} catch (error) {
			const current = errorResult(error);
			return reply
				.code(current.status)
				.send(
					errorEnvelope(request, current.code, current.status, current.message),
				);
		}
	});

	app.delete("/v1/work-objects/:id", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const { id } = request.params as { id: string };
			const object = await workObjects.findById(orgId, id);
			if (!object) throw new Error("NOT_FOUND");
			const snapshot = await permissions.getSnapshot(
				orgId,
				current.userId,
				"work_object",
				id,
				object.classification,
			);
			if (
				!can({ orgId, ...snapshot }, objectResource(object), "delete").allowed
			)
				throw new Error("PERMISSION_DENIED");
			await workObjects.softDelete(orgId, current.userId, id);
			return reply.send(envelope(request, { deleted: true }));
		} catch (error) {
			const current = errorResult(error);
			return reply
				.code(current.status)
				.send(
					errorEnvelope(request, current.code, current.status, current.message),
				);
		}
	});

	app.post("/v1/work-objects/:id/assignments", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const { id } = request.params as { id: string };
			const object = await workObjects.findById(orgId, id);
			if (!object) throw new Error("NOT_FOUND");
			const snapshot = await permissions.getSnapshot(
				orgId,
				current.userId,
				"work_object",
				id,
				object.classification,
			);
			if (
				!can({ orgId, ...snapshot }, objectResource(object), "update").allowed
			)
				throw new Error("PERMISSION_DENIED");
			const input = WorkObjectAssignmentCreateInputSchema.parse(request.body);
			const result = await workObjects.assign(orgId, current.userId, id, input);
			return reply.code(201).send(envelope(request, result));
		} catch (error) {
			const current = errorResult(error);
			return reply
				.code(current.status)
				.send(
					errorEnvelope(request, current.code, current.status, current.message),
				);
		}
	});

	app.delete(
		"/v1/work-objects/:id/assignments/:assignmentId",
		async (request, reply) => {
			try {
				idempotency(request);
				const orgId = orgIdOf(request);
				const current = await session(request, orgId);
				const params = request.params as { id: string; assignmentId: string };
				const object = await workObjects.findById(orgId, params.id);
				if (!object) throw new Error("NOT_FOUND");
				const snapshot = await permissions.getSnapshot(
					orgId,
					current.userId,
					"work_object",
					params.id,
					object.classification,
				);
				if (
					!can({ orgId, ...snapshot }, objectResource(object), "update").allowed
				)
					throw new Error("PERMISSION_DENIED");
				await workObjects.removeAssignment(
					orgId,
					current.userId,
					params.id,
					params.assignmentId,
				);
				return reply.send(envelope(request, { deleted: true }));
			} catch (error) {
				const current = errorResult(error);
				return reply
					.code(current.status)
					.send(
						errorEnvelope(
							request,
							current.code,
							current.status,
							current.message,
						),
					);
			}
		},
	);

	app.post("/v1/work-objects/:id/placements", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const { id } = request.params as { id: string };
			const object = await workObjects.findById(orgId, id);
			if (!object) throw new Error("NOT_FOUND");
			const snapshot = await permissions.getSnapshot(
				orgId,
				current.userId,
				"work_object",
				id,
				object.classification,
			);
			if (
				!can({ orgId, ...snapshot }, objectResource(object), "update").allowed
			)
				throw new Error("PERMISSION_DENIED");
			const input = WorkObjectPlacementCreateInputSchema.parse(request.body);
			const result = await workObjects.place(orgId, current.userId, id, input);
			return reply.code(201).send(envelope(request, result));
		} catch (error) {
			const current = errorResult(error);
			return reply
				.code(current.status)
				.send(
					errorEnvelope(request, current.code, current.status, current.message),
				);
		}
	});

	app.post("/v1/work-objects/:id/status", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const { id } = request.params as { id: string };
			const object = await workObjects.findById(orgId, id);
			if (!object) throw new Error("NOT_FOUND");
			const snapshot = await permissions.getSnapshot(
				orgId,
				current.userId,
				"work_object",
				id,
				object.classification,
			);
			if (
				!can({ orgId, ...snapshot }, objectResource(object), "update").allowed
			)
				throw new Error("PERMISSION_DENIED");
			const input = WorkObjectStatusInputSchema.parse(request.body);
			const result = await workObjects.status(orgId, current.userId, id, input);
			return reply.send(
				envelope(request, await toResponse(orgId, result, current.userId)),
			);
		} catch (error) {
			const current = errorResult(error);
			return reply
				.code(current.status)
				.send(
					errorEnvelope(request, current.code, current.status, current.message),
				);
		}
	});
}
