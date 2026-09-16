# OryonOS V1 Local Infrastructure Runbook

A Fase 1 fornece uma infraestrutura local única e reproduzível para desenvolvimento da OryonOS.

## Pré-requisitos

Node.js 24 LTS, pnpm 10.x e Docker Desktop ou Docker Engine com Docker Compose v2.

## Arranque

```bash
cp .env.example .env
pnpm infra:config
pnpm infra:up
pnpm infra:doctor
```

`infra:up` constrói a imagem PostgreSQL local, inicia os seis serviços base e aguarda os healthchecks. O `minio-init` cria o bucket privado definido em `S3_BUCKET`.

## Serviços

| Serviço | Porta local | Utilização |
| --- | ---: | --- |
| PostgreSQL 17 | 5432 | Base transaccional + pgvector + pg_trgm + pgcrypto + uuid-ossp + pg_partman |
| Redis 7.4 | 6379 | Cache, filas, sessões e estado transitório |
| NATS JetStream | 4222 | Event bus persistente |
| NATS monitoring | 8222 | Operação local e health |
| Typesense 28 | 8108 | Pesquisa textual |
| MinIO | 9000 | S3 compatível |
| MinIO Console | 9001 | Administração local do object storage |
| LiveKit | 7880 | Signal/API/WebSocket |
| LiveKit TCP | 7881 | WebRTC fallback |
| LiveKit UDP | 7882 + 50000-50100 | WebRTC local |

## URLs e credenciais locais

Os valores normais estão em `.env.example`. O LiveKit em modo `--dev` usa `devkey` / `secret` e aceita bind explícito a `0.0.0.0` para desenvolvimento local.

A imagem do servidor MinIO usa o registry oficial `quay.io/minio/minio` com tag fixa.

## Diagnóstico

```bash
pnpm infra:status
pnpm infra:doctor
pnpm infra:logs
```

`infra:doctor` valida a configuração Compose, estado dos containers, portas públicas e endpoints HTTP de Typesense e MinIO. Também verifica a acessibilidade do bucket configurado.

## Identidade e autenticação

A Fase 3 usa `User` como identidade empresarial canónica. `Organization`, `Workspace`, `Team` e `TeamMember` formam o contexto da sessão. A autorização detalhada permanece na Fase 4.

Em desenvolvimento local, configure:

```dotenv
ORYON_AUTH_JWT_SECRET=uma-chave-aleatoria-com-pelo-menos-32-caracteres
ORYON_AUTH_DEV_MODE=true
```

Com `ORYON_AUTH_DEV_MODE=true`, `POST /v1/auth/request-link` devolve `debugToken` para permitir validar o fluxo sem um provider de email. Em ambientes partilhados ou de produção, mantenha `ORYON_AUTH_DEV_MODE=false` e configure `RESEND_API_KEY`.

O browser recebe apenas um cookie HttpOnly de sessão. O access token JWT é curto e destinado à fronteira da API. Sessões são revogáveis através do Redis e o JWT deixa de resolver quando a sessão é revogada.

Fluxo local:

```bash
pnpm db:migrate:deploy
pnpm db:seed
pnpm --filter @oryon/api dev
pnpm --filter @oryon/web dev
```

Abra `/login`, utilize uma identidade semeada, abra o acesso devolvido no modo de desenvolvimento e confirme que `/os` apresenta a organização, utilizador, workspaces e equipas. O logout revoga a sessão e devolve o browser a `/login`.

Endpoints de identidade:

```text
POST /v1/auth/request-link
POST /v1/auth/verify-link
GET  /v1/auth/session
POST /v1/auth/logout
```

Todos usam `X-Oryon-Org`; operações de mutação também exigem `Idempotency-Key`.

## Paragem

```bash
pnpm infra:down
```

Os volumes nomeados são preservados. Para apagar dados locais deliberadamente, remova os volumes Docker `oryon_*` depois de parar a stack.

## Princípios operacionais

A infraestrutura local não contém credenciais de produção. Os volumes são nomeados, os serviços usam healthchecks e as imagens têm versões explicitamente definidas através do Compose. A aplicação deve consumir as URLs do `.env`, nunca nomes ou IPs hardcoded de containers.

A infraestrutura é transversal: não cria domínio de produto nem tabelas específicas. O object graph e a experiência de produto entram nas fases seguintes, sobre esta fundação.

## Gate de validação da Fase 1

A Fase 1 só é aceite quando o CI conseguir instalar com `--frozen-lockfile`, validar o Compose, construir a imagem PostgreSQL, iniciar PostgreSQL, Redis, NATS JetStream, Typesense, MinIO e LiveKit, executar o bootstrap do bucket e concluir `infra:doctor` com todos os serviços saudáveis.

O mesmo gate também valida os checks de arquitectura e de invariantes V1, typecheck, lint, testes e build, evitando que a infraestrutura seja considerada pronta quando a base do monorepo está inconsistente.

## Gate de validação da Fase 3

A Fase 3 só é aceite quando, sobre a mesma infraestrutura, o CI conseguir gerar Prisma, aplicar a migration, semear os dois tenants, verificar RLS, arrancar a API, pedir um magic link, consumi-lo uma única vez, criar uma sessão, consultar o `IdentityContext`, rejeitar essa sessão noutro `Organization` e concluir o restante pipeline de qualidade.
