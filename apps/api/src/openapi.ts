import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { toOpenApiSchema } from "@oryon/contracts/openapi";
import {
	ApiKeyCreateInputSchema,
	ApiKeyCreatedSchema,
	ApiKeyRevokeInputSchema,
	ApiKeyRevokeResponseSchema,
	ApiKeySummarySchema,
	AuditEntrySchema,
	AuditQuerySchema,
	ExportWorkObjectsInputSchema,
	ExportWorkObjectsResponseSchema,
	ImportWorkObjectsInputSchema,
	ImportWorkObjectsResponseSchema,
	PlatformHealthSchema,
	WebhookCreateInputSchema,
	WebhookSummarySchema,
	WebhookTestResponseSchema,
	WebhookUpdateInputSchema,
} from "@oryon/contracts/platform-release";
import {
	GraphEdgeCreateInputSchema,
	GraphEdgeDeleteInputSchema,
	GraphEdgeMutationResponseSchema,
	GraphEdgeRestoreInputSchema,
	GraphEdgeSchema,
	GraphTraverseQuerySchema,
	GraphTraverseResponseSchema,
} from "@oryon/contracts/graph";

function schemaRef(name: string) {
	return { $ref: `#/components/schemas/${name}` };
}

function arrayRef(name: string) {
	return { type: "array", items: schemaRef(name) };
}

function queryParameters(schema: Parameters<typeof toOpenApiSchema>[0]) {
	const json = toOpenApiSchema(schema) as {
		properties?: Record<string, Record<string, unknown>>;
		required?: string[];
	};
	return Object.entries(json.properties ?? {}).map(([name, value]) => ({
		name,
		in: "query",
		required: json.required?.includes(name) ?? false,
		schema: value,
	}));
}

function jsonRequestBody(name: string) {
	return {
		required: true,
		content: { "application/json": { schema: schemaRef(name) } },
	};
}

function jsonResponse(name: string, description: string) {
	return {
		description,
		content: {
			"application/json": {
				schema: {
					type: "object",
					required: ["data", "meta"],
					properties: {
						data: schemaRef(name),
						meta: {
							type: "object",
							required: ["requestId", "durationMs"],
							properties: {
								requestId: { type: "string" },
								durationMs: { type: "number" },
							},
						},
					},
				},
			},
		},
	};
}

export const openApiDocument = {
	openapi: "3.1.0",
	info: {
		title: "OryonOS API",
		version: "0.1.0",
		description: "REST + OpenAPI 3.1 public API for OryonOS V1.",
	},
	servers: [{ url: "https://api.oryon.os/v1" }],
	security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
	components: {
		securitySchemes: {
			bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
			apiKeyAuth: { type: "apiKey", in: "header", name: "X-Oryon-Api-Key" },
		},
		schemas: {
			ApiKeyCreateInput: toOpenApiSchema(ApiKeyCreateInputSchema),
			ApiKeyCreated: toOpenApiSchema(ApiKeyCreatedSchema),
			ApiKeyRevokeInput: toOpenApiSchema(ApiKeyRevokeInputSchema),
			ApiKeyRevokeResponse: toOpenApiSchema(ApiKeyRevokeResponseSchema),
			ApiKeySummary: toOpenApiSchema(ApiKeySummarySchema),
			AuditEntry: toOpenApiSchema(AuditEntrySchema),
			AuditQuery: toOpenApiSchema(AuditQuerySchema),
			ExportWorkObjectsInput: toOpenApiSchema(ExportWorkObjectsInputSchema),
			ExportWorkObjectsResponse: toOpenApiSchema(ExportWorkObjectsResponseSchema),
			ImportWorkObjectsInput: toOpenApiSchema(ImportWorkObjectsInputSchema),
			ImportWorkObjectsResponse: toOpenApiSchema(ImportWorkObjectsResponseSchema),
			PlatformHealth: toOpenApiSchema(PlatformHealthSchema),
			WebhookCreateInput: toOpenApiSchema(WebhookCreateInputSchema),
			WebhookSummary: toOpenApiSchema(WebhookSummarySchema),
			WebhookSummaryList: arrayRef("WebhookSummary"),
			WebhookTestResponse: toOpenApiSchema(WebhookTestResponseSchema),
			WebhookUpdateInput: toOpenApiSchema(WebhookUpdateInputSchema),
			ApiKeySummaryList: arrayRef("ApiKeySummary"),
			AuditEntryList: arrayRef("AuditEntry"),
			GraphEdgeCreateInput: toOpenApiSchema(GraphEdgeCreateInputSchema),
			GraphEdgeDeleteInput: toOpenApiSchema(GraphEdgeDeleteInputSchema),
			GraphEdgeRestoreInput: toOpenApiSchema(GraphEdgeRestoreInputSchema),
			GraphEdgeMutationResponse: toOpenApiSchema(GraphEdgeMutationResponseSchema),
			GraphEdge: toOpenApiSchema(GraphEdgeSchema),
			GraphTraverseQuery: toOpenApiSchema(GraphTraverseQuerySchema),
			GraphTraverseResponse: toOpenApiSchema(GraphTraverseResponseSchema),
		},
	},
	paths: {
		"/health": {
			get: {
				security: [],
				responses: { "200": { description: "Health check" } },
			},
		},
		"/platform/health": {
			get: {
				responses: {
					"200": jsonResponse("PlatformHealth", "Platform health"),
					"503": jsonResponse("PlatformHealth", "Degraded platform"),
				},
			},
		},
		"/platform/api-keys": {
			get: { responses: { "200": jsonResponse("ApiKeySummaryList", "API keys") } },
			post: {
				requestBody: jsonRequestBody("ApiKeyCreateInput"),
				responses: { "201": jsonResponse("ApiKeyCreated", "Created API key") },
			},
		},
		"/platform/api-keys/{id}": {
			parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
			delete: {
				requestBody: jsonRequestBody("ApiKeyRevokeInput"),
				responses: { "200": jsonResponse("ApiKeyRevokeResponse", "Revoked API key") },
			},
		},
		"/platform/webhooks": {
			get: { responses: { "200": jsonResponse("WebhookSummaryList", "Webhook endpoints") } },
			post: {
				requestBody: jsonRequestBody("WebhookCreateInput"),
				responses: { "201": jsonResponse("WebhookSummary", "Created webhook") },
			},
		},
		"/platform/webhooks/{id}": {
			parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
			patch: {
				requestBody: jsonRequestBody("WebhookUpdateInput"),
				responses: { "200": jsonResponse("WebhookSummary", "Updated webhook") },
			},
		},
		"/platform/webhooks/{id}/test": {
			parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
			post: {
				responses: { "200": jsonResponse("WebhookTestResponse", "Delivery result") },
			},
		},
		"/platform/audit": {
			get: {
				parameters: queryParameters(AuditQuerySchema),
				responses: { "200": jsonResponse("AuditEntryList", "Audit entries") },
			},
		},
		"/platform/import/work-objects": {
			post: {
				requestBody: jsonRequestBody("ImportWorkObjectsInput"),
				responses: { "200": jsonResponse("ImportWorkObjectsResponse", "Imported WorkObjects") },
			},
		},
		"/platform/export/work-objects": {
			get: {
				parameters: queryParameters(ExportWorkObjectsInputSchema),
				responses: { "200": jsonResponse("ExportWorkObjectsResponse", "Exported WorkObjects") },
			},
		},
		"/edges": {
			post: {
				parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8 } }],
				requestBody: jsonRequestBody("GraphEdgeCreateInput"),
				responses: { "201": jsonResponse("GraphEdgeMutationResponse", "Created graph edge") },
			},
		},
		"/edges/{id}": {
			parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
			delete: {
				parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8 } }],
				requestBody: jsonRequestBody("GraphEdgeDeleteInput"),
				responses: { "200": jsonResponse("GraphEdgeMutationResponse", "Deleted graph edge") },
			},
		},
		"/edges/{id}/restore": {
			parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
			post: {
				parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8 } }],
				requestBody: jsonRequestBody("GraphEdgeRestoreInput"),
				responses: { "200": jsonResponse("GraphEdgeMutationResponse", "Restored graph edge") },
			},
		},
		"/graph/traverse": {
			get: {
				parameters: queryParameters(GraphTraverseQuerySchema),
				responses: { "200": jsonResponse("GraphTraverseResponse", "Visible graph traversal") },
			},
		},
	},
} as const;

export async function registerOpenApiRoutes(app: FastifyInstance): Promise<void> {
	app.get("/openapi.json", async (_request, reply) =>
		reply.type("application/json").send(openApiDocument),
	);
}

if (process.argv[1]?.endsWith("openapi.ts")) {
	const generatedDir = resolve(dirname(fileURLToPath(import.meta.url)), "../generated");
	mkdirSync(generatedDir, { recursive: true });
	const outputPath = resolve(generatedDir, "openapi.json");
	writeFileSync(outputPath, `${JSON.stringify(openApiDocument, null, 2)}\n`);
	console.log(`OpenAPI 3.1 generated at ${outputPath}`);
}
