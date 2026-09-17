import { randomUUID } from "node:crypto";
import type { Prisma } from "./generated/client.js";
import { getPrisma } from "./index.js";
import { withOrgContext } from "./tenant.js";

export interface DomainEventInput {
	readonly orgId: string;
	readonly name: string;
	readonly version?: number;
	readonly actorId?: string;
	readonly actorType:
		| "MEMBER"
		| "GUEST"
		| "CLIENT"
		| "VENDOR"
		| "AGENT"
		| "SERVICE_ACCOUNT";
	readonly subjectType: string;
	readonly subjectId: string;
	readonly payload: Prisma.InputJsonValue;
	readonly correlationId?: string;
	readonly causationId?: string;
}

export type OutboxEvent = {
	id: string;
	orgId: string;
	name: string;
	version: number;
	actorId: string | null;
	actorType: string;
	subjectType: string;
	subjectId: string;
	payload: Prisma.JsonValue;
	correlationId: string | null;
	causationId: string | null;
};

export type OutboxConsumerKey = "webhooks" | "realtime" | "search" | "automation";
export type OutboxConsumer = {
	readonly key: OutboxConsumerKey;
	readonly handle: (event: OutboxEvent) => Promise<void>;
};
export type ConsumerDeliveryClaim = "CLAIMED" | "DELIVERED" | "LOCKED";

export async function appendDomainEvent(
	tx: Prisma.TransactionClient,
	input: DomainEventInput,
): Promise<{ readonly id: string }> {
	const data: Prisma.DomainEventUncheckedCreateInput = {
		orgId: input.orgId,
		name: input.name,
		version: input.version ?? 1,
		actorType: input.actorType,
		subjectType: input.subjectType,
		subjectId: input.subjectId,
		payload: input.payload,
	};
	if (input.actorId !== undefined) data.actorId = input.actorId;
	if (input.correlationId !== undefined) data.correlationId = input.correlationId;
	if (input.causationId !== undefined) data.causationId = input.causationId;
	return tx.domainEvent.create({ data, select: { id: true } });
}

export async function claimOutboxEvents(
	orgId: string,
	limit = 100,
	leaseSeconds = 120,
): Promise<OutboxEvent[]> {
	const db = getPrisma();
	return withOrgContext(db, orgId, async (tx) => {
		const rows = await tx.$queryRaw<OutboxEvent[]>`
			WITH candidates AS (
				SELECT id
				FROM domain_events
				WHERE org_id = ${orgId}
				  AND (
						dispatch_status = 'PENDING'
						OR (dispatch_status = 'PROCESSING' AND dispatch_locked_at < now() - make_interval(secs => ${leaseSeconds}))
				  )
				ORDER BY created_at ASC
				FOR UPDATE SKIP LOCKED
				LIMIT ${Math.min(Math.max(limit, 1), 500)}
			)
			UPDATE domain_events e
			SET dispatch_status = 'PROCESSING',
				dispatch_attempts = e.dispatch_attempts + 1,
				dispatch_locked_at = now()
			FROM candidates c
			WHERE e.id = c.id
			RETURNING e.id, e.org_id AS "orgId", e.name, e.version,
				e.actor_id AS "actorId", e.actor_type AS "actorType",
				e.subject_type AS "subjectType", e.subject_id AS "subjectId",
				e.payload, e.correlation_id AS "correlationId", e.causation_id AS "causationId"
		`;
		return rows;
	});
}

export async function completeOutboxEvent(orgId: string, eventId: string): Promise<void> {
	const db = getPrisma();
	await withOrgContext(db, orgId, (tx) =>
		tx.$executeRaw`
			UPDATE domain_events
			SET dispatch_status = 'DISPATCHED', dispatched_at = now(), published_at = now(), dispatch_locked_at = NULL, dispatch_last_error = NULL
			WHERE org_id = ${orgId} AND id = ${eventId} AND dispatch_status = 'PROCESSING'
		`,
	);
}

export async function failOutboxEvent(orgId: string, eventId: string, error: unknown): Promise<void> {
	const db = getPrisma();
	const message = error instanceof Error ? error.message : String(error);
	await withOrgContext(db, orgId, (tx) =>
		tx.$executeRaw`
			UPDATE domain_events
			SET dispatch_status = 'PENDING', dispatch_locked_at = NULL, dispatch_last_error = ${message.slice(0, 4000)}
			WHERE org_id = ${orgId} AND id = ${eventId} AND dispatch_status = 'PROCESSING'
		`,
	);
}

export async function claimConsumerDelivery(
	orgId: string,
	eventId: string,
	consumerKey: OutboxConsumerKey,
	leaseSeconds = 120,
): Promise<ConsumerDeliveryClaim> {
	const db = getPrisma();
	return withOrgContext(db, orgId, async (tx) => {
		const rows = await tx.$queryRaw<Array<{ status: string }>>`
			INSERT INTO outbox_consumer_deliveries
				(id, org_id, event_id, consumer_key, status, attempts, locked_at)
			VALUES (${randomUUID()}, ${orgId}, ${eventId}, ${consumerKey}, 'PROCESSING', 1, now())
			ON CONFLICT (org_id, event_id, consumer_key) DO UPDATE
			SET status = 'PROCESSING',
				attempts = outbox_consumer_deliveries.attempts + 1,
				locked_at = now(),
				last_error = NULL
			WHERE outbox_consumer_deliveries.delivered_at IS NULL
			  AND (
				outbox_consumer_deliveries.status <> 'PROCESSING'
				OR outbox_consumer_deliveries.locked_at < now() - make_interval(secs => ${leaseSeconds})
			  )
			RETURNING status
		`;
		if (rows[0]) return "CLAIMED";
		const current = await tx.$queryRaw<Array<{ status: string; delivered_at: Date | null }>>`
			SELECT status, delivered_at
			FROM outbox_consumer_deliveries
			WHERE org_id = ${orgId} AND event_id = ${eventId} AND consumer_key = ${consumerKey}
			LIMIT 1
		`;
		return current[0]?.delivered_at ? "DELIVERED" : "LOCKED";
	});
}

export async function completeConsumerDelivery(
	orgId: string,
	eventId: string,
	consumerKey: OutboxConsumerKey,
): Promise<void> {
	const db = getPrisma();
	await withOrgContext(db, orgId, (tx) =>
		tx.$executeRaw`
			UPDATE outbox_consumer_deliveries
			SET status = 'DELIVERED', delivered_at = now(), locked_at = NULL, last_error = NULL
			WHERE org_id = ${orgId} AND event_id = ${eventId} AND consumer_key = ${consumerKey} AND status = 'PROCESSING'
		`,
	);
}

export async function failConsumerDelivery(
	orgId: string,
	eventId: string,
	consumerKey: OutboxConsumerKey,
	error: unknown,
): Promise<void> {
	const db = getPrisma();
	const message = error instanceof Error ? error.message : String(error);
	await withOrgContext(db, orgId, (tx) =>
		tx.$executeRaw`
			UPDATE outbox_consumer_deliveries
			SET status = 'FAILED', locked_at = NULL, last_error = ${message.slice(0, 4000)}
			WHERE org_id = ${orgId} AND event_id = ${eventId} AND consumer_key = ${consumerKey} AND delivered_at IS NULL
		`,
	);
}

export async function dispatchOutboxBatch(
	orgId: string,
	consumers: readonly OutboxConsumer[],
	options?: { limit?: number; leaseSeconds?: number },
): Promise<{
	claimed: number;
	dispatched: number;
	failed: number;
	deferred: number;
}> {
	const events = await claimOutboxEvents(orgId, options?.limit ?? 100, options?.leaseSeconds ?? 120);
	let dispatched = 0;
	let failed = 0;
	let deferred = 0;
	for (const event of events) {
		let eventFailed = false;
		let eventDeferred = false;
		for (const consumer of consumers) {
			const claim = await claimConsumerDelivery(orgId, event.id, consumer.key, options?.leaseSeconds ?? 120);
			if (claim === "DELIVERED") continue;
			if (claim === "LOCKED") {
				eventDeferred = true;
				continue;
			}
			try {
				await consumer.handle(event);
				await completeConsumerDelivery(orgId, event.id, consumer.key);
			} catch (error) {
				eventFailed = true;
				await failConsumerDelivery(orgId, event.id, consumer.key, error);
			}
		}
		if (eventFailed) {
			failed += 1;
			await failOutboxEvent(orgId, event.id, new Error("OUTBOX_CONSUMER_FAILED"));
		} else if (eventDeferred) {
			deferred += 1;
		} else {
			dispatched += 1;
			await completeOutboxEvent(orgId, event.id);
		}
	}
	return { claimed: events.length, dispatched, failed, deferred };
}
