# ADR-0010: Search + AI architecture

Status: Accepted
Date: 2026-09-16
Phase: 12

## Decision

OryonOS Search + AI uses one tenant-aware retrieval path over the canonical Work Graph resources. The searchable corpus is the union of `WorkObject`, `Page` and `FileAsset` records.

Typesense is the lexical index. PostgreSQL `pgvector` remains the semantic source of truth for embeddings. Retrieval candidates from both systems are fused using weighted reciprocal rank fusion, resolved back to canonical PostgreSQL records and passed through the existing `can()` engine before the API returns them or exposes them to an AI model.

The browser talks to the web BFF. Provider credentials never reach the browser. AI requests go through an explicit gateway abstraction, where `ModelPolicy` controls the allowed model route when a policy exists.

AI answers are grounded. The model receives only authorized source content and is instructed to cite source identifiers. The gateway output is rejected when citations are missing or cannot be resolved to the authorized source set.

Conversation memory is intentionally ephemeral and Redis-backed. The current canonical V1 schema has no standalone Memory table, so Phase 12 does not introduce one. Memory keys are scoped to organization and user and the conversation identifier is hashed before storage.

## Security

Typesense is an index and not an authorization authority. Tenant filtering happens during retrieval and source resolution. AI exposure is a second explicit permission decision (`use_ai`) after ordinary read authorization. Classification rules that block AI therefore remain effective regardless of search ranking.

The reindex endpoint is tenant scoped and requires organization `manage` permission plus an idempotency key.

## UX and service design

Search is available as a first-class `/os/search` surface and can be reached from the AppShell. Results distinguish Work, Docs and Files without creating separate search products. The same result links return users to the canonical object experience.

AI is presented as an answer layer on top of search, with visible retrieval counters and resolvable source cards. Empty, loading and failure states remain usable when the AI provider is not configured or unavailable.

## Consequences

This keeps Search + AI transversal instead of attaching intelligence to individual domains. It also means indexing and embedding are asynchronous operational concerns while PostgreSQL remains the authoritative record of the resource and its permissions.
