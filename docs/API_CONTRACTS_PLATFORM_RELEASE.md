# Platform Release API Contracts

All routes are under `/v1` and inherit the canonical OryonOS headers and envelopes from `docs/API_CONTRACTS.md`.

## Platform health

`GET /v1/platform/health` returns database, OpenAPI and security readiness. HTTP 503 is returned when the database check fails.

## API keys

`GET /v1/platform/api-keys` lists redacted API keys.
`POST /v1/platform/api-keys` accepts `{ label, expiresAt }` and returns the secret exactly once. A service account and organization-scoped `RoleBinding` are created transactionally.
`DELETE /v1/platform/api-keys/{id}` revokes the key without deleting its audit trail.

Authentication accepts `X-Oryon-Api-Key`. Every mutation requires `Idempotency-Key`.

## Webhooks

`GET /v1/platform/webhooks` lists configured endpoints without secrets.
`POST /v1/platform/webhooks` accepts `{ url, events, description }`.
`PATCH /v1/platform/webhooks/{id}` updates endpoint configuration.
`POST /v1/platform/webhooks/{id}/test` performs a signed delivery using `X-Oryon-Signature: sha256=<hmac>`.

## Import / export

`POST /v1/platform/import/work-objects` accepts up to 500 WorkObjects in a single validated payload.
`GET /v1/platform/export/work-objects` supports `typeKey`, `workspaceId`, `includeCustomFields` and `limit`.

Both operations use the canonical WorkObject repository. No parallel domain persistence is introduced.

## Audit

`GET /v1/platform/audit` lists administrative AuditLog entries and supports action, resourceType, resourceId, actorId and limit filters.
