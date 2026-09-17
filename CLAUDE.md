# CLAUDE.md — Manual de Arquitectura OryonOS

Documento normativo. Precedência sobre qualquer instrução conversacional.
Alterações arquitecturais exigem ADR aprovado; a decisão desta etapa está em `docs/adr/ADR-0010-rest-openapi-canonical-contract.md` e deve ser incorporada ao índice normativo de decisões na próxima manutenção documental.

## Stack

Node.js 24 LTS, pnpm 10.x, Turborepo 2.5+, TypeScript 5.9+ strict, Biome 2.x, Lefthook 1.x.

Frontend: Next.js 16 App Router, React 19.2+, Tailwind 4, Radix, Motion 12, Zustand 5, TanStack Query/Table/Virtual, dnd-kit, React Hook Form, Zod 4, Lucide, Temporal/date-fns, TipTap 3, Yjs 13, tldraw 3, Visx/Recharts, next-intl, Storybook 9.

Backend: Fastify 5 + OpenAPI 3.1, Prisma 6, PostgreSQL 17, pgvector/pg_trgm/pgcrypto/uuid-ossp/pg_partman, Redis 7.4+, BullMQ 5, NATS JetStream 2.11+, Typesense 28, S3 compatível, Socket.IO/uWebSockets, LiveKit 1.9+, Temporal 1.28+, WorkOS, Auth.js 5, Resend/React Email, React PDF/Gotenberg, Vercel AI SDK 5, OpenTelemetry/Grafana LGTM, Sentry 9, OpenFeature/Flagsmith.

REST + OpenAPI 3.1 é o contrato externo canónico da V1. tRPC não faz parte da V1.

Node 24 é obrigatório para CI. Bun não é runtime de produção. npm e yarn não são usados.

## Fronteiras

```text
apps/*        → podem importar packages/*
packages/ui   → só packages/config. Nunca db, core ou contracts.
packages/core → só packages/contracts. Domínio puro, zero I/O, zero Prisma.
packages/db   → importa core e contracts. Único pacote que conhece Prisma.
packages/ai   → importa core, contracts, db. Nunca é importado por core.
sdk           → só depende de packages/contracts para a fronteira pública.
```

Violação de fronteira falha o build e CI.

## Contratos

`packages/contracts` é a fonte de verdade executável para entradas e saídas públicas.

`packages/contracts/src/public-api.ts` reúne a fronteira HTTP pública e referencia os schemas por capacidade.

A cadeia canónica é:

`Zod Contract → API validation → OpenAPI 3.1 → SDK validation/types → UI data access`.

OpenAPI não contém definições duplicadas de payloads. SDK não usa `unknown` onde já exista contract. Documentação humana (`docs/API_CONTRACTS.md`) descreve a superfície, mas não substitui os schemas executáveis.

## Regras não negociáveis

TypeScript strict, zero `any`, zero `@ts-ignore`. Toda entrada e saída pública passa por Zod. Nenhum componente ou rota acede Prisma directamente. Toda query é precedida por `can()` e protegida por RLS. Toda mutação emite DomainEvent na mesma transacção via outbox. Dinheiro usa Decimal/minor units + currency. Datas são UTC na base. Zero strings literais em JSX. E2E inclui acessibilidade. LCP < 1.8s, INP < 200ms, first load JS `/os` < 180 kB gzip, query P95 < 120ms.

## Artefactos gerados

Não versionar `node_modules`, `.turbo`, `.next`, `dist`, clientes Prisma gerados, OpenAPI gerado ou outros artefactos de build. Eles devem ser reproduzidos por `pnpm install`, `pnpm db:generate`, `pnpm gen:openapi` e `pnpm gen:sdk`.

## Scripts

```bash
pnpm install
pnpm dev
pnpm dev --filter=web
pnpm dev --filter=api
pnpm dev --filter=worker
pnpm storybook
pnpm infra:up
pnpm infra:down
pnpm db:generate
pnpm db:validate
pnpm db:migrate:dev --name <slug>
pnpm db:migrate:deploy
pnpm db:migrate:status
pnpm db:seed
pnpm db:studio
pnpm db:rls:verify
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm test:visual
pnpm build
pnpm verify
pnpm gen:openapi
pnpm gen:sdk
pnpm analyze:bundle
pnpm analyze:deps
pnpm analyze:unused
pnpm audit:security
```

`prisma db push`, `git push --force`, `git commit --no-verify` e `pnpm db:reset` fora de local são proibidos.

## CI

PRs passam por install/cache, generation, typecheck, lint, testes, validação/migração de DB, RLS, build, E2E, visual regression, bundle analysis, security audit e preview deploy. Merge apenas com squash e portões verdes. `main` deve estar protegido.
