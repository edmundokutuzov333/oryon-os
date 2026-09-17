import {
	GraphEdgeCreateInputSchema,
	GraphEdgeDeleteInputSchema,
	GraphEdgeMutationResponseSchema,
	GraphEdgeRestoreInputSchema,
	GraphTraverseQuerySchema,
	GraphTraverseResponseSchema,
	type GraphEdgeCreateInput,
	type GraphEdgeDeleteInput,
	type GraphEdgeRestoreInput,
	type GraphTraverseQuery,
	type GraphTraverseResponse,
} from "@oryon/contracts/graph";

async function request<T>(path: string, init: RequestInit, parse: (value: unknown) => T): Promise<T> {
	const response = await fetch(path, { ...init, cache: "no-store" });
	const payload = (await response.json()) as { data?: unknown; error?: { message?: string } };
	if (!response.ok || payload.data === undefined)
		throw new Error(payload.error?.message ?? `Oryon API returned HTTP ${response.status}`);
	return parse(payload.data);
}

export function createGraphClient(fetchImpl: typeof fetch = fetch) {
	const call = async <T>(path: string, init: RequestInit, parse: (value: unknown) => T) => {
		const response = await fetchImpl(path, { ...init, cache: "no-store" });
		const payload = (await response.json()) as { data?: unknown; error?: { message?: string } };
		if (!response.ok || payload.data === undefined)
			throw new Error(payload.error?.message ?? `Oryon API returned HTTP ${response.status}`);
		return parse(payload.data);
	};

	return {
		traverse(query: GraphTraverseQuery): Promise<GraphTraverseResponse> {
			const parsed = GraphTraverseQuerySchema.parse(query);
			const params = new URLSearchParams({
				rootType: parsed.rootType,
				rootId: parsed.rootId,
				depth: String(parsed.depth),
				direction: parsed.direction,
				relation: parsed.relation,
				includeTimeline: String(parsed.includeTimeline),
			});
			return call(`/v1/graph/traverse?${params.toString()}`, { method: "GET" }, GraphTraverseResponseSchema.parse);
		},
		createEdge(input: GraphEdgeCreateInput, idempotencyKey: string) {
			const parsed = GraphEdgeCreateInputSchema.parse(input);
			if (idempotencyKey.trim().length < 8) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
			return call(
				"/v1/edges",
				{
					method: "POST",
					headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
					body: JSON.stringify(parsed),
				},
				GraphEdgeMutationResponseSchema.parse,
			);
		},
		deleteEdge(input: GraphEdgeDeleteInput, edgeId: string, idempotencyKey: string) {
			const parsed = GraphEdgeDeleteInputSchema.parse(input);
			return call(
				`/v1/edges/${encodeURIComponent(edgeId)}`,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
					body: JSON.stringify(parsed),
				},
				GraphEdgeMutationResponseSchema.parse,
			);
		},
		restoreEdge(input: GraphEdgeRestoreInput, edgeId: string, idempotencyKey: string) {
			const parsed = GraphEdgeRestoreInputSchema.parse(input);
			return call(
				`/v1/edges/${encodeURIComponent(edgeId)}/restore`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
					body: JSON.stringify(parsed),
				},
				GraphEdgeMutationResponseSchema.parse,
			);
		},
	};
}

export const graphClient = createGraphClient();
