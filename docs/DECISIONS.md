# DECISIONS.md

## ADR-0001: Identidade e sessões da Fase 3

- Estado: aceite para implementação da Fase 3
- Data: 2026-09-16

### Contexto

O schema canónico V1 mantém `Organization`, `Workspace`, `User`, `Team`, `TeamMember` e `Agent` como entidades de identidade empresarial, mas não contém uma tabela de sessão. A API normativa exige Bearer JWT e a infraestrutura da Fase 1 já fornece Redis.

### Decisão

A OryonOS usa uma separação explícita entre identidade, sessão e autorização:

1. `User` é a identidade empresarial canónica e permanece persistida em PostgreSQL.
2. `Organization`, `Workspace`, `Team` e `TeamMember` definem o contexto empresarial e permanecem protegidos por RLS.
3. Sessões de aplicação são tokens opacos, aleatórios e revogáveis, armazenados no Redis com TTL. O servidor nunca guarda o token em claro fora do estado transitório da requisição; a chave persistida é o hash SHA-256 do token.
4. JWT HS256 de curta duração é o credential de acesso da API, conforme o contrato público. O JWT contém apenas claims de identidade/contexto e o identificador da sessão, nunca uma cópia das permissões.
5. A sessão pode ser convertida num Bearer JWT e renovada sem alterar a identidade canónica.
6. A autenticação inicial da V1 usa magic link por email. Quando o provider de email não está configurado, o modo de desenvolvimento pode devolver um token de verificação para facilitar desenvolvimento local; isto é proibido fora de `ORYON_AUTH_DEV_MODE`.
7. `User.externalId` permanece o ponto de ligação para identidade externa/SSO futura, sem criar uma segunda identidade de utilizador.
8. Autorização detalhada continua a ser responsabilidade da Fase 4; esta fase apenas estabelece autenticação, contexto e sessão seguros para alimentar `can()` depois.

### Consequências

Esta decisão evita introduzir um segundo modelo de identidade, mantém o schema de negócio focado, usa a infraestrutura já existente e permite revogação imediata de sessões. A API pode continuar a obedecer ao contrato Bearer JWT, enquanto a aplicação web recebe uma sessão HttpOnly sem expor credenciais persistentes ao JavaScript.

## ADR-0002: Motor de permissões da Fase 4

- Estado: aceite para implementação da Fase 4
- Data: 2026-09-16

### Contexto

A V1 exige um único motor de autorização para UI, API, agentes e integrações. O schema canónico já fornece `Role`, `RoleBinding`, `AccessGrant` e `ClassificationLabel`, além de scopes organizacionais, de workspace, equipa, projecto e objecto.

### Decisão

1. `can()` vive em `packages/core` e é puro, determinístico e sem I/O.
2. `packages/db` carrega o snapshot tenant-aware de principal, roles, grants e classification sob RLS.
3. A API combina o snapshot com o recurso e chama o mesmo `can()` que os testes de domínio cobrem.
4. RBAC é representado por permissões de Role e `RoleBinding`; ABAC combina identidade, equipas, owner, recurso, scope e expiração.
5. `AccessGrant.externalEmail` representa exposição externa explícita. `fieldMask` representa campos que devem ser mascarados no consumidor.
6. `ClassificationLabel` tem precedência sobre exposição externa, IA e exportação quando os respectivos bloqueios estão activos.
7. A UI nunca deduz permissões a partir do nome da role. Recebe `PermissionEvaluation`, incluindo o conjunto explícito de acções, decisões e `fieldAccess`.
8. “Ver como” é uma simulação somente leitura que resolve exactamente o mesmo engine para outro `User`; não altera a sessão real.
9. Alterações de role, binding e grant são mutações administrativas protegidas por `manage` sobre o âmbito organizacional e emitem DomainEvent na mesma transacção.
10. Relatórios de exposição mostram grants externos activos e existência de masking, sem revelar recursos invisíveis a quem não tem `manage`.

### Consequências

A autorização deixa de ser lógica duplicada entre frontend, rotas e integrações. O backend torna-se a fonte única da verdade, a UI pode renderizar estados exactos e futuras fases, incluindo Work Objects, Graph, AI e Agents, podem reutilizar o mesmo engine sem criar sistemas de permissão paralelos.

## ADR-0003: WorkObject Engine universal da Fase 5

- Estado: aceite para implementação da Fase 5
- Data: 2026-09-16

### Contexto

A V1 define `WorkObject` como o motor universal de trabalho. O schema canónico já fornece `WorkObject`, `ObjectTypeDef`, `ObjectPlacement`, `Assignment` e `StatusTransition`. Criar tabelas de tipo específico nesta fase recriaria a arquitectura que o modelo universal procura evitar.

### Decisão

1. Todo o trabalho continua em `WorkObject`; tipos nativos e tipos criados pelo utilizador usam a mesma tabela.
2. `ObjectTypeDef` define schema dos custom fields, estados, transições, prefixo de human ID e metadados do tipo.
3. `packages/core` valida invariantes de domínio sem I/O: status model, transitions, custom fields, datas, progresso, dinheiro, parent e human ID.
4. `packages/db` é responsável pelo acesso tenant-aware e por transacções. Owner, parent, User/Agent assignment e ObjectPlacement são validados dentro da transacção.
5. Mudanças de estado persistem `StatusTransition` e todas as mutações escrevem `DomainEvent` na mesma transacção.
6. `ObjectPlacement` permite multi-homing; quando a criação nasce num workspace, o workspace é o contexto primário do objecto.
7. A API devolve sempre `permissions` em `WorkObjectResponse` e trata recursos invisíveis como `NOT_FOUND`.
8. A UI apenas consome contratos Zod e renderiza o contexto devolvido pelo backend. O editor de custom fields é derivado de `ObjectTypeDef`, nunca de regras duplicadas no cliente.
9. Board, List, Calendar, Timeline, comentários e anexos permanecem responsabilidades da Fase 8; a Fase 5 fornece o motor e as operações primitivas sobre as quais essas vistas serão construídas.

### Consequências

O WorkObject Engine pode alimentar CRM, Support, Product/Engineering e tipos empresariais personalizados sem criar um segundo modelo de trabalho. A mesma identidade de objecto passa pelas futuras fases de Graph, Docs, Comunicação, IA e Agents.

## ADR-0004: Work Graph da Fase 6

- Estado: aceite para implementação da Fase 6
- Data: 2026-09-16

### Contexto

O schema canónico define `Edge` como a representação única das relações entre tipos de trabalho e proíbe FKs ad-hoc entre tipos de trabalho. O contrato público fixa `POST /v1/edges` e `GET /v1/graph/traverse`, com ciclos protegidos em `BLOCKS` e `PARENT_OF` e traversal filtrado por permissão.

### Decisão

1. `Edge` é a única fonte de verdade para relações entre WorkObjects. Não são criadas tabelas de relações por domínio.
2. `POST /v1/edges` aceita relações tipadas entre WorkObjects existentes. A criação exige leitura nos dois endpoints e `update` no objecto de origem.
3. `BLOCKS` e `PARENT_OF` são relações protegidas contra ciclos. A verificação percorre o grafo existente a partir do destino antes de persistir a nova aresta.
4. Self-edge e duplicado activo são rejeitados com erro determinístico. `CONVERTED_TO` representa conversão como relação entre objectos existentes, sem copiar o conteúdo de origem.
5. `GET /v1/graph/traverse` usa profundidade limitada, direcção e filtro de relação; a traversal pára em nodes já visitados para evitar loops durante leitura.
6. A autorização acontece antes da resposta: o root e cada WorkObject candidato passam pelo mesmo `can()` da Fase 4. Edges que contenham um endpoint invisível são removidos da resposta.
7. A timeline do grafo é derivada dos `DomainEvent` e `StatusTransition` dos nodes visíveis, sem criar uma segunda tabela de histórico.
8. Customer 360 é uma composição da traversal bidireccional sobre o mesmo Graph, com maior profundidade, sem replicar dados do cliente noutra estrutura.
9. A UI deve usar a mesma primitive de traversal para rede, navegação contextual, timeline e Customer 360.

### Consequências

O Work Graph passa a ser a camada de relação transversal da V1. As futuras fases podem ligar comunicação, documentos, reuniões e artefactos ao mesmo grafo quando esses nodes forem suportados, sem mudar o modelo de relações.

## ADR-0005: Design System e App Shell da Fase 7

- Estado: aceite para implementação da Fase 7
- Data: 2026-09-16

### Contexto

A experiência da OryonOS deve ter uma única linguagem visual, com tokens semânticos, chrome flutuante, hierarquia de raios, acento lima parcimonioso e superfícies em camadas. O frontend precisa de um shell partilhado antes de as vistas de trabalho evoluírem para experiências compostas.

### Decisão

1. `packages/ui` é a fonte única dos tokens, primitives, overlays e chrome da aplicação.
2. `AppShell`, `FloatingTopBar`, `SegmentedNav`, `AppLauncher`, `IconButtonRail`, `PageHeader` e `CommandPalette` são primitives de produto partilhadas, não implementações específicas de `/os`.
3. As cores da interface são consumidas por papéis semânticos; a escala de cor directa fica confinada ao token layer.
4. `⌘K`/`Ctrl+K` é o ponto de entrada transversal para comandos e navegação. Retrieval híbrido de conteúdo continua responsabilidade da Fase 12.
5. `/os` adopta o AppShell como chrome único e as páginas não criam shells paralelos.
6. A biblioteca UI não conhece `core`, `contracts` ou `db`; a aplicação web liga identidade e dados aos primitives através de contratos.

### Consequências

Todas as experiências posteriores podem reutilizar a mesma linguagem visual e de interação. O Work Experience não precisa de inventar novos controlos para List, Board, Calendar ou Detail, e o futuro Search + AI pode ligar-se à superfície `CommandPalette` sem alterar a shell.

## ADR-0006: Work Experience da Fase 8

- Estado: aceite para implementação da Fase 8
- Data: 2026-09-16

### Contexto

O `WorkObject` já fornece os dados universais e as operações de base. A Fase 8 precisa de transformar esse motor numa experiência de trabalho contínua sem criar modelos paralelos para cada vista.

### Decisão

1. `List`, `Board`, `Calendar` e `Timeline` são composições da mesma colecção autorizada de `WorkObject`; nenhuma vista mantém uma cópia de estado persistido.
2. Criação, edição e mudança de estado usam os endpoints do WorkObject Engine e continuam protegidos por `can()` e RLS.
3. `Comment` é usado para colaboração contextual; comentários têm endpoint próprio, parent/replies e `DomainEvent` na mesma transacção.
4. `Attachment` liga `FileAsset` existente ao WorkObject. Upload físico e storage S3 continuam na Fase 9.
5. O histórico da experiência é derivado de `DomainEvent` e `StatusTransition`, sem criar uma tabela de histórico paralela.
6. A pesquisa desta fase é filtragem local sobre o conjunto já autorizado; o índice/retrieval transversal permanece na Fase 12.
7. A UI recebe permissões explícitas do backend e esconde acções não autorizadas; ela não deduz capacidade a partir de roles.

### Consequências

O mesmo WorkObject pode ser visto, alterado, atribuído e acompanhado em diferentes representações sem perder identidade ou histórico. As fases seguintes podem acrescentar conteúdo, comunicação, documentos e IA ao mesmo objecto sem migração para outro modelo.

## ADR-0007: Docs + Files da Fase 9

- Estado: aceite para implementação da Fase 9
- Data: 2026-09-16

### Contexto

O schema canónico já fornece `Page`, `PageVersion`, `FileAsset` e `Attachment`. A plataforma precisa de uma experiência documental persistente, versionada e compatível com S3, sem criar um segundo sistema de ficheiros ou um editor proprietário.

### Decisão

1. `Page` é a entidade documental universal. `contentJson` representa a estrutura TipTap, `contentText` alimenta pesquisa textual e `contentYjs` guarda o estado colaborativo binário.
2. TipTap é o editor de superfície e Yjs é o modelo de colaboração persistido. A sincronização realtime por provider dedicado fica para a infraestrutura de colaboração posterior sem mudar o schema.
3. Cada alteração de conteúdo cria uma nova `PageVersion` dentro da mesma transacção que actualiza `Page`. O snapshot é imutável e devolvido como base64 pela API.
4. `FileAsset` é a entidade universal de ficheiro. `Attachment` liga-o a páginas e, como já definido na Fase 8, a WorkObjects.
5. Upload usa uma intenção autenticada, seguida de PUT directo do browser para S3/MinIO através de URL pré-assinada. A API valida tamanho e MIME com `HeadObject` antes de materializar o `FileAsset`.
6. O storage é encapsulado em `@oryon/storage`; `db` continua dono exclusivo do Prisma e a API não manipula clientes Prisma directamente.
7. Publicação é controlada por `publishedSlug`, `publishedAt` e `indexable` e requer `manage` sobre a página. O estado publicado continua sob classificação e autorização.
8. Downloads são resolvidos por `can(..., "export")`, permitindo `ClassificationLabel.blocksDownload` bloquear a saída do object storage.
9. Pesquisa textual da Fase 9 usa os campos `title`, `contentText`, `name` e `ocrText` dentro do tenant, filtrando resultados invisíveis. Typesense e retrieval híbrido ficam reservados para a Fase 12.
10. A UI recebe `permissions` explícitas para páginas e ficheiros e nunca infere permissões através de roles ou estado visual.

### Consequências

Docs, Files e Work permanecem partes do mesmo sistema de identidade, tenancy, permissões e auditoria. A Fase 9 estabelece a base de conteúdo e storage sobre a qual as fases de Comunicação, Meetings, Search + AI e Agents podem actuar sem duplicar documentos ou ficheiros.

## ADR-0008: Comunicação da Fase 10

- Estado: aceite para implementação da Fase 10
- Data: 2026-09-16

### Contexto

A Fase 10 precisa de transformar as entidades de comunicação já presentes no schema canónico em uma experiência empresarial completa, sem criar um modelo paralelo para DMs, threads ou notificações. O schema fornece `Channel`, `ChannelMember`, `Message`, `Reaction` e `Notification`, e o Work Graph fornece `DERIVED_FROM` para ligar uma mensagem a trabalho real.

### Decisão

1. `Channel` é o contentor universal de comunicação. `TEXT`, `FORUM`, `VOICE`, `STAGE`, `ANNOUNCEMENT`, `DM` e `GROUP_DM` são variações do mesmo modelo.
2. `ChannelMember` é a fonte de membership e de read state. `lastReadAt` é persistido por utilizador e canal e alimenta `unreadCount`.
3. `Message.parentId` é a representação única de threads. `replyCount` é mantido no pai para acesso rápido, sem criar uma tabela `Thread` paralela.
4. `Reaction` representa reacções por utilizador e emoji. A resposta da API agrega as reacções e indica se o principal actual reagiu.
5. `Message.mentions` guarda IDs de utilizador. A API só materializa `Notification` para membros efectivamente presentes no canal; `/v1/people` fornece pesquisa de pessoas para a UI resolver menções e criar DMs.
6. A criação e envio de mensagens requerem `comment` sobre o recurso `channel`, usando o mesmo `can()` da Fase 4. A membership é hidratada no `PermissionSubject.channelIds` e é consumida pelo domínio puro, sem autorização duplicada.
7. `Notification` é o modelo de Inbox V1. Ler uma notificação ou todas as notificações é uma mutação tenant-aware associada ao principal autenticado.
8. Realtime usa Socket.IO 4.8.x sobre o mesmo servidor Fastify. O handshake autentica a sessão existente e o `orgId`; sockets entram em rooms por organização, utilizador e canal.
9. REST continua a ser a fonte de verdade. Socket.IO acelera entrega de eventos; depois de reconectar, a UI usa `catch-up` por timestamp para recuperar mensagens potencialmente perdidas.
10. Os eventos realtime são `message.created`, `message.updated`, `message.deleted`, `reaction.updated`, `notification.created` e `channel.updated`.
11. Conversão de mensagem em trabalho usa o `WorkObject` universal e cria um `Edge` `DERIVED_FROM` entre `message` e `work_object` na mesma transacção, sem copiar a mensagem para um modelo de task.
12. DMs e canais continuam sujeitos a tenancy, RLS, membership e permission engine. Nenhum socket pode entrar num canal sem uma membership válida.

### Consequências

Comunicação passa a ser uma camada transversal do mesmo Work Graph. Mensagens podem gerar trabalho sem quebrar a identidade do objecto, notificações têm estado persistido, threads são apenas mensagens relacionadas e a UI pode funcionar em tempo real com recuperação segura após desconexão.

## ADR-0009: Meetings da Fase 11

- Estado: aceite para implementação da Fase 11
- Data: 2026-09-16

### Contexto

A Fase 11 precisa de transformar o modelo canónico `Meeting` numa experiência empresarial de calendário e reunião, ligando agenda, participantes, presença em chamada, notas, transcrição e artefactos ao mesmo objecto. O schema já fornece `Meeting`, `MeetingParticipant`, `MeetingArtifact` e `Room`, e o Work Graph já fornece as relações `DECIDED_IN` e `RESULTED_IN`.

### Decisão

1. `Meeting` é a entidade universal de evento de calendário da V1. Não será criada uma tabela paralela `CalendarEvent`.
2. `MeetingParticipant` é a fonte de RSVP, presença, papel, entrada e saída da reunião. Participantes internos usam `userId`; convidados externos podem usar `email` sem criar uma segunda identidade.
3. Criação, alteração de horário, cancelamento e mudança de estado são mutações tenant-aware protegidas por `can()` e escritas dentro de transacções que emitem `DomainEvent` através do outbox.
4. Conflitos de `Room` são impedidos por verificação transaccional de sobreposição para reuniões `SCHEDULED` ou `LIVE`.
5. LiveKit é o transporte de media e presença da reunião. O backend gera um token efémero por participação autenticada. O browser nunca recebe `LIVEKIT_API_SECRET`.
6. O REST continua a ser a fonte de verdade do estado da reunião, participantes e artefactos. A ligação LiveKit é uma camada de sessão; reconexão de media não altera a autoridade do modelo PostgreSQL.
7. `MeetingArtifact` é a entidade universal para recording, transcript, notes, summary, decisions, tasks, document, whiteboard, chat log e AI report. Não serão criadas tabelas específicas para cada tipo.
8. Notas e transcrição ficam persistidas como artefactos da reunião. A Fase 11 não inventa um segundo editor ou motor de pesquisa para conteúdo, deixando retrieval transversal para a Fase 12.
9. Artefactos de `DECISIONS`, `TASKS` e resultados de reunião podem ser convertidos em `WorkObject`. A conversão cria a relação Graph correspondente sem copiar o sistema de trabalho.
10. `meetingIds` passa a fazer parte do `PermissionSubject`, permitindo que a membership seja considerada pelo mesmo `can()` usado nas restantes áreas.
11. A UI mostra agenda, detalhe, participantes, RSVP, sala, estado da reunião e área de chamada em uma só experiência, com acções desabilitadas pela decisão de permissão devolvida pela API.
12. Os contratos públicos de Meetings são adicionados como extensão formal do `API_CONTRACTS.md`, mantendo os invariantes globais de autenticação, `X-Oryon-Org`, `Idempotency-Key`, envelopes e datas ISO com offset.

### Consequências

Meetings torna-se uma camada de serviço integrada com Identity, Permissions, LiveKit, Docs/Files e Work Graph. Uma reunião pode começar como evento, adquirir participantes e artefactos e terminar produzindo trabalho real sem introduzir um segundo modelo de dados.
