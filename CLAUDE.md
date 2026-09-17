# CLAUDE.md, Manual de Arquitectura OryonOS

Documento normativo. Precedência sobre qualquer instrução conversacional.
Alterações só por ADR aprovado em `/docs/DECISIONS.md`.

A stack, árvore, nomenclatura, scripts, convenções de código e CI deste ficheiro devem corresponder à implementação real do repositório. Em caso de conflito, a decisão normativa aprovada deve prevalecer e o código deve ser alinhado a ela através de ADR.

## Stack

Node.js 24 LTS, pnpm 10.x, Turborepo 2.5+, TypeScript 5.9+ strict, Biome 2.x, Lefthook 1.x.

Frontend: Next.js 16 App Router, React 19.2+, Tailwind 4, Radix, Motion 12, Zustand 5, TanStack Query/Table/Virtual, dnd-kit, React Hook Form, Zod 4, Lucide, TipTap 3, Yjs 13, tldraw 3, Visx/Recharts, next-intl.

Backend: Fastify 5 + OpenAPI 3.1, Prisma 6, PostgreSQL 17, pgvector/pg_trgm/pgcrypto/uuid-ossp/pg_partman, Redis 7.4+, BullMQ 5, NATS JetStream 2.11+, Typesense 28, S3 compatível, Socket.IO, LiveKit 1.9+ e Temporal 1.28+.

Node 24 é obrigatório para CI. Bun não é runtime de produção. npm e yarn não são usados.

## Contrato da API

REST + OpenAPI 3.1 é o contrato externo canónico da OryonOS V1.

`tRPC` não faz parte da arquitectura V1 e não deve ser introduzido como uma segunda camada de transporte ou contrato. A API HTTP, o frontend, o SDK e a documentação pública devem consumir a mesma definição de contratos em `packages/contracts`.

As entradas e saídas públicas passam por Zod. O documento OpenAPI deriva dos schemas de contrato. O SDK expõe tipos inferidos desses mesmos contratos e não expõe `unknown` nos métodos públicos.

Socket.IO é transporte realtime complementar. Não é uma segunda fonte de verdade para dados de negócio.

## Fronteiras

```text
apps/*        → podem importar packages/*
packages/ui   → só packages/config. Nunca db, core ou contracts.
packages/core → só packages/contracts. Domínio puro, zero I/O, zero Prisma.
packages/db   → importa core e contracts. Único pacote que conhece Prisma.
packages/ai   → importa core, contracts, db. Nunca é importado por core.
```

Violação de fronteira falha o build e CI.

## Regras não negociáveis

TypeScript strict, zero `any`, zero `@ts-ignore`. Toda entrada e saída pública passa por Zod. Nenhum componente ou rota acede Prisma directamente. Toda query sensível é autorizada por `can()` e protegida por RLS. Toda mutação de negócio emite `DomainEvent` na mesma transacção via outbox. Dinheiro usa Decimal + currency. Datas são UTC na base. Zero strings literais em JSX. E2E inclui acessibilidade.

## Scripts canónicos

```bash
pnpm install
pnpm dev
pnpm dev --filter=web
pnpm dev --filter=api
pnpm dev --filter=worker
pnpm db:generate
pnpm db:validate
pnpm db:migrate:dev --name <slug>
pnpm db:migrate:deploy
pnpm db:migrate:status
pnpm db:seed
pnpm db:rls:verify
pnpm infra:config
pnpm infra:up
pnpm infra:down
pnpm infra:logs
pnpm infra:status
pnpm infra:doctor
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm test:visual
pnpm build
pnpm generate
pnpm validate
pnpm verify
pnpm verify:release
pnpm check:boundaries
pnpm check:contracts
pnpm check:sdk
pnpm check:v1
pnpm check:phase13
pnpm check:phase14
pnpm check:phase15
pnpm gen:openapi
pnpm gen:sdk
pnpm analyze:bundle
pnpm performance:gate
pnpm audit:security
```

`prisma db push`, `git push --force`, `git commit --no-verify` e `pnpm db:reset` fora de local são proibidos.

## CI

O CI instala com `pnpm install --frozen-lockfile`, gera os artefactos canónicos e executa `pnpm verify`. A pipeline de infraestrutura valida Prisma, Compose, migrações, seed determinístico e RLS. O lockfile não é alterado automaticamente durante a verificação.

O Release Gate adiciona E2E, visual contract, bundle budget, release evidence e security audit. `main` só deve aceitar integração quando os portões aplicáveis estiverem verdes.
