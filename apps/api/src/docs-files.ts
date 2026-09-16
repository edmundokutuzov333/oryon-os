import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { FileAssetSchema, FileCompleteInputSchema, FileSearchQuerySchema, PageCreateInputSchema, PagePublishInputSchema, PageSchema, PageUpdateInputSchema, PageVersionListSchema, FileUploadIntentInputSchema, FileUploadIntentSchema } from "@oryon/contracts/docs-files";
import { can } from "@oryon/core";
import { DocsFilesRepository, PermissionRepository } from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";
import { authenticate, AUTH_COOKIE_NAME } from "./auth.js";
import { createDownloadUrl, createUploadUrl, headObject, storageKeyFor } from "@oryon/storage";

const repository = new DocsFilesRepository(getPrisma());
const permissions = new PermissionRepository();

function headerString(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function orgIdOf(request: FastifyRequest): string {
  const value = headerString(request, "x-oryon-org");
  if (!value) throw new Error("ORG_HEADER_MISSING");
  return value;
}
function tokenOf(request: FastifyRequest): { token: string; mode: "bearer" | "session" } {
  const auth = headerString(request, "authorization");
  if (auth?.startsWith("Bearer ")) return { token: auth.slice(7).trim(), mode: "bearer" };
  const cookie = headerString(request, "cookie");
  if (cookie) for (const part of cookie.split(";")) { const separator = part.indexOf("="); if (separator > 0 && part.slice(0, separator).trim() === AUTH_COOKIE_NAME) return { token: decodeURIComponent(part.slice(separator + 1).trim()), mode: "session" }; }
  throw new Error("UNAUTHENTICATED");
}
async function session(request: FastifyRequest, orgId: string) {
  const auth = tokenOf(request);
  const current = await authenticate(auth.token, auth.mode);
  if (current.orgId !== orgId) throw new Error("UNAUTHENTICATED");
  return current;
}
function idempotency(request: FastifyRequest): void { if (!headerString(request, "idempotency-key")) throw new Error("IDEMPOTENCY_KEY_MISSING"); }
function envelope(request: FastifyRequest, data: unknown) { return { data, meta: { requestId: request.id, durationMs: 0 } }; }
function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "Docs operation failed";
  if (message === "ORG_HEADER_MISSING") return { code: message, status: 400 };
  if (message === "IDEMPOTENCY_KEY_MISSING") return { code: "VALIDATION_FAILED", status: 400 };
  if (message === "UNAUTHENTICATED") return { code: message, status: 401 };
  if (message === "PERMISSION_DENIED") return { code: message, status: 403 };
  if (["NOT_FOUND", "PARENT_PAGE_NOT_FOUND", "OWNER_NOT_FOUND", "FILE_NOT_FOUND", "STORAGE_OBJECT_SIZE_MISSING"].includes(message)) return { code: "NOT_FOUND", status: 404 };
  if (["PAGE_PARENT_CYCLE", "CONFLICT"].includes(message)) return { code: "CONFLICT", status: 409 };
  if (message.startsWith("STORAGE_CONFIG_MISSING")) return { code: "INTERNAL", status: 500 };
  return { code: "VALIDATION_FAILED", status: 400 };
}
function sendError(request: FastifyRequest, reply: { code: (status: number) => { send: (payload: unknown) => unknown } }, error: unknown) {
  const current = errorResult(error);
  const message = error instanceof Error ? error.message : "Docs operation failed";
  return reply.code(current.status).send({ error: { code: current.code, httpStatus: current.status, message, requestId: request.id } });
}
async function pagePermissions(orgId: string, userId: string, page: { id: string; workspaceId: string | null; ownerId: string | null; classification: string | null }) {
  const snapshot = await permissions.getSnapshot(orgId, userId, "page", page.id, page.classification);
  const resource = { orgId, type: "page", id: page.id, workspaceId: page.workspaceId, projectId: null, ownerId: page.ownerId, teamId: null, classification: page.classification };
  const actions = ["read", "create", "update", "delete", "share", "export", "manage"] as const;
  return Object.fromEntries(actions.map((action) => [action, can({ orgId, ...snapshot }, resource, action).allowed])) as { read: boolean; create: boolean; update: boolean; delete: boolean; share: boolean; export: boolean; manage: boolean };
}
async function pageResponse(orgId: string, userId: string, page: Awaited<ReturnType<DocsFilesRepository["findPage"]>>) {
  if (!page) throw new Error("NOT_FOUND");
  const permissionsForPage = await pagePermissions(orgId, userId, page);
  if (!permissionsForPage.read) throw new Error("NOT_FOUND");
  return PageSchema.parse({ ...page, position: page.position.toString(), contentYjsBase64: page.contentYjs ? Buffer.from(page.contentYjs).toString("base64") : null, verifiedAt: page.verifiedAt?.toISOString() ?? null, nextReviewAt: page.nextReviewAt?.toISOString() ?? null, publishedAt: page.publishedAt?.toISOString() ?? null, updatedAt: page.updatedAt.toISOString(), createdAt: page.createdAt.toISOString(), permissions: permissionsForPage });
}
async function fileResponse(orgId: string, userId: string, file: Awaited<ReturnType<DocsFilesRepository["findFile"]>>, includeDownload: boolean) {
  if (!file) throw new Error("NOT_FOUND");
  const snapshot = await permissions.getSnapshot(orgId, userId, "file_asset", file.id, file.classification);
  const resource = { orgId, type: "file_asset", id: file.id, workspaceId: null, projectId: null, ownerId: file.uploadedBy, teamId: null, classification: file.classification };
  const read = can({ orgId, ...snapshot }, resource, "read").allowed;
  const update = can({ orgId, ...snapshot }, resource, "update").allowed;
  const exportAllowed = can({ orgId, ...snapshot }, resource, "export").allowed;
  const deleteAllowed = can({ orgId, ...snapshot }, resource, "delete").allowed;
  if (!read) throw new Error("NOT_FOUND");
  return FileAssetSchema.parse({ id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes.toString(), storageKey: file.storageKey, version: file.version, classification: file.classification, checksumSha256: file.checksumSha256, createdAt: file.createdAt.toISOString(), downloadUrl: includeDownload && exportAllowed ? await createDownloadUrl(file.storageKey) : null, permissions: { read, update, export: exportAllowed, delete: deleteAllowed } });
}

export async function registerDocsFilesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/pages", async (request, reply) => {
    try {
      const orgId = orgIdOf(request);
      const current = await session(request, orgId);
      const query = request.query as { workspaceId?: string; limit?: string };
      const rows = await repository.listPages(orgId, query.workspaceId ?? undefined, Number(query.limit ?? "100"));
      const result = [];
      for (const row of rows) try { result.push(await pageResponse(orgId, current.userId, row)); } catch (error) { if (!(error instanceof Error && error.message === "NOT_FOUND")) throw error; }
      return reply.send(envelope(request, result));
    } catch (error) { return sendError(request, reply, error); }
  });

  app.post("/v1/pages", async (request, reply) => {
    try {
      idempotency(request);
      const orgId = orgIdOf(request); const current = await session(request, orgId); const input = PageCreateInputSchema.parse(request.body);
      const snapshot = await permissions.getSnapshot(orgId, current.userId, "page", "__collection__");
      const resource = { orgId, type: "page", id: "__collection__", workspaceId: input.workspaceId ?? null, projectId: null, ownerId: null, teamId: null, classification: input.classification ?? null };
      if (!can({ orgId, ...snapshot }, resource, "create").allowed) throw new Error("PERMISSION_DENIED");
      const page = await repository.createPage(orgId, current.userId, input);
      return reply.code(201).send(envelope(request, await pageResponse(orgId, current.userId, page)));
    } catch (error) { return sendError(request, reply, error); }
  });

  app.get("/v1/pages/:id", async (request, reply) => {
    try { const orgId = orgIdOf(request); const current = await session(request, orgId); const { id } = request.params as { id: string }; return reply.send(envelope(request, await pageResponse(orgId, current.userId, await repository.findPage(orgId, id)))); }
    catch (error) { return sendError(request, reply, error); }
  });

  app.patch("/v1/pages/:id", async (request, reply) => {
    try {
      idempotency(request); const orgId = orgIdOf(request); const current = await session(request, orgId); const { id } = request.params as { id: string }; const input = PageUpdateInputSchema.parse(request.body);
      const page = await repository.findPage(orgId, id); if (!page) throw new Error("NOT_FOUND");
      const snapshot = await permissions.getSnapshot(orgId, current.userId, "page", id, page.classification); const resource = { orgId, type: "page", id, workspaceId: page.workspaceId, projectId: null, ownerId: page.ownerId, teamId: null, classification: page.classification };
      if (!can({ orgId, ...snapshot }, resource, "update").allowed) throw new Error("PERMISSION_DENIED");
      if (input.classification !== undefined || input.indexable !== undefined || input.publishedSlug !== undefined) if (!can({ orgId, ...snapshot }, resource, "manage").allowed) throw new Error("PERMISSION_DENIED");
      const updated = await repository.updatePage(orgId, current.userId, id, input);
      return reply.send(envelope(request, await pageResponse(orgId, current.userId, updated)));
    } catch (error) { return sendError(request, reply, error); }
  });

  app.get("/v1/pages/:id/versions", async (request, reply) => {
    try { const orgId = orgIdOf(request); const current = await session(request, orgId); const page = await repository.findPage(orgId, (request.params as { id: string }).id); if (!page) throw new Error("NOT_FOUND"); if (!(await pagePermissions(orgId, current.userId, page)).read) throw new Error("NOT_FOUND"); const versions = await repository.listVersions(orgId, page.id); return reply.send(envelope(request, PageVersionListSchema.parse(versions.map((version) => ({ id: version.id, pageId: version.pageId, version: version.version, summary: version.summary, authorId: version.authorId, snapshotBytes: Buffer.from(version.snapshot).toString("base64"), createdAt: version.createdAt.toISOString() }))))); }
    catch (error) { return sendError(request, reply, error); }
  });

  app.post("/v1/pages/:id/publish", async (request, reply) => {
    try { idempotency(request); const orgId = orgIdOf(request); const current = await session(request, orgId); const { id } = request.params as { id: string }; const input = PagePublishInputSchema.parse(request.body); const page = await repository.findPage(orgId, id); if (!page) throw new Error("NOT_FOUND"); const snapshot = await permissions.getSnapshot(orgId, current.userId, "page", id, page.classification); const resource = { orgId, type: "page", id, workspaceId: page.workspaceId, projectId: null, ownerId: page.ownerId, teamId: null, classification: page.classification }; if (!can({ orgId, ...snapshot }, resource, "manage").allowed) throw new Error("PERMISSION_DENIED"); const updated = await repository.publishPage(orgId, current.userId, id, input.publish ? input.publishedSlug : null); return reply.send(envelope(request, await pageResponse(orgId, current.userId, updated))); }
    catch (error) { return sendError(request, reply, error); }
  });

  app.delete("/v1/pages/:id", async (request, reply) => {
    try { idempotency(request); const orgId = orgIdOf(request); const current = await session(request, orgId); const { id } = request.params as { id: string }; const page = await repository.findPage(orgId, id); if (!page) throw new Error("NOT_FOUND"); const snapshot = await permissions.getSnapshot(orgId, current.userId, "page", id, page.classification); const resource = { orgId, type: "page", id, workspaceId: page.workspaceId, projectId: null, ownerId: page.ownerId, teamId: null, classification: page.classification }; if (!can({ orgId, ...snapshot }, resource, "delete").allowed) throw new Error("PERMISSION_DENIED"); await repository.softDeletePage(orgId, current.userId, id); return reply.send(envelope(request, { deleted: true })); }
    catch (error) { return sendError(request, reply, error); }
  });

  app.post("/v1/files/upload-intent", async (request, reply) => {
    try { idempotency(request); const orgId = orgIdOf(request); const current = await session(request, orgId); const input = FileUploadIntentInputSchema.parse(request.body); const snapshot = await permissions.getSnapshot(orgId, current.userId, "file_asset", "__collection__"); const resource = { orgId, type: "file_asset", id: "__collection__", workspaceId: null, projectId: null, ownerId: current.userId, teamId: null, classification: null }; if (!can({ orgId, ...snapshot }, resource, "create").allowed) throw new Error("PERMISSION_DENIED"); const uploadId = randomUUID(); const fileId = randomUUID(); const storageKey = storageKeyFor(orgId, current.userId, fileId, input.name); const upload = await createUploadUrl({ storageKey, mimeType: input.mimeType }); return reply.send(envelope(request, FileUploadIntentSchema.parse({ uploadId, fileId, storageKey, uploadUrl: upload.uploadUrl, expiresIn: upload.expiresIn }))); }
    catch (error) { return sendError(request, reply, error); }
  });

  app.post("/v1/files/complete", async (request, reply) => {
    try { idempotency(request); const orgId = orgIdOf(request); const current = await session(request, orgId); const input = FileCompleteInputSchema.parse(request.body); const parsed = new URLSearchParams(); parsed.set("uploadId", input.uploadId); const fileId = input.uploadId; const storageKey = storageKeyFor(orgId, current.userId, fileId, input.name); const head = await headObject(storageKey); if (head.sizeBytes !== input.sizeBytes) throw new Error("FILE_SIZE_MISMATCH"); if (head.mimeType && head.mimeType !== input.mimeType) throw new Error("FILE_MIME_MISMATCH"); const file = await repository.createFile(orgId, current.userId, { ...input, storageKey }); return reply.code(201).send(envelope(request, await fileResponse(orgId, current.userId, file, false))); }
    catch (error) { return sendError(request, reply, error); }
  });

  app.get("/v1/files/:id", async (request, reply) => {
    try { const orgId = orgIdOf(request); const current = await session(request, orgId); const file = await repository.findFile(orgId, (request.params as { id: string }).id); return reply.send(envelope(request, await fileResponse(orgId, current.userId, file, true))); }
    catch (error) { return sendError(request, reply, error); }
  });

  app.get("/v1/search/text", async (request, reply) => {
    try { const orgId = orgIdOf(request); const current = await session(request, orgId); const query = FileSearchQuerySchema.parse(request.query); const result = await repository.search(orgId, query.q, query.limit); const pages = []; for (const page of result.pages) try { pages.push(await pageResponse(orgId, current.userId, page)); } catch (error) { if (!(error instanceof Error && error.message === "NOT_FOUND")) throw error; } const files = []; for (const file of result.files) try { files.push(await fileResponse(orgId, current.userId, file, false)); } catch (error) { if (!(error instanceof Error && error.message === "NOT_FOUND")) throw error; } return reply.send(envelope(request, { pages, files })); }
    catch (error) { return sendError(request, reply, error); }
  });
}
