import { z } from "zod";
import {
	ApiKeyCreateInputSchema,
	ApiKeyCreatedSchema,
	ApiKeyRevokeInputSchema,
	ApiKeyRevokeResponseSchema,
	ApiKeySummarySchema,
	AuditEntrySchema,
	ExportWorkObjectsInputSchema,
	ExportWorkObjectsResponseSchema,
	ImportWorkObjectsInputSchema,
	ImportWorkObjectsResponseSchema,
	PlatformHealthSchema,
	WebhookCreateInputSchema,
	WebhookSummarySchema,
	WebhookTestResponseSchema,
	WebhookUpdateInputSchema,
	type ApiKeyCreated,
	type ApiKeySummary,
	type AuditEntry,
	type AuditQuery,
	type ExportWorkObjectsInput,
	type ExportWorkObjectsResponse,
	type ImportWorkObjectsInput,
	type ImportWorkObjectsResponse,
	type WebhookCreateInput,
	type WebhookSummary,
	type WebhookTestResponse,
	type WebhookUpdateInput,
} from "@oryon/contracts/platform-release";

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

export type ApiKey = ApiKeySummary;
export type Webhook = WebhookSummary;
export type ImportResult = ImportWorkObjectsResponse;
export type HealthResult = z.infer<typeof PlatformHealthSchema>;
export type AuditResult = AuditEntry[];

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
		schema: z.ZodType<T>,
		init: RequestInit = {},
	): Promise<T> {
		const headers = new Headers(init.headers);
		headers.set("Accept", "application/json");
		headers.set("X-Oryon-Org", this.orgId);
		headers.set("X-Oryon-Api-Key", this.apiKey);
		if (init.method && init.method !== "GET")
			headers.set("Idempotency-Key", crypto.randomUUID());
		const response = await this.http(`${this.baseUrl}${path}`, {
			...init,
			headers,
		});
		const payload = (await response.json()) as
			| OryonEnvelope<unknown>
			| { error?: { message?: string } };
		if (!response.ok)
			throw new Error(
				"error" in payload && payload.error?.message
					? payload.error.message
					: `Oryon API error ${response.status}`,
			);
		if (!("data" in payload)) throw new Error("INVALID_API_ENVELOPE");
		return schema.parse(payload.data);
	}

	health(): Promise<HealthResult> {
		return this.request("/platform/health", PlatformHealthSchema);
	}

	listApiKeys(): Promise<ApiKey[]> {
		return this.request("/platform/api-keys", ApiKeySummarySchema.array());
	}

	createApiKey(
		input: z.input<typeof ApiKeyCreateInputSchema>,
	): Promise<ApiKeyCreated> {
		const body = ApiKeyCreateInputSchema.parse(input);
		return this.request("/platform/api-keys", ApiKeyCreatedSchema, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	revokeApiKey(
		id: string,
		input: z.input<typeof ApiKeyRevokeInputSchema> = {},
	): Promise<z.infer<typeof ApiKeyRevokeResponseSchema>> {
		const body = ApiKeyRevokeInputSchema.parse(input);
		return this.request(
			`/platform/api-keys/${encodeURIComponent(id)}`,
			ApiKeyRevokeResponseSchema,
			{
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		);
	}

	listWebhooks(): Promise<Webhook[]> {
		return this.request("/platform/webhooks", WebhookSummarySchema.array());
	}

	createWebhook(input: WebhookCreateInput): Promise<Webhook> {
		const body = WebhookCreateInputSchema.parse(input);
		return this.request("/platform/webhooks", WebhookSummarySchema, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	updateWebhook(id: string, input: WebhookUpdateInput): Promise<Webhook> {
		const body = WebhookUpdateInputSchema.parse(input);
		return this.request(
			`/platform/webhooks/${encodeURIComponent(id)}`,
			WebhookSummarySchema,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		);
	}

	testWebhook(id: string): Promise<WebhookTestResponse> {
		return this.request(
			`/platform/webhooks/${encodeURIComponent(id)}/test`,
			WebhookTestResponseSchema,
			{ method: "POST" },
		);
	}

	listAudit(params: AuditQuery = {}): Promise<AuditResult> {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(params))
			if (value !== undefined) query.set(key, String(value));
		return this.request(
			`/platform/audit?${query.toString()}`,
			AuditEntrySchema.array(),
		);
	}

	importWorkObjects(input: ImportWorkObjectsInput): Promise<ImportResult> {
		const body = ImportWorkObjectsInputSchema.parse(input);
		return this.request(
			"/platform/import/work-objects",
			ImportWorkObjectsResponseSchema,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		);
	}

	exportWorkObjects(
		params: ExportWorkObjectsInput = {},
	): Promise<ExportWorkObjectsResponse> {
		const query = new URLSearchParams();
		const parsed = ExportWorkObjectsInputSchema.parse(params);
		if (parsed.typeKey) query.set("typeKey", parsed.typeKey);
		if (parsed.workspaceId) query.set("workspaceId", parsed.workspaceId);
		query.set("includeCustomFields", String(parsed.includeCustomFields));
		query.set("limit", String(parsed.limit));
		return this.request(
			`/platform/export/work-objects?${query.toString()}`,
			ExportWorkObjectsResponseSchema,
		);
	}
}
