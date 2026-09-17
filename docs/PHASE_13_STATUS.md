# Fase 13 status

Implementation branch: `feat/phase-13-agents-automation`

Implemented on top of the actual `main` snapshot:

- Agent identity and AGENT principal provisioning
- Agent lifecycle and configuration
- Agent tool declarations and validation
- AgentRun durable state
- checkpoint policy and human approval
- per-run budget enforcement
- rollback journal and compensation
- workflow definitions
- manual/event/schedule triggers
- workflow conditions and actions
- nested Agent execution
- BullMQ queues and retries
- Temporal workflow/activity path
- tenant-aware persistence
- same-transaction DomainEvents for runtime state mutation
- Fastify API surface
- Next.js BFF surface
- Agents UI
- Automations UI
- unit tests and static phase verification
- local Temporal infrastructure

Verification remains mandatory. The branch must not be merged until the CI gates are green.
