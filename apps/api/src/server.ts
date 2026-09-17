import { AuthRequestLinkResponseSchema, AuthVerifyLinkResponseSchema } from "@oryon/contracts/identity";
import { HealthResponseSchema } from "@oryon/contracts/health";
import { closePrisma, getPrisma } from "@oryon/db";
import Fastify from "fastify";
import { registerAgentAutomationRoutes } from "./agents.js";
import { registerCommunicationRoutesV2 } from "./communication-v2.js";
import { registerDocsFilesRoutesV2 } from "./docs-files-v2.js";
import { registerGraphRoutes } from "./graph.js";
import { registerMeetingRoutesV2 } from "./meetings-v2.js";
import { registerPageAttachmentRoutes } from "./page-attachments.js";
import { registerPermissionRoutes } from "./permissions.js";
import { registerSearchAiRoutes, closeAiSearchResources } from "./search-ai.js";
import { registerWorkExperienceRoutes } from "./work-experience.js";
import { registerWorkObjectRoutes } from "./work-objects.js";
import { registerDomainTemplateRoutes } from "./domain-templates.js";
import { registerPlatformRoutes } from "./platform.js";
import { registerOpenApiRoutes } from "./openapi.js";
import { installSecurityHardening } from "./security.js";
import { registerSearchAiRoutes, closeAiSearchResources } from "./search-ai.js";
import { registerAgentAutomationRoutes } from "./agents.js";
import { AUTH_COOKIE_NAME, authenticate, identityForSession, requestMagicLink, revokeSession, verifyMagicLink } from "./auth.js";
import { registerRealtime } from "./realtime.js";
const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
installSecurityHardening(app);
const io = registerRealtime(app);
function envelope<T>(request: { id: string }, data: T) { return { data, meta: { requestId: request.id, durationMs: 0 } }; }
function errorEnvelope(request: { id: string }, code: string, httpStatus: number, message: string) { return { error: { code, httpStatus, message, requestId: request.id } }; }
function getOrg(request: { headers: Record<string, string | string[] | undefined> }): string { const value = request.headers["x-oryon-org"]; const orgId = Array.isArray(value) ? value[0] : value; if (!orgId) throw new Error("ORG_HEADER_MISSING"); return orgId; }
function getIdempotencyKey(request: { headers: Record<string, string | string[] | undefined> }): string { const value = request.headers["idempotency-key"]; const key = Array.isArray(value) ? value[0] : value; if (!key) throw new Error("IDEMPOTENCY_KEY_MISSING"); return key; }
function getCookie(request: { headers: Record<string, string | string[] | undefined> }, name: string): string | undefined { const raw = request.headers.cookie; if (!raw || Array.isArray(raw)) return undefined; for (const chunk of raw.split(";")) { const separator = chunk.indexOf("="); if (separator < 0) continue; const key = chunk.slice(0, separator).trim(); if (key === name) return decodeURIComponent(chunk.slice(separator + 1).trim()); } return undefined; }
function bearerToken(request: { headers: Record<string, string | string[] | undefined> }): string | undefined { const raw = request.headers.authorization; if (!raw || Array.isArray(raw) || !raw.startsWith("Bearer ")) return undefined; return raw.slice("Bearer ".length).trim(); }
function setSessionCookie(reply: { header: (name: string, value: string) => void }, token: string): void { const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""; reply.header("Set-Cookie", `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Number(process.env.ORYON_AUTH_SESSION_TTL_SECONDS ?? "2592000")}${secure}`); }
function clearSessionCookie(reply: { header: (name: string, value: string) => void }): void { reply.header("Set-Cookie", `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }
const healthPayload = () => HealthResponseSchema.parse({ status: "ok", service: "oryon-api", version: "0.1.0", timestamp: new Date().toISOString() });
app.get("/health", async (_request, reply) => reply.send(healthPayload()));
app.get("/v1/health", async (request, reply) => reply.send(envelope(request, healthPayload())));
app.post("/v1/auth/request-link", async (request, reply) => { try { getIdempotencyKey(request); const orgId = getOrg(request); const result = await requestMagicLink(orgId, request.body); return reply.send(envelope(request, AuthRequestLinkResponseSchema.parse(result))); } catch (error) { const message = error instanceof Error ? error.message : "Unable to request sign-in link"; const code = message === "ORG_HEADER_MISSING" ? "ORG_HEADER_MISSING" : message.includes("Email provider") ? "INTERNAL" : message === "IDEMPOTENCY_KEY_MISSING" ? "VALIDATION_FAILED" : "VALIDATION_FAILED"; const status = code === "ORG_HEADER_MISSING" ? 400 : code === "INTERNAL" ? 500 : 400; return reply.code(status).send(errorEnvelope(request, code, status, message)); } });
app.post("/v1/auth/verify-link", async (request, reply) => { try { getIdempotencyKey(request); const orgId = getOrg(request); const result = await verifyMagicLink(orgId, request.body); setSessionCookie(reply, result.sessionToken); return reply.send(envelope(request, AuthVerifyLinkResponseSchema.parse({ accessToken: result.accessToken, expiresAt: result.expiresAt }))); } catch (error) { const message = error instanceof Error ? error.message : "Unable to verify sign-in link"; const status = message.includes("Organization mismatch") || message.includes("Invalid") || message.includes("expired") ? 401 : 400; return reply.code(status).send(errorEnvelope(request, status === 401 ? "UNAUTHENTICATED" : "VALIDATION_FAILED", status, message)); } });
app.get("/v1/auth/session", async (request, reply) => { try { const orgId = getOrg(request); const bearer = bearerToken(request); const cookie = getCookie(request, AUTH_COOKIE_NAME); if (!bearer && !cookie) return reply.code(401).send(errorEnvelope(request, "UNAUTHENTICATED", 401, "Authentication required")); const currentSession = bearer ? await authenticate(bearer, "bearer") : await authenticate(cookie as string, "session"); if (currentSession.orgId !== orgId) return reply.code(401).send(errorEnvelope(request, "UNAUTHENTICATED", 401, "Organization mismatch")); return reply.send(envelope(request, await identityForSession(currentSession))); } catch (error) { const message = error instanceof Error ? error.message : "Authentication required"; return reply.code(401).send(errorEnvelope(request, "UNAUTHENTICATED", 401, message)); } });
app.post("/v1/auth/logout", async (request, reply) => { try { getIdempotencyKey(request); getOrg(request); const token = getCookie(request, AUTH_COOKIE_NAME); if (token) await revokeSession(token); clearSessionCookie(reply); return reply.send(envelope(request, { loggedOut: true })); } catch (error) { const message = error instanceof Error ? error.message : "Unable to log out"; const status = message === "ORG_HEADER_MISSING" ? 400 : 401; return reply.code(status).send(errorEnvelope(request, status === 400 ? "ORG_HEADER_MISSING" : "UNAUTHENTICATED", status, message)); } });
await registerOpenApiRoutes(app);
await registerPermissionRoutes(app);
await registerWorkObjectRoutes(app);
await registerWorkExperienceRoutes(app);
await registerDocsFilesRoutesV2(app);
await registerPageAttachmentRoutes(app);
await registerCommunicationRoutesV2(app, { to: (room) => ({ emit: (event, payload) => io.to(room).emit(event, payload) }) });
await registerMeetingRoutesV2(app);
await registerGraphRoutes(app);
await registerDomainTemplateRoutes(app);
await registerPlatformRoutes(app);
await registerSearchAiRoutes(app);
await registerAgentAutomationRoutes(app);
try { await getPrisma().$queryRawUnsafe("SELECT 1"); await app.listen({ port: 4000, host: "0.0.0.0" }); } catch (error) { app.log.error(error); await io.close(); await closeAiSearchResources(); await closePrisma(); process.exitCode = 1; }
process.on("SIGTERM", async () => { await io.close(); await closeAiSearchResources(); await app.close(); await closePrisma(); });
process.on("SIGINT", async () => { await io.close(); await closeAiSearchResources(); await app.close(); await closePrisma(); });
