# API Contracts: Search + AI V1

This document extends the global invariants in `docs/API_CONTRACTS.md` for Phase 12. It does not replace the canonical global rules.

## `GET /v1/search/hybrid`

Headers:

- `Authorization: Bearer <jwt>` or the authenticated web session cookie.
- `X-Oryon-Org: <organization-id>`.

Query:

```json
{
  "q": "texto livre",
  "limit": 20,
  "type": "work_object | page | file_asset",
  "offset": 0
}
```

The response uses the standard `{ data, meta }` envelope and returns:

```json
{
  "query": "texto livre",
  "results": [
    {
      "id": "...",
      "type": "work_object",
      "title": "...",
      "snippet": "...",
      "score": 0.01,
      "matchedBy": ["lexical", "semantic"],
      "classification": "internal",
      "href": "/os/work?object=...",
      "permissions": { "read": true, "use_ai": true }
    }
  ],
  "hasMore": false,
  "mode": "HYBRID"
}
```

Lexical retrieval uses Typesense. Semantic retrieval uses the canonical `embedding vector(1536)` fields in `WorkObject`, `Page` and `FileAsset` when an embedding provider is configured. Results are fused with weighted reciprocal rank fusion and then filtered again through `can()`.

The API never returns a resource that is not readable by the current principal. Tenancy is applied in PostgreSQL and validated again against the resource before presentation.

## `POST /v1/ai/search`

Requires `Idempotency-Key` in addition to the global invariants.

Request:

```json
{
  "query": "Quais são as tarefas abertas desta operação?",
  "mode": "ANSWER",
  "limit": 8,
  "conversationKey": "optional-conversation-key"
}
```

`mode=SEARCH` returns a grounded source-first response. `mode=ANSWER` calls the configured AI gateway when available and otherwise falls back to an extractive grounded response so the contract remains useful in a local development environment.

Every returned answer must contain at least one citation token in the form `[type:id]`. The API validates every citation against the source set returned for the authenticated principal. Unknown citation identifiers or an answer with no citations are rejected.

Before context retrieval, every candidate resource must pass both `read` and `use_ai`. Classification rules with `blocksAi` take precedence over ordinary role or grant access. A model policy, when present, restricts the model route to its declared `allowedModels` and fallback model.

Conversation memory is stored in Redis under an organization and user scoped key, hashed from `conversationKey`, with a configurable TTL. Only recent turns, answer text and citation identifiers are retained. No separate persistent `Memory` table is introduced because the canonical V1 schema does not define one.

## `POST /v1/search/reindex`

Requires `Idempotency-Key` and `manage` on the organization resource. This endpoint rebuilds the tenant's Typesense collection from the canonical `WorkObject`, `Page` and `FileAsset` records. When an embedding provider is configured it also refreshes the stored vectors for those resources.

The endpoint is operational and does not expose document contents outside the caller's organization.

## Security invariants

1. Typesense is an index, never an authorization source.
2. PostgreSQL tenancy and RLS remain authoritative.
3. Search candidates are resolved back to canonical records before response.
4. AI retrieval applies the same `can()` engine used by the rest of OryonOS.
5. AI-blocked classifications are not sent to the model.
6. AI output is rejected unless every citation is resolvable to an authorized source.
7. The browser never receives provider API credentials.
