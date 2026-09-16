import type { z } from "zod";
import { ApiKeyCreatedSchema, ApiKeySummarySchema, ImportWorkObjectsResponseSchema, WebhookSummarySchema, WebhookTestResponseSchema } from "@oryon/contracts/platform-release";

type ClientOptions = { baseUrl?: string; apiKey?: string; accessToken?: string; orgId: string; fetch?: typeof fetch };
export class OryonClient {
  private readonly baseUrl: string; private readonly apiKey?: string; private readonly accessToken?: string; private readonly orgId: string; private readonly http: typeof fetch;
  constructor(options: ClientOptions) { this.baseUrl = (options.baseUrl ?? "https://api.oryon.os/v1").replace(/\/$/, ""); this.apiKey = options.apiKey; this.accessToken = options.accessToken; this.orgId = options.orgId; this.http = options.fetch ?? fetch; }
  private async request<T>(path: string, init: RequestInit = {}, schema?: z.ZodType<T>): Promise<T> { const headers = new Headers(init.headers); headers.set("Accept", "application/json"); headers.set("X-Oryon-Org", this.orgId); if (this.apiKey) headers.set("X-Oryon-Api-Key", this.apiKey); else if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`); if (init.method && init.method !== "GET") headers.set("Idempotency-Key", crypto.randomUUID()); const response = await this.http(`${this.baseUrl}${path}`, { ...init, headers }); const payload = (await response.json()) as { data?: unknown; error?: { message?: string } }; if (!response.ok) throw new Error(payload.error?.message ?? `Oryon API error ${response.status}`); return schema ? schema.parse(payload.data) : payload.data as T; }
  listApiKeys() { return this.request("/platform/api-keys", {}, ApiKeySummarySchema.array()); }
  createApiKey(input: { label: string; expiresAt?: string | null }) { return this.request("/platform/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, ApiKeyCreatedSchema); }
  revokeApiKey(id: string, reason?: string | null) { return this.request(`/platform/api-keys/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason ?? null }) }); }
  listWebhooks() { return this.request("/platform/webhooks", {}, WebhookSummarySchema.array()); }
  createWebhook(input: { url: string; events: string[]; description?: string | null }) { return this.request("/platform/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, WebhookSummarySchema); }
  testWebhook(id: string) { return this.request(`/platform/webhooks/${encodeURIComponent(id)}/test`, { method: "POST" }, WebhookTestResponseSchema); }
  importWorkObjects(objects: unknown[]) { return this.request("/platform/import/work-objects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objects }) }, ImportWorkObjectsResponseSchema); }
  exportWorkObjects(query = new URLSearchParams()) { return this.request(`/platform/export/work-objects?${query.toString()}`); }
}
export type ApiKey = z.infer<typeof ApiKeySummarySchema>;
