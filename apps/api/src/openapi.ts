import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

export const openApiDocument = {
	openapi: "3.1.0",
	info: {
		title: "OryonOS API",
		version: "0.1.0",
		description: "Public REST API for OryonOS V1.",
	},
	servers: [{ url: "https://api.oryon.os/v1" }],
	security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
	components: {
		securitySchemes: {
			bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
			apiKeyAuth: { type: "apiKey", in: "header", name: "X-Oryon-Api-Key" },
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
					"200": { description: "Platform health" },
					"503": { description: "Degraded platform" },
				},
			},
		},
		"/platform/api-keys": {
			get: { responses: { "200": { description: "API keys" } } },
			post: { responses: { "201": { description: "Created API key" } } },
		},
		"/platform/api-keys/{id}": {
			delete: { responses: { "200": { description: "Revoked" } } },
		},
		"/platform/webhooks": {
			get: { responses: { "200": { description: "Webhook endpoints" } } },
			post: { responses: { "201": { description: "Created webhook" } } },
		},
		"/platform/webhooks/{id}": {
			patch: { responses: { "200": { description: "Updated webhook" } } },
		},
		"/platform/webhooks/{id}/test": {
			post: { responses: { "200": { description: "Delivery result" } } },
		},
		"/platform/audit": {
			get: { responses: { "200": { description: "Audit entries" } } },
		},
		"/platform/import/work-objects": {
			post: { responses: { "200": { description: "Imported WorkObjects" } } },
		},
		"/platform/export/work-objects": {
			get: { responses: { "200": { description: "Exported WorkObjects" } } },
		},
		"/domain-templates": {
			get: { responses: { "200": { description: "Domain templates" } } },
		},
		"/work-objects": {
			get: { responses: { "200": { description: "WorkObjects" } } },
			post: { responses: { "201": { description: "Created WorkObject" } } },
		},
		"/graph/traverse": {
			get: { responses: { "200": { description: "Graph traversal" } } },
		},
		"/agents/{id}/runs": {
			post: { responses: { "200": { description: "Agent run" } } },
		},
	},
} as const;

export async function registerOpenApiRoutes(
	app: FastifyInstance,
): Promise<void> {
	app.get("/openapi.json", async (_request, reply) =>
		reply.type("application/json").send(openApiDocument),
	);
}

if (process.argv[1]?.endsWith("openapi.ts")) {
	const generatedDir = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../generated",
	);
	mkdirSync(generatedDir, { recursive: true });
	const outputPath = resolve(generatedDir, "openapi.json");
	writeFileSync(outputPath, `${JSON.stringify(openApiDocument, null, 2)}\n`);
	console.log(`OpenAPI 3.1 generated at ${outputPath}`);
}
