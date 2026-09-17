import { Prisma, type PrismaClient } from "../generated/client.js";
import { withOrgContext } from "../tenant.js";

type HookSetting = { id: string; url: string; events: string[]; active: boolean; secret: string };
type PlatformSettings = { webhooks?: HookSetting[] };

function parseSettings(value: Prisma.JsonValue): PlatformSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as PlatformSettings;
}

export class WebhookDeliveryRepository {
  constructor(private readonly db: PrismaClient) {}

  async listUnpublishedEvents(orgId: string, limit = 200) {
    return withOrgContext(this.db, orgId, (tx) => tx.domainEvent.findMany({
      where: { orgId, publishedAt: null },
      orderBy: { createdAt: "asc" },
      take: Math.min(limit, 200),
    }));
  }

  async markEventPublished(orgId: string, eventId: string): Promise<void> {
    await withOrgContext(this.db, orgId, (tx) => tx.domainEvent.updateMany({
      where: { id: eventId, orgId, publishedAt: null },
      data: { publishedAt: new Date() },
    }));
  }

  async listWebhookTargets(orgId: string, eventName: string): Promise<HookSetting[]> {
    return withOrgContext(this.db, orgId, async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { settings: true } });
      if (!org) return [];
      const hooks = parseSettings(org.settings).webhooks ?? [];
      return hooks.filter((hook) => hook.active && hook.events.some((event) => event === "*" || event === eventName));
    });
  }

  async getWebhook(orgId: string, webhookId: string): Promise<HookSetting | null> {
    return withOrgContext(this.db, orgId, async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { settings: true } });
      if (!org) return null;
      const hook = (parseSettings(org.settings).webhooks ?? []).find((item) => item.id === webhookId);
      return hook?.active ? hook : null;
    });
  }

  async createDelivery(orgId: string, webhookId: string, eventId: string): Promise<{ id: string; created: boolean }> {
    return withOrgContext(this.db, orgId, async (tx) => {
      const existing = await tx.webhookDelivery.findUnique({ where: { webhookId_eventId: { webhookId, eventId } }, select: { id: true } });
      if (existing) return { id: existing.id, created: false };
      const row = await tx.webhookDelivery.create({ data: { orgId, webhookId, eventId, status: "PENDING" }, select: { id: true } });
      return { id: row.id, created: true };
    });
  }

  async listPendingDeliveries(orgId: string, limit = 200): Promise<string[]> {
    return withOrgContext(this.db, orgId, async (tx) => {
      const rows = await tx.webhookDelivery.findMany({ where: { orgId, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: Math.min(limit, 200), select: { id: true } });
      return rows.map((row) => row.id);
    });
  }

  async getDelivery(orgId: string, deliveryId: string) {
    return withOrgContext(this.db, orgId, (tx) => tx.webhookDelivery.findFirst({ where: { id: deliveryId, orgId }, include: { event: true } }));
  }

  async recordAttempt(orgId: string, deliveryId: string): Promise<number> {
    return withOrgContext(this.db, orgId, async (tx) => {
      const row = await tx.webhookDelivery.update({ where: { id: deliveryId }, data: { attempts: { increment: 1 }, lastAttemptAt: new Date() }, select: { attempts: true } });
      return row.attempts;
    });
  }

  async markDelivered(orgId: string, deliveryId: string, responseStatus: number): Promise<void> {
    await withOrgContext(this.db, orgId, (tx) => tx.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "DELIVERED", responseStatus, deliveredAt: new Date(), lastError: null } }));
  }

  async markFailed(orgId: string, deliveryId: string, responseStatus: number | null, error: string): Promise<void> {
    await withOrgContext(this.db, orgId, (tx) => tx.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "FAILED", responseStatus, lastError: error.slice(0, 4000) } }));
  }
}
