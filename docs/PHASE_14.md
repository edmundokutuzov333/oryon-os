# Fase 14, Domain Templates

A Fase 14 prova que CRM, Support e Product / Engineering podem nascer sobre o mesmo motor de trabalho.

## Princípio

Não existem tabelas ou engines paralelos para os domínios. Cada domínio é um manifesto de configuração que instala `ObjectTypeDef` e usa `WorkObject` para dados operacionais. Relações entre objectos continuam a usar `Edge` e as permissões continuam a ser resolvidas pelo Permissions Engine.

## Templates incluídos

### CRM

- Conta
- Contacto
- Oportunidade
- Actividade

Pipeline comercial, relacionamento conta/contacto/oportunidade e jornada lead até cliente.

### Support

- Cliente
- Ticket
- Escalamento

Triagem, atendimento, espera, resolução e escalamento com metadados de SLA e canal.

### Product / Engineering

- Projecto
- Épico
- História
- Bug
- Release

Roadmap e execução com hierarquia, revisão, bugs e entregas.

## Ciclo de vida

`GET /v1/domain-templates` apresenta o catálogo no tenant.

`GET /v1/domain-templates/{key}` devolve o manifesto resolúvel do template.

`POST /v1/domain-templates/{key}/install` instala ou actualiza os `ObjectTypeDef` geridos pelo template e regista a versão activa em `Organization.settings.domainTemplates`.

`POST /v1/domain-templates/{key}/deactivate` desactiva o template sem apagar `WorkObject` ou `ObjectTypeDef`. Esta decisão protege dados e permite reactivação posterior.

Toda operação administrativa requer `manage` no recurso organizacional de `object_type_def`, autenticação, `X-Oryon-Org` e `Idempotency-Key`.

## H1

A ausência de um `DomainTemplate` Prisma model é intencional. O produto prova a hipótese de configuração sobre o motor comum: instalar um domínio cria apenas definições de tipos, não um novo sistema de dados.

## UI / UX / CX / SD

A superfície `Templates` apresenta estado, versão, quantidade de tipos e jornadas antes da activação. O detalhe mostra os tipos e relações para tornar a consequência da instalação explícita.

A activação é reversível. Conflitos com tipos personalizados existentes não sobrescrevem dados silenciosamente. Em mobile, as acções passam para alvos de toque de largura total e a grelha colapsa para uma coluna.

As permissões continuam backend-first: a UI não assume que o papel do utilizador concede acesso e trata `403` como ausência de acesso administrativo.
