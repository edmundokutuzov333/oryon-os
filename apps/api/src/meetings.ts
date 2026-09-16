import type { FastifyInstance, FastifyRequest } from "fastify";
import { AccessToken } from "livekit-server-sdk";
import { can } from "@oryon/core";
import {
	MeetingArtifactConvertInputSchema,
	MeetingArtifactConvertResponseSchema,
	MeetingArtifactCreateInputSchema,
	MeetingCreateInputSchema,
	MeetingJoinResponseSchema,
	MeetingListQuerySchema,
	MeetingParticipantCreateInputSchema,
	MeetingParticipantUpdateInputSchema,
	MeetingSchema,
	MeetingStateInputSchema,
	MeetingUpdateInputSchema,
} from "@oryon/contracts/meeting";
import { MeetingRepository } from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";
import { PermissionRepository } from "@oryon/db/repositories";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";

const meetings = new MeetingRepository(getPrisma());
const permissions = new PermissionRepository();

function orgIdOf(request: FastifyRequest): string {
	const value = request.headers["x-oryon-org"];
	if (typeof value !== "string" || value.length === 0) throw new Error("ORG_HEADER_MISSING");
	return value;
}
function idempotency(request: FastifyRequest): void {
	const value = request.headers["idempotency-key"];
	if (typeof value !== "string" || value.length === 0) throw new Error("IDEMPOTENCY_KEY_MISSING");
}
function cookieValue(request: FastifyRequest): string | undefined {
	const raw = request.headers.cookie;
	if (typeof raw !== "string") return undefined;
	for (const item of raw.split(";")) {
		const separator = item.indexOf("=");
		if (separator < 0) continue;
		if (item.slice(0, separator).trim() === AUTH_COOKIE_NAME) return decodeURIComponent(item.slice(separator + 1).trim());
	}
	return undefined;
}
function bearerValue(request: FastifyRequest): string | undefined {
	const value = request.headers.authorization;
	if (typeof value !== "string" || !value.startsWith("Bearer ")) return undefined;
	return value.slice("Bearer ".length).trim();
}
async function actor(request: FastifyRequest, orgId: string) {
	const bearer = bearerValue(request);
	const token = bearer ?? cookieValue(request);
	if (!token) throw new Error("UNAUTHENTICATED");
	const session = await authenticate(token, bearer ? "bearer" : "session");
	if (session.orgId !== orgId) throw new Error("UNAUTHENTICATED");
	return session;
}
function envelope(request: FastifyRequest, data: unknown) { return { data, meta: { requestId: request.id, durationMs: 0 } }; }
function errorEnvelope(request: FastifyRequest, code: string, httpStatus: number, message: string) { return { error: { code, httpStatus, message, requestId: request.id } }; }
function statusFor(error: unknown): { code: string; status: number; message: string } {
	const message = error instanceof Error ? error.message : "Meeting operation failed";
	if (message === "ORG_HEADER_MISSING") return { code: "ORG_HEADER_MISSING", status: 400, message };
	if (message === "IDEMPOTENCY_KEY_MISSING") return { code: "VALIDATION_FAILED", status: 400, message };
	if (message === "UNAUTHENTICATED") return { code: "UNAUTHENTICATED", status: 401, message };
	if (message === "PERMISSION_DENIED" || message === "permission_denied") return { code: "PERMISSION_DENIED", status: 403, message };
	if (message === "NOT_FOUND" || message === "USER_NOT_FOUND" || message === "PARTICIPANT_NOT_FOUND") return { code: "NOT_FOUND", status: 404, message };
	if (message === "ROOM_CONFLICT" || message === "MEETING_TERMINAL") return { code: "CONFLICT", status: 409, message };
	if (message === "ROOM_NOT_FOUND" || message === "INVALID_MEETING_TIME" || message === "PARTICIPANT_IDENTITY_REQUIRED" || message === "ARTIFACT_NOT_CONVERTIBLE" || message === "OBJECT_TYPE_NOT_FOUND" || message === "INVALID_STATUS") return { code: "VALIDATION_FAILED", status: 400, message };
	return { code: "VALIDATION_FAILED", status: 400, message };
}
function meetingResource(orgId: string, meeting: { id: string; createdBy: string }) {
	return { orgId, type: "meeting", id: meeting.id, workspaceId: null, projectId: null, ownerId: meeting.createdBy, teamId: null, classification: null };
}
async function requirePermission(orgId: string, actorId: string, meeting: { id: string; createdBy: string }, action: "read" | "update" | "delete" | "comment" | "manage") {
	const snapshot = await permissions.getSnapshot(orgId, actorId, "meeting", meeting.id);
	const decision = can({ orgId, ...snapshot }, meetingResource(orgId, meeting), action);
	if (!decision.allowed) throw new Error("PERMISSION_DENIED");
	return decision;
}
function iso(value: Date | null): string | null { return value ? value.toISOString() : null; }
function agenda(value: unknown): string[] { return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : []; }
function serializeMeeting(row: Awaited<ReturnType<MeetingRepository["findById"]>>, permission: { read: boolean; update: boolean; delete: boolean; comment: boolean; manage: boolean }) {
	if (!row) return null;
	return MeetingSchema.parse({
		id: row.id,
		orgId: row.orgId,
		objectId: row.objectId,
		title: row.title,
		agenda: agenda(row.agendaJson),
		startAt: row.startAt.toISOString(),
		endAt: row.endAt.toISOString(),
		timezone: row.timezone,
		roomId: row.roomId,
		joinUrl: row.joinUrl,
		provider: row.provider,
		externalRef: row.externalRef,
		recurrenceRule: row.recurrenceRule,
		e2ee: row.e2ee,
		aiEnabled: row.aiEnabled,
		aiDisabledAt: iso(row.aiDisabledAt),
		effectivenessScore: row.effectivenessScore,
		state: row.state,
		createdBy: row.createdBy,
		createdAt: row.createdAt.toISOString(),
		participants: row.participants.map((participant) => ({ id: participant.id, userId: participant.userId, email: participant.email, role: participant.role, rsvp: participant.rsvp, joinedAt: iso(participant.joinedAt), leftAt: iso(participant.leftAt), talkTimeMs: participant.talkTimeMs === null ? null : participant.talkTimeMs.toString(), user: participant.user ? { id: participant.user.id, name: participant.user.name, displayName: participant.user.displayName, avatarUrl: participant.user.avatarUrl } : null })),
		artifacts: row.artifacts.map((artifact) => ({ id: artifact.id, meetingId: artifact.meetingId, kind: artifact.kind, fileId: artifact.fileId, pageId: artifact.pageId, contentJson: artifact.contentJson, transcript: artifact.transcript, language: artifact.language, createdAt: artifact.createdAt.toISOString() })),
		permissions: permission,
	});
}
function livekitConfig(): { apiKey: string; apiSecret: string; wsUrl: string } {
	const apiKey = process.env.LIVEKIT_API_KEY ?? (process.env.NODE_ENV === "production" ? undefined : "devkey");
	const apiSecret = process.env.LIVEKIT_API_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "secret");
	const rawUrl = process.env.LIVEKIT_URL ?? "http://localhost:7880";
	if (!apiKey || !apiSecret) throw new Error("LIVEKIT_CONFIG_MISSING");
	return { apiKey, apiSecret, wsUrl: rawUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:") };
}

export async function registerMeetingRoutes(app: FastifyInstance): Promise<void> {
	app.get("/v1/rooms", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			await actor(request, orgId);
			const rows = await getPrisma().room.findMany({ where: { orgId, bookable: true }, orderBy: [{ name: "asc" }] });
			return reply.send(envelope(request, rows.map((row) => ({ id: row.id, name: row.name, capacity: row.capacity, equipment: row.equipment, floor: row.floor, buildingId: row.buildingId, bookable: row.bookable }))));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.get("/v1/meetings", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const input = MeetingListQuerySchema.parse(request.query);
			const rows = await meetings.list({ orgId, ...input });
			const visible = [] as ReturnType<typeof MeetingSchema.parse>[];
			for (const row of rows) {
				const snapshot = await permissions.getSnapshot(orgId, session.userId, "meeting", row.id);
				const decision = can({ orgId, ...snapshot }, meetingResource(orgId, row), "read");
				if (!decision.allowed) continue;
				const data = serializeMeeting(row, { read: true, update: can({ orgId, ...snapshot }, meetingResource(orgId, row), "update").allowed, delete: can({ orgId, ...snapshot }, meetingResource(orgId, row), "delete").allowed, comment: can({ orgId, ...snapshot }, meetingResource(orgId, row), "comment").allowed, manage: can({ orgId, ...snapshot }, meetingResource(orgId, row), "manage").allowed });
				if (data) visible.push(data);
			}
			return reply.send(envelope(request, visible));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/meetings", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const snapshot = await permissions.getSnapshot(orgId, session.userId, "meeting", orgId);
			if (!can({ orgId, ...snapshot }, { orgId, type: "meeting", id: orgId, workspaceId: null, projectId: null, ownerId: null, teamId: null, classification: null }, "create").allowed) throw new Error("PERMISSION_DENIED");
			const input = MeetingCreateInputSchema.parse(request.body);
			const id = await meetings.create(orgId, session.userId, input);
			const row = await meetings.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			const data = serializeMeeting(row, { read: true, update: true, delete: true, comment: true, manage: true });
			return reply.code(201).send(envelope(request, data));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.get("/v1/meetings/:id", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const id = (request.params as { id?: string }).id;
			if (!id) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			const snapshot = await permissions.getSnapshot(orgId, session.userId, "meeting", row.id);
			if (!can({ orgId, ...snapshot }, meetingResource(orgId, row), "read").allowed) throw new Error("NOT_FOUND");
			const permission = { read: true, update: can({ orgId, ...snapshot }, meetingResource(orgId, row), "update").allowed, delete: can({ orgId, ...snapshot }, meetingResource(orgId, row), "delete").allowed, comment: can({ orgId, ...snapshot }, meetingResource(orgId, row), "comment").allowed, manage: can({ orgId, ...snapshot }, meetingResource(orgId, row), "manage").allowed };
			return reply.send(envelope(request, serializeMeeting(row, permission)));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.patch("/v1/meetings/:id", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const id = (request.params as { id?: string }).id;
			if (!id) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await requirePermission(orgId, session.userId, row, "update");
			const input = MeetingUpdateInputSchema.parse(request.body);
			await meetings.update(orgId, session.userId, id, input);
			return reply.send(envelope(request, serializeMeeting(await meetings.findById(orgId, id), { read: true, update: true, delete: true, comment: true, manage: true })));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.delete("/v1/meetings/:id", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const id = (request.params as { id?: string }).id;
			if (!id) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await requirePermission(orgId, session.userId, row, "manage");
			await meetings.changeState(orgId, session.userId, id, "CANCELLED");
			return reply.send(envelope(request, { cancelled: true }));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/meetings/:id/state", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const id = (request.params as { id?: string }).id;
			if (!id) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await requirePermission(orgId, session.userId, row, "manage");
			const input = MeetingStateInputSchema.parse(request.body);
			await meetings.changeState(orgId, session.userId, id, input.state);
			return reply.send(envelope(request, serializeMeeting(await meetings.findById(orgId, id), { read: true, update: true, delete: true, comment: true, manage: true })));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/meetings/:id/participants", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const id = (request.params as { id?: string }).id;
			if (!id) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await requirePermission(orgId, session.userId, row, "manage");
			return reply.code(201).send(envelope(request, await meetings.addParticipant(orgId, session.userId, id, MeetingParticipantCreateInputSchema.parse(request.body))));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.patch("/v1/meetings/:id/participants/:participantId", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const params = request.params as { id?: string; participantId?: string };
			if (!params.id || !params.participantId) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, params.id);
			if (!row) throw new Error("NOT_FOUND");
			const participant = row.participants.find((entry) => entry.id === params.participantId);
			if (!participant) throw new Error("NOT_FOUND");
			const input = MeetingParticipantUpdateInputSchema.parse(request.body);
			const ownRsvpOnly = participant.userId === session.userId && input.rsvp !== undefined && input.role === undefined;
			if (!ownRsvpOnly) await requirePermission(orgId, session.userId, row, "manage");
			return reply.send(envelope(request, await meetings.updateParticipant(orgId, session.userId, params.id, params.participantId, input)));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/meetings/:id/join", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const id = (request.params as { id?: string }).id;
			if (!id) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await requirePermission(orgId, session.userId, row, "read");
			const participant = row.participants.find((entry) => entry.userId === session.userId);
			if (!participant) throw new Error("PARTICIPANT_NOT_FOUND");
			const config = livekitConfig();
			const roomName = `oryon-meeting:${id}`;
			const token = await new AccessToken(config.apiKey, config.apiSecret, { identity: session.userId, name: participant.user?.displayName ?? participant.user?.name ?? session.userId }).addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true }).toJwt();
			await meetings.markJoined(orgId, session.userId, id);
			return reply.send(envelope(request, MeetingJoinResponseSchema.parse({ meetingId: id, roomName, wsUrl: config.wsUrl, token, participantId: participant.id })));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/meetings/:id/leave", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const id = (request.params as { id?: string }).id;
			if (!id) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await requirePermission(orgId, session.userId, row, "read");
			await meetings.markLeft(orgId, session.userId, id);
			return reply.send(envelope(request, { left: true }));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.get("/v1/meetings/:id/artifacts", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const id = (request.params as { id?: string }).id;
			if (!id) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await requirePermission(orgId, session.userId, row, "read");
			return reply.send(envelope(request, row.artifacts.map((artifact) => ({ id: artifact.id, meetingId: artifact.meetingId, kind: artifact.kind, fileId: artifact.fileId, pageId: artifact.pageId, contentJson: artifact.contentJson, transcript: artifact.transcript, language: artifact.language, createdAt: artifact.createdAt.toISOString() }))));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/meetings/:id/artifacts", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const id = (request.params as { id?: string }).id;
			if (!id) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await requirePermission(orgId, session.userId, row, "update");
			return reply.code(201).send(envelope(request, await meetings.createArtifact(orgId, session.userId, id, MeetingArtifactCreateInputSchema.parse(request.body))));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});

	app.post("/v1/meetings/:id/artifacts/:artifactId/convert", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await actor(request, orgId);
			const params = request.params as { id?: string; artifactId?: string };
			if (!params.id || !params.artifactId) throw new Error("NOT_FOUND");
			const row = await meetings.findById(orgId, params.id);
			if (!row) throw new Error("NOT_FOUND");
			await requirePermission(orgId, session.userId, row, "update");
			const input = MeetingArtifactConvertInputSchema.parse(request.body);
			const snapshot = await permissions.getSnapshot(orgId, session.userId, "work_object", orgId);
			if (!can({ orgId, ...snapshot }, { orgId, type: "work_object", id: orgId, workspaceId: input.workspaceId ?? null, projectId: null, ownerId: null, teamId: null, classification: null }, "create").allowed) throw new Error("PERMISSION_DENIED");
			return reply.code(201).send(envelope(request, MeetingArtifactConvertResponseSchema.parse(await meetings.convertArtifact(orgId, session.userId, params.id, params.artifactId, input))));
		} catch (error) {
			const current = statusFor(error);
			return reply.code(current.status).send(errorEnvelope(request, current.code, current.status, current.message));
		}
	});
}
