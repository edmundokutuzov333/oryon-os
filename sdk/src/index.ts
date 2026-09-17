import { z } from "zod";
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
	apiEnvelopeSchema,
} from "@oryon/contracts/public-api";

const ApiKeyListResponseSchema = apiEnvelopeSchema(ApiKeySummarySchema.array());
const ApiKeyCreatedResponseSchema = apiEnvelopeSchema(ApiKeyCreatedSchema);
const RevokedResponseSchema = apiEnvelopeSchema(z.object({ revoked: z.boolean() }));
const WebhookListResponseSchema = apiEnvelopeSchema(WebhookSummarySchema.array());
const WebhookResponseSchema = apiEnvelopeSchema(WebhookSummarySchema);
const WebhookTestResponseEnvelopeSchema = apiEnvelopeSchema(WebhookTestResponseSchema);
const AuditListResponseSchema = apiEnvelopeSchema(AuditEntrySchema.array());
const ImportResponseSchema = apiEnvelopeSchema(ImportWorkObjectsResponseSchema);
const ExportResponseSchema = apiEnvelopeSchema(ExportWorkObjectsResponseSchema);
const PlatformHealthResponseSchema = apiEnvelopeSchema(PlatformHealthSchema);

type AnySchema = z.ZodType;

type RequestOptions = RequestInit & {
	idempotencyKey?: string;
};

export type OryonClientOptions = {
	baseUrl?: string;
	apiKey: string;
	orgId: string;
	fetch?: typeof fetch;
};

export type OryonEnvelope<T> = {
	data: T;
	meta: { requestId: string; durationMs: number };
};
export type Webhook = z.infer<typeof WebhookSummarySchema>;
export type ApiKey = z.infer<typeof ApiKeySummarySchema>;
export type ApiKeyCreated = z.infer<typeof ApiKeyCreatedSchema>;
export type ImportResult = z.infer<typeof ImportWorkObjectsResponseSchema>;
export type ExportResult = z.infer<typeof ExportWorkObjectsResponseSchema>;

function encodePath(value: string): string {
	return encodeURIComponent(value);
}

export class OryonClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly orgId: string;
	private readonly http: typeof fetch;

	constructor(options: OryonClientOptions) {
		this.baseUrl = (options.baseUrl ?? "https://api.oryon.os/v1").replace(
			/\/$/,
			"",
		);
		this.apiKey = options.apiKey;
		this.orgId = options.orgId;
		this.http = options.fetch ?? fetch;
	}

	private async request<T>(
		path: string,
		schema: AnySchema,
		options: RequestOptions = {},
	): Promise<T> {
		const headers = new Headers(options.headers);
		headers.set("Accept", "application/json");
		headers.set("X-Oryon-Org", this.orgId);
		headers.set("X-Oryon-Api-Key", this.apiKey);
		if (options.method && options.method !== "GET") {
			headers.set(
				"Idempotency-Key",
				options.idempotencyKey ?? crypto.randomUUID(),
			);
		}
		const { idempotencyKey: _idempotencyKey, ...init } = options;
		const response = await this.http(`${this.baseUrl}${path}`, {
			...init,
			headers,
		});
		const payload: unknown = await response.json();
		if (!response.ok) {
			const error =
				typeof payload === "object" && payload !== null && "error" in payload
					? (payload as { error?: { message?: string } }).error
					: undefined;
			throw new Error(
				typeof error?.message === "string"
					? error.message
					: `Oryon API error ${response.status}`,
			);
		}
		return schema.parse(payload) as T;
	}

	listApiKeys(): Promise<ApiKey[]> {
		return this.request<z.infer<typeof ApiKeyListResponseSchema>>(
			"/platform/api-keys",
			ApiKeyListResponseSchema,
		).then((value) => value.data);
	}

	createApiKey(
		input: z.input<typeof ApiKeyCreateInputSchema>,
	): Promise<ApiKeyCreated> {
		const body = ApiKeyCreateInputSchema.parse(input);
		return this.request<z.infer<typeof ApiKeyCreatedResponseSchema>>(
			"/platform/api-keys",
			ApiKeyCreatedResponseSchema,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		).then((value) => value.data);
	}

	revokeApiKey(
		id: string,
		reason: z.input<typeof ApiKeyRevokeInputSchema>["reason"] = null,
	): Promise<{ revoked: boolean }> {
		const body = ApiKeyRevokeInputSchema.parse({ reason });
		return this.request<z.infer<typeof RevokedResponseSchema>>(
			`/platform/api-keys/${encodePath(id)}`,
			RevokedResponseSchema,
			{
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		).then((value) => value.data);
	}

	listWebhooks(): Promise<Webhook[]> {
		return this.request<z.infer<typeof WebhookListResponseSchema>>(
			"/platform/webhooks",
			WebhookListResponseSchema,
		).then((value) => value.data);
	}

	createWebhook(
		input: z.input<typeof WebhookCreateInputSchema>,
	): Promise<Webhook> {
		const body = WebhookCreateInputSchema.parse(input);
		return this.request<z.infer<typeof WebhookResponseSchema>>(
			"/platform/webhooks",
			WebhookResponseSchema,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		).then((value) => value.data);
	}

	updateWebhook(
		id: string,
		input: z.input<typeof WebhookUpdateInputSchema>,
	): Promise<Webhook> {
		const body = WebhookUpdateInputSchema.parse(input);
		return this.request<z.infer<typeof WebhookResponseSchema>>(
			`/platform/webhooks/${encodePath(id)}`,
			WebhookResponseSchema,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		).then((value) => value.data);
	}

	testWebhook(id: string): Promise<z.infer<typeof WebhookTestResponseSchema>> {
		return this.request<z.infer<typeof WebhookTestResponseEnvelopeSchema>>(
			`/platform/webhooks/${encodePath(id)}/test`,
			WebhookTestResponseEnvelopeSchema,
			{ method: "POST" },
		).then((value) => value.data);
	}

	listAudit(
		params: z.input<typeof AuditQuerySchema> = {},
	): Promise<z.infer<typeof AuditEntrySchema>[]> {
		const query = AuditQuerySchema.parse(params);
		const search = new URLSearchParams();
		if (query.action) search.set("action", query.action);
		if (query.resourceType) search.set("resourceType", query.resourceType);
		if (query.resourceId) search.set("resourceId", query.resourceId);
		if (query.actorId) search.set("actorId", query.actorId);
		search.set("limit", String(query.limit));
		return this.request<z.infer<typeof AuditListResponseSchema>>(
			`/platform/audit?${search.toString()}`,
			AuditListResponseSchema,
		).then((value) => value.data);
	}

	importWorkObjects(
		input: z.input<typeof ImportWorkObjectsInputSchema>,
	): Promise<ImportResult> {
		const body = ImportWorkObjectsInputSchema.parse(input);
		return this.request<z.infer<typeof ImportResponseSchema>>(
			"/platform/import/work-objects",
			ImportResponseSchema,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		).then((value) => value.data);
	}

	exportWorkObjects(
		params: z.input<typeof ExportWorkObjectsInputSchema> = {},
	): Promise<ExportResult> {
		const parsed = ExportWorkObjectsInputSchema.parse(params);
		const query = new URLSearchParams();
		if (parsed.typeKey) query.set("typeKey", parsed.typeKey);
		if (parsed.workspaceId) query.set("workspaceId", parsed.workspaceId);
		query.set("includeCustomFields", String(parsed.includeCustomFields));
		query.set("limit", String(parsed.limit));
		return this.request<z.infer<typeof ExportResponseSchema>>(
			`/platform/export/work-objects?${query.toString()}`,
			ExportResponseSchema,
		).then((value) => value.data);
	}

	getPlatformHealth(): Promise<z.infer<typeof PlatformHealthSchema>> {
		return this.request<z.infer<typeof PlatformHealthResponseSchema>>(
			"/platform/health",
			PlatformHealthResponseSchema,
		).then((value) => value.data);
	}
}
