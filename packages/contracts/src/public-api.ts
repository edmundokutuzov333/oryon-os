import { z } from "zod";
import {
	AuthRequestLinkInputSchema,
	AuthRequestLinkResponseSchema,
	AuthVerifyLinkInputSchema,
	AuthVerifyLinkResponseSchema,
	IdentityContextSchema,
} from "./identity.schema.js";
import {
	ApiKeyCreateInputSchema,
	ApiKeyCreatedSchema,
	ApiKeyRevokeInputSchema,
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
} from "./platform-release.schema.js";

export const ApiRequestParamsIdSchema = z.object({
	id: z.string().min(1),
});

export const ApiEnvelopeMetaSchema = z.object({
	requestId: z.string().min(1),
	durationMs: z.number().nonnegative(),
});

export function apiEnvelopeSchema<T extends z.ZodType>(schema: T) {
	return z.object({
		data: schema,
		meta: ApiEnvelopeMetaSchema,
	});
}

const HealthResponseSchema = z.object({
	status: z.literal("ok"),
	service: z.literal("oryon-api"),
	version: z.string(),
	timestamp: z.string().datetime({ offset: true }),
});

const RevokedResponseSchema = z.object({
	revoked: z.boolean(),
});

export type ApiContractMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type ApiContract = {
	method: ApiContractMethod;
	path: string;
	operationId: string;
	summary: string;
	tags: string[];
	params?: z.ZodType;
	query?: z.ZodType;
	body?: z.ZodType;
	response: {
		status: number;
		description: string;
		schema: z.ZodType;
	};
	security?: "bearer" | "apiKey" | "either" | "none";
};

export const publicApiContracts: readonly ApiContract[] = [
	{
		method: "GET",
		path: "/health",
		operationId: "getHealth",
		summary: "API health check",
		tags: ["System"],
		response: { status: 200, description: "Health check", schema: HealthResponseSchema },
		security: "none",
	},
	{
		method: "GET",
		path: "/v1/health",
		operationId: "getVersionedHealth",
		summary: "Versioned API health check",
		tags: ["System"],
		response: {
			status: 200,
			description: "Versioned health check",
			schema: apiEnvelopeSchema(HealthResponseSchema),
		},
		security: "none",
	},
	{
		method: "POST",
		path: "/v1/auth/request-link",
		operationId: "requestMagicLink",
		summary: "Request a magic sign-in link",
		tags: ["Identity"],
		body: AuthRequestLinkInputSchema,
		response: {
			status: 200,
			description: "Magic link delivery status",
			schema: apiEnvelopeSchema(AuthRequestLinkResponseSchema),
		},
		security: "none",
	},
	{
		method: "POST",
		path: "/v1/auth/verify-link",
		operationId: "verifyMagicLink",
		summary: "Exchange a magic link for an access token",
		tags: ["Identity"],
		body: AuthVerifyLinkInputSchema,
		response: {
			status: 200,
			description: "Issued access token",
			schema: apiEnvelopeSchema(AuthVerifyLinkResponseSchema),
		},
		security: "none",
	},
	{
		method: "GET",
		path: "/v1/auth/session",
		operationId: "getSession",
		summary: "Resolve the current session",
		tags: ["Identity"],
		response: {
			status: 200,
			description: "Current identity context",
			schema: apiEnvelopeSchema(IdentityContextSchema),
		},
		security: "either",
	},
	{
		method: "POST",
		path: "/v1/auth/logout",
		operationId: "logout",
		summary: "Revoke the current session",
		tags: ["Identity"],
		response: {
			status: 200,
			description: "Logout completed",
			schema: apiEnvelopeSchema(z.object({ loggedOut: z.boolean() })),
		},
		security: "either",
	},
	{
		method: "GET",
		path: "/v1/platform/health",
		operationId: "getPlatformHealth",
		summary: "Get platform service health",
		tags: ["Platform"],
		response: {
			status: 200,
			description: "Platform health",
			schema: apiEnvelopeSchema(PlatformHealthSchema),
		},
		security: "either",
	},
	{
		method: "GET",
		path: "/v1/platform/api-keys",
		operationId: "listApiKeys",
		summary: "List API keys",
		tags: ["Platform"],
		response: {
			status: 200,
			description: "API keys",
			schema: apiEnvelopeSchema(ApiKeySummarySchema.array()),
		},
		security: "either",
	},
	{
		method: "POST",
		path: "/v1/platform/api-keys",
		operationId: "createApiKey",
		summary: "Create an API key",
		tags: ["Platform"],
		body: ApiKeyCreateInputSchema,
		response: {
			status: 201,
			description: "Created API key",
			schema: apiEnvelopeSchema(ApiKeyCreatedSchema),
		},
		security: "either",
	},
	{
		method: "DELETE",
		path: "/v1/platform/api-keys/{id}",
		operationId: "revokeApiKey",
		summary: "Revoke an API key",
		tags: ["Platform"],
		params: ApiRequestParamsIdSchema,
		body: ApiKeyRevokeInputSchema,
		response: {
			status: 200,
			description: "API key revoked",
			schema: apiEnvelopeSchema(RevokedResponseSchema),
		},
		security: "either",
	},
	{
		method: "GET",
		path: "/v1/platform/webhooks",
		operationId: "listWebhooks",
		summary: "List webhook endpoints",
		tags: ["Platform"],
		response: {
			status: 200,
			description: "Webhook endpoints",
			schema: apiEnvelopeSchema(WebhookSummarySchema.array()),
		},
		security: "either",
	},
	{
		method: "POST",
		path: "/v1/platform/webhooks",
		operationId: "createWebhook",
		summary: "Create a webhook endpoint",
		tags: ["Platform"],
		body: WebhookCreateInputSchema,
		response: {
			status: 201,
			description: "Created webhook",
			schema: apiEnvelopeSchema(WebhookSummarySchema),
		},
		security: "either",
	},
	{
		method: "PATCH",
		path: "/v1/platform/webhooks/{id}",
		operationId: "updateWebhook",
		summary: "Update a webhook endpoint",
		tags: ["Platform"],
		params: ApiRequestParamsIdSchema,
		body: WebhookUpdateInputSchema,
		response: {
			status: 200,
			description: "Updated webhook",
			schema: apiEnvelopeSchema(WebhookSummarySchema),
		},
		security: "either",
	},
	{
		method: "POST",
		path: "/v1/platform/webhooks/{id}/test",
		operationId: "testWebhook",
		summary: "Send a signed webhook test",
		tags: ["Platform"],
		params: ApiRequestParamsIdSchema,
		response: {
			status: 200,
			description: "Webhook delivery result",
			schema: apiEnvelopeSchema(WebhookTestResponseSchema),
		},
		security: "either",
	},
	{
		method: "GET",
		path: "/v1/platform/audit",
		operationId: "listAudit",
		summary: "List audit entries",
		tags: ["Platform"],
		query: AuditQuerySchema,
		response: {
			status: 200,
			description: "Audit entries",
			schema: apiEnvelopeSchema(AuditEntrySchema.array()),
		},
		security: "either",
	},
	{
		method: "GET",
		path: "/v1/platform/export/work-objects",
		operationId: "exportWorkObjects",
		summary: "Export WorkObjects",
		tags: ["Platform"],
		query: ExportWorkObjectsInputSchema,
		response: {
			status: 200,
			description: "Exported WorkObjects",
			schema: z.object({
				data: ExportWorkObjectsResponseSchema,
				meta: ApiEnvelopeMetaSchema,
			}),
		},
		security: "either",
	},
	{
		method: "POST",
		path: "/v1/platform/import/work-objects",
		operationId: "importWorkObjects",
		summary: "Import WorkObjects",
		tags: ["Platform"],
		body: ImportWorkObjectsInputSchema,
		response: {
			status: 200,
			description: "Imported WorkObjects",
			schema: apiEnvelopeSchema(ImportWorkObjectsResponseSchema),
		},
		security: "either",
	},
];

export type PublicApiOperationId = (typeof publicApiContracts)[number]["operationId"];
