import type { FastifyInstance, FastifyRequest } from "fastify";
import { GraphEdgeCreateInputSchema, GraphEdgeResponseSchema, GraphTraverseQuerySchema, GraphTraverseResponseSchema, type GraphEdgeCreateInput } from "@oryon/contracts/graph";
import { can } from "@oryon/core";
import { GraphRepository, PermissionRepository } from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";

const graph = new GraphRepository(getPrisma());
const permissions = new PermissionRepository();

function headerString(request: FastifyRequest, name: string): string | undefined {
	const value = request.headers[name];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function orgIdOf(request: FastifyRequest): string {
	const value = headerString(request, "x-oryon-org");
	if (!value) throw new Error("ORG_HEADER_MISSING");
	return value;
}

function tokenOf(request: FastifyRequest): { token: string; kind: "bearer" | "session" } {
	const authorization = headerString(request, "authorization");
	if (authorization?.startsWith("Bearer ")) return { token: authorization.slice(7).trim(), kind: "bearer" };
	const rawCookie = headerString(request, "cookie");
	if (rawCookie) {
		for (const chunk of rawCookie.split(";")) {
			const separator = chunk.indexOf("=");
			if (separator > 0 && chunk.slice(0, separator).trim() === AUTH_COOKIE_NAME) return { token: decodeURIComponent(chunk.slice(separator + 1).trim()), kind: "session" };
		}
	}
	throw new Error("UNAUTHENTICATED");
}

async function session(request: FastifyRequest, orgId: string) {
	const token = tokenOf(request);
	const current = await authenticate(token.token, token.kind);
	if (current.orgId !== orgId) throw new Error("UNAUTHENTICATED");
	return current;
}

function idempotency(request: FastifyRequest): void {
	if (!headerString(request, "idempotency-key")) throw new Error("IDEMPOTENCY_KEY_MISSING");
}

function envelope(request: FastifyRequest, data: unknown) {
	return { data, meta: { requestId: request.id, durationMs: 0 } };
}

function errorEnvelope(request: FastifyRequest, code: string, status: number, message: string) {
	return { error: { code, httpStatus: status, message, requestId: request.id } };
}

function errorResult(error: unknown): { code: string; status: number; message: string } {
	const message = error instanceof Error ? error.message : "Graph operation failed";
	if (message === "ORG_HEADER_MISSING") return { code: message, status: 400, message };
	if (message === "IDEMPOTENCY_KEY_MISSING") return { code: "VALIDATION_FAILED", status: 400, message };
	if (message === "UNAUTHENTICATED") return { code: message, status: 401, message };
	if (message === "PERMISSION_DENIED") return { code: message, status: 403, message };
	if (["NOT_FOUND", "GRAPH_NODE_TYPE_UNSUPPORTED"].includes(message)) return { code: message === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_FAILED", status: message === "NOT_FOUND" ? 404 : 400, message };
	if (message === "CYCLE_DETECTED") return { code: message, status: 409, message };
	if (message === "CONFLICT") return { code: message, status: 409, message };
	if (message === "INVALID_SELF_EDGE" || message === "INVALID_RELATION") return { code: "VALIDATION_FAILED", status: 400, message };
	if (error instanceof Error && error.name === "GraphDomainError") return { code: "VALIDATION_FAILED", status: 400, message };
	return { code: "VALIDATION_FAILED", status: 400, message };
}

function objectResource(object: { orgId: string; id: string; workspaceId: string | null; ownerId: string | null; classification: string | null }) {
	return { orgId: object.orgId, type: "work_object", id: object.id, workspaceId: object.workspaceId, projectId: null, ownerId: object.ownerId, teamId: null, classification: object.classification };
}

async function canRead(orgId: string, userId: string, objectId: string): Promise<boolean> {
	const object = await graph.getWorkObject(orgId, objectId);
	if (!object) return false;
	const snapshot = await permissions.getSnapshot(orgId, userId, "work_object", objectId, object.classification);
	return can({ orgId, ...snapshot }, objectResource(object), "read").allowed;
}

async function filterTraversal(orgId: string, userId: string, result: Awaited<ReturnType<GraphRepository["traverse"]>>) {
	const readableIds = new Set<string>();
	for (const object of result.workObjects) {
		const snapshot = await permissions.getSnapshot(orgId, userId, "work_object", object.id);
		if (can({ orgId, ...snapshot }, objectResource(object), "read").allowed) readableIds.add(object.id);
	}
	if (!readableIds.has(result.root.id)) throw new Error("NOT_FOUND");
	const visibleRefs = result.nodeRefs.filter((node) => node.type !== "work_object" || readableIds.has(node.id));
	const visibleKeys = new Set(visibleRefs.map((node) => `${node.type}:${node.id}`));
	const visibleEdges = result.edges.filter((edge) => visibleKeys.has(`${edge.from.type}:${edge.from.id}`) && visibleKeys.has(`${edge.to.type}:${edge.to.id}`));
	const visibleObjects = result.workObjects.filter((object) => readableIds.has(object.id));
	const timelineNodeIds = new Set(visibleObjects.map((object) => object.id));
	return {
		root: result.root,
		nodes: visibleRefs.map((node) => {
			const object = visibleObjects.find((candidate) => candidate.id === node.id);
			if (!object) return node;
			return {
				type: "work_object" as const,
				id: object.id,
				humanId: object.humanId,
				title: object.title,
				status: object.status,
				statusCategory: object.statusCategory as "BACKLOG" | "TODO" | "IN_PROGRESS" | "BLOCKED" | "IN_REVIEW" | "DONE" | "CANCELLED",
				priority: object.priority as "LOWEST" | "LOW" | "NORMAL" | "HIGH" | "URGENT",
				typeKey: object.typeKey,
				ownerId: object.ownerId,
				workspaceId: object.workspaceId,
				permissions: { read: true },
			};
		}),
		edges: visibleEdges,
		timeline: result.timeline.filter((event) => timelineNodeIds.has(event.node.id)),
		meta: {
			depth: 0,
			direction: "both" as const,
			truncated: result.truncated,
			visibleNodeCount: visibleRefs.length,
		},
	};
}

export async function registerGraphRoutes(app: FastifyInstance): Promise<void> {
	app.post("/v1/edges", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const input: GraphEdgeCreateInput = GraphEdgeCreateInputSchema.parse(request.body);
			if (input.from.type !== "work_object" || input.to.type !== "work_object") throw new Error("GRAPH_NODE_TYPE_UNSUPPORTED");
			if (!(await canRead(orgId, current.userId, input.from.id)) || !(await canRead(orgId, current.userId, input.to.id))) throw new Error("PERMISSION_DENIED");
			const fromSnapshot = await permissions.getSnapshot(orgId, current.userId, "work_object", input.from.id);
			const fromObject = await graph.getWorkObject(orgId, input.from.id);
			if (!fromObject || !can({ orgId, ...fromSnapshot }, objectResource(fromObject), "update").allowed) throw new Error("PERMISSION_DENIED");
			const created = await graph.createEdge(orgId, current.userId, input);
			return reply.code(201).send(envelope(request, GraphEdgeResponseSchema.parse(created)));
		} catch (error) {
			const current = errorResult(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.get("/v1/graph/traverse", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const query = GraphTraverseQuerySchema.parse(request.query);
			if (query.rootType !== "work_object") throw new Error("GRAPH_NODE_TYPE_UNSUPPORTED");
			if (!(await canRead(orgId, current.userId, query.rootId))) throw new Error("NOT_FOUND");
			const raw = await graph.traverse(orgId, query);
			const filtered = await filterTraversal(orgId, current.userId, raw);
			return reply.send(envelope(request, GraphTraverseResponseSchema.parse({ ...filtered, meta: { ...filtered.meta, depth: query.depth, direction: query.direction } })));
		} catch (error) {
			const current = errorResult(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});
}
