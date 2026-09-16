# Fase 15, Platform + Release

A Fase 15 fecha a superfície operacional da OryonOS V1 sem criar um segundo motor de dados.

## Public REST

A API Fastify expõe `/v1` e `/openapi.json`. A autenticação pública suporta Bearer JWT e `X-Oryon-Api-Key`. API keys são associadas a service accounts e armazenadas apenas como SHA-256. Mutations exigem `Idempotency-Key`.

## Webhooks

Endpoints são configurados por organização em `Organization.settings`. Cada endpoint recebe um secret dedicado e os deliveries de teste usam `HMAC-SHA256` no header `X-Oryon-Signature`.

## Import / Export

Importação e exportação usam `WorkObjectRepository`, logo os dados continuam universais. A validação de payload usa Zod e cada objecto importado cria o mesmo `DomainEvent` que uma operação normal.

## Admin / Audit

A consola de Platform apresenta service accounts, webhooks e audit trail. A autorização é resolvida pelo mesmo `can()` do produto e a UI nunca decide permissões pelo papel.

## SDK

`sdk/` contém o pacote público `@oryon/sdk`, independente da workspace interna. O cliente usa a API pública, injeta `X-Oryon-Org`, `X-Oryon-Api-Key` e `Idempotency-Key` automaticamente.

## Release gates

`check:phase15`, typecheck, lint, test, build, E2E smoke, visual regression contract, bundle analysis, performance gate e security audit são executados pelo workflow de Phase 15.

Os requisitos de produto do Release Gate, como TTFV, uso de CMD-K, templates sem código novo, agentes a fechar trabalho real, objectos personalizados e exportação completa, permanecem critérios de aceitação V1 e não são inventados como métricas automáticas sem fonte de telemetria.
