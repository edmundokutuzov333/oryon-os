# ADR-0015: REST + OpenAPI como contrato externo canónico

- Estado: aceite para a Etapa 1
- Data: 2026-09-17

## Contexto

A arquitectura normativa da OryonOS V1 mencionava simultaneamente tRPC e Fastify + OpenAPI 3.1, mas a implementação real da `main` usa Fastify REST e não contém uma camada tRPC funcional. Manter os dois transportes criaria dois contratos externos concorrentes e permitiria divergência entre frontend, SDK e API.

## Decisão

1. REST sobre Fastify é o transporte HTTP canónico da OryonOS V1.
2. OpenAPI 3.1 é o contrato público HTTP canónico e a documentação formal da API.
3. tRPC não faz parte da V1 e não deve ser introduzido como uma segunda camada de RPC.
4. `packages/contracts` é a fonte canónica dos schemas de entrada e saída públicos, usando Zod 4.
5. A implementação da API valida entradas e saídas através dos schemas de `packages/contracts`.
6. A documentação OpenAPI deriva os schemas públicos a partir desses contratos, evitando duplicar estruturas de request e response.
7. O SDK público expõe tipos inferidos dos mesmos contratos e não usa `unknown` em métodos públicos.
8. Frontend e integrações externas tratam REST/OpenAPI como a mesma superfície contratual. Socket.IO é apenas um transporte de aceleração realtime e nunca substitui REST como fonte de verdade.
9. Qualquer mudança de contrato público exige alteração simultânea do schema canónico, implementação HTTP, testes e artefactos gerados.

## Consequências

A plataforma passa a ter uma única linguagem de integração externa. O backend, frontend, SDK e documentação deixam de depender de uma escolha implícita entre RPC e REST. A decisão reduz duplicação e torna o CI capaz de verificar o mesmo contrato em todas as camadas.
