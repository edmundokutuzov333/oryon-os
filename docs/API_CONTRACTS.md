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

O WorkObject é o tipo universal de trabalho. O `ObjectTypeDef` define nome, prefixo, schema de custom fields, estados, transições e defaults. Tipos nativos e tipos criados pelo utilizador usam a mesma entidade `WorkObject`.

`GET /v1/object-types` devolve os tipos disponíveis para a organização.
`POST /v1/object-types` cria um novo tipo de trabalho e requer `manage` sobre o âmbito organizacional.

`GET /v1/work-objects` lista objectos respeitando workspace, type, status e owner. O resultado é filtrado por permissão antes de ser exposto.
`POST /v1/work-objects` cria um objecto universal. O `typeKey` resolve o `ObjectTypeDef`; o status omitido usa `statusModel.initial`; `customFields` é validado contra o schema do tipo.
`GET /v1/work-objects/{id}` obtém um objecto visível.
`PATCH /v1/work-objects/{id}` actualiza campos universais ou custom fields. Mudanças de status têm de respeitar as transições declaradas.
`DELETE /v1/work-objects/{id}` executa soft delete.

`POST /v1/work-objects/{id}/status` aplica uma transição de status e persiste `StatusTransition` com actor, estado anterior, novo estado e comentário.
`POST /v1/work-objects/{id}/assignments` atribui o trabalho a `User` ou `Agent` com papel e allocation.
`DELETE /v1/work-objects/{id}/assignments/{assignmentId}` remove uma atribuição.
`POST /v1/work-objects/{id}/placements` cria ou actualiza a localização do objecto em um container e suporta múltiplas localizações, com uma primary por objecto.

Campos universais incluem prioridade, owner, parent/child, datas, progresso, classificação, severity, probability, referências externas e valores monetários. `humanId` é estável e derivado do prefixo do `ObjectTypeDef` e do ID do objecto.

Toda resposta de WorkObject inclui `permissions`. Recursos invisíveis são tratados como `NOT_FOUND`. Toda mutação escreve `DomainEvent` na mesma transacção.

## Work Graph

`POST /v1/edges` cria uma relação entre dois WorkObjects existentes. O body usa `{ "from": { "type": "work_object", "id": "..." }, "to": { "type": "work_object", "id": "..." }, "relation": "RELATES_TO", "lagDays": 0, "metadata": {} }`. A criação exige `update` no objecto de origem e leitura nos dois endpoints. Relações suportadas são os valores de `EdgeRelation` do schema canónico.

`GET /v1/graph/traverse` recebe `rootType`, `rootId`, `depth` máximo 10, `direction` (`out`, `in`, `both`), `relation` (`*` ou uma relação) e `includeTimeline`. O retorno contém `root`, `nodes`, `edges`, `timeline` e metadados de truncamento. O root e todos os WorkObjects retornados são filtrados com o mesmo `can()` da Fase 4; nodes e edges invisíveis são removidos sem revelar a sua existência.

Ciclos em `BLOCKS` ou `PARENT_OF` devolvem `CYCLE_DETECTED`. Self-edge devolve `VALIDATION_FAILED`. A relação `CONVERTED_TO` representa conversão por ligação entre objectos existentes, sem copiar o conteúdo do objecto de origem.

A timeline é derivada de `DomainEvent` e `StatusTransition` dos nodes visíveis. Customer 360 é uma composição de traversal bidireccional com maior profundidade e a mesma filtragem por permissão, não uma segunda fonte de dados.

## Work Experience

A Fase 8 usa o mesmo `WorkObject` para as vistas `List`, `Board`, `Calendar` e `Timeline`.

`GET /v1/work-objects/{id}` devolve o detalhe canónico do objecto com `permissions`.
`GET /v1/work-objects/{id}/comments` devolve comentários visíveis ordenados por criação.
`POST /v1/work-objects/{id}/comments` cria um comentário e requer `comment`; o body usa `bodyText`, `parentId`, `mentions` e `isInternal`.
`GET /v1/work-objects/{id}/attachments` devolve anexos existentes associados ao WorkObject.
`POST /v1/work-objects/{id}/attachments` associa um `FileAsset` existente ao objecto e requer `update`.
`GET /v1/work-objects/{id}/history` devolve a linha temporal derivada de `DomainEvent` e `StatusTransition`.

A UI pode filtrar localmente o conjunto autorizado de WorkObjects por texto, tipo e estado; não é introduzido nesta fase um segundo motor de pesquisa, reservado para Search + AI.

Comentários, anexos e alterações de estado obedecem às mesmas permissões e tenancy do WorkObject. Anexos físicos e upload para S3 permanecem responsabilidade da Fase 9; a Fase 8 apenas associa `FileAsset` já existente.

## Docs + Files

A Fase 9 usa `Page` como entidade documental universal. `Page.contentYjs` é o estado persistido da colaboração, `contentJson` é a representação estruturada para rendering/exportação e `contentText` é a representação textual para pesquisa. `PageVersion` guarda snapshots imutáveis de conteúdo.

`GET /v1/pages` lista páginas visíveis na organização e aceita `workspaceId` e `limit`.
`POST /v1/pages` cria uma página e usa o mesmo `Page` para DOC, WIKI, CANVAS, DATABASE_VIEW, BRIEF ou NOTE.
`GET /v1/pages/{id}` devolve a página com `contentYjsBase64` e `permissions`.
`PATCH /v1/pages/{id}` actualiza metadados ou conteúdo. Alterações de conteúdo criam automaticamente uma nova `PageVersion` na mesma transacção.
`GET /v1/pages/{id}/versions` devolve os snapshots versionados mais recentes.
`POST /v1/pages/{id}/publish` publica ou retira a publicação usando `publishedSlug` e `publishedAt` e requer `manage`.
`GET /v1/pages/{id}/attachments` lista `FileAsset` associados à página.
`POST /v1/pages/{id}/attachments` associa um `FileAsset` existente à página e requer `update`.

`POST /v1/files/upload-intent` cria uma intenção de upload com `fileId`, `storageKey` e URL PUT pré-assinada para S3/MinIO. O browser envia o conteúdo directamente para storage.
`POST /v1/files/complete` valida `fileId`, `storageKey`, tamanho e MIME do objecto no storage antes de criar `FileAsset`.
`GET /v1/files/{id}` devolve metadados e uma URL GET pré-assinada quando `export` é permitido.

`GET /v1/search/text` pesquisa `Page.title`, `Page.contentText`, `FileAsset.name` e `FileAsset.ocrText` dentro da organização, filtrando novamente cada resultado com o permission engine. Typesense e retrieval híbrido continuam reservados para Search + AI.

Classificação é persistida em `Page.classification` e `FileAsset.classification`; downloads de ficheiros passam por `can(..., "export")`, permitindo que `ClassificationLabel.blocksDownload` impeça exposição.

## Communication

A Fase 10 usa `Channel`, `ChannelMember`, `Message`, `Reaction` e `Notification` como entidades canónicas. DMs 1:1 e grupos usam o mesmo `Channel` com `kind` `DM` ou `GROUP_DM`; não existe um modelo separado de mensagens privadas.

`GET /v1/channels` lista apenas os canais onde o principal autenticado é membro e devolve `memberCount`, `unreadCount` e permissões explícitas.
`POST /v1/channels` cria um canal organizacional e adiciona automaticamente o actor como `OWNER`; requer `create` no recurso `channel` de colecção.
`POST /v1/channels/direct` cria ou recupera uma DM/grupo directo para os utilizadores indicados; requer `create` no recurso de colecção `channel`.
`GET /v1/people` devolve utilizadores activos pesquisáveis da organização para construção de DMs e menções.

`GET /v1/channels/{channelId}/messages` devolve mensagens paginadas por cursor e pode receber `parentId` para uma thread.
`POST /v1/channels/{channelId}/messages` cria uma mensagem, aceita `bodyText`, `parentId`, `mentions`, `kind` e `mediaFileId`, requer `comment` sobre o canal e emite `communication.message.created`.
`PATCH /v1/messages/{id}` edita a mensagem pelo respectivo autor e persiste `editedAt`.
`DELETE /v1/messages/{id}` executa soft delete da mensagem pelo respectivo autor.

`POST /v1/messages/{id}/reactions` adiciona uma reacção por utilizador e emoji.
`DELETE /v1/messages/{id}/reactions/{emoji}` remove a reacção do utilizador autenticado.

Threads são mensagens filhas com `parentId`. A resposta principal mantém `replyCount` para acesso rápido à thread sem criar uma segunda tabela de threads.

Menções são guardadas em `Message.mentions` como IDs de utilizador. O backend cria `Notification` para membros efectivamente mencionados e a UI resolve os nomes através de `/v1/people`.

`GET /v1/notifications` lista a inbox do utilizador; `?unreadOnly=true` limita a notificações não lidas.
`POST /v1/notifications/{id}/read` marca uma notificação como lida.
`POST /v1/notifications/read-all` marca todas as notificações do principal como lidas.
`POST /v1/channels/{channelId}/read` persiste `ChannelMember.lastReadAt` e faz o `unreadCount` do canal voltar a zero para esse principal.

`GET /v1/channels/{channelId}/catch-up` aceita `since` e `limit` e devolve todas as mensagens posteriores ao timestamp do cliente para recuperação após perda de ligação.

`POST /v1/messages/{id}/convert` cria um `WorkObject` universal a partir da mensagem e uma relação Graph `DERIVED_FROM` entre `message` e `work_object`, sem copiar o sistema de trabalho para uma entidade específica de comunicação. A criação exige `create` sobre a colecção de WorkObjects.

### Realtime

A aplicação publica eventos através de Socket.IO em `/socket.io`. O handshake valida a sessão existente e `orgId`; o socket entra em rooms `org:{orgId}`, `user:{userId}` e nos canais dos quais o principal é membro.

Eventos suportados pelo contrato realtime:

`message.created`
`message.updated`
`message.deleted`
`reaction.updated`
`notification.created`
`channel.updated`

A UI trata o realtime como aceleração de entrega, não como fonte única de verdade. Depois de reconectar, o cliente chama `catch-up` para recuperar mensagens que possam ter sido perdidas entre a última mensagem conhecida e a nova ligação.

A sincronização realtime não altera a segurança do recurso: as operações continuam a passar pelo mesmo contexto de organização, membership e `can()` usados pela API REST.

## IA e Agentes

`POST /v1/agents/{id}/runs`, `GET /v1/agent-runs/{id}`, `POST /v1/agent-runs/{id}/rollback` e `POST /v1/ai/search`.

Acções sensíveis podem exigir `CHECKPOINT_REQUIRED`. Runs registam passos, tools, recursos lidos/escritos, consumo e rollback.

## Eventos

Todos os consumidores recebem envelope versionado com `eventId`, `name`, `version`, `orgId`, `occurredAt`, `actor`, `subject`, `payload`, `correlationId` e `causationId`.

## Regras do agente de execução

Entrada e saída pública passam pelo mesmo schema Zod. Nunca expor existência de recurso invisível. Nenhuma resposta de objecto sem `permissions`. Nenhuma resposta de IA sem fontes resolvíveis. Nenhuma mutação sem outbox. Dinheiro sempre como decimal em string + moeda.