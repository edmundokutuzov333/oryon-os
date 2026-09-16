export const ORYON_SEARCH_VERSION = "1.0.0" as const;
export const SEARCH_COLLECTION = "oryon_search_v1" as const;

export type SearchDocument = {
	id: string;
	orgId: string;
	type: "work_object" | "page" | "file_asset";
	title: string;
	contentText: string;
	classification: string | null;
	updatedAt: number;
};

export type LexicalHit = {
	id: string;
	type: SearchDocument["type"];
	title: string;
	snippet: string;
	textRank: number;
};

export type SemanticHit = {
	id: string;
	type: "work_object" | "page" | "file_asset";
	semanticScore: number;
};

export type FusedHit = {
	id: string;
	type: SearchDocument["type"];
	lexicalRank?: number;
	semanticRank?: number;
	score: number;
	matchedBy: Array<"lexical" | "semantic">;
};

export type TypesenseConfig = {
	url: string;
	apiKey: string;
};

function normalize(value: string): string {
	return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function fuseHybrid(lexical: readonly LexicalHit[], semantic: readonly SemanticHit[], limit: number, k = 60): FusedHit[] {
	const fused = new Map<string, FusedHit>();
	for (const [index, hit] of lexical.entries()) {
		const existing = fused.get(hit.id) ?? { id: hit.id, type: hit.type, score: 0, matchedBy: [] };
		existing.lexicalRank = index + 1;
		existing.score += 0.65 / (k + index + 1);
		if (!existing.matchedBy.includes("lexical")) existing.matchedBy.push("lexical");
		fused.set(hit.id, existing);
	}
	for (const [index, hit] of semantic.entries()) {
		const existing = fused.get(hit.id) ?? { id: hit.id, type: hit.type, score: 0, matchedBy: [] };
		existing.semanticRank = index + 1;
		existing.score += 0.35 / (k + index + 1);
		if (!existing.matchedBy.includes("semantic")) existing.matchedBy.push("semantic");
		fused.set(hit.id, existing);
	}
	return [...fused.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}

export class TypesenseSearchClient {
	private readonly url: string;
	private readonly apiKey: string;

	constructor(config: TypesenseConfig) {
		this.url = config.url.replace(/\/$/, "");
		this.apiKey = config.apiKey;
	}

	private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await fetch(`${this.url}${path}`, {
			...init,
			headers: { "Content-Type": "application/json", "X-TYPESENSE-API-KEY": this.apiKey, ...init.headers },
		});
		if (!response.ok) throw new Error(`TYPESENSE_${response.status}`);
		return response.json() as Promise<T>;
	}

	async ensureCollection(): Promise<void> {
		try {
			await this.request(`/collections/${SEARCH_COLLECTION}`);
			return;
		} catch (error) {
			if (!(error instanceof Error) || !error.message.includes("TYPESENSE_404")) throw error;
		}
		await this.request("/collections", { method: "POST", body: JSON.stringify({
			name: SEARCH_COLLECTION,
			fields: [
				{ name: "orgId", type: "string", facet: true },
				{ name: "type", type: "string", facet: true },
				{ name: "title", type: "string" },
				{ name: "contentText", type: "string" },
				{ name: "classification", type: "string", facet: true, optional: true },
				{ name: "updatedAt", type: "int64", sort: true },
			],
			default_sorting_field: "updatedAt",
		}) });
	}

	async upsertMany(documents: readonly SearchDocument[]): Promise<number> {
		if (documents.length === 0) return 0;
		await this.ensureCollection();
		const body = documents.map((document) => JSON.stringify(document)).join("\n");
		const response = await fetch(`${this.url}/collections/${SEARCH_COLLECTION}/documents/import?action=upsert`, { method: "POST", headers: { "Content-Type": "text/plain", "X-TYPESENSE-API-KEY": this.apiKey }, body });
		if (!response.ok) throw new Error(`TYPESENSE_${response.status}`);
		const lines = (await response.text()).trim().split("\n").filter(Boolean);
		const failed = lines.filter((line) => line.includes('"success":false'));
		if (failed.length > 0) throw new Error(`TYPESENSE_IMPORT_FAILED_${failed.length}`);
		return lines.length;
	}

	async lexical(query: string, orgId: string, limit: number, type?: SearchDocument["type"]): Promise<LexicalHit[]> {
		await this.ensureCollection();
		const params = new URLSearchParams({ q: normalize(query), query_by: "title,contentText", query_by_weights: "4,1", prioritize_exact_match: "true", per_page: String(Math.min(limit, 50)), page: "1", filter_by: `orgId:=${orgId}${type ? ` && type:=${type}` : ""}` });
		type Response = { hits?: Array<{ document: SearchDocument; text_match?: number; highlight?: { contentText?: string; title?: string } }> };
		const response = await this.request<Response>(`/collections/${SEARCH_COLLECTION}/documents/search?${params.toString()}`);
		return (response.hits ?? []).map((hit, index) => ({ id: hit.document.id, type: hit.document.type, title: hit.document.title, snippet: hit.highlight?.contentText ?? hit.highlight?.title ?? hit.document.contentText.slice(0, 240), textRank: hit.text_match ?? index + 1 }));
	}
}
