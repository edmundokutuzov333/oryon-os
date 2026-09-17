import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
	publicApiContracts,
	type ApiContract,
} from "@oryon/contracts/public-api";

type OpenApiSchema = Record<string, unknown>;
type OpenApiOperation = Record<string, unknown>;

type JsonSchemaDocument = OpenApiSchema & {
	properties?: Record<string, OpenApiSchema>;
	required?: string[];
	$schema?: string;
};

function jsonSchema(
	schema: z.ZodType,
	io: "input" | "output",
): JsonSchemaDocument {
	const document = z.toJSONSchema(schema, {
		target: "draft-2020-12",
		io,
		unrepresentable: "any",
	}) as JsonSchemaDocument;
	delete document.$schema;
	return document;
}

function parametersFor(
	schema: z.ZodType | undefined,
	location: "path" | "query",
): OpenApiSchema[] {
	if (!schema) return [];
	const document = jsonSchema(schema, "input");
	const properties = document.properties ?? {};
	const required = new Set(document.required ?? []);
	return Object.entries(properties).map(([name, propertySchema]) => ({
		name,
		in: location,
		required: location === "path" ? true : required.has(name),
		schema: propertySchema,
	}));
}

function securityFor(
	security: ApiContract["security"],
): OpenApiSchema[] | undefined {
	if (!security || security === "none") return [];
	if (security === "bearer") return [{ bearerAuth: [] }];
	if (security === "apiKey") return [{ apiKeyAuth: [] }];
	return [{ bearerAuth: [] }, { apiKeyAuth: [] }];
}

function operationFor(contract: ApiContract): OpenApiOperation {
	const operation: OpenApiOperation = {
		operationId: contract.operationId,
		summary: contract.summary,
		tags: contract.tags,
		responses: {
			[String(contract.response.status)]: {
				description: contract.response.description,
				content: {
					"application/json": {
						schema: jsonSchema(contract.response.schema, "output"),
					},
				},
			},
		},
	};
	const parameters = [
		...parametersFor(contract.params, "path"),
		...parametersFor(contract.query, "query"),
	];
	if (parameters.length > 0) operation.parameters = parameters;
	if (contract.body) {
		operation.requestBody = {
			required: true,
			content: {
				"application/json": {
					schema: jsonSchema(contract.body, "input"),
				},
			},
		};
	}
	operation.security = securityFor(contract.security);
	return operation;
}

function buildOpenApiDocument() {
	const paths: Record<string, Record<string, OpenApiOperation>> = {};
	for (const contract of publicApiContracts) {
		const path = (paths[contract.path] ??= {});
		path[contract.method.toLowerCase()] = operationFor(contract);
	}
	return {
		openapi: "3.1.0",
		info: {
			title: "OryonOS API",
			version: "0.1.0",
			description:
				"Public REST API for OryonOS V1. Contract-generated from packages/contracts.",
		},
		servers: [{ url: "https://api.oryon.os" }],
		paths,
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
				apiKeyAuth: {
					type: "apiKey",
					in: "header",
					name: "X-Oryon-Api-Key",
				},
			},
		},
	};
}

export const openApiDocument = buildOpenApiDocument();

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
