# CLAUDE.md — Manual de Arquitectura OryonOS

Documento normativo. Precedência sobre qualquer instrução conversacional.
Alterações só por ADR aprovado em `/docs/DECISIONS.md`.

---

## 1. STACK — FIXADA, VERSÕES MÍNIMAS

### Runtime e tooling

| Camada | Escolha | Versão | Razão |
|---|---|---|---|
| Runtime | Node.js | `24.x LTS` | LTS activo, `node:sqlite`, permission model estável |
| Package manager | pnpm | `10.x` | workspaces, store partilhado, instala 3× mais rápido que npm em monorepo |
| Monorepo | Turborepo | `2.5+` | cache remoto, task graph, afectados por diff |
| Linguagem | TypeScript | `5.9+` | `strict: true`, `noUncheckedIndexedAccess: true`, `erasableSyntaxOnly` |
| Lint/Format | Biome | `2.x` | substitui ESLint + Prettier, ~25× mais rápido, config única |
| Git hooks | Lefthook | `1.x` | mais rápido que husky, config declarativa |

> Bun não entra como runtime de produção. Entra só como executor de scripts locais se medires ganho real.

### Frontend

| Camada | Escolha | Versão |
|---|---|---|
| Framework | Next.js (App Router) | `16.x` |
| UI runtime | React | `19.2+` |
| Styling | Tailwind CSS | `4.x` (CSS-first, `@theme`) |
| Primitivas headless | Radix UI Primitives | `1.x` |
| Motion | Motion | `12.x` |
| Estado cliente | Zustand | `5.x` |
| Estado servidor | TanStack Query | `5.x` |
| Tabelas | TanStack Table | `8.x` |
| Virtualização | TanStack Virtual | `3.x` |
| Drag & drop | dnd-kit | `6.x` |
| Formulários | React Hook Form | `7.x` |
| Validação | Zod | `4.x` |
| Ícones | Lucide React | `0.5x` |
| Datas | Temporal polyfill + date-fns | `4.x` |
| Editor de blocos | TipTap | `3.x` sobre ProseMirror |
| CRDT | Yjs + y-prosemirror + y-indexeddb | `13.x` |
| Canvas infinito | tldraw | `3.x` |
| Gráficos | Visx (baixo nível) + Recharts (rápido) | `3.x` / `2.x` |
| Gantt | implementação própria sobre Visx | — |
| i18n | next-intl | `3.x` |
| Storybook | Storybook | `9.x` |

### Backend

| Camada | Escolha | Versão |
|---|---|---|
| API interna | tRPC | `11.x` |
| API pública | Fastify + OpenAPI 3.1 | `5.x` |
| ORM | Prisma | `6.x` (driver adapters, TypedSQL) |
| Base de dados | PostgreSQL | `17.x` |
| Extensões PG | `pgvector`, `pg_trgm`, `pgcrypto`, `uuid-ossp`, `pg_partman` | — |
| Cache / locks | Redis | `7.4+` |
| Filas | BullMQ | `5.x` |
| Event bus | NATS JetStream | `2.11+` |
| Pesquisa | Typesense | `28.x` |
| Object storage | S3-compatível (R2 / MinIO) | — |
| Realtime | Socket.IO sobre uWebSockets | `4.x` |
| WebRTC SFU | LiveKit | `1.9+` |
| Telefonia | LiveKit SIP + provedor SIP local | — |
| Workflow engine | Temporal | `1.28+` |
| Auth enterprise | WorkOS (SSO/SCIM/Directory) | — |
| Auth sessão | Auth.js | `5.x` |
| Email transaccional | Resend + React Email | — |
| PDF | `@react-pdf/renderer` + Gotenberg | — |
| IA | Vercel AI SDK | `5.x` |
| Observabilidade | OpenTelemetry + Grafana LGTM | — |
| Erros | Sentry | `9.x` |
| Feature flags | OpenFeature + Flagsmith self-host | — |

### Testes

| Tipo | Ferramenta |
|---|---|
| Unitário | Vitest `3.x` |
| Componente | Vitest + Testing Library |
| Integração API | Vitest + Testcontainers |
| E2E | Playwright `1.5x` |
| Visual regression | Playwright screenshots + Chromatic |
| Carga | k6 |
| Contrato | Pact |

### Infraestrutura

Docker multi-stage → Kubernetes (Helm). Terraform para cloud. GitHub Actions para CI.
Ambientes: `local` (Docker Compose), `preview` (por PR), `staging`, `production`.
Multi-região com read replicas por residência de dados.

### Proibidas

`moment`, `axios` (usa `fetch`), `lodash` completo (só `lodash-es` com import nomeado),
`styled-components`, `emotion`, qualquer kit de UI com visual próprio
(MUI, Ant, Chakra, Mantine, DaisyUI, Bootstrap, shadcn instalado como dependência —
os componentes vivem no repositório, escritos por nós).

---

## 2. ÁRVORE DO REPOSITÓRIO

```
oryon-os/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── e2e.yml
│   │   ├── visual-regression.yml
│   │   ├── db-migrate-check.yml
│   │   └── release.yml
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── .vscode/
├── apps/
│   ├── web/
│   │   └── src/
│   ├── api/
│   ├── worker/
│   ├── realtime/
│   ├── mobile/
│   └── docs-site/
├── packages/
│   ├── ui/
│   ├── core/
│   ├── db/
│   ├── contracts/
│   ├── ai/
│   ├── search/
│   ├── realtime-client/
│   ├── i18n/
│   ├── config/
│   └── testing/
├── infra/
│   ├── docker/
│   ├── k8s/
│   ├── terraform/
│   └── grafana/
├── docs/
├── scripts/
├── .env.example
├── biome.json
├── turbo.json
├── pnpm-workspace.yaml
├── CLAUDE.md
├── DESIGN_SYSTEM.md
└── README.md
```

### Regras de fronteira entre pacotes

```
apps/*        → podem importar packages/*
packages/ui   → só packages/config. NUNCA importa db, core ou contracts.
packages/core → só packages/contracts. Domínio puro, zero I/O, zero Prisma.
packages/db   → importa core e contracts. É o único que conhece Prisma.
packages/ai   → importa core, contracts, db. Nunca é importado por core.
```

Violação de fronteira é erro de build, não aviso. Configurado em
`biome.json` via `noRestrictedImports` e validado em CI.

---

## 3. NOMENCLATURA — ESTRITA

Pastas e ficheiros seguem `kebab-case`; componentes React seguem `PascalCase`; hooks têm prefixo `use`; stores e serviços usam os sufixos definidos pela arquitectura. Modelos Prisma são `PascalCase`, tabelas físicas `snake_case` via `@@map`, e eventos usam `dominio.entidade.accao`. Commits seguem Conventional Commits com escopo obrigatório.

---

## 4. SCRIPTS PERMITIDOS

Executar sempre a partir da raiz, sempre com `pnpm`. `npm` e `yarn` são proibidos.

### Desenvolvimento

```bash
pnpm install
pnpm dev
pnpm dev --filter=web
pnpm dev --filter=api
pnpm dev --filter=worker
pnpm storybook
pnpm infra:up
pnpm infra:down
pnpm infra:logs <serviço>
```

### Base de dados

```bash
pnpm db:generate
pnpm db:migrate:dev --name <slug>
pnpm db:migrate:deploy
pnpm db:migrate:status
pnpm db:seed
pnpm db:studio
pnpm db:reset
pnpm db:rls:verify
```

### Qualidade

```bash
pnpm typecheck
pnpm lint
pnpm lint:fix
pnpm format
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm test:e2e:ui
pnpm test:visual
pnpm build
pnpm verify
```

### Contratos e geração

```bash
pnpm gen:openapi
pnpm gen:sdk
pnpm gen:events
pnpm gen:i18n
pnpm gen:tokens
```

### Análise

```bash
pnpm analyze:bundle
pnpm analyze:deps
pnpm analyze:unused
pnpm audit:security
```

---

## 5. CONVENÇÕES DE CÓDIGO NÃO NEGOCIÁVEIS

TypeScript `strict: true`, zero `any`, zero `@ts-ignore`, entradas externas validadas com Zod, mutações através de serviços/core, nenhuma query sem `can()` e RLS activo, toda mutação gera evento na mesma transacção, dinheiro nunca usa `number`, datas persistem em UTC, zero strings literais em JSX, e acessibilidade/performance fazem parte do CI.

---

## 6. CI — PORTÕES

```
PR aberto
  ├─ install + cache turbo
  ├─ typecheck
  ├─ lint
  ├─ test unit + integração
  ├─ db:migrate:status
  ├─ db:rls:verify
  ├─ build
  ├─ e2e
  ├─ regressão visual
  ├─ analyze:bundle
  ├─ audit:security
  └─ preview deploy
```

Merge só com squash, título Conventional Commit e todos os portões verdes.
`main` protegido, sem excepções, incluindo para agentes.
