# API_CONTRACTS.md — OryonOS

Contratos normativos da API. Schemas Zod vivem em `packages/contracts`; OpenAPI 3.1 é gerado pela aplicação API.

## Invariantes

- Base: `https://api.oryon.os/v1`
- Auth: `Authorization: Bearer <jwt>` ou `X-Oryon-Api-Key` para service accounts.
- `X-Oryon-Org` é obrigatório em toda a chamada.
- Todo POST/PATCH/DELETE exige `Idempotency-Key`.
- Agentes enviam `X-Oryon-Agent-Run` e a permissão resolve contra `principalId`.
- `X-Request-Id` propaga-se pela cadeia e pelos eventos.
- Datas usam ISO 8601 com offset explícito.
- Dinheiro usa `{ amount: string, currency: string }`.
- Paginação usa cursor opaco e `limit` máximo 200.
- Respostas podem usar `fields` e `expand`.

## Envelopes

```json
{ "data": {}, "meta": { "requestId": "req_...", "durationMs": 42 } }
```

Erros usam `{ error: { code, httpStatus, message, requestId } }`. Códigos canónicos incluem `VALIDATION_FAILED`, `ORG_HEADER_MISSING`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, `CLASSIFICATION_BLOCKED`, `NOT_FOUND`, `CONFLICT`, `CYCLE_DETECTED`, `IDEMPOTENCY_MISMATCH`, `RATE_LIMITED`, `AI_BUDGET_EXCEEDED`, `CHECKPOINT_REQUIRED` e `INTERNAL`.

## Work Objects

`POST /v1/work-objects`, `PATCH /v1/work-objects/{id}`, `GET /v1/work-objects`, `POST /v1/work-objects/bulk` e `POST /v1/work-objects/{id}/convert`.

Toda resposta de WorkObject inclui `permissions`. Transições inválidas respeitam o `statusModel` do `ObjectTypeDef`.

## Work Graph

`POST /v1/edges` e `GET /v1/graph/traverse`.

Ciclos em `BLOCKS` ou `PARENT_OF` devolvem `CYCLE_DETECTED`. Traversals filtram por permissão.

## Comunicação

`POST /v1/channels/{channelId}/messages`, `POST /v1/messages/{id}/convert` e `GET /v1/channels/{id}/catch-up`.

Resposta de IA sem `citations` não é aceite pela UI.

## IA e Agentes

`POST /v1/agents/{id}/runs`, `GET /v1/agent-runs/{id}`, `POST /v1/agent-runs/{id}/rollback` e `POST /v1/ai/search`.

Acções sensíveis podem exigir `CHECKPOINT_REQUIRED`. Runs registam passos, tools, recursos lidos/escritos, consumo e rollback.

## Eventos

Todos os consumidores recebem envelope versionado com `eventId`, `name`, `version`, `orgId`, `occurredAt`, `actor`, `subject`, `payload`, `correlationId` e `causationId`.

## Regras do agente de execução

Entrada e saída pública passam pelo mesmo schema Zod. Nunca expor existência de recurso invisível. Nenhuma resposta de objecto sem `permissions`. Nenhuma resposta de IA sem fontes resolvíveis. Nenhuma mutação sem outbox. Dinheiro sempre como decimal em string + moeda.
