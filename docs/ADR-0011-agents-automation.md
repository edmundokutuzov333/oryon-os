# ADR-0011: Agents + Automation runtime

Status: Accepted
Date: 2026-09-16
Phase: 13

## Decision

Agents are first-class identities. Every Agent owns an `AGENT` principal when one is not explicitly supplied. Permissions for tool execution resolve against that principal and the canonical `can()` engine, not against UI state.

Agent execution is represented by `AgentRun`. Planning may use the configured AI provider; local development may provide explicit tool calls in the run input. Only tools declared on the Agent can execute.

Sensitive operations are stopped before execution according to `CheckpointPolicy`. A human approval changes the run to an approved state, and the worker consumes that approval for the pending operation only. The approval is never treated as a blanket bypass for later sensitive actions.

Every state mutation of AgentRun and WorkflowRun is written in the same transaction as a DomainEvent. Tool writes use existing WorkObject and Graph repositories, so they preserve their own validation and mutation events.

Agent and workflow runs are distributed with BullMQ. When `TEMPORAL_ADDRESS` is configured, workflow executions can be delegated to a durable Temporal workflow and activity. Local development therefore works without Temporal while production can use durable orchestration.

Workflow definitions are data. A workflow contains a trigger, ordered steps, conditions, actions, agent calls and approval points. The runner resumes from the persisted step log instead of restarting completed work.

Rollback uses the run's persisted rollback journal. WorkObject creation is compensated by soft deletion. WorkObject updates are compensated by applying the captured previous state through the canonical WorkObject repository.

## Triggering

Supported workflow triggers are manual, event and cron schedule. Event workflows consume canonical DomainEvents and de-duplicate on `(workflowId, triggerEventId)`. Scheduled workflows are registered in BullMQ job schedulers. Agents may also use their canonical `schedule` field for scheduled runs.

## Budget

Each tool execution consumes a configurable run cost in cents. `budgetCapCents` is enforced before execution, producing `AI_BUDGET_EXCEEDED` when the next action would exceed the cap. A later phase may add provider-native usage accounting without changing the run contract.

## UX, CX and service design

The UI presents Agents and Automations as operational surfaces rather than chat experiences. Users can create, activate, run and inspect Agents, see tool calls and cost, approve or reject checkpoints, and request rollback. Automations expose trigger type, state, run state and approval controls. Loading, empty and error states are explicit, and API credentials remain server-side.
