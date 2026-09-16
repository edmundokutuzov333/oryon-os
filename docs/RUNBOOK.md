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
| Redis 7.4 | 6379 | Cache, filas e estado transitório |
| NATS JetStream | 4222 | Event bus persistente |
| NATS monitoring | 8222 | Operação local e health |
| Typesense 28 | 8108 | Pesquisa textual |
| MinIO | 9000 | S3 compatível |
| MinIO Console | 9001 | Administração local do object storage |
| LiveKit | 7880 | Signal/API/WebSocket |
| LiveKit TCP | 7881 | WebRTC fallback |
| LiveKit UDP | 7882 + 50000-50100 | WebRTC local |

## URLs e credenciais locais

Os valores normais estão em `.env.example`. O LiveKit em modo `--dev` usa `devkey` / `secret` e aceita bind explícito a `0.0.0.0` para desenvolvimento local. citeturn224132search0

A imagem do servidor MinIO usa o registry oficial `quay.io/minio/minio` com tag fixa, evitando a dependência de uma tag antiga do Docker Hub que deixou de ser utilizável neste ambiente. citeturn943006search0turn943006search2

## Diagnóstico

```bash
pnpm infra:status
pnpm infra:doctor
pnpm infra:logs
```

`infra:doctor` valida a configuração Compose, estado dos containers, portas públicas e endpoints HTTP de Typesense e MinIO. Também verifica a acessibilidade do bucket configurado.

## Paragem

```bash
pnpm infra:down
```

Os volumes nomeados são preservados. Para apagar dados locais deliberadamente, remova os volumes Docker `oryon_*` depois de parar a stack.

## Princípios operacionais

A infraestrutura local não contém credenciais de produção. Os volumes são nomeados, os serviços usam healthchecks e as imagens têm versões explicitamente definidas através do Compose. A aplicação deve consumir as URLs do `.env`, nunca nomes ou IPs hardcoded de containers.

A infraestrutura é transversal: não cria domínio de produto nem tabelas específicas. O object graph e a experiência de produto entram nas fases seguintes, sobre esta fundação.
