import type { FastifyInstance, FastifyRequest } from "fastify";
import {
	GraphEdgeCreateInputSchema,
	GraphEdgeDeleteInputSchema,
	GraphEdgeMutationResponseSchema,
	GraphEdgeRestoreInputSchema,
	GraphTraverseQuerySchema,
	GraphTraverseResponseSchema,
	type GraphEdgeCreateInput,
} from "@oryon/contracts/graph";
import { GraphRepository, WorkObjectRepository } from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";
import {
	authorizeResource,
	authorizeRequest,
	identityFromRequest,
	organizationId,
	permissions,
	resources,
} from "./authorization.js";

const graph = new GraphRepository(getPrisma());
const workObjects = new WorkObjectRepository(getPrisma());

function headerString(request: FastifyRequest, name: string): string | undefined {
	const value = request.headers[name];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function idempotency(request: FastifyRequest): string {
	const value = headerString(request, "idempotency-key");
	if (!value) throw new Error("IDEMPOTENCY_KEY_MISSING");
	return value;
}

function envelope(request: FastifyRequest, data: unknown) {
	return { data, meta: { requestId: request.id, durationMs: 0 } };
}

function errorEnvelope(request: FastifyRequest, code: string, status: number, message: string) {
	return { error: { code, httpStatus: status, message, requestId: request.id } };
}

function errorResult(error: unknown): { code: string; status: number; message: string } {
	const message = error instanceof Error ? error.message : "Graph operation failed";
	const map: Record<string, { code: string; status: number }> = {
		ORG_HEADER_MISSING: { code: "ORG_HEADER_MISSING", status: 400 },
		IDEMPOTENCY_KEY_MISSING: { code: "VALIDATION_FAILED", status: 400 },
		UNAUTHENTICATED: { code: "UNAUTHENTICATED", status: 401 },
		PERMISSION_DENIED: { code: "PERMISSION_DENIED", status: 403 },
		NOT_FOUND: { code: "NOT_FOUND", status: 404 },
		CONFLICT: { code: "CONFLICT", status: 409 },
		CYCLE_DETECTED: { code: "CYCLE_DETECTED", status: 409 },
		INVALID_SELF_EDGE: { code: "VALIDATION_FAILED", status: 400 },
		INVALID_RELATION: { code: "VALIDATION_FAILED", status: 400 },
		GRAPH_NODE_TYPE_UNSUPPORTED: { code: "VALIDATION_FAILED", status: 400 },
	};
	const item = map[message] ?? { code: "VALIDATION_FAILED", status: 400 };
	return { ...item, message };
}

async function authorizeNode(orgId: string, userId: string, type: string, id: string, action: "read" | "update") {
	return authorizeResource(orgId, userId, action, type, id);
}

async function filterTraversal(orgId: string, userId: string, result: Awaited<ReturnType<GraphRepository["traverse"]>>) {
	const visibleRefs: Array<{ type: string; id: string }> = [];
	const decisions = await Promise.all(
		result.nodeRefs.map(async (node) => {
			try {
				await authorizeNode(orgId, userId, node.type, node.id, "read");
				return node;
			} catch {
				return null;
			}
		}),
	);
	for (const node of decisions) if (node) visibleRefs.push(node);
	if (!visibleRefs.some((node) => node.type === result.root.type && node.id === result.root.id))
		throw new Error("NOT_FOUND");
	const visibleKeys = new Set(visibleRefs.map((node) => `${node.type}:${node.id}`));
	const visibleEdges = result.edges.filter(
		(edge) =>
			visibleKeys.has(`${edge.from.type}:${edge.from.id}`) &&
			visibleKeys.has(`${edge.to.type}:${edge.to.id}`),
	);
	const visibleObjects = result.workObjects.filter((object) =>
		visibleKeys.has(`work_object:${object.id}`),
	);
	const visibleGeneric = result.genericNodes.filter((node) =>
		visibleKeys.has(`${node.type}:${node.id}`),
	);
	const nodes = [
		...visibleObjects.map((object) => ({
			type: "work_object" as const,
			id: object.id,
			humanId: object.humanId ?? object.id,
			title: object.title,
			status: object.status ?? "UNKNOWN",
			statusCategory: (object.statusCategory ?? "TODO") as
				| "BACKLOG"
				| "TODO"
				| "IN_PROGRESS"
				| "BLOCKED"
				| "IN_REVIEW"
				| "DONE"
				| "CANCELLED",
			priority: (object.priority ?? "NORMAL") as
				| "LOWEST"
				| "LOW"
				| "NORMAL"
				| "HIGH"
				| "URGENT",
			typeKey: object.typeKey ?? "unknown",
			ownerId: object.ownerId,
			workspaceId: object.workspaceId,
			classification: object.classification,
			permissions: { read: true },
		})),
		...visibleGeneric.map((node) => ({
			type: node.type,
			id: node.id,
			label: node.label,
			classification: node.classification,
			permissions: { read: true },
		})),
	];
	const nodeIds = new Set(visibleObjects.map((object) => object.id));
	return {
		root: result.root,
		nodes,
		edges: visibleEdges,
		timeline: result.timeline.filter((event) => nodeIds.has(event.node.id)),
		meta: {
			depth: 0,
			direction: "both" as const,
			truncated: result.truncated,
			visibleNodeCount: nodes.length,
		},
	};
}

export async function registerGraphRoutes(app: FastifyInstance): Promise<void> {
	app.post("/v1/edges", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = organizationId(request);
			const { identity } = await authorizeRequest(request, "create", "edge", "__collection__").catch(async () => ({
				orgId,
				identity: await identityFromRequest(request, orgId),
			}));
			const input: GraphEdgeCreateInput = GraphEdgeCreateInputSchema.parse(request.body);
			await authorizeNode(orgId, identity.userId, input.from.type, input.from.id, "read");
			await authorizeNode(orgId, identity.userId, input.to.type, input.to.id, "read");
			await authorizeNode(orgId, identity.userId, input.from.type, input.from.id, "update");
			const created = await graph.createEdge(orgId, identity.userId, input);
			return reply.code(201).send(
				envelope(request, GraphEdgeMutationResponseSchema.parse({ ...created, state: "ACTIVE" })),
			);
		} catch (error) {
			const item = errorResult(error);
			return reply.code(item.status).send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});

	app.delete("/v1/edges/:id", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = organizationId(request);
			const { identity } = await import("./authorization.js").then(({ identityFromRequest }) =>
				identityFromRequest(request, orgId),
			);
			const edgeId = (request.params as { id: string }).id;
			const edge = await graph.findById(orgId, edgeId);
			if (!edge) throw new Error("NOT_FOUND");
			await authorizeNode(orgId, identity.userId, edge.from.type, edge.from.id, "read");
			await authorizeNode(orgId, identity.userId, edge.to.type, edge.to.id, "read");
			await authorizeNode(orgId, identity.userId, edge.from.type, edge.from.id, "update");
			const input = GraphEdgeDeleteInputSchema.parse(request.body ?? {});
			const deleted = await graph.deleteEdge(orgId, identity.userId, edgeId, input.reason);
			return reply.send(envelope(request, GraphEdgeMutationResponseSchema.parse(deleted)));
		} catch (error) {
			const item = errorResult(error);
			return reply.code(item.status).send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});

	app.post("/v1/edges/:id/restore", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = organizationId(request);
			const identity = await identityFromRequest(request, orgId);
			const edgeId = (request.params as { id: string }).id;
			const edge = await graph.findById(orgId, edgeId);
			if (!edge) throw new Error("NOT_FOUND");
			await authorizeNode(orgId, identity.userId, edge.from.type, edge.from.id, "read");
			await authorizeNode(orgId, identity.userId, edge.to.type, edge.to.id, "read");
			await authorizeNode(orgId, identity.userId, edge.from.type, edge.from.id, "update");
			const input = GraphEdgeRestoreInputSchema.parse(request.body ?? {});
			const restored = await graph.restoreEdge(orgId, identity.userId, edgeId, input.reason);
			return reply.send(envelope(request, GraphEdgeMutationResponseSchema.parse(restored)));
		} catch (error) {
			const item = errorResult(error);
			return reply.code(item.status).send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});

	app.get("/v1/graph/traverse", async (request, reply) => {
		try {
			const orgId = organizationId(request);
			const identity = await identityFromRequest(request, orgId);
			const query = GraphTraverseQuerySchema.parse(request.query);
			await authorizeNode(orgId, identity.userId, query.rootType, query.rootId, "read");
			const raw = await graph.traverse(orgId, query);
			const filtered = await filterTraversal(orgId, identity.userId, raw);
			return reply.send(
				envelope(
					request,
					GraphTraverseResponseSchema.parse({
						...filtered,
						meta: {
							...filtered.meta,
							depth: query.depth,
							direction: query.direction,
						},
					}),
				),
			);
		} catch (error) {
			const item = errorResult(error);
			return reply.code(item.status).send(errorEnvelope(request, item.code, item.status, item.message));
		}
	});
}
