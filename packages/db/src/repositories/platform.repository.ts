import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";
import type {
	ApiKeyCreated,
	ApiKeySummary,
	WebhookCreateInput,
	WebhookSummary,
	WebhookUpdateInput,
} from "@oryon/contracts/platform-release";

type PlatformSettings = {
	apiKeys?: Array<{
		id: string;
		label: string;
		prefix: string;
		hash: string;
		userId: string;
		createdAt: string;
		expiresAt: string | null;
		revokedAt: string | null;
	}>;
	webhooks?: Array<{
		id: string;
		url: string;
		events: string[];
		description: string | null;
		active: boolean;
		secret: string;
		createdAt: string;
		updatedAt: string;
	}>;
};
function hashSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex");
}
function parseSettings(value: Prisma.JsonValue): PlatformSettings {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return {};
	return value as PlatformSettings;
}
function safeSettings(value: PlatformSettings): Prisma.InputJsonObject {
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

export class PlatformRepository {
	constructor(private readonly db: PrismaClient) {}
	async listApiKeys(orgId: string): Promise<ApiKeySummary[]> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const org = await tx.organization.findFirst({
				where: { id: orgId, deletedAt: null },
				select: { settings: true },
			});
			if (!org) throw new Error("ORG_NOT_FOUND");
			return (parseSettings(org.settings).apiKeys ?? []).map(
				({ hash: _hash, ...item }) => item,
			);
		});
	}
	async createApiKey(
		orgId: string,
		actorId: string,
		label: string,
		expiresAt: string | null,
	): Promise<ApiKeyCreated> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const org = await tx.organization.findFirst({
				where: { id: orgId, deletedAt: null },
				select: { settings: true },
			});
			if (!org) throw new Error("ORG_NOT_FOUND");
			const user = await tx.user.create({
				data: {
					orgId,
					email: `service-${randomBytes(8).toString("hex")}@api.oryon.local`,
					name: label,
					displayName: label,
					type: "SERVICE_ACCOUNT",
					status: "ACTIVE",
				},
			});
			const role = await tx.role.upsert({
				where: { orgId_key: { orgId, key: "api_service_account" } },
				update: { permissions: ["manage"] },
				create: {
					orgId,
					key: "api_service_account",
					name: "API Service Account",
					description: "Least-surface organization automation account",
					isSystem: true,
					permissions: ["manage"],
				},
			});
			const binding = await tx.roleBinding.create({
				data: {
					orgId,
					roleId: role.id,
					principalId: user.id,
					scopeType: "ORG",
					scopeId: orgId,
					grantedBy: actorId,
				},
			});
			const secret = `oryon_${randomBytes(30).toString("base64url")}`;
			const id = `key_${randomBytes(12).toString("hex")}`;
			const key = {
				id,
				label,
				prefix: secret.slice(0, 14),
				hash: hashSecret(secret),
				userId: user.id,
				createdAt: new Date().toISOString(),
				expiresAt,
				revokedAt: null,
			};
			const settings = parseSettings(org.settings);
			settings.apiKeys = [...(settings.apiKeys ?? []), key];
			await tx.organization.update({
				where: { id: orgId },
				data: { settings: safeSettings(settings) },
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "ApiKey",
				subjectId: id,
				name: "platform.api_key.created",
				payload: {
					id,
					userId: user.id,
					roleBindingId: binding.id,
					label,
					prefix: key.prefix,
				},
			});
			return { ...key, secret };
		});
	}
	async authenticateApiKey(
		orgId: string,
		secret: string,
	): Promise<string | null> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const org = await tx.organization.findFirst({
				where: { id: orgId, deletedAt: null },
				select: { settings: true },
			});
			if (!org) return null;
			const match = (parseSettings(org.settings).apiKeys ?? []).find(
				(item) =>
					item.hash === hashSecret(secret) &&
					item.revokedAt === null &&
					(!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now()),
			);
			return match?.userId ?? null;
		});
	}
	async revokeApiKey(
		orgId: string,
		actorId: string,
		id: string,
		reason: string | null,
	): Promise<void> {
		await withOrgContext(this.db, orgId, async (tx) => {
			const org = await tx.organization.findFirst({
				where: { id: orgId, deletedAt: null },
				select: { settings: true },
			});
			if (!org) throw new Error("ORG_NOT_FOUND");
			const settings = parseSettings(org.settings);
			const key = (settings.apiKeys ?? []).find((item) => item.id === id);
			if (!key) throw new Error("NOT_FOUND");
			key.revokedAt = new Date().toISOString();
			await tx.organization.update({
				where: { id: orgId },
				data: { settings: safeSettings(settings) },
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "ApiKey",
				subjectId: id,
				name: "platform.api_key.revoked",
				payload: { id, reason },
			});
		});
	}
	async listWebhooks(orgId: string): Promise<WebhookSummary[]> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const org = await tx.organization.findFirst({
				where: { id: orgId, deletedAt: null },
				select: { settings: true },
			});
			if (!org) throw new Error("ORG_NOT_FOUND");
			return (parseSettings(org.settings).webhooks ?? []).map(
				({ secret, ...hook }) => ({
					...hook,
					secretPreview: `${secret.slice(0, 10)}…`,
				}),
			);
		});
	}
	async createWebhook(
		orgId: string,
		actorId: string,
		input: WebhookCreateInput,
	): Promise<WebhookSummary> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const org = await tx.organization.findFirst({
				where: { id: orgId, deletedAt: null },
				select: { settings: true },
			});
			if (!org) throw new Error("ORG_NOT_FOUND");
			const now = new Date().toISOString();
			const id = `wh_${randomBytes(12).toString("hex")}`;
			const secret = `whsec_${randomBytes(30).toString("base64url")}`;
			const hook = {
				id,
				url: input.url,
				events: input.events,
				description: input.description,
				active: true,
				secret,
				createdAt: now,
				updatedAt: now,
			};
			const settings = parseSettings(org.settings);
			settings.webhooks = [...(settings.webhooks ?? []), hook];
			await tx.organization.update({
				where: { id: orgId },
				data: { settings: safeSettings(settings) },
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "WebhookEndpoint",
				subjectId: id,
				name: "platform.webhook.created",
				payload: { id, url: input.url, events: input.events },
			});
			return { ...hook, secretPreview: `${secret.slice(0, 10)}…` };
		});
	}
	async updateWebhook(
		orgId: string,
		actorId: string,
		id: string,
		input: WebhookUpdateInput,
	): Promise<WebhookSummary> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const org = await tx.organization.findFirst({
				where: { id: orgId, deletedAt: null },
				select: { settings: true },
			});
			if (!org) throw new Error("ORG_NOT_FOUND");
			const settings = parseSettings(org.settings);
			const hook = (settings.webhooks ?? []).find((item) => item.id === id);
			if (!hook) throw new Error("NOT_FOUND");
			if (input.url !== undefined) hook.url = input.url;
			if (input.events !== undefined) hook.events = input.events;
			if (input.description !== undefined) hook.description = input.description;
			if (input.active !== undefined) hook.active = input.active;
			hook.updatedAt = new Date().toISOString();
			await tx.organization.update({
				where: { id: orgId },
				data: { settings: safeSettings(settings) },
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "WebhookEndpoint",
				subjectId: id,
				name: "platform.webhook.updated",
				payload: { id, ...input },
			});
			return { ...hook, secretPreview: `${hook.secret.slice(0, 10)}…` };
		});
	}
	async getWebhookSecrets(
		orgId: string,
	): Promise<
		Array<{
			id: string;
			url: string;
			events: string[];
			active: boolean;
			secret: string;
		}>
	> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const org = await tx.organization.findFirst({
				where: { id: orgId, deletedAt: null },
				select: { settings: true },
			});
			if (!org) throw new Error("ORG_NOT_FOUND");
			return (parseSettings(org.settings).webhooks ?? []).map((h) => ({
				id: h.id,
				url: h.url,
				events: h.events,
				active: h.active,
				secret: h.secret,
			}));
		});
	}
	async listAudit(
		orgId: string,
		input: {
			action?: string;
			resourceType?: string;
			resourceId?: string;
			actorId?: string;
			limit: number;
		},
	): Promise<
		Array<{
			id: string;
			action: string;
			resourceType: string;
			resourceId: string;
			actorId: string | null;
			actorType: string;
			decision: string;
			reason: string | null;
			createdAt: string;
		}>
	> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const rows = await tx.auditLog.findMany({
				where: {
					orgId,
					...(input.action ? { action: input.action } : {}),
					...(input.resourceType ? { resourceType: input.resourceType } : {}),
					...(input.resourceId ? { resourceId: input.resourceId } : {}),
					...(input.actorId ? { actorId: input.actorId } : {}),
				},
				orderBy: { createdAt: "desc" },
				take: input.limit,
			});
			return rows.map((row) => ({
				id: row.id,
				action: row.action,
				resourceType: row.resourceType,
				resourceId: row.resourceId,
				actorId: row.actorId,
				actorType: row.actorType,
				decision: row.decision,
				reason: row.reason,
				createdAt: row.createdAt.toISOString(),
			}));
		});
	}
}
