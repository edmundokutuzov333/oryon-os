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
	return withOrgContext(db, async (tx) => {
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
				LIMIT ${limit}
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
	await withOrgContext(db, (tx) =>
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
	await withOrgContext(db, (tx) =>
		tx.$executeRaw`
			UPDATE domain_events
			SET dispatch_status = 'PENDING', dispatch_locked_at = NULL, dispatch_last_error = ${message.slice(0, 4000)}
			WHERE org_id = ${orgId} AND id = ${eventId}
		`,
	);
}

export async function claimConsumerDelivery(
	orgId: string,
	eventId: string,
	consumerKey: string,
): Promise<boolean> {
	const db = getPrisma();
	return withOrgContext(db, orgId, async (tx) => {
		const result = await tx.$queryRaw<Array<{ created: boolean }>>`
			INSERT INTO outbox_consumer_deliveries (id, org_id, event_id, consumer_key)
			VALUES (${crypto.randomUUID()}, ${orgId}, ${eventId}, ${consumerKey})
			ON CONFLICT (org_id, event_id, consumer_key) DO NOTHING
			RETURNING true AS created
		`;
		return result[0]?.created === true;
	});
}
