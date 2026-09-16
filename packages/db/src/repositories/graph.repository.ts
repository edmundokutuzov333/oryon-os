import { graphNodeKey, validateGraphSelfEdge } from "@oryon/core";
import type { GraphEdgeCreateInput, GraphNodeRef, GraphRelation, GraphTimelineEvent, GraphTraverseQuery } from "@oryon/contracts/graph";
import { Prisma, type PrismaClient } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";

export interface GraphNodeRecord {
	readonly type: "work_object";
	readonly id: string;
	readonly humanId: string;
	readonly title: string;
	readonly status: string;
	readonly statusCategory: string;
	readonly priority: string;
	readonly typeKey: string;
	readonly ownerId: string | null;
	readonly workspaceId: string | null;
}

export interface GraphEdgeRecord {
	readonly id: string;
	readonly orgId: string;
	readonly from: GraphNodeRef;
	readonly to: GraphNodeRef;
	readonly relation: GraphRelation;
	readonly lagDays: number | null;
	readonly metadata: Prisma.JsonValue;
	readonly createdAt: Date;
}

export interface GraphTraverseResult {
	readonly root: GraphNodeRef;
	readonly nodeRefs: readonly GraphNodeRef[];
	readonly edges: readonly GraphEdgeRecord[];
	readonly workObjects: readonly GraphNodeRecord[];
	readonly timeline: readonly GraphTimelineEvent[];
	readonly truncated: boolean;
}

type RawReachability = { type: string; id: string; depth: number };

const graphRelations = new Set<GraphRelation>([
	"BLOCKS",
	"BLOCKED_BY",
	"DUPLICATES",
	"RELATES_TO",
	"DERIVED_FROM",
	"CONVERTED_TO",
	"PARENT_OF",
	"MENTIONS",
	"ATTACHED_TO",
	"OWNS",
	"DISCUSSED_IN",
	"DECIDED_IN",
	"RESULTED_IN",
	"FINISH_TO_START",
	"START_TO_START",
	"FINISH_TO_FINISH",
	"START_TO_FINISH",
]);

function relationValue(relation: GraphRelation | "*"): GraphRelation | null {
	return relation === "*" ? null : relation;
}

function keyPair(type: string, id: string): string {
	return `${type}:${id}`;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

export class GraphRepository {
	private readonly db: PrismaClient;

	constructor(db: PrismaClient) {
		this.db = db;
	}

	async createEdge(orgId: string, actorId: string, input: GraphEdgeCreateInput): Promise<{ id: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			validateGraphSelfEdge(input.from, input.to);
			if (!graphRelations.has(input.relation)) throw new Error("INVALID_RELATION");
			for (const node of [input.from, input.to]) {
				if (node.type !== "work_object") throw new Error("GRAPH_NODE_TYPE_UNSUPPORTED");
				const object = await tx.workObject.findFirst({ where: { orgId, id: node.id, deletedAt: null }, select: { id: true } });
				if (!object) throw new Error("NOT_FOUND");
			}

			if (input.relation === "BLOCKS" || input.relation === "PARENT_OF") {
				const rows = await tx.$queryRaw<RawReachability[]>`
					WITH RECURSIVE reach(node_type, node_id) AS (
						SELECT ${input.to.type}, ${input.to.id}
						UNION
						SELECT e.to_type, e.to_id
						FROM edges e
						JOIN reach r ON r.node_type = e.from_type AND r.node_id = e.from_id
						WHERE e.org_id = ${orgId}
						  AND e.relation = ${input.relation}::"EdgeRelation"
						  AND e.deleted_at IS NULL
					)
					SELECT node_type AS type, node_id AS id, 0 AS depth
					FROM reach
					WHERE node_type = ${input.from.type} AND node_id = ${input.from.id}
					LIMIT 1
				`;
				if (rows.length > 0) throw new Error("CYCLE_DETECTED");
			}

			const existing = await tx.edge.findFirst({ where: { orgId, fromType: input.from.type, fromId: input.from.id, toType: input.to.type, toId: input.to.id, relation: input.relation, deletedAt: null }, select: { id: true } });
			if (existing) throw new Error("CONFLICT");
			const row = await tx.edge.create({ data: { orgId, fromType: input.from.type, fromId: input.from.id, toType: input.to.type, toId: input.to.id, relation: input.relation, lagDays: input.lagDays ?? null, metadata: JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue, createdBy: actorId } });
			await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Edge", subjectId: row.id, name: "graph.edge.created", payload: { from: input.from, to: input.to, relation: input.relation } });
			return { id: row.id };
		});
	}

	async traverse(orgId: string, query: GraphTraverseQuery): Promise<GraphTraverseResult> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const root: GraphNodeRef = { type: query.rootType, id: query.rootId };
			const relation = relationValue(query.relation);
			const relationSql = relation === null ? Prisma.sql`` : Prisma.sql`AND e.relation = ${relation}::"EdgeRelation"`;
			const rows = await tx.$queryRaw<RawReachability[]>(Prisma.sql`
				WITH RECURSIVE walk(node_type, node_id, depth, path) AS (
					SELECT ${root.type}, ${root.id}, 0, ARRAY[${graphNodeKey(root)}]::text[]
					UNION ALL
					SELECT
						CASE WHEN ${query.direction}::text = 'in' OR (${query.direction}::text = 'both' AND e.to_type = w.node_type AND e.to_id = w.node_id) THEN e.from_type ELSE e.to_type END,
						CASE WHEN ${query.direction}::text = 'in' OR (${query.direction}::text = 'both' AND e.to_type = w.node_type AND e.to_id = w.node_id) THEN e.from_id ELSE e.to_id END,
						w.depth + 1,
						w.path || CASE WHEN ${query.direction}::text = 'in' OR (${query.direction}::text = 'both' AND e.to_type = w.node_type AND e.to_id = w.node_id) THEN e.from_type || ':' || e.from_id ELSE e.to_type || ':' || e.to_id END
					FROM walk w
					JOIN edges e ON e.org_id = ${orgId} AND e.deleted_at IS NULL ${relationSql}
					WHERE w.depth < ${query.depth}
					AND (
						(${query.direction}::text IN ('out', 'both') AND e.from_type = w.node_type AND e.from_id = w.node_id)
						OR (${query.direction}::text IN ('in', 'both') AND e.to_type = w.node_type AND e.to_id = w.node_id)
					)
					AND NOT (
						(CASE WHEN ${query.direction}::text = 'in' OR (${query.direction}::text = 'both' AND e.to_type = w.node_type AND e.to_id = w.node_id) THEN e.from_type || ':' || e.from_id ELSE e.to_type || ':' || e.to_id END) = ANY(w.path)
					)
				)
				SELECT node_type AS type, node_id AS id, min(depth) AS depth
				FROM walk
				GROUP BY node_type, node_id
			`);

			const nodeRefs = rows.map((row) => ({ type: row.type, id: row.id }));
			const workObjectIds = unique(nodeRefs.filter((node) => node.type === "work_object").map((node) => node.id));
			const workObjects = workObjectIds.length === 0
				? []
				: await tx.workObject.findMany({ where: { orgId, id: { in: workObjectIds }, deletedAt: null }, select: { id: true, humanId: true, title: true, status: true, statusCategory: true, priority: true, typeKey: true, ownerId: true, workspaceId: true } });

			const reachableKeys = new Set(nodeRefs.map((node) => keyPair(node.type, node.id)));
			const edgeWhere: Prisma.EdgeWhereInput = {
				orgId,
				deletedAt: null,
				...(relation === null ? {} : { relation }),
				OR: [
					{ fromType: "work_object", fromId: { in: workObjectIds } },
					{ toType: "work_object", toId: { in: workObjectIds } },
				],
			};
			const rawEdges = workObjectIds.length === 0 ? [] : await tx.edge.findMany({ where: edgeWhere, orderBy: { createdAt: "asc" } });
			const edges = rawEdges.filter((edge) => reachableKeys.has(keyPair(edge.fromType, edge.fromId)) && reachableKeys.has(keyPair(edge.toType, edge.toId))).map((edge) => ({ id: edge.id, orgId: edge.orgId, from: { type: edge.fromType, id: edge.fromId }, to: { type: edge.toType, id: edge.toId }, relation: edge.relation, lagDays: edge.lagDays, metadata: edge.metadata, createdAt: edge.createdAt }));

			let timeline: GraphTimelineEvent[] = [];
			if (query.includeTimeline && workObjectIds.length > 0) {
				const [events, transitions] = await Promise.all([
					tx.domainEvent.findMany({ where: { orgId, subjectType: "WorkObject", subjectId: { in: workObjectIds } }, orderBy: { createdAt: "desc" }, take: 200 }),
					tx.statusTransition.findMany({ where: { orgId, objectId: { in: workObjectIds } }, orderBy: { createdAt: "desc" }, take: 200 }),
				]);
				timeline = [
					...events.map((event) => ({ id: event.id, kind: "DOMAIN_EVENT" as const, node: { type: "work_object", id: event.subjectId }, name: event.name, fromStatus: null, toStatus: null, comment: null, actorId: event.actorId, occurredAt: event.createdAt.toISOString() })),
					...transitions.map((transition) => ({ id: transition.id, kind: "STATUS_TRANSITION" as const, node: { type: "work_object", id: transition.objectId }, name: "work_object.status_changed", fromStatus: transition.fromStatus, toStatus: transition.toStatus, comment: transition.comment, actorId: transition.actorId, occurredAt: transition.createdAt.toISOString() })),
				].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 300);
			}

			return {
				root,
				nodeRefs,
				edges,
				workObjects: workObjects.map((object) => ({ type: "work_object" as const, ...object })),
				timeline,
				truncated: query.depth > 0 && rows.some((row) => row.depth === query.depth),
			};
		});
	}
}
