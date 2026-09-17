export type OryonClientOptions = {
    baseUrl?: string;
    apiKey: string;
    orgId: string;
    fetch?: typeof fetch;
};
export type OryonEnvelope<T> = {
    data: T;
    meta: {
        requestId: string;
        durationMs: number;
    };
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
export type ApiKeyCreated = ApiKey & {
    secret: string;
};
export type ImportResult = {
    imported: number;
    ids: string[];
};
export declare class OryonClient {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly orgId;
    private readonly http;
    constructor(options: OryonClientOptions);
    private request;
    listApiKeys(): Promise<ApiKey[]>;
    createApiKey(label: string, expiresAt?: string | null): Promise<ApiKeyCreated>;
    revokeApiKey(id: string, reason?: string | null): Promise<{
        revoked: boolean;
    }>;
    listWebhooks(): Promise<Webhook[]>;
    createWebhook(input: {
        url: string;
        events: string[];
        description?: string | null;
    }): Promise<Webhook>;
    updateWebhook(id: string, input: Partial<{
        url: string;
        events: string[];
        description: string | null;
        active: boolean;
    }>): Promise<Webhook>;
    testWebhook(id: string): Promise<{
        delivered: boolean;
        statusCode: number | null;
        durationMs: number;
    }>;
    importWorkObjects(objects: unknown[]): Promise<ImportResult>;
    exportWorkObjects(params?: {
        typeKey?: string;
        workspaceId?: string;
        includeCustomFields?: boolean;
        limit?: number;
    }): Promise<unknown>;
}
