# OryonOS Main Branch

`main` is the canonical and cumulative source of truth for the OryonOS V1 platform.

All product phases, fixes, integrations, migrations and release hardening are committed directly to `main`.

No new feature branches are created for OryonOS V1 execution.

The expected V1 state is cumulative:

`Bootstrap → Infrastructure → Data → Identity → Permissions → WorkObject → Work Graph → Design System/App Shell → Work Experience → Docs + Files → Communication → Meetings → Search + AI → Agents + Automation → Domain Templates → Platform + Release`

Every production-facing surface must remain connected through the canonical contracts, permission engine, WorkObject model, domain events/outbox and shared design system documented by `CLAUDE.md`, `DESIGN_SYSTEM.md`, `packages/db/prisma/schema.prisma` and `docs/API_CONTRACTS.md`.

A phase is not considered complete until its implementation is present on `main` and the repository verification gates pass against the consolidated state.
