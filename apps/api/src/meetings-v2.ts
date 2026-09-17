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
import {
	meetingStore,
	roomStore,
} from "@oryon/db/repositories/meeting-api.repository.js";
import { PermissionRepository } from "@oryon/db/repositories";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";

const permissionStore = new PermissionRepository();

type Action = "read" | "update" | "delete" | "comment" | "manage";
type MeetingRecord = {
	id: string;
	orgId: string;
	createdBy: string;
	workspaceId?: string | null;
	objectId?: string | null;
	title: string;
};

function orgIdOf(request: FastifyRequest): string {
	const value = request.headers["x-oryon-org"];
	if (typeof value !== "string" || value.length === 0)
		throw new Error("ORG_HEADER_MISSING");
	return value;
}
function idempotency(request: FastifyRequest): void {
	const value = request.headers["idempotency-key"];
	if (typeof value !== "string" || value.length === 0)
		throw new Error("IDEMPOTENCY_KEY_MISSING");
}
function tokenOf(request: FastifyRequest): string | undefined {
	const bearer = request.headers.authorization;
	if (typeof bearer === "string" && bearer.startsWith("Bearer "))
		return bearer.slice(7).trim();
	const raw = request.headers.cookie;
	if (typeof raw !== "string") return undefined;
	for (const part of raw.split(";")) {
		const at = part.indexOf("=");
		if (at < 0) continue;
		if (part.slice(0, at).trim() === AUTH_COOKIE_NAME)
			return decodeURIComponent(part.slice(at + 1).trim());
	}
	return undefined;
}
async function principal(request: FastifyRequest, orgId: string) {
	const bearer = request.headers.authorization;
	const bearerMode = typeof bearer === "string" && bearer.startsWith("Bearer ");
	const token = tokenOf(request);
	if (!token) throw new Error("UNAUTHENTICATED");
	const session = await authenticate(token, bearerMode ? "bearer" : "session");
	if (session.orgId !== orgId) throw new Error("UNAUTHENTICATED");
	return session;
}
function replyEnvelope(request: FastifyRequest, data: unknown) {
	return { data, meta: { requestId: request.id, durationMs: 0 } };
}
function errorReply(request: FastifyRequest, error: unknown) {
	const message =
		error instanceof Error ? error.message : "Meeting operation failed";
	const map: Record<string, [string, number]> = {
		ORG_HEADER_MISSING: ["ORG_HEADER_MISSING", 400],
		IDEMPOTENCY_KEY_MISSING: ["VALIDATION_FAILED", 400],
		UNAUTHENTICATED: ["UNAUTHENTICATED", 401],
		PERMISSION_DENIED: ["PERMISSION_DENIED", 403],
		NOT_FOUND: ["NOT_FOUND", 404],
		USER_NOT_FOUND: ["NOT_FOUND", 404],
		PARTICIPANT_NOT_FOUND: ["NOT_FOUND", 404],
		ROOM_NOT_FOUND: ["NOT_FOUND", 404],
		ROOM_CONFLICT: ["CONFLICT", 409],
		MEETING_TERMINAL: ["CONFLICT", 409],
		INVALID_MEETING_TIME: ["VALIDATION_FAILED", 400],
		PARTICIPANT_IDENTITY_REQUIRED: ["VALIDATION_FAILED", 400],
		ARTIFACT_NOT_CONVERTIBLE: ["VALIDATION_FAILED", 400],
		OBJECT_TYPE_NOT_FOUND: ["VALIDATION_FAILED", 400],
		INVALID_STATUS: ["VALIDATION_FAILED", 400],
		LIVEKIT_CONFIG_MISSING: ["INTERNAL", 500],
		MEETING_STATE_INVALID: ["VALIDATION_FAILED", 400],
	};
	const [code, status] = map[message] ?? ["VALIDATION_FAILED", 400];
	return {
		code,
		status,
		response: {
			error: { code, httpStatus: status, message, requestId: request.id },
		},
	};
}
function meetingResource(orgId: string, meeting: MeetingRecord) {
	return {
		orgId,
		type: "meeting",
		id: meeting.id,
		workspaceId: meeting.workspaceId ?? null,
		projectId: null,
		ownerId: meeting.createdBy,
		teamId: null,
		classification: null,
	};
}
async function authorize(
	orgId: string,
	actorId: string,
	meeting: MeetingRecord,
	action: Action,
) {
	const snapshot = await permissionStore.getSnapshot(
		orgId,
		actorId,
		"meeting",
		meeting.id,
	);
	const decision = can(
		{ orgId, ...snapshot },
		meetingResource(orgId, meeting),
		action,
	);
	if (!decision.allowed) throw new Error("PERMISSION_DENIED");
	return snapshot;
}
function serialized(
	row: Awaited<ReturnType<typeof meetingStore.findById>>,
	permission: {
		read: boolean;
		update: boolean;
		delete: boolean;
		comment: boolean;
		manage: boolean;
	},
) {
	if (!row) return null;
	const agenda =
		Array.isArray(row.agendaJson) &&
		row.agendaJson.every((value) => typeof value === "string")
			? row.agendaJson
			: [];
	return MeetingSchema.parse({
		id: row.id,
		orgId: row.orgId,
		objectId: row.objectId,
		title: row.title,
		agenda,
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
		aiDisabledAt: row.aiDisabledAt?.toISOString() ?? null,
		effectivenessScore: row.effectivenessScore,
		state: row.state,
		createdBy: row.createdBy,
		createdAt: row.createdAt.toISOString(),
		participants: row.participants.map((participant) => ({
			id: participant.id,
			userId: participant.userId,
			email: participant.email,
			role: participant.role,
			rsvp: participant.rsvp,
			joinedAt: participant.joinedAt?.toISOString() ?? null,
			leftAt: participant.leftAt?.toISOString() ?? null,
			talkTimeMs:
				participant.talkTimeMs === null
					? null
					: participant.talkTimeMs.toString(),
			user: participant.user
				? {
						id: participant.user.id,
						name: participant.user.name,
						displayName: participant.user.displayName,
						avatarUrl: participant.user.avatarUrl,
					}
				: null,
		})),
		artifacts: row.artifacts.map((artifact) => ({
			id: artifact.id,
			meetingId: artifact.meetingId,
			kind: artifact.kind,
			fileId: artifact.fileId,
			pageId: artifact.pageId,
			contentJson: artifact.contentJson,
			transcript: artifact.transcript,
			language: artifact.language,
			createdAt: artifact.createdAt.toISOString(),
		})),
		permissions: permission,
	});
}
function livekit() {
	const apiKey =
		process.env.LIVEKIT_API_KEY ??
		(process.env.NODE_ENV === "production" ? undefined : "devkey");
	const apiSecret =
		process.env.LIVEKIT_API_SECRET ??
		(process.env.NODE_ENV === "production" ? undefined : "secret");
	const configuredUrl = process.env.LIVEKIT_URL ?? "http://localhost:7880";
	if (!apiKey || !apiSecret) throw new Error("LIVEKIT_CONFIG_MISSING");
	return {
		apiKey,
		apiSecret,
		wsUrl: configuredUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:"),
	};
}

export async function registerMeetingRoutesV2(
	app: FastifyInstance,
): Promise<void> {
	app.get("/v1/rooms", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			await principal(request, orgId);
			const rows = await roomStore.listBookable(orgId);
			return reply.send(
				replyEnvelope(
					request,
					rows.map((room) => ({
						id: room.id,
						name: room.name,
						capacity: room.capacity,
						equipment: room.equipment,
						floor: room.floor,
						buildingId: room.buildingId,
						bookable: room.bookable,
					})),
				),
			);
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.get("/v1/meetings", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const query = MeetingListQuerySchema.parse(request.query);
			const rows = await meetingStore.list({ orgId, ...query });
			const output = [];
			for (const row of rows) {
				const snapshot = await permissionStore.getSnapshot(
					orgId,
					session.userId,
					"meeting",
					row.id,
				);
				if (
					!can({ orgId, ...snapshot }, meetingResource(orgId, row), "read")
						.allowed
				)
					continue;
				const resource = meetingResource(orgId, row);
				output.push(
					serialized(row, {
						read: true,
						update: can({ orgId, ...snapshot }, resource, "update").allowed,
						delete: can({ orgId, ...snapshot }, resource, "delete").allowed,
						comment: can({ orgId, ...snapshot }, resource, "comment").allowed,
						manage: can({ orgId, ...snapshot }, resource, "manage").allowed,
					}),
				);
			}
			return reply.send(replyEnvelope(request, output));
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.post("/v1/meetings", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const snapshot = await permissionStore.getSnapshot(
				orgId,
				session.userId,
				"meeting",
				orgId,
			);
			const collection = {
				orgId,
				type: "meeting",
				id: orgId,
				workspaceId: null,
				projectId: null,
				ownerId: null,
				teamId: null,
				classification: null,
			};
			if (!can({ orgId, ...snapshot }, collection, "create").allowed)
				throw new Error("PERMISSION_DENIED");
			const id = await meetingStore.create(
				orgId,
				session.userId,
				MeetingCreateInputSchema.parse(request.body),
			);
			const row = await meetingStore.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			return reply
				.code(201)
				.send(
					replyEnvelope(
						request,
						serialized(row, {
							read: true,
							update: true,
							delete: true,
							comment: true,
							manage: true,
						}),
					),
				);
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.get("/v1/meetings/:id", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await meetingStore.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			const snapshot = await permissionStore.getSnapshot(
				orgId,
				session.userId,
				"meeting",
				row.id,
			);
			if (
				!can({ orgId, ...snapshot }, meetingResource(orgId, row), "read")
					.allowed
			)
				throw new Error("NOT_FOUND");
			const resource = meetingResource(orgId, row);
			return reply.send(
				replyEnvelope(
					request,
					serialized(row, {
						read: true,
						update: can({ orgId, ...snapshot }, resource, "update").allowed,
						delete: can({ orgId, ...snapshot }, resource, "delete").allowed,
						comment: can({ orgId, ...snapshot }, resource, "comment").allowed,
						manage: can({ orgId, ...snapshot }, resource, "manage").allowed,
					}),
				),
			);
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.patch("/v1/meetings/:id", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await meetingStore.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(orgId, session.userId, row, "update");
			await meetingStore.update(
				orgId,
				session.userId,
				id,
				MeetingUpdateInputSchema.parse(request.body),
			);
			const updated = await meetingStore.findById(orgId, id);
			return reply.send(
				replyEnvelope(
					request,
					serialized(updated, {
						read: true,
						update: true,
						delete: true,
						comment: true,
						manage: true,
					}),
				),
			);
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.delete("/v1/meetings/:id", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await meetingStore.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(orgId, session.userId, row, "manage");
			await meetingStore.changeState(orgId, session.userId, id, "CANCELLED");
			return reply.send(replyEnvelope(request, { cancelled: true }));
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.post("/v1/meetings/:id/state", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await meetingStore.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(orgId, session.userId, row, "manage");
			const input = MeetingStateInputSchema.parse(request.body);
			await meetingStore.changeState(orgId, session.userId, id, input.state);
			return reply.send(
				replyEnvelope(
					request,
					serialized(await meetingStore.findById(orgId, id), {
						read: true,
						update: true,
						delete: true,
						comment: true,
						manage: true,
					}),
				),
			);
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.post("/v1/meetings/:id/participants", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await meetingStore.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(orgId, session.userId, row, "manage");
			return reply
				.code(201)
				.send(
					replyEnvelope(
						request,
						await meetingStore.addParticipant(
							orgId,
							session.userId,
							id,
							MeetingParticipantCreateInputSchema.parse(request.body),
						),
					),
				);
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.patch(
		"/v1/meetings/:id/participants/:participantId",
		async (request, reply) => {
			try {
				idempotency(request);
				const orgId = orgIdOf(request);
				const session = await principal(request, orgId);
				const params = request.params as { id: string; participantId: string };
				const row = await meetingStore.findById(orgId, params.id);
				if (!row) throw new Error("NOT_FOUND");
				const participant = row.participants.find(
					(entry) => entry.id === params.participantId,
				);
				if (!participant) throw new Error("NOT_FOUND");
				const input = MeetingParticipantUpdateInputSchema.parse(request.body);
				const selfRsvp =
					participant.userId === session.userId &&
					input.rsvp !== undefined &&
					input.role === undefined;
				if (!selfRsvp) await authorize(orgId, session.userId, row, "manage");
				return reply.send(
					replyEnvelope(
						request,
						await meetingStore.updateParticipant(
							orgId,
							session.userId,
							params.id,
							params.participantId,
							input,
						),
					),
				);
			} catch (error) {
				const result = errorReply(request, error);
				return reply.code(result.status).send(result.response);
			}
		},
	);
	app.post("/v1/meetings/:id/join", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await meetingStore.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(orgId, session.userId, row, "read");
			const participant = row.participants.find(
				(entry) => entry.userId === session.userId,
			);
			if (!participant) throw new Error("PARTICIPANT_NOT_FOUND");
			if (row.state === "CANCELLED" || row.state === "ENDED")
				throw new Error("MEETING_TERMINAL");
			const config = livekit();
			const roomName = `oryon-meeting:${row.id}`;
			const accessToken = new AccessToken(config.apiKey, config.apiSecret, {
				identity: session.userId,
				name:
					participant.user?.displayName ??
					participant.user?.name ??
					session.userId,
			});
			accessToken.addGrant({
				roomJoin: true,
				room: roomName,
				canPublish: true,
				canSubscribe: true,
				canPublishData: true,
			});
			const token = await accessToken.toJwt();
			await meetingStore.markJoined(orgId, session.userId, id);
			return reply.send(
				replyEnvelope(
					request,
					MeetingJoinResponseSchema.parse({
						meetingId: id,
						roomName,
						wsUrl: config.wsUrl,
						token,
						participantId: participant.id,
					}),
				),
			);
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.post("/v1/meetings/:id/leave", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await meetingStore.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(orgId, session.userId, row, "read");
			await meetingStore.markLeft(orgId, session.userId, id);
			return reply.send(replyEnvelope(request, { left: true }));
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.get("/v1/meetings/:id/artifacts", async (request, reply) => {
		try {
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await meetingStore.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(orgId, session.userId, row, "read");
			return reply.send(replyEnvelope(request, row.artifacts));
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.post("/v1/meetings/:id/artifacts", async (request, reply) => {
		try {
			idempotency(request);
			const orgId = orgIdOf(request);
			const session = await principal(request, orgId);
			const id = (request.params as { id: string }).id;
			const row = await meetingStore.findById(orgId, id);
			if (!row) throw new Error("NOT_FOUND");
			await authorize(orgId, session.userId, row, "update");
			return reply
				.code(201)
				.send(
					replyEnvelope(
						request,
						await meetingStore.createArtifact(
							orgId,
							session.userId,
							id,
							MeetingArtifactCreateInputSchema.parse(request.body),
						),
					),
				);
		} catch (error) {
			const result = errorReply(request, error);
			return reply.code(result.status).send(result.response);
		}
	});
	app.post(
		"/v1/meetings/:id/artifacts/:artifactId/convert",
		async (request, reply) => {
			try {
				idempotency(request);
				const orgId = orgIdOf(request);
				const session = await principal(request, orgId);
				const params = request.params as { id: string; artifactId: string };
				const row = await meetingStore.findById(orgId, params.id);
				if (!row) throw new Error("NOT_FOUND");
				await authorize(orgId, session.userId, row, "update");
				const input = MeetingArtifactConvertInputSchema.parse(request.body);
				const workSnapshot = await permissionStore.getSnapshot(
					orgId,
					session.userId,
					"work_object",
					orgId,
				);
				const workResource = {
					orgId,
					type: "work_object",
					id: orgId,
					workspaceId: input.workspaceId ?? null,
					projectId: null,
					ownerId: null,
					teamId: null,
					classification: null,
				};
				if (!can({ orgId, ...workSnapshot }, workResource, "create").allowed)
					throw new Error("PERMISSION_DENIED");
				return reply
					.code(201)
					.send(
						replyEnvelope(
							request,
							MeetingArtifactConvertResponseSchema.parse(
								await meetingStore.convertArtifact(
									orgId,
									session.userId,
									params.id,
									params.artifactId,
									input,
								),
							),
						),
					);
			} catch (error) {
				const result = errorReply(request, error);
				return reply.code(result.status).send(result.response);
			}
		},
	);
}
