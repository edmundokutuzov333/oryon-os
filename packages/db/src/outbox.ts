import { PrismaClient } from "./generated/client.js";

export interface DomainEventInput {
	readonly orgId: string;
	readonly name: string;
	readonly version?: number;
	readonly actorId?: string;
	readonly actorType: "MEMBER" | "GUEST" | "CLIENT" | "VENDOR" | "AGENT" | "SERVICE_ACCOUNT";
	readonly subjectType: string;
	readonly subjectId: string;
	readonly payload: Record<string, unknown>;
	readonly correlationId?: string;
	readonly causationId?: string;
}

export async function appendDomainEvent(
	tx: PrismaClient,
	input: DomainEventInput,
): Promise<{ readonly id: string }> {
	const event = await tx.domainEvent.create({
		data: {
			orgId: input.orgId,
			name: input.name,
			version: input.version ?? 1,
			actorId: input.actorId,
			actorType: input.actorType,
			subjectType: input.subjectType,
			subjectId: input.subjectId,
			payload: input.payload,
			correlationId: input.correlationId,
			causationId: input.causationId,
		},
		select: { id: true },
	});

	return event;
}
