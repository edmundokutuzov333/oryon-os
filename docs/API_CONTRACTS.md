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

Erros usam `{ "error": { "code", "httpStatus", "message", "requestId" } }`. Códigos canónicos incluem `VALIDATION_FAILED`, `ORG_HEADER_MISSING`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, `CLASSIFICATION_BLOCKED`, `NOT_FOUND`, `CONFLICT`, `CYCLE_DETECTED`, `IDEMPOTENCY_MISMATCH`, `RATE_LIMITED`, `AI_BUDGET_EXCEEDED`, `CHECKPOINT_REQUIRED` e `INTERNAL`.

## Identity e Auth

A identidade canónica é `User` dentro de `Organization`. `Workspace`, `Team` e `TeamMember` compõem o contexto empresarial devolvido à aplicação. Sessões web são tokens opacos HttpOnly e revogáveis; a API aceita o JWT de curta duração emitido no exchange da sessão.

`POST /v1/auth/request-link` pede um magic link. O body é `{ "email": "user@example.com" }` e requer `X-Oryon-Org` e `Idempotency-Key`. O sistema responde `{ "delivered": true }`; em `ORYON_AUTH_DEV_MODE=true` pode incluir `debugToken`.

`POST /v1/auth/verify-link` recebe `{ "token": "..." }`, requer `X-Oryon-Org` e `Idempotency-Key`, valida o token de uso único, cria sessão e devolve `{ "accessToken": "...", "expiresAt": "..." }`. A aplicação web recebe adicionalmente a sessão através de cookie HttpOnly.

`GET /v1/auth/session` requer `X-Oryon-Org` e autenticação por Bearer JWT ou cookie de sessão. Devolve `IdentityContext` com `user`, `organization`, `workspaces`, `teams` e `session`.

`POST /v1/auth/logout` requer `X-Oryon-Org` e `Idempotency-Key`. Revoga a sessão web e limpa o cookie. O access token de curta duração deixa de resolver porque a sessão a que está ligado foi revogada.

Identidade externa futura deve mapear para `User.externalId`, preservando um único principal por pessoa.

## Permissions Engine

A autorização é resolvida pelo `can()` no domínio puro. RBAC usa `Role` + `RoleBinding`; ABAC considera principal, equipa, owner, recurso, scope e expiração. `AccessGrant` acrescenta grants directos, de equipa e por email externo. `ClassificationLabel` pode bloquear exposição externa, IA ou exportação e activar watermark.

`POST /v1/permissions/evaluate` avalia um recurso para o principal autenticado e devolve todas as acções, decisões, exposição e `fieldAccess`. A resposta é a fonte única de verdade da UI.

`POST /v1/permissions/view-as` permite a um principal com `view_as` simular outro utilizador sem mudar a sessão. O simulador aplica as mesmas regras de RBAC, ABAC, grants, scopes e classification.

`GET /v1/permissions/exposure` devolve o inventário de recursos com grants externos activos, número de destinatários e presença de field masking.

`POST /v1/permissions/roles` cria uma Role personalizada.
`POST /v1/permissions/role-bindings` atribui uma Role a um principal dentro de um scope.
`POST /v1/permissions/grants` cria um AccessGrant com nível, destinatário, máscara e expiração.

Operações administrativas exigem `manage` sobre o recurso organizacional. Nenhuma rota administrativa ignora o permission engine.

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
