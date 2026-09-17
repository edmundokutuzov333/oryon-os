# OryonOS Fase 13

## Scope

Agents + Automation: agent identity, principal, tools, execution runs, checkpoints, human approval, budget controls, rollback, workflow triggers, conditions, actions, BullMQ distribution, Temporal durability and audit events.

## Runtime path

Browser → Next.js BFF → Fastify API → Zod contracts → permission engine → AgentRepository/AutomationRepository → Agent runtime → BullMQ → Temporal when configured → canonical WorkObject/Graph repositories.

The UI never talks directly to Prisma or provider secrets.

## Agent lifecycle

Create an Agent with a dedicated AGENT principal. Configure tools, knowledge scope, model policy, checkpoint policy and optional budget. Runs start as `RUNNING`, persist a step plan and tool calls, stop in `WAITING` before sensitive work, resume after explicit approval, record cost, and expose a rollback token after success.

## Automation lifecycle

A Workflow is data. Its trigger can be manual, event based or cron scheduled. Steps can evaluate conditions, call an agent action, run an Agent or create an approval point. Step completion is persisted, so retries continue from the last durable state.

## Safety

Tool execution is restricted to the Agent's declared tools. Authorization resolves against the Agent principal via `can()`. Sensitive writes use checkpoint policy. Budget is checked before each tool. Rollback compensates successful writes in reverse order using the canonical repositories.

## Audit

Agent create/update/status/run/checkpoint/run-state mutations and Workflow create/state/run/run-state mutations emit DomainEvents in the same transaction as their database changes. Tool-level WorkObject mutations keep their own existing domain events.

## Operations

BullMQ provides concurrent distributed workers with retry/backoff and stable job ids. Temporal can own workflow execution when `TEMPORAL_ADDRESS` is configured. The worker also polls durable RUNNING records so a restart does not orphan work.

## UX

`/os/agents` exposes creation, execution status, tool counts, costs, checkpoints and rollback. `/os/automations` exposes workflow lifecycle, trigger type, execution state and approval actions. Both use the shared UI primitives and design tokens.
