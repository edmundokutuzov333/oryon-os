import { createHmac } from "node:crypto";
import { WebhookDeliveryRepository } from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";

const repository = new WebhookDeliveryRepository(getPrisma());
const MAX_ATTEMPTS = 8;

function envelope(event: {
	id: string;
	name: string;
	version: number;
	orgId: string;
	createdAt: Date;
	actorId: string | null;
	actorType: string;
	subjectType: string;
	subjectId: string;
	payload: unknown;
	correlationId: string | null;
	causationId: string | null;
}) {
	return {
		eventId: event.id,
		name: event.name,
		version: event.version,
		orgId: event.orgId,
		occurredAt: event.createdAt.toISOString(),
		actor: event.actorId ? { id: event.actorId, type: event.actorType } : null,
		subject: { type: event.subjectType, id: event.subjectId },
		payload: event.payload,
		correlationId: event.correlationId,
		causationId: event.causationId,
	};
}

export async function deliverWebhookDelivery(
	orgId: string,
	deliveryId: string,
): Promise<void> {
	const delivery = await repository.getDelivery(orgId, deliveryId);
	if (!delivery || delivery.status === "DELIVERED") return;
	const hook = await repository.getWebhook(orgId, delivery.webhookId);
	if (!hook) {
		await repository.markFailed(
			orgId,
			deliveryId,
			null,
			"Webhook endpoint is inactive or missing",
		);
		return;
	}

	const attempt = await repository.recordAttempt(orgId, deliveryId);
	const body = JSON.stringify(envelope(delivery.event));
	const signature = createHmac("sha256", hook.secret)
		.update(body)
		.digest("hex");
	try {
		const response = await fetch(hook.url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-oryon-event-id": delivery.event.id,
				"x-oryon-event": delivery.event.name,
				"x-oryon-signature": `sha256=${signature}`,
				"x-oryon-delivery-id": delivery.id,
			},
			body,
			signal: AbortSignal.timeout(
				Number(process.env.ORYON_WEBHOOK_TIMEOUT_MS ?? "10000"),
			),
		});
		if (response.ok) {
			await repository.markDelivered(orgId, deliveryId, response.status);
			return;
		}
		const retryable =
			response.status === 408 ||
			response.status === 425 ||
			response.status === 429 ||
			response.status >= 500;
		if (!retryable || attempt >= MAX_ATTEMPTS) {
			await repository.markFailed(
				orgId,
				deliveryId,
				response.status,
				`Webhook delivery failed with HTTP ${response.status}`,
			);
			return;
		}
		throw new Error(`WEBHOOK_RETRY:${response.status}`);
	} catch (error) {
		if (attempt >= MAX_ATTEMPTS) {
			await repository.markFailed(
				orgId,
				deliveryId,
				null,
				error instanceof Error ? error.message : "Webhook delivery failed",
			);
			return;
		}
		throw error;
	}
}
