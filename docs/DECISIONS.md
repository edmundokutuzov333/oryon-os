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
