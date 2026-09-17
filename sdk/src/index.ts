import type {
	ApiKeyCreateInput,
	ApiKeyCreated,
	ApiKeyRevokeInput,
	ApiKeyRevokeResponse,
	ApiKeySummary,
	AuditEntry,
	AuditQuery,
	ExportWorkObjectsInput,
	ExportWorkObjectsResponse,
	ImportWorkObjectsInput,
	ImportWorkObjectsResponse,
	PlatformHealth,
	WebhookCreateInput,
	WebhookSummary,
	WebhookTestResponse,
	WebhookUpdateInput,
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
export type HealthResult = PlatformHealth;
export type AuditResult = AuditEntry[];

function parseEnvelope<T>(value: unknown): OryonEnvelope<T> {
	if (typeof value !== "object" || value === null || !("data" in value) || !("meta" in value))
		throw new Error("INVALID_API_ENVELOPE");
	const envelope = value as { data: T; meta: unknown };
	if (
		typeof envelope.meta !== "object" ||
		envelope.meta === null ||
		!("requestId" in envelope.meta) ||
		!("durationMs" in envelope.meta) ||
		typeof envelope.meta.requestId !== "string" ||
		typeof envelope.meta.durationMs !== "number"
	)
		throw new Error("INVALID_API_ENVELOPE");
	return {
		data: envelope.data,
		meta: {
			requestId: envelope.meta.requestId,
			durationMs: envelope.meta.durationMs,
		},
	};
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

	private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
		const raw: unknown = await response.json();
		if (!response.ok) {
			const error =
				typeof raw === "object" && raw !== null && "error" in raw
					? (raw as { error?: { message?: unknown } }).error
					: undefined;
			throw new Error(
				typeof error?.message === "string"
					? error.message
					: `Oryon API error ${response.status}`,
			);
		}
		return parseEnvelope<T>(raw).data;
	}

	health(): Promise<HealthResult> {
		return this.request("/platform/health");
	}

	listApiKeys(): Promise<ApiKey[]> {
		return this.request("/platform/api-keys");
	}

	createApiKey(input: ApiKeyCreateInput): Promise<ApiKeyCreated> {
		return this.request("/platform/api-keys", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
	}

	revokeApiKey(
		id: string,
		input: ApiKeyRevokeInput = {},
	): Promise<ApiKeyRevokeResponse> {
		return this.request(
			`/platform/api-keys/${encodeURIComponent(id)}`,
			{
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			},
		);
	}

	listWebhooks(): Promise<Webhook[]> {
		return this.request("/platform/webhooks");
	}

	createWebhook(input: WebhookCreateInput): Promise<Webhook> {
		return this.request("/platform/webhooks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
	}

	updateWebhook(id: string, input: WebhookUpdateInput): Promise<Webhook> {
		return this.request(
			`/platform/webhooks/${encodeURIComponent(id)}`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			},
		);
	}

	testWebhook(id: string): Promise<WebhookTestResponse> {
		return this.request(
			`/platform/webhooks/${encodeURIComponent(id)}/test`,
			{ method: "POST" },
		);
	}

	listAudit(params: AuditQuery = {}): Promise<AuditResult> {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(params))
			if (value !== undefined) query.set(key, String(value));
		return this.request(`/platform/audit?${query.toString()}`);
	}

	importWorkObjects(input: ImportWorkObjectsInput): Promise<ImportResult> {
		return this.request("/platform/import/work-objects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
	}

	exportWorkObjects(
		params: ExportWorkObjectsInput = {},
	): Promise<ExportWorkObjectsResponse> {
		const query = new URLSearchParams();
		if (params.typeKey) query.set("typeKey", params.typeKey);
		if (params.workspaceId) query.set("workspaceId", params.workspaceId);
		if (params.includeCustomFields !== undefined)
			query.set("includeCustomFields", String(params.includeCustomFields));
		if (params.limit !== undefined) query.set("limit", String(params.limit));
		return this.request(`/platform/export/work-objects?${query.toString()}`);
	}
}
