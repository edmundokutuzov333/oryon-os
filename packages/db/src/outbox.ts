import type { Prisma } from "./generated/client.js";

export interface DomainEventInput {
	readonly orgId: string;
	readonly name: string;
	readonly version?: number;
	readonly actorId?: string;
	readonly actorType: "MEMBER" | "GUEST" | "CLIENT" | "VENDOR" | "AGENT" | "SERVICE_ACCOUNT";
	readonly subjectType: string;
	readonly subjectId: string;
	readonly payload: Prisma.InputJsonValue;
	readonly correlationId?: string;
	readonly causationId?: string;
}

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

	return tx.domainEvent.create({
		data,
		select: { id: true },
	});
}
