# ADR-0010: REST + OpenAPI como contrato externo canónico da V1

- Estado: aprovado para a V1
- Data: 2026-09-17

## Contexto

O `CLAUDE.md` histórico declarava simultaneamente tRPC 11 e Fastify + OpenAPI 3.1, enquanto a implementação real da OryonOS V1 é REST sobre Fastify e o repositório não contém um servidor tRPC. Manter duas stacks como contratos normativos criaria uma autoridade duplicada e deixaria o frontend, o SDK e a documentação sujeitos a drift.

## Decisão

1. REST sobre Fastify é o contrato externo canónico da OryonOS V1.
2. OpenAPI 3.1 é a representação pública e máquina-legível desse contrato.
3. Schemas Zod em `packages/contracts` são a fonte de verdade executável para entradas e saídas públicas.
4. `apps/api/src/openapi.ts` não define contratos manualmente. Ele gera o documento a partir de `packages/contracts/src/public-api.ts` usando a conversão JSON Schema nativa do Zod 4.
5. O SDK oficial em `sdk` pertence ao workspace pnpm e consome os mesmos contracts para tipos e validação de respostas.
6. tRPC não faz parte da V1. Uma futura introdução de tRPC exige um novo ADR e não pode coexistir como segundo contrato público para os mesmos endpoints.
7. `API_CONTRACTS.md` permanece documentação normativa e deve apontar sempre para os schemas executáveis, nunca ser a única fonte de definição de payloads.
8. Contratos de domínio existentes continuam separados por capacidade (`identity`, `permissions`, `work-object`, `graph`, `docs-files`, `communication`, `meeting`, `agents-automation`, `platform-release`). O catálogo público reúne apenas a fronteira HTTP externa e referencia esses schemas.

## Consequências

Há uma única cadeia de autoridade para a fronteira pública:

`Zod Contract → API validation → OpenAPI 3.1 → SDK types/runtime validation → UI data access`.

A camada de frontend não depende de Prisma nem de detalhes internos do backend. O SDK não declara `unknown` para operações cujo contrato já existe. Qualquer alteração de payload deve alterar primeiro o contract e só depois ser propagada pelas camadas consumidoras.
