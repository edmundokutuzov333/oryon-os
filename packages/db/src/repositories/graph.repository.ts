import { canonicalizeGraphEdge, graphNodeKey, validateGraphSelfEdge } from "@oryon/core";
import type {
	GraphEdgeCreateInput,
	GraphNodeRef,
	GraphRelation,
	GraphTimelineEvent,
	GraphTraverseQuery,
} from "@oryon/contracts/graph";
import { Prisma, type PrismaClient } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";

export interface GraphNodeRecord {
	readonly type: string;
	readonly id: string;
	readonly humanId: string | null;
	readonly title: string;
	readonly status: string | null;
	readonly statusCategory: string | null;
	readonly priority: string | null;
	readonly typeKey: string | null;
	readonly ownerId: string | null;
	readonly workspaceId: string | null;
	readonly classification: string | null;
	readonly label: string;
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
	readonly genericNodes: readonly GraphNodeRecord[];
	readonly timeline: readonly GraphTimelineEvent[];
	readonly truncated: boolean;
}

type RawReachability = { type: string; id: string; depth: number };
type RawGenericNode = {
	id: string;
	label: string | null;
	workspace_id: string | null;
	owner_id: string | null;
	classification: string | null;
};

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

const genericNodeResolvers: Record<string, { table: string; select: string }> = {
	workspace: {
		table: "workspaces",
		select: "id, name AS label, NULL::text AS workspace_id, NULL::text AS owner_id, NULL::text AS classification",
	},
	user: {
		table: "users",
		select: "id, name AS label, NULL::text AS workspace_id, id AS owner_id, NULL::text AS classification",
	},
	team: {
		table: "teams",
		select: "id, name AS label, NULL::text AS workspace_id, lead_user_id AS owner_id, NULL::text AS classification",
	},
	channel: {
		table: "channels",
		select: "id, name AS label, workspace_id, created_by AS owner_id, NULL::text AS classification",
	},
	meeting: {
		table: "meetings",
		select: "id, title AS label, NULL::text AS workspace_id, created_by AS owner_id, NULL::text AS classification",
	},
	page: {
		table: "pages",
		select: "id, title AS label, workspace_id, owner_id, classification",
	},
	data_base: {
		table: "databases",
		select: "id, name AS label, workspace_id, NULL::text AS owner_id, NULL::text AS classification",
	},
	workflow: {
		table: "workflows",
		select: "id, name AS label, NULL::text AS workspace_id, created_by AS owner_id, NULL::text AS classification",
	},
	agent: {
		table: "agents",
		select: "id, name AS label, NULL::text AS workspace_id, principal_id AS owner_id, NULL::text AS classification",
	},
	file: {
		table: "file_assets",
		select: "id, name AS label, NULL::text AS workspace_id, uploaded_by AS owner_id, classification",
	},
	data_record: {
		table: "data_records",
		select: "id, id AS label, NULL::text AS workspace_id, created_by AS owner_id, NULL::text AS classification",
	},
};

function relationValue(relation: GraphRelation | "*"): GraphRelation | null {
	return relation === "*" ? null : relation;
}

function keyPair(type: string, id: string): string {
	return `${type}:${id}`;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

async function resolveNodes(
	tx: Prisma.TransactionClient,
	orgId: string,
	nodes: readonly GraphNodeRef[],
): Promise<GraphNodeRecord[]> {
	const byKey = new Map<string, GraphNodeRecord>();
	const workIds = nodes.filter((node) => node.type === "work_object").map((node) => node.id);
	if (workIds.length > 0) {
		const rows = await tx.workObject.findMany({
			where: { orgId, id: { in: unique(workIds) }, deletedAt: null },
			select: {
				id: true,
				humanId: true,
				title: true,
				status: true,
				statusCategory: true,
				priority: true,
				typeKey: true,
				ownerId: true,
				workspaceId: true,
				classification: true,
			},
		});
		for (const row of rows)
			byKey.set(`work_object:${row.id}`, {
				type: "work_object",
				id: row.id,
				humanId: row.humanId,
				title: row.title,
				status: row.status,
				statusCategory: row.statusCategory,
				priority: row.priority,
				typeKey: row.typeKey,
				ownerId: row.ownerId,
				workspaceId: row.workspaceId,
				classification: row.classification,
				label: row.title,
			});
	}
	for (const [type, resolver] of Object.entries(genericNodeResolvers)) {
		const ids = nodes.filter((node) => node.type === type).map((node) => node.id);
		if (ids.length === 0) continue;
		const rows = await tx.$queryRawUnsafe<RawGenericNode[]>(
			`SELECT ${resolver.select} FROM ${resolver.table} WHERE org_id = $1 AND id = ANY($2::text[]) AND (deleted_at IS NULL OR deleted_at IS NULL)`,
			orgId,
			ids,
		);
		for (const row of rows)
			byKey.set(`${type}:${row.id}`, {
				type,
				id: row.id,
				humanId: null,
				title: row.label ?? row.id,
				status: null,
				statusCategory: null,
				priority: null,
				typeKey: null,
				ownerId: row.owner_id,
				workspaceId: row.workspace_id,
				classification: row.classification,
				label: row.label ?? row.id,
			});
	}
	return nodes.flatMap((node) => byKey.get(graphNodeKey(node)) ?? []);
}

export class GraphRepository {
	private readonly db: PrismaClient;

	constructor(db: PrismaClient) {
		this.db = db;
	}

	async createEdge(
		orgId: string,
		actorId: string,
		input: GraphEdgeCreateInput,
	): Promise<{ id: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			if (!graphRelations.has(input.relation)) throw new Error("INVALID_RELATION");
			const canonical = canonicalizeGraphEdge(input.from, input.to, input.relation);
			const nodes = await resolveNodes(tx, orgId, [canonical.from, canonical.to]);
			if (nodes.length !== 2) throw new Error("NOT_FOUND");
			if (canonical.relation === "BLOCKS" || canonical.relation === "PARENT_OF") {
				const rows = await tx.$queryRaw<RawReachability[]>`
					WITH RECURSIVE reach(node_type, node_id) AS (
						SELECT ${canonical.to.type}, ${canonical.to.id}
						UNION
						SELECT e.to_type, e.to_id
						FROM edges e JOIN reach r
						  ON r.node_type = e.from_type AND r.node_id = e.from_id
						WHERE e.org_id = ${orgId}
						  AND e.relation = ${canonical.relation}::"EdgeRelation"
						  AND e.deleted_at IS NULL
					)
					SELECT node_type AS type, node_id AS id, 0 AS depth
					FROM reach
					WHERE node_type = ${canonical.from.type} AND node_id = ${canonical.from.id}
					LIMIT 1
				`;
				if (rows.length > 0) throw new Error("CYCLE_DETECTED");
			}
			try {
				const row = await tx.edge.create({
					data: {
						orgId,
						fromType: canonical.from.type,
						fromId: canonical.from.id,
						toType: canonical.to.type,
						toId: canonical.to.id,
						relation: canonical.relation,
						lagDays: input.lagDays ?? null,
						metadata: input.metadata as Prisma.InputJsonValue,
						createdBy: actorId,
					},
				});
				await appendDomainEvent(tx, {
					orgId,
					actorId,
					actorType: "MEMBER",
					subjectType: "Edge",
					subjectId: row.id,
					name: "graph.edge.created",
					payload: { from: canonical.from, to: canonical.to, relation: canonical.relation },
				});
				return { id: row.id };
			} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
				throw new Error("CONFLICT");
			throw error;
			}
		});
	}

	async deleteEdge(orgId: string, actorId: string, edgeId: string, reason?: string | null): Promise<{ id: string; state: "DELETED" }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const existing = await tx.edge.findFirst({ where: { id: edgeId, orgId, deletedAt: null } });
			if (!existing) throw new Error("NOT_FOUND");
			await tx.edge.update({ where: { id: edgeId }, data: { deletedAt: new Date() } });
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Edge",
				subjectId: edgeId,
				name: "graph.edge.deleted",
				payload: { reason: reason ?? null, from: { type: existing.fromType, id: existing.fromId }, to: { type: existing.toType, id: existing.toId }, relation: existing.relation },
			});
			return { id: edgeId, state: "DELETED" };
		});
	}

	async restoreEdge(orgId: string, actorId: string, edgeId: string, reason?: string | null): Promise<{ id: string; state: "ACTIVE" }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const existing = await tx.edge.findFirst({ where: { id: edgeId, orgId, deletedAt: { not: null } } });
			if (!existing) throw new Error("NOT_FOUND");
			const conflict = await tx.edge.findFirst({
				where: {
					orgId,
					fromType: existing.fromType,
					fromId: existing.fromId,
					toType: existing.toType,
					toId: existing.toId,
					relation: existing.relation,
					deletedAt: null,
				},
				select: { id: true },
			});
			if (conflict) throw new Error("CONFLICT");
			if (existing.relation === "BLOCKS" || existing.relation === "PARENT_OF") {
				const rows = await tx.$queryRaw<RawReachability[]>`
					WITH RECURSIVE reach(node_type, node_id) AS (
						SELECT ${existing.toType}, ${existing.toId}
						UNION
						SELECT e.to_type, e.to_id FROM edges e JOIN reach r
						ON r.node_type = e.from_type AND r.node_id = e.from_id
						WHERE e.org_id = ${orgId} AND e.relation = ${existing.relation}::"EdgeRelation" AND e.deleted_at IS NULL
					)
					SELECT node_type AS type, node_id AS id, 0 AS depth FROM reach
					WHERE node_type = ${existing.fromType} AND node_id = ${existing.fromId} LIMIT 1
				`;
				if (rows.length > 0) throw new Error("CYCLE_DETECTED");
			}
			await tx.edge.update({ where: { id: edgeId }, data: { deletedAt: null } });
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Edge",
				subjectId: edgeId,
				name: "graph.edge.restored",
				payload: { reason: reason ?? null },
			});
			return { id: edgeId, state: "ACTIVE" };
		});
	}

	async traverse(orgId: string, query: GraphTraverseQuery): Promise<GraphTraverseResult> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const root: GraphNodeRef = { type: query.rootType, id: query.rootId };
			const rootRecords = await resolveNodes(tx, orgId, [root]);
			if (rootRecords.length !== 1) throw new Error("NOT_FOUND");
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
					FROM walk w JOIN edges e ON e.org_id = ${orgId} AND e.deleted_at IS NULL ${relationSql}
					WHERE w.depth < ${query.depth}
					AND (( ${query.direction}::text IN ('out','both') AND e.from_type = w.node_type AND e.from_id = w.node_id )
						 OR ( ${query.direction}::text IN ('in','both') AND e.to_type = w.node_type AND e.to_id = w.node_id ))
					AND NOT ((CASE WHEN ${query.direction}::text = 'in' OR (${query.direction}::text = 'both' AND e.to_type = w.node_type AND e.to_id = w.node_id) THEN e.from_type || ':' || e.from_id ELSE e.to_type || ':' || e.to_id END) = ANY(w.path))
				)
				SELECT node_type AS type, node_id AS id, min(depth) AS depth FROM walk GROUP BY node_type, node_id
			`);
			const nodeRefs = rows.map((row) => ({ type: row.type, id: row.id }));
			const records = await resolveNodes(tx, orgId, nodeRefs);
			if (records.length !== nodeRefs.length) throw new Error("NOT_FOUND");
			const reachableKeys = new Set(nodeRefs.map((node) => keyPair(node.type, node.id)));
			const grouped = new Map<string, string[]>();
			for (const node of nodeRefs) grouped.set(node.type, [...(grouped.get(node.type) ?? []), node.id]);
			const edgeOr: Prisma.EdgeWhereInput[] = [];
			for (const [type, ids] of grouped) {
				edgeOr.push({ fromType: type, fromId: { in: ids } });
				edgeOr.push({ toType: type, toId: { in: ids } });
			}
			const rawEdges = edgeOr.length === 0 ? [] : await tx.edge.findMany({ where: { orgId, deletedAt: null, ...(relation === null ? {} : { relation }), OR: edgeOr }, orderBy: { createdAt: "asc" } });
			const edges = rawEdges.filter((edge) => reachableKeys.has(keyPair(edge.fromType, edge.fromId)) && reachableKeys.has(keyPair(edge.toType, edge.toId))).map((edge) => ({
				id: edge.id,
				orgId: edge.orgId,
				from: { type: edge.fromType, id: edge.fromId },
				to: { type: edge.toType, id: edge.toId },
				relation: edge.relation,
				lagDays: edge.lagDays,
				metadata: edge.metadata,
				createdAt: edge.createdAt,
			}));
			let timeline: GraphTimelineEvent[] = [];
			const workObjectIds = records.filter((node) => node.type === "work_object").map((node) => node.id);
			if (query.includeTimeline && workObjectIds.length > 0) {
				const [events, transitions] = await Promise.all([
					tx.domainEvent.findMany({ where: { orgId, subjectType: "WorkObject", subjectId: { in: workObjectIds } }, orderBy: { createdAt: "desc" }, take: 200 }),
					tx.statusTransition.findMany({ where: { orgId, objectId: { in: workObjectIds } }, orderBy: { createdAt: "desc" }, take: 200 }),
				]);
				timeline = [...events.map((event) => ({ id: event.id, kind: "DOMAIN_EVENT" as const, node: { type: "work_object", id: event.subjectId }, name: event.name, fromStatus: null, toStatus: null, comment: null, actorId: event.actorId, occurredAt: event.createdAt.toISOString() })), ...transitions.map((transition) => ({ id: transition.id, kind: "STATUS_TRANSITION" as const, node: { type: "work_object", id: transition.objectId }, name: "work_object.status_changed", fromStatus: transition.fromStatus, toStatus: transition.toStatus, comment: transition.comment, actorId: transition.actorId, occurredAt: transition.createdAt.toISOString() }))].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 300);
			}
			return {
				root,
				nodeRefs,
				edges,
				workObjects: records.filter((node) => node.type === "work_object"),
				genericNodes: records.filter((node) => node.type !== "work_object"),
				timeline,
				truncated: query.depth > 0 && rows.some((row) => row.depth === query.depth),
			};
		});
	}
}
