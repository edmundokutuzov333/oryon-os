# API Contracts: Agents + Automation V1

These routes extend the mandatory global invariants in `docs/API_CONTRACTS.md`: `X-Oryon-Org` is required, authentication is required, mutating requests require `Idempotency-Key`, responses use `{ data, meta }` and errors use the canonical error envelope.

## Agents

`GET /v1/agents`

Returns tenant-scoped Agent summaries.

`POST /v1/agents`

Creates an Agent identity, principal, tool declarations, knowledge scope, model policy reference, checkpoint policy and optional budget. The body is validated with `AgentCreateInputSchema`.

`PATCH /v1/agents/{id}`

Changes Agent configuration. Manage permission is required.

`POST /v1/agents/{id}/status`

Changes lifecycle state to `DRAFT`, `ACTIVE`, `PAUSED` or `ARCHIVED`.

`POST /v1/agents/{id}/runs`

Creates a run and returns `202`. The worker claims it through BullMQ polling. `AgentRun` is the durable execution record.

`GET /v1/agent-runs/{id}`

Returns current state, tool calls, steps, read resources, written resources, cost, checkpoint state and rollback token.

`POST /v1/agent-runs/{id}/checkpoint`

Body:

```json
{"decision":"APPROVE","comment":"optional"}
```

Approval is consumed only by the pending operation. Rejection cancels the run.

`POST /v1/agent-runs/{id}/rollback`

Requires manage permission. Applies the persisted compensation journal in reverse order and moves the run to `ROLLED_BACK`.

## Automations

`GET /v1/workflows`

Returns workflow definitions.

`POST /v1/workflows`

Creates a versioned workflow containing a `MANUAL`, `EVENT` or `SCHEDULE` trigger and ordered data-defined steps.

`POST /v1/workflows/{id}/state`

Changes lifecycle state through the validated `WorkflowStateUpdateSchema`.

`POST /v1/workflows/{id}/runs`

Starts an active workflow and returns `202`.

`GET /v1/workflow-runs/{id}`

Returns the durable workflow run and persisted step log.

`POST /v1/workflow-runs/{id}/approve`

Approves or rejects a waiting workflow checkpoint. Approval places the workflow back in `RUNNING` so the worker resumes from the persisted step log.

## Runtime guarantees

1. Agent tool calls are limited to tools declared by the Agent.
2. Tool execution resolves authorization against the Agent principal with `can()`.
3. Sensitive tool actions require a checkpoint according to the Agent policy.
4. Agent budget is checked before each tool execution.
5. AgentRun and WorkflowRun state mutations emit DomainEvents in the same transaction.
6. Event-triggered workflows de-duplicate by canonical DomainEvent id.
7. BullMQ is the distributed execution queue. Temporal provides the durable workflow path when configured.
8. The browser talks only to the Next.js BFF and never receives provider secrets.
