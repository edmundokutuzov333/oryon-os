# DECISIONS.md

## ADR-0001: Identidade e sessões da Fase 3

- Estado: aceite para implementação da Fase 3
- Data: 2026-09-16

### Contexto

A V1 mantém identidade empresarial em PostgreSQL e sessões revogáveis em Redis, com Bearer JWT curto para a API.

### Decisão

1. `User` é a identidade empresarial canónica.
2. `Organization`, `Workspace`, `Team` e `TeamMember` definem o contexto empresarial.
3. Sessões são tokens opacos revogáveis; a persistência usa hash SHA-256 e TTL no Redis.
4. JWT HS256 curto é o credential de acesso da API e não contém permissões.
5. Magic link é o mecanismo inicial de autenticação; debug token só existe em modo de desenvolvimento.

### Consequências

A API mantém o contrato Bearer e a web usa cookie HttpOnly sem duplicar a identidade.

## ADR-0002: Motor de permissões da Fase 4

- Estado: aceite para implementação da Fase 4
- Data: 2026-09-16

### Decisão

1. `can()` vive no domínio puro.
2. `packages/db` carrega snapshots tenant-aware.
3. RBAC, ABAC, grants e classification convergem no mesmo engine.
4. A UI recebe decisões explícitas do backend.
5. “Ver como” é simulação somente leitura.

## ADR-0003: WorkObject Engine universal da Fase 5

- Estado: aceite para implementação da Fase 5
- Data: 2026-09-16

### Decisão

1. Todo o trabalho vive em `WorkObject`.
2. `ObjectTypeDef` define schema, estados, transições e defaults.
3. O domínio valida invariantes sem I/O.
4. `packages/db` mantém acesso tenant-aware e transacções.
5. `ObjectPlacement` suporta multi-homing.

## ADR-0004: Work Graph da Fase 6

- Estado: aceite para implementação da Fase 6
- Data: 2026-09-16

### Decisão

1. `Edge` é a fonte única das relações entre WorkObjects.
2. Relações cíclicas proibidas são validadas antes da persistência.
3. Traversal tem profundidade, direcção e filtragem por permissão.
4. Timeline e Customer 360 são composições do mesmo Graph.

## ADR-0005: Design System e App Shell da Fase 7

- Estado: aceite para implementação da Fase 7
- Data: 2026-09-16

### Decisão

1. `packages/ui` é a fonte única dos primitives e tokens.
2. `AppShell`, chrome e `CommandPalette` são partilhados.
3. A UI usa papéis semânticos.
4. `⌘K` é comando/navegação; retrieval híbrido permanece Fase 12.

## ADR-0006: Work Experience da Fase 8

- Estado: aceite para implementação da Fase 8
- Data: 2026-09-16

### Decisão

1. List, Board, Calendar e Timeline são vistas do mesmo `WorkObject`.
2. Comentários, anexos e histórico usam os modelos canónicos.
3. A pesquisa local desta fase não cria um segundo motor de pesquisa.

## ADR-0007: Docs + Files da Fase 9

- Estado: aceite para implementação da Fase 9
- Data: 2026-09-16

### Decisão

1. `Page` é o documento universal.
2. TipTap + Yjs persistem conteúdo colaborativo.
3. `PageVersion` guarda snapshots imutáveis.
4. `FileAsset` + `Attachment` são a camada canónica de ficheiros.
5. S3/MinIO usa upload directo com URLs pré-assinadas.

## ADR-0008: Comunicação da Fase 10

- Estado: aceite para implementação da Fase 10
- Data: 2026-09-16

### Decisão

1. `Channel` é o contentor universal de comunicação.
2. `ChannelMember` guarda membership e read state.
3. Threads são mensagens com `parentId`.
4. `Reaction` e `Notification` são persistentes.
5. Socket.IO acelera eventos, enquanto REST + catch-up continuam fonte de verdade.
6. Conversão de mensagem em trabalho usa `WorkObject` + `DERIVED_FROM`.

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