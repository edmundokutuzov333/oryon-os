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
export type Webhook = {
	id: string;
	url: string;
	events: string[];
	description: string | null;
	active: boolean;
	secretPreview: string;
	createdAt: string;
	updatedAt: string;
};
export type ApiKey = {
	id: string;
	label: string;
	prefix: string;
	userId: string;
	createdAt: string;
	expiresAt: string | null;
	revokedAt: string | null;
};
export type ApiKeyCreated = ApiKey & { secret: string };
export type ImportResult = { imported: number; ids: string[] };

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
		const payload = (await response.json()) as
			| OryonEnvelope<T>
			| { error?: { message?: string } };
		if (!response.ok)
			throw new Error(
				"error" in payload && payload.error?.message
					? payload.error.message
					: `Oryon API error ${response.status}`,
			);
		return (payload as OryonEnvelope<T>).data;
	}
	listApiKeys(): Promise<ApiKey[]> {
		return this.request("/platform/api-keys");
	}
	createApiKey(
		label: string,
		expiresAt: string | null = null,
	): Promise<ApiKeyCreated> {
		return this.request("/platform/api-keys", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ label, expiresAt }),
		});
	}
	revokeApiKey(
		id: string,
		reason: string | null = null,
	): Promise<{ revoked: boolean }> {
		return this.request(`/platform/api-keys/${encodeURIComponent(id)}`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ reason }),
		});
	}
	listWebhooks(): Promise<Webhook[]> {
		return this.request("/platform/webhooks");
	}
	createWebhook(input: {
		url: string;
		events: string[];
		description?: string | null;
	}): Promise<Webhook> {
		return this.request("/platform/webhooks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
	}
	updateWebhook(
		id: string,
		input: Partial<{
			url: string;
			events: string[];
			description: string | null;
			active: boolean;
		}>,
	): Promise<Webhook> {
		return this.request(`/platform/webhooks/${encodeURIComponent(id)}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
	}
	testWebhook(
		id: string,
	): Promise<{
		delivered: boolean;
		statusCode: number | null;
		durationMs: number;
	}> {
		return this.request(`/platform/webhooks/${encodeURIComponent(id)}/test`, {
			method: "POST",
		});
	}
	importWorkObjects(objects: unknown[]): Promise<ImportResult> {
		return this.request("/platform/import/work-objects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ objects }),
		});
	}
	exportWorkObjects(
		params: {
			typeKey?: string;
			workspaceId?: string;
			includeCustomFields?: boolean;
			limit?: number;
		} = {},
	): Promise<unknown> {
		const query = new URLSearchParams();
		if (params.typeKey) query.set("typeKey", params.typeKey);
		if (params.workspaceId) query.set("workspaceId", params.workspaceId);
		if (params.includeCustomFields !== undefined)
			query.set("includeCustomFields", String(params.includeCustomFields));
		if (params.limit) query.set("limit", String(params.limit));
		return this.request(`/platform/export/work-objects?${query.toString()}`);
	}
}
