import type { PrismaClient } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";
import type { WorkObjectCommentCreateInput, WorkObjectAttachmentCreateInput } from "@oryon/contracts/work-experience";

export class WorkExperienceRepository {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient) { this.db = db; }

  async listComments(orgId: string, objectId: string) {
    return withOrgContext(this.db, orgId, (tx) => tx.comment.findMany({
      where: { orgId, targetType: "work_object", targetId: objectId, objectId, deletedAt: null },
      include: { author: { select: { id: true, name: true, displayName: true } } },
      orderBy: { createdAt: "asc" },
    }));
  }

  async createComment(orgId: string, actorId: string, objectId: string, input: WorkObjectCommentCreateInput) {
    return withOrgContext(this.db, orgId, async (tx) => {
      const object = await tx.workObject.findFirst({ where: { orgId, id: objectId, deletedAt: null }, select: { id: true } });
      if (!object) throw new Error("NOT_FOUND");
      if (input.parentId) {
        const parent = await tx.comment.findFirst({ where: { orgId, id: input.parentId, targetType: "work_object", targetId: objectId, deletedAt: null }, select: { id: true } });
        if (!parent) throw new Error("COMMENT_PARENT_NOT_FOUND");
      }
      const comment = await tx.comment.create({ data: {
        orgId, objectId, targetType: "work_object", targetId: objectId, parentId: input.parentId ?? null,
        authorId: actorId, authorType: "MEMBER",
        bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: input.bodyText }] }] },
        bodyText: input.bodyText, mentions: input.mentions, isInternal: input.isInternal,
      }, include: { author: { select: { id: true, name: true, displayName: true } } } });
      await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Comment", subjectId: comment.id, name: "work_object.comment.created", payload: { objectId, commentId: comment.id, parentId: comment.parentId } });
      return comment;
    });
  }

  async listAttachments(orgId: string, objectId: string) {
    return withOrgContext(this.db, orgId, (tx) => tx.attachment.findMany({
      where: { orgId, objectId, targetType: "work_object", targetId: objectId },
      include: { file: { select: { id: true, name: true, mimeType: true, sizeBytes: true, version: true, createdAt: true, deletedAt: true } } },
      orderBy: { createdAt: "desc" },
    }));
  }

  async attachFile(orgId: string, actorId: string, objectId: string, input: WorkObjectAttachmentCreateInput) {
    return withOrgContext(this.db, orgId, async (tx) => {
      const object = await tx.workObject.findFirst({ where: { orgId, id: objectId, deletedAt: null }, select: { id: true } });
      if (!object) throw new Error("NOT_FOUND");
      const file = await tx.fileAsset.findFirst({ where: { orgId, id: input.fileId, deletedAt: null }, select: { id: true } });
      if (!file) throw new Error("FILE_NOT_FOUND");
      const existing = await tx.attachment.findFirst({ where: { fileId: input.fileId, targetType: "work_object", targetId: objectId } });
      if (existing) throw new Error("CONFLICT");
      const attachment = await tx.attachment.create({ data: { orgId, fileId: input.fileId, objectId, targetType: "work_object", targetId: objectId }, include: { file: { select: { id: true, name: true, mimeType: true, sizeBytes: true, version: true, createdAt: true, deletedAt: true } } } });
      await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Attachment", subjectId: attachment.id, name: "work_object.attachment.created", payload: { objectId, fileId: input.fileId } });
      return attachment;
    });
  }

  async listHistory(orgId: string, objectId: string) {
    return withOrgContext(this.db, orgId, async (tx) => {
      const [events, transitions] = await Promise.all([
        tx.domainEvent.findMany({ where: { orgId, subjectType: "WorkObject", subjectId: objectId }, orderBy: { occurredAt: "asc" }, take: 300 }),
        tx.statusTransition.findMany({ where: { orgId, objectId }, orderBy: { createdAt: "asc" }, take: 300 }),
      ]);
      return [...events.map((event) => ({ id: event.id, kind: "DOMAIN_EVENT" as const, name: event.name, actorId: event.actorId, fromStatus: null, toStatus: null, comment: null, occurredAt: event.occurredAt })), ...transitions.map((transition) => ({ id: transition.id, kind: "STATUS_TRANSITION" as const, name: "work_object.status.changed", actorId: transition.actorId, fromStatus: transition.fromStatus, toStatus: transition.toStatus, comment: transition.comment, occurredAt: transition.createdAt }))]
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).slice(0, 500);
    });
  }
}
