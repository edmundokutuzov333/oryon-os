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
