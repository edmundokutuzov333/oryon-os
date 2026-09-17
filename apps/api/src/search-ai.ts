import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createClient, type RedisClientType } from "redis";
import { can } from "@oryon/core";
import { AiSearchRequestSchema, AiSearchResponseSchema, SearchQuerySchema, SearchReindexResponseSchema, SearchResponseSchema, type SearchDocumentType } from "@oryon/contracts/search-ai";
import { AiRepository, PermissionRepository, SearchRepository } from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";
import { answerWithSources, createEmbedding, extractCitationIds, gatewayConfig, type AiPolicy } from "@oryon/ai";
import { fuseHybrid, TypesenseSearchClient, type LexicalHit, type SemanticHit } from "@oryon/search";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";

const db = getPrisma();
const searchRepository = new SearchRepository(db);
const aiRepository = new AiRepository(db);
const permissions = new PermissionRepository();
const typesense = process.env.TYPESENSE_URL && process.env.TYPESENSE_API_KEY ? new TypesenseSearchClient({ url: process.env.TYPESENSE_URL, apiKey: process.env.TYPESENSE_API_KEY }) : null;
const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
let redisConnectPromise: Promise<void> | undefined;

async function getRedis(): Promise<RedisClientType> {
	if (!redis.isOpen) {
		redisConnectPromise ??= redis.connect().then(() => undefined);
		await redisConnectPromise;
	}
	return redis;
}

export async function closeAiSearchResources(): Promise<void> {
	if (redis.isOpen) await redis.quit();
}

function headerString(request: FastifyRequest, name: string): string | undefined {
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
		if (separator > 0 && part.slice(0, separator).trim() === AUTH_COOKIE_NAME) return decodeURIComponent(part.slice(separator + 1).trim());
	}
	return undefined;
}

async function session(request: FastifyRequest, orgId: string) {
	const token = bearer(request) ?? cookie(request);
	if (!token) throw new Error("UNAUTHENTICATED");
	const value = await authenticate(token, bearer(request) ? "bearer" : "session");
	if (value.orgId !== orgId) throw new Error("UNAUTHENTICATED");
	return value;
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

function resourceHref(type: SearchDocumentType, id: string): string {
	if (type === "work_object") return `/os/work?object=${encodeURIComponent(id)}`;
	return `/os/docs?${type === "page" ? "page" : "file"}=${encodeURIComponent(id)}`;
}

function keyForMemory(orgId: string, userId: string, conversationKey: string): string {
	const digest = createHash("sha256").update(conversationKey).digest("hex");
	return `oryon:ai-memory:${orgId}:${userId}:${digest}`;
}

type MemoryTurn = { query: string; answer: string; citations: string[]; createdAt: string };

async function readMemory(orgId: string, userId: string, conversationKey?: string): Promise<MemoryTurn[]> {
	if (!conversationKey) return [];
	try {
		const client = await getRedis();
		const value = await client.get(keyForMemory(orgId, userId, conversationKey));
		return value ? (JSON.parse(value) as MemoryTurn[]).slice(-5) : [];
	} catch {
		return [];
	}
}

async function writeMemory(orgId: string, userId: string, conversationKey: string | undefined, turn: MemoryTurn): Promise<void> {
	if (!conversationKey) return;
	try {
		const client = await getRedis();
		const key = keyForMemory(orgId, userId, conversationKey);
		const existing = await readMemory(orgId, userId, conversationKey);
		existing.push(turn);
		await client.set(key, JSON.stringify(existing.slice(-8)), { EX: Number(process.env.ORYON_AI_MEMORY_TTL_SECONDS ?? "2592000") });
	} catch {
		return;
	}
}

async function readAndAuthorize(orgId: string, userId: string, type: SearchDocumentType, id: string, requireAi: boolean) {
	const source = await searchRepository.getSource(orgId, type, id);
	if (!source) return null;
	const snapshot = await permissions.getSnapshot(orgId, userId, type, id, source.classification);
	const resource = { orgId, type, id, workspaceId: source.workspaceId, projectId: null, ownerId: source.ownerId, teamId: null, classification: source.classification };
	const readDecision = can(snapshot, resource, "read");
	if (!readDecision.allowed) return null;
	const aiDecision = can(snapshot, resource, "use_ai");
	if (requireAi && !aiDecision.allowed) return null;
	return { source, snapshot, permissions: { read: readDecision.allowed, use_ai: aiDecision.allowed } };
}

async function hybridSearch(orgId: string, userId: string, query: string, limit: number, type?: SearchDocumentType) {
	let lexical: LexicalHit[] = [];
	if (typesense) {
		try { lexical = await typesense.lexical(query, orgId, Math.min(limit * 3, 50), type); } catch { lexical = []; }
	}
	if (lexical.length === 0) {
		const fallback = await searchRepository.lexicalFallback(orgId, query, Math.min(limit * 3, 50), type);
		lexical = fallback.map((hit, index) => ({ id: `${hit.type}:${hit.id}`, type: hit.type, title: hit.title, snippet: hit.snippet, textRank: index + 1 }));
	}

	let semantic: SemanticHit[] = [];
	const embedding = await createEmbedding(query);
	if (embedding) {
		try {
			const rows = await searchRepository.semantic(orgId, embedding, Math.min(limit * 3, 50));
			semantic = rows.map((row) => ({ id: `${row.type}:${row.id}`, type: row.type, semanticScore: 1 / (1 + row.distance) })).filter((hit) => !type || hit.type === type);
		} catch {
			semantic = [];
		}
	}

	const fused = fuseHybrid(lexical, semantic, Math.min(limit * 2, 50));
	const authorized = [];
	for (const hit of fused) {
		const [hitType, ...idParts] = hit.id.split(":");
		const resourceId = idParts.join(":");
		if (hitType !== "work_object" && hitType !== "page" && hitType !== "file_asset") continue;
		const typeValue = hitType as SearchDocumentType;
		const resource = await readAndAuthorize(orgId, userId, typeValue, resourceId, false);
		if (!resource) continue;
		const lexicalHit = lexical.find((entry) => entry.id === hit.id);
		authorized.push({ id: resource.source.id, type: typeValue, title: resource.source.title, snippet: lexicalHit?.snippet ?? resource.source.text.slice(0, 240), score: hit.score, matchedBy: hit.matchedBy, classification: resource.source.classification, href: resourceHref(typeValue, resource.source.id), permissions: resource.permissions });
		if (authorized.length >= limit) break;
	}
	return { results: authorized, lexicalCount: lexical.length, semanticCount: semantic.length };
}

export async function registerSearchAiRoutes(app: FastifyInstance): Promise<void> {
	app.get("/v1/search/hybrid", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const query = SearchQuerySchema.parse(request.query);
			const result = await hybridSearch(orgId, current.userId, query.q, query.limit, query.type);
			return reply.send(envelope(request, SearchResponseSchema.parse({ query: query.q, results: result.results, hasMore: result.results.length === query.limit, mode: "HYBRID" })));
		} catch (error) {
			const message = error instanceof Error ? error.message : "Search failed";
			const status = message === "UNAUTHENTICATED" ? 401 : message === "ORG_HEADER_MISSING" ? 400 : 400;
			return reply.code(status).send(errorEnvelope(request, status === 401 ? "UNAUTHENTICATED" : "VALIDATION_FAILED", status, message));
		}
	});

	app.post("/v1/ai/search", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const input = AiSearchRequestSchema.parse(request.body);
			const memory = await readMemory(orgId, current.userId, input.conversationKey);
			const result = await hybridSearch(orgId, current.userId, input.query, input.limit);
			const sources = [];
			for (const item of result.results) {
				const authorized = await readAndAuthorize(orgId, current.userId, item.type, item.id, true);
				if (authorized) sources.push({ id: `${item.type}:${item.id}`, title: authorized.source.title, text: authorized.source.text });
			}
			if (sources.length === 0) return reply.code(404).send(errorEnvelope(request, "NOT_FOUND", 404, "No AI-readable sources found"));

			const aiContext = await aiRepository.getContext(orgId);
			const policyRecord = aiContext.policies[0];
			const policy: AiPolicy | null = policyRecord ? { allowedModels: policyRecord.allowedModels, fallbackModel: policyRecord.fallbackModel, maxClassification: policyRecord.maxClassification, residencyRegion: policyRecord.residencyRegion, monthlyCapCents: policyRecord.monthlyCapCents, routingRules: policyRecord.routingRules } : null;
			const memoryPrefix = memory.length > 0 ? memory.map((turn) => `Anterior: ${turn.query}\nResposta: ${turn.answer}`).join("\n\n") : "";
			const groundedQuery = memoryPrefix ? `${memoryPrefix}\n\nNova pergunta: ${input.query}` : input.query;
			let answer: string;
			let model: string | null = null;
			if (input.mode === "ANSWER") {
				const config = gatewayConfig();
				if (config) {
					const generated = await answerWithSources(groundedQuery, sources, policy, config);
					answer = generated.answer;
					model = generated.model;
				} else {
					answer = sources.slice(0, 4).map((source) => `${source.title}: ${source.text.slice(0, 320)} [${source.id}]`).join("\n\n");
				}
			} else {
				answer = sources.slice(0, 4).map((source) => `${source.title}: ${source.text.slice(0, 320)} [${source.id}]`).join("\n\n");
			}
			const citationIds = extractCitationIds(answer);
			const knownIds = new Set(sources.map((source) => source.id));
			if (citationIds.length === 0 || citationIds.some((id) => !knownIds.has(id))) return reply.code(502).send(errorEnvelope(request, "INTERNAL", 502, "AI response did not contain resolvable citations"));
			const citations = citationIds.map((id) => {
				const source = sources.find((candidate) => candidate.id === id);
				const separator = id.indexOf(":");
				const type = id.slice(0, separator) as SearchDocumentType;
				const resourceId = id.slice(separator + 1);
				return { id, type, title: source?.title ?? id, href: resourceHref(type, resourceId), snippet: source?.text.slice(0, 360) ?? id, classification: result.results.find((item) => item.type === type && item.id === resourceId)?.classification ?? null };
			});
			await writeMemory(orgId, current.userId, input.conversationKey, { query: input.query, answer: answer.slice(0, 6000), citations: citationIds, createdAt: new Date().toISOString() });
			const payload = AiSearchResponseSchema.parse({ query: input.query, answer, citations, model, retrieval: { lexical: result.lexicalCount, semantic: result.semanticCount, fused: result.results.length }, memoryUsed: memory.length > 0 });
			return reply.send(envelope(request, payload));
		} catch (error) {
			const message = error instanceof Error ? error.message : "AI search failed";
			const status = message === "UNAUTHENTICATED" ? 401 : message === "AI_PROVIDER_429" ? 429 : message === "IDEMPOTENCY_KEY_MISSING" ? 400 : 400;
			const code = status === 401 ? "UNAUTHENTICATED" : status === 429 ? "RATE_LIMITED" : "VALIDATION_FAILED";
			return reply.code(status).send(errorEnvelope(request, code, status, message));
		}
	});

	app.post("/v1/search/reindex", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const current = await session(request, orgId);
			const snapshot = await permissions.getSnapshot(orgId, current.userId, "organization", orgId, null);
			const allowed = can(snapshot, { orgId, type: "organization", id: orgId, workspaceId: null, projectId: null, ownerId: null, teamId: null, classification: null }, "manage");
			if (!allowed.allowed) return reply.code(403).send(errorEnvelope(request, "PERMISSION_DENIED", 403, "Search index management requires manage permission"));
			if (!typesense) return reply.code(503).send(errorEnvelope(request, "INTERNAL", 503, "Typesense is not configured"));
			const documents = await searchRepository.listIndexDocuments(orgId);
			const indexed = await typesense.upsertMany(documents);
			const config = gatewayConfig();
			if (config) {
				for (const document of documents) {
					const embedding = await createEmbedding(`${document.title}\n${document.contentText}`, config);
					if (embedding) await searchRepository.setEmbedding(orgId, document.type, document.id.slice(document.type.length + 1), embedding);
				}
			}
			const payload = SearchReindexResponseSchema.parse({ indexed, collection: "oryon_search_v1" });
			return reply.send(envelope(request, payload));
		} catch (error) {
			const message = error instanceof Error ? error.message : "Search reindex failed";
			const status = message === "UNAUTHENTICATED" ? 401 : message === "IDEMPOTENCY_KEY_MISSING" || message === "ORG_HEADER_MISSING" ? 400 : 500;
			return reply.code(status).send(errorEnvelope(request, status === 401 ? "UNAUTHENTICATED" : status === 500 ? "INTERNAL" : "VALIDATION_FAILED", status, message));
		}
	});
}
