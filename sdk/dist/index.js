export class OryonClient {
    baseUrl;
    apiKey;
    orgId;
    http;
    constructor(options) {
        this.baseUrl = (options.baseUrl ?? "https://api.oryon.os/v1").replace(/\/$/, "");
        this.apiKey = options.apiKey;
        this.orgId = options.orgId;
        this.http = options.fetch ?? fetch;
    }
    async request(path, init = {}) {
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
        const payload = (await response.json());
        if (!response.ok)
            throw new Error("error" in payload && payload.error?.message
                ? payload.error.message
                : `Oryon API error ${response.status}`);
        return payload.data;
    }
    listApiKeys() {
        return this.request("/platform/api-keys");
    }
    createApiKey(label, expiresAt = null) {
        return this.request("/platform/api-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label, expiresAt }),
        });
    }
    revokeApiKey(id, reason = null) {
        return this.request(`/platform/api-keys/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason }),
        });
    }
    listWebhooks() {
        return this.request("/platform/webhooks");
    }
    createWebhook(input) {
        return this.request("/platform/webhooks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
    }
    updateWebhook(id, input) {
        return this.request(`/platform/webhooks/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
    }
    testWebhook(id) {
        return this.request(`/platform/webhooks/${encodeURIComponent(id)}/test`, {
            method: "POST",
        });
    }
    importWorkObjects(objects) {
        return this.request("/platform/import/work-objects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ objects }),
        });
    }
    exportWorkObjects(params = {}) {
        const query = new URLSearchParams();
        if (params.typeKey)
            query.set("typeKey", params.typeKey);
        if (params.workspaceId)
            query.set("workspaceId", params.workspaceId);
        if (params.includeCustomFields !== undefined)
            query.set("includeCustomFields", String(params.includeCustomFields));
        if (params.limit)
            query.set("limit", String(params.limit));
        return this.request(`/platform/export/work-objects?${query.toString()}`);
    }
}
