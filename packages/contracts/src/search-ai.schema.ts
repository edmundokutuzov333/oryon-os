import { z } from "zod";

export const AiSearchModeSchema = z.enum(["SEARCH", "ANSWER"]);
export const SearchDocumentTypeSchema = z.enum([
	"work_object",
	"page",
	"file_asset",
]);
export const SearchQuerySchema = z.object({
	q: z.string().trim().min(1).max(500),
	limit: z.coerce.number().int().min(1).max(50).default(20),
	type: SearchDocumentTypeSchema.optional(),
	offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export const SearchCitationSchema = z.object({
	id: z.string().min(1),
	type: SearchDocumentTypeSchema,
	title: z.string().min(1),
	href: z.string().min(1),
	snippet: z.string().min(1),
	classification: z.string().min(1).nullable(),
});
export const SearchResultSchema = z.object({
	id: z.string().min(1),
	type: SearchDocumentTypeSchema,
	title: z.string().min(1),
	snippet: z.string().min(1),
	score: z.number(),
	matchedBy: z.array(z.enum(["lexical", "semantic"])).min(1),
	classification: z.string().min(1).nullable(),
	href: z.string().min(1),
	permissions: z.object({ read: z.boolean(), use_ai: z.boolean() }),
});
export const SearchResponseSchema = z.object({
	query: z.string(),
	results: z.array(SearchResultSchema),
	hasMore: z.boolean(),
	mode: z.literal("HYBRID"),
});
export const AiSearchRequestSchema = z.object({
	query: z.string().trim().min(1).max(5000),
	mode: AiSearchModeSchema.default("ANSWER"),
	limit: z.number().int().min(1).max(20).default(8),
	conversationKey: z.string().trim().min(1).max(120).optional(),
});
export const AiSearchResponseSchema = z.object({
	query: z.string(),
	answer: z.string().min(1),
	citations: z.array(SearchCitationSchema).min(1),
	model: z.string().min(1).nullable(),
	retrieval: z.object({
		lexical: z.number().int().nonnegative(),
		semantic: z.number().int().nonnegative(),
		fused: z.number().int().nonnegative(),
	}),
	memoryUsed: z.boolean(),
});
export const SearchReindexResponseSchema = z.object({
	indexed: z.number().int().nonnegative(),
	collection: z.string().min(1),
});
export type SearchDocumentType = z.infer<typeof SearchDocumentTypeSchema>;
export type SearchCitation = z.infer<typeof SearchCitationSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type AiSearchRequest = z.infer<typeof AiSearchRequestSchema>;
export type AiSearchResponse = z.infer<typeof AiSearchResponseSchema>;
export type SearchReindexResponse = z.infer<typeof SearchReindexResponseSchema>;
