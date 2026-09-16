import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  WorkObjectAttachmentCreateInputSchema,
  WorkObjectAttachmentSchema,
  WorkObjectCommentCreateInputSchema,
  WorkObjectCommentSchema,
  WorkObjectHistoryResponseSchema,
} from "@oryon/contracts/work-experience";
import { can } from "@oryon/core";
import { PermissionRepository, WorkExperienceRepository, WorkObjectRepository } from "@oryon/db/repositories";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";

const dbModule = await import("@oryon/db");
const experiences = new WorkExperienceRepository(dbModule.getPrisma());
const objects = new WorkObjectRepository(dbModule.getPrisma());
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
  const raw = headerString(request, "cookie");
  if (raw) {
    for (const part of raw.split(";")) {
      const separator = part.indexOf("=");
      if (separator > 0 && part.slice(0, separator).trim() === AUTH_COOKIE_NAME) return { token: decodeURIComponent(part.slice(separator + 1).trim()), mode: "session" };
    }
  }
  throw new Error("UNAUTHENTICATED");
}

async function session(request: FastifyRequest, orgId: string) {
  const auth = tokenOf(request);
  const current = await authenticate(auth.token, auth.mode);
  if (current.orgId !== orgId) throw new Error("UNAUTHENTICATED");
  return current;
}

function idempotency(request: FastifyRequest): void {
  if (!headerString(request, "idempotency-key")) throw new Error("IDEMPOTENCY_KEY_MISSING");
}

function envelope(request: FastifyRequest, data: unknown) {
  return { data, meta: { requestId: request.id, durationMs: 0 } };
}

function errorResult(error: unknown): { code: string; status: number; message: string } {
  const message = error instanceof Error ? error.message : "Work experience operation failed";
  if (message === "ORG_HEADER_MISSING") return { code: message, status: 400, message };
  if (message === "IDEMPOTENCY_KEY_MISSING") return { code: "VALIDATION_FAILED", status: 400, message };
  if (message === "UNAUTHENTICATED") return { code: message, status: 401, message };
  if (message === "PERMISSION_DENIED") return { code: message, status: 403, message };
  if (["NOT_FOUND", "FILE_NOT_FOUND", "COMMENT_PARENT_NOT_FOUND"].includes(message)) return { code: "NOT_FOUND", status: 404, message };
  if (message === "CONFLICT") return { code: message, status: 409, message };
  if (error instanceof Error && error.name === "ZodError") return { code: "VALIDATION_FAILED", status: 400, message };
  return { code: "VALIDATION_FAILED", status: 400, message };
}

async function authorizeObject(request: FastifyRequest, action: "read" | "comment" | "update") {
  const orgId = orgIdOf(request);
  const current = await session(request, orgId);
  const { id } = request.params as { id: string };
  const object = await objects.findById(orgId, id);
  if (!object) throw new Error("NOT_FOUND");
  const snapshot = await permissions.getSnapshot(orgId, current.userId, "work_object", object.id, object.classification);
  const resource = { orgId, type: "work_object", id: object.id, workspaceId: object.workspaceId, projectId: null, ownerId: object.ownerId, teamId: null, classification: object.classification };
  if (!can({ orgId, ...snapshot }, resource, action).allowed) throw new Error("NOT_FOUND");
  return { orgId, current, object };
}

function commentResponse(comment: Awaited<ReturnType<WorkExperienceRepository["listComments"]>>[number]) {
  return WorkObjectCommentSchema.parse({
    id: comment.id,
    objectId: comment.objectId ?? comment.targetId,
    parentId: comment.parentId,
    authorId: comment.authorId,
    authorName: comment.author.displayName ?? comment.author.name,
    bodyText: comment.bodyText,
    mentions: comment.mentions,
    isInternal: comment.isInternal,
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  });
}

function attachmentResponse(attachment: Awaited<ReturnType<WorkExperienceRepository["listAttachments"]>>[number]) {
  return WorkObjectAttachmentSchema.parse({
    id: attachment.id,
    fileId: attachment.fileId,
    objectId: attachment.objectId,
    name: attachment.file.name,
    mimeType: attachment.file.mimeType,
    sizeBytes: attachment.file.sizeBytes.toString(),
    version: attachment.file.version,
    createdAt: attachment.createdAt.toISOString(),
  });
}

export async function registerWorkExperienceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/work-objects/:id/comments", async (request, reply) => {
    try {
      const { orgId, object } = await authorizeObject(request, "read");
      const comments = await experiences.listComments(orgId, object.id);
      return reply.send(envelope(request, comments.map(commentResponse)));
    } catch (error) {
      const current = errorResult(error);
      return reply.code(current.status).send({ error: { code: current.code, httpStatus: current.status, message: current.message, requestId: request.id } });
    }
  });

  app.post("/v1/work-objects/:id/comments", async (request, reply) => {
    try {
      idempotency(request);
      const { orgId, current, object } = await authorizeObject(request, "comment");
      const input = WorkObjectCommentCreateInputSchema.parse(request.body);
      const comment = await experiences.createComment(orgId, current.userId, object.id, input);
      return reply.code(201).send(envelope(request, commentResponse(comment)));
    } catch (error) {
      const current = errorResult(error);
      return reply.code(current.status).send({ error: { code: current.code, httpStatus: current.status, message: current.message, requestId: request.id } });
    }
  });

  app.get("/v1/work-objects/:id/attachments", async (request, reply) => {
    try {
      const { orgId, object } = await authorizeObject(request, "read");
      const attachments = await experiences.listAttachments(orgId, object.id);
      return reply.send(envelope(request, attachments.filter((item) => !item.file.deletedAt).map(attachmentResponse)));
    } catch (error) {
      const current = errorResult(error);
      return reply.code(current.status).send({ error: { code: current.code, httpStatus: current.status, message: current.message, requestId: request.id } });
    }
  });

  app.post("/v1/work-objects/:id/attachments", async (request, reply) => {
    try {
      idempotency(request);
      const { orgId, current, object } = await authorizeObject(request, "update");
      const input = WorkObjectAttachmentCreateInputSchema.parse(request.body);
      const attachment = await experiences.attachFile(orgId, current.userId, object.id, input);
      return reply.code(201).send(envelope(request, attachmentResponse(attachment)));
    } catch (error) {
      const current = errorResult(error);
      return reply.code(current.status).send({ error: { code: current.code, httpStatus: current.status, message: current.message, requestId: request.id } });
    }
  });

  app.get("/v1/work-objects/:id/history", async (request, reply) => {
    try {
      const { orgId, object } = await authorizeObject(request, "read");
      const history = await experiences.listHistory(orgId, object.id);
      return reply.send(envelope(request, WorkObjectHistoryResponseSchema.parse(history.map((item) => ({ ...item, occurredAt: item.occurredAt.toISOString() })))));
    } catch (error) {
      const current = errorResult(error);
      return reply.code(current.status).send({ error: { code: current.code, httpStatus: current.status, message: current.message, requestId: request.id } });
    }
  });
}
