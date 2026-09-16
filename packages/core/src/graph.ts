import type { GraphDirection, GraphNodeRef, GraphRelation } from "@oryon/contracts/graph";

export class GraphDomainError extends Error {
	readonly code: "CYCLE_DETECTED" | "INVALID_RELATION" | "INVALID_SELF_EDGE";

	constructor(code: GraphDomainError["code"], message: string) {
		super(message);
		this.name = "GraphDomainError";
		this.code = code;
	}
}

export const GRAPH_RELATIONS: readonly GraphRelation[] = [
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
];

export const PROTECTED_CYCLE_RELATIONS: readonly GraphRelation[] = ["BLOCKS", "PARENT_OF"];

export type GraphAdjacency = ReadonlyMap<string, readonly GraphNodeRef[]>;

export function graphNodeKey(node: GraphNodeRef): string {
	return `${node.type}:${node.id}`;
}

export function validateGraphSelfEdge(from: GraphNodeRef, to: GraphNodeRef): void {
	if (graphNodeKey(from) === graphNodeKey(to)) throw new GraphDomainError("INVALID_SELF_EDGE", "A graph edge cannot point to itself");
}

export function relationAllowedForCycleCheck(relation: GraphRelation): boolean {
	return PROTECTED_CYCLE_RELATIONS.includes(relation);
}

export function cycleWouldExist(from: GraphNodeRef, to: GraphNodeRef, relation: GraphRelation, adjacency: GraphAdjacency): boolean {
	if (!relationAllowedForCycleCheck(relation)) return false;
	validateGraphSelfEdge(from, to);
	const target = graphNodeKey(from);
	const queue = [graphNodeKey(to)];
	const visited = new Set<string>();
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || visited.has(current)) continue;
		if (current === target) return true;
		visited.add(current);
		for (const neighbour of adjacency.get(current) ?? []) {
			if (!visited.has(graphNodeKey(neighbour))) queue.push(graphNodeKey(neighbour));
		}
	}
	return false;
}

export function assertNoProtectedCycle(from: GraphNodeRef, to: GraphNodeRef, relation: GraphRelation, adjacency: GraphAdjacency): void {
	if (cycleWouldExist(from, to, relation, adjacency)) throw new GraphDomainError("CYCLE_DETECTED", `Cycle detected for relation ${relation}`);
}

export function neighboursForDirection(direction: GraphDirection, relation: GraphRelation, from: GraphNodeRef, to: GraphNodeRef): readonly { node: GraphNodeRef; relation: GraphRelation; edgeDirection: "out" | "in" }[] {
	if (direction === "out") return [{ node: to, relation, edgeDirection: "out" }];
	if (direction === "in") return [{ node: from, relation, edgeDirection: "in" }];
	return [
		{ node: to, relation, edgeDirection: "out" },
		{ node: from, relation, edgeDirection: "in" },
	];
}
