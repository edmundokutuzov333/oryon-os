import type { PageCreateInput, PageUpdateInput, FileCompleteInput } from "@oryon/contracts/docs-files";
import type { Prisma, PrismaClient } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";

export class DocsFilesRepository {
  constructor(private readonly db: PrismaClient) {}

  async listPages(orgId: string, workspaceId?: string | null, limit = 100) {
    return withOrgContext(this.db, orgId, (tx) => tx.page.findMany({
      where: { orgId, deletedAt: null, ...(workspaceId === undefined ? {} : { workspaceId }) },
      orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
      take: Math.min(Math.max(limit, 1), 200),
    }));
  }

  async findPage(orgId: string, id: string) {
    return withOrgContext(this.db, orgId, (tx) => tx.page.findFirst({ where: { orgId, id, deletedAt: null } }));
  }

  async createPage(orgId: string, actorId: string, input: PageCreateInput) {
    return withOrgContext(this.db, orgId, async (tx) => {
      if (input.parentPageId) {
        const parent = await tx.page.findFirst({ where: { orgId, id: input.parentPageId, deletedAt: null }, select: { id: true } });
        if (!parent) throw new Error("PARENT_PAGE_NOT_FOUND");
      }
      if (input.ownerId) {
        const owner = await tx.user.findFirst({ where: { orgId, id: input.ownerId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
        if (!owner) throw new Error("OWNER_NOT_FOUND");
      }
      const position = await tx.page.count({ where: { orgId, parentPageId: input.parentPageId ?? null, deletedAt: null } });
      const pageKind = input.kind === "WIKI" ? "WIKI" : input.kind === "NOTE" ? "NOTE" : "DOC";
      const page = await tx.page.create({ data: { orgId, workspaceId: input.workspaceId ?? null, parentPageId: input.parentPageId ?? null, title: input.title, kind: pageKind, ownerId: input.ownerId ?? actorId, classification: input.classification ?? null, position, contentJson: { type: "doc", content: [{ type: "paragraph" }] }, contentText: "", indexable: false, createdBy: actorId } });
      await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Page", subjectId: page.id, name: "page.created", payload: { title: page.title, kind: page.kind } });
      return page;
    });
  }

  async updatePage(orgId: string, actorId: string, id: string, input: PageUpdateInput) {
    return withOrgContext(this.db, orgId, async (tx) => {
      const current = await tx.page.findFirst({ where: { orgId, id, deletedAt: null } });
      if (!current) throw new Error("NOT_FOUND");
      if (input.parentPageId !== undefined && input.parentPageId !== null && input.parentPageId !== current.parentPageId) {
        if (input.parentPageId === id) throw new Error("PAGE_PARENT_CYCLE");
        const parent = await tx.page.findFirst({ where: { orgId, id: input.parentPageId, deletedAt: null }, select: { id: true, parentPageId: true } });
        if (!parent) throw new Error("PARENT_PAGE_NOT_FOUND");
        let cursor = parent.parentPageId;
        for (let depth = 0; depth < 100 && cursor; depth += 1) {
          if (cursor === id) throw new Error("PAGE_PARENT_CYCLE");
          const next = await tx.page.findFirst({ where: { orgId, id: cursor, deletedAt: null }, select: { parentPageId: true } });
          cursor = next?.parentPageId ?? null;
        }
      }
      const data = {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.parentPageId === undefined ? {} : { parentPageId: input.parentPageId }),
        ...(input.icon === undefined ? {} : { icon: input.icon }),
        ...(input.coverUrl === undefined ? {} : { coverUrl: input.coverUrl }),
        ...(input.contentJson === undefined ? {} : { contentJson: input.contentJson }),
        ...(input.contentText === undefined ? {} : { contentText: input.contentText }),
        ...(input.contentYjsBase64 === undefined ? {} : { contentYjs: input.contentYjsBase64 === null ? null : Buffer.from(input.contentYjsBase64, "base64") }),
        ...(input.classification === undefined ? {} : { classification: input.classification }),
        ...(input.reviewEveryDays === undefined ? {} : { reviewEveryDays: input.reviewEveryDays, nextReviewAt: input.reviewEveryDays === null ? null : new Date(Date.now() + input.reviewEveryDays * 86400000) }),
        ...(input.nextReviewAt === undefined ? {} : { nextReviewAt: input.nextReviewAt === null ? null : new Date(input.nextReviewAt) }),
        ...(input.indexable === undefined ? {} : { indexable: input.indexable }),
        ...(input.publishedSlug === undefined ? {} : { publishedSlug: input.publishedSlug }),
      };
      const page = await tx.page.update({ where: { id }, data: data as Prisma.PageUncheckedUpdateInput });
      const hasContent = input.contentJson !== undefined || input.contentText !== undefined || input.contentYjsBase64 !== undefined;
      if (hasContent) {
        const last = await tx.pageVersion.findFirst({ where: { orgId, pageId: id }, orderBy: { version: "desc" }, select: { version: true } });
        const snapshot = input.contentYjsBase64 ? Buffer.from(input.contentYjsBase64, "base64") : Buffer.from(JSON.stringify(input.contentJson ?? page.contentJson ?? { type: "doc", content: [] }), "utf8");
        await tx.pageVersion.create({ data: { orgId, pageId: id, version: (last?.version ?? 0) + 1, snapshot, authorId: actorId, summary: "Conteúdo actualizado" } });
      }
      await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Page", subjectId: id, name: "page.updated", payload: { changed: Object.keys(data), contentVersioned: hasContent } });
      return page;
    });
  }

  async listVersions(orgId: string, pageId: string) {
    return withOrgContext(this.db, orgId, (tx) => tx.pageVersion.findMany({ where: { orgId, pageId }, orderBy: { version: "desc" }, take: 100 }));
  }

  async publishPage(orgId: string, actorId: string, id: string, slug: string | null) {
    return withOrgContext(this.db, orgId, async (tx) => {
      const page = await tx.page.findFirst({ where: { orgId, id, deletedAt: null } });
      if (!page) throw new Error("NOT_FOUND");
      const next = slug === null ? { publishedSlug: null, publishedAt: null } : { publishedSlug: slug, publishedAt: new Date() };
      const updated = await tx.page.update({ where: { id }, data: next });
      await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Page", subjectId: id, name: slug === null ? "page.unpublished" : "page.published", payload: { slug } });
      return updated;
    });
  }

  async softDeletePage(orgId: string, actorId: string, id: string) {
    await withOrgContext(this.db, orgId, async (tx) => {
      const page = await tx.page.findFirst({ where: { orgId, id, deletedAt: null }, select: { id: true } });
      if (!page) throw new Error("NOT_FOUND");
      await tx.page.update({ where: { id }, data: { deletedAt: new Date() } });
      await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Page", subjectId: id, name: "page.deleted", payload: { id } });
    });
  }

  async createFile(orgId: string, actorId: string, input: FileCompleteInput & { storageKey: string }) {
    return withOrgContext(this.db, orgId, async (tx) => {
      const existing = await tx.fileAsset.findFirst({ where: { orgId, checksumSha256: input.checksumSha256, version: 1 } });
      if (existing) return existing;
      const file = await tx.fileAsset.create({ data: { orgId, name: input.name, mimeType: input.mimeType, sizeBytes: input.sizeBytes, storageKey: input.storageKey, checksumSha256: input.checksumSha256, version: 1, tags: input.tags ?? [], classification: input.classification ?? null, uploadedBy: actorId } });
      await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "FileAsset", subjectId: file.id, name: "file.asset.created", payload: { name: file.name, mimeType: file.mimeType, sizeBytes: input.sizeBytes } });
      return file;
    });
  }

  async findFile(orgId: string, id: string) {
    return withOrgContext(this.db, orgId, (tx) => tx.fileAsset.findFirst({ where: { orgId, id, deletedAt: null } }));
  }

  async search(orgId: string, query: string, limit = 20) {
    return withOrgContext(this.db, orgId, async (tx) => {
      const q = query.trim();
      const [pages, files] = await Promise.all([
        tx.page.findMany({ where: { orgId, deletedAt: null, OR: [{ title: { contains: q, mode: "insensitive" } }, { contentText: { contains: q, mode: "insensitive" } }] }, orderBy: { updatedAt: "desc" }, take: Math.min(limit, 50) }),
        tx.fileAsset.findMany({ where: { orgId, deletedAt: null, OR: [{ name: { contains: q, mode: "insensitive" } }, { ocrText: { contains: q, mode: "insensitive" } }] }, orderBy: { createdAt: "desc" }, take: Math.min(limit, 50) }),
      ]);
      return { pages, files };
    });
  }
}
