import type { PrismaClient } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";

export class PageAttachmentsRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(orgId: string, pageId: string) {
    return withOrgContext(this.db, orgId, (tx) => tx.attachment.findMany({ where: { orgId, objectId: null, targetType: "page", targetId: pageId }, include: { file: true }, orderBy: { createdAt: "desc" } }));
  }

  async attach(orgId: string, actorId: string, pageId: string, fileId: string) {
    return withOrgContext(this.db, orgId, async (tx) => {
      const page = await tx.page.findFirst({ where: { orgId, id: pageId, deletedAt: null }, select: { id: true } });
      if (!page) throw new Error("NOT_FOUND");
      const file = await tx.fileAsset.findFirst({ where: { orgId, id: fileId, deletedAt: null }, select: { id: true } });
      if (!file) throw new Error("FILE_NOT_FOUND");
      const existing = await tx.attachment.findFirst({ where: { orgId, fileId, targetType: "page", targetId: pageId } });
      if (existing) throw new Error("CONFLICT");
      const attachment = await tx.attachment.create({ data: { orgId, fileId, objectId: null, targetType: "page", targetId: pageId }, include: { file: true } });
      await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Attachment", subjectId: attachment.id, name: "page.attachment.created", payload: { pageId, fileId } });
      return attachment;
    });
  }
}
