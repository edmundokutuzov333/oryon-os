import { randomUUID } from "node:crypto";
import { generateHumanId, prepareWorkObjectCreate } from "@oryon/core";
import type {
	MeetingArtifactConvertInput,
	MeetingArtifactCreateInput,
	MeetingCreateInput,
	MeetingParticipantCreateInput,
	MeetingParticipantUpdateInput,
	MeetingUpdateInput,
} from "@oryon/contracts/meeting";
import { Prisma, type PrismaClient } from "../generated/client.js";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";

export interface MeetingListInput {
	readonly orgId: string;
	readonly from?: string;
	readonly to?: string;
	readonly state?: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
	readonly limit?: number;
}

const participantInclude = {
	user: {
		select: { id: true, name: true, displayName: true, avatarUrl: true },
	},
} as const;

export class MeetingRepository {
	constructor(private readonly db: PrismaClient) {}

	async list(input: MeetingListInput) {
		const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
		return withOrgContext(this.db, input.orgId, async (tx) => {
			const where: Prisma.MeetingWhereInput = { orgId: input.orgId };
			if (input.state !== undefined) where.state = input.state;
			if (input.from !== undefined || input.to !== undefined)
				where.startAt = {
					...(input.from === undefined ? {} : { gte: new Date(input.from) }),
					...(input.to === undefined ? {} : { lt: new Date(input.to) }),
				};
			return tx.meeting.findMany({
				where,
				include: {
					participants: {
						include: participantInclude,
						orderBy: { joinedAt: "asc" },
					},
					artifacts: { orderBy: { createdAt: "desc" } },
				},
				orderBy: { startAt: "asc" },
				take: limit,
			});
		});
	}

	async findById(orgId: string, id: string) {
		return withOrgContext(this.db, orgId, (tx) =>
			tx.meeting.findFirst({
				where: { orgId, id },
				include: {
					participants: {
						include: participantInclude,
						orderBy: { joinedAt: "asc" },
					},
					artifacts: { orderBy: { createdAt: "desc" } },
				},
			}),
		);
	}

	async create(
		orgId: string,
		actorId: string,
		input: MeetingCreateInput,
	): Promise<string> {
		if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime())
			throw new Error("INVALID_MEETING_TIME");
		return withOrgContext(this.db, orgId, async (tx) => {
			if (input.roomId) {
				const room = await tx.room.findFirst({
					where: { id: input.roomId, orgId, bookable: true },
				});
				if (!room) throw new Error("ROOM_NOT_FOUND");
				const conflict = await tx.meeting.findFirst({
					where: {
						orgId,
						roomId: input.roomId,
						state: { in: ["SCHEDULED", "LIVE"] },
						startAt: { lt: new Date(input.endAt) },
						endAt: { gt: new Date(input.startAt) },
					},
					select: { id: true },
				});
				if (conflict) throw new Error("ROOM_CONFLICT");
			}
			const meeting = await tx.meeting.create({
				data: {
					orgId,
					title: input.title,
					agendaJson: input.agenda,
					startAt: new Date(input.startAt),
					endAt: new Date(input.endAt),
					timezone: input.timezone,
					roomId: input.roomId ?? null,
					joinUrl: `${process.env.LIVEKIT_URL ?? "http://localhost:7880"}/oryon/${encodeURIComponent(randomUUID())}`,
					provider: input.provider,
					recurrenceRule: input.recurrenceRule ?? null,
					e2ee: input.e2ee,
					aiEnabled: input.aiEnabled,
					createdBy: actorId,
				},
			});
			const participantIds = [
				...new Set([actorId, ...input.participantUserIds]),
			];
			if (participantIds.length > 0)
				await tx.meetingParticipant.createMany({
					data: participantIds.map((userId) => ({
						orgId,
						meetingId: meeting.id,
						userId,
						email: null,
						role:
							userId === actorId
								? ("ORGANIZER" as const)
								: ("ATTENDEE" as const),
						rsvp:
							userId === actorId ? ("ACCEPTED" as const) : ("PENDING" as const),
					})),
				});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Meeting",
				subjectId: meeting.id,
				name: "meeting.created",
				payload: {
					title: meeting.title,
					startAt: meeting.startAt.toISOString(),
					endAt: meeting.endAt.toISOString(),
					participantCount: participantIds.length,
				},
			});
			return meeting.id;
		});
	}

	async update(
		orgId: string,
		actorId: string,
		id: string,
		input: MeetingUpdateInput,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const current = await tx.meeting.findFirst({ where: { orgId, id } });
			if (!current) throw new Error("NOT_FOUND");
			const startAt = input.startAt ? new Date(input.startAt) : current.startAt;
			const endAt = input.endAt ? new Date(input.endAt) : current.endAt;
			if (endAt.getTime() <= startAt.getTime())
				throw new Error("INVALID_MEETING_TIME");
			if (input.roomId !== undefined && input.roomId !== null) {
				const room = await tx.room.findFirst({
					where: { id: input.roomId, orgId, bookable: true },
					select: { id: true },
				});
				if (!room) throw new Error("ROOM_NOT_FOUND");
				const conflict = await tx.meeting.findFirst({
					where: {
						orgId,
						id: { not: id },
						roomId: input.roomId,
						state: { in: ["SCHEDULED", "LIVE"] },
						startAt: { lt: endAt },
						endAt: { gt: startAt },
					},
					select: { id: true },
				});
				if (conflict) throw new Error("ROOM_CONFLICT");
			}
			const data: Prisma.MeetingUpdateInput = {};
			if (input.title !== undefined) data.title = input.title;
			if (input.agenda !== undefined) data.agendaJson = input.agenda;
			if (input.startAt !== undefined) data.startAt = startAt;
			if (input.endAt !== undefined) data.endAt = endAt;
			if (input.timezone !== undefined) data.timezone = input.timezone;
			if (input.roomId !== undefined) data.roomId = input.roomId;
			if (input.recurrenceRule !== undefined)
				data.recurrenceRule = input.recurrenceRule;
			if (input.aiEnabled !== undefined) data.aiEnabled = input.aiEnabled;
			const updated = await tx.meeting.update({ where: { id }, data });
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Meeting",
				subjectId: id,
				name: "meeting.updated",
				payload: { changed: Object.keys(data) },
			});
			return updated;
		});
	}

	async changeState(
		orgId: string,
		actorId: string,
		id: string,
		state: "LIVE" | "ENDED" | "CANCELLED",
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const current = await tx.meeting.findFirst({ where: { orgId, id } });
			if (!current) throw new Error("NOT_FOUND");
			if (current.state === "ENDED" || current.state === "CANCELLED")
				throw new Error("MEETING_TERMINAL");
			const updated = await tx.meeting.update({
				where: { id },
				data: { state },
			});
			if (state === "ENDED")
				await tx.meetingParticipant.updateMany({
					where: {
						orgId,
						meetingId: id,
						joinedAt: { not: null },
						leftAt: null,
					},
					data: { leftAt: new Date() },
				});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "Meeting",
				subjectId: id,
				name: `meeting.${state.toLowerCase()}`,
				payload: { previousState: current.state, state },
			});
			return updated;
		});
	}

	async addParticipant(
		orgId: string,
		actorId: string,
		meetingId: string,
		input: MeetingParticipantCreateInput,
	): Promise<{ id: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const meeting = await tx.meeting.findFirst({
				where: { orgId, id: meetingId },
				select: { id: true },
			});
			if (!meeting) throw new Error("NOT_FOUND");
			if (!input.userId && !input.email)
				throw new Error("PARTICIPANT_IDENTITY_REQUIRED");
			if (input.userId) {
				const user = await tx.user.findFirst({
					where: { orgId, id: input.userId, status: "ACTIVE", deletedAt: null },
					select: { id: true },
				});
				if (!user) throw new Error("USER_NOT_FOUND");
			}
			const row = await tx.meetingParticipant.create({
				data: {
					orgId,
					meetingId,
					userId: input.userId ?? null,
					email: input.email ?? null,
					role: input.role,
					rsvp: "PENDING",
				},
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "MeetingParticipant",
				subjectId: row.id,
				name: "meeting.participant.added",
				payload: {
					meetingId,
					userId: input.userId ?? null,
					email: input.email ?? null,
					role: input.role,
				},
			});
			return { id: row.id };
		});
	}

	async updateParticipant(
		orgId: string,
		actorId: string,
		meetingId: string,
		participantId: string,
		input: MeetingParticipantUpdateInput,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const current = await tx.meetingParticipant.findFirst({
				where: { id: participantId, orgId, meetingId },
			});
			if (!current) throw new Error("NOT_FOUND");
			const data: Prisma.MeetingParticipantUpdateInput = {};
			if (input.role !== undefined) data.role = input.role;
			if (input.rsvp !== undefined) data.rsvp = input.rsvp;
			const updated = await tx.meetingParticipant.update({
				where: { id: participantId },
				data,
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "MeetingParticipant",
				subjectId: participantId,
				name: "meeting.participant.updated",
				payload: { meetingId, changed: Object.keys(data) },
			});
			return updated;
		});
	}

	async markJoined(
		orgId: string,
		actorId: string,
		meetingId: string,
	): Promise<{ id: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const row = await tx.meetingParticipant.findFirst({
				where: { orgId, meetingId, userId: actorId },
			});
			if (!row) throw new Error("PARTICIPANT_NOT_FOUND");
			const updated = await tx.meetingParticipant.update({
				where: { id: row.id },
				data: { joinedAt: new Date(), leftAt: null, rsvp: "ACCEPTED" },
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "MeetingParticipant",
				subjectId: updated.id,
				name: "meeting.participant.joined",
				payload: { meetingId },
			});
			return { id: updated.id };
		});
	}

	async markLeft(
		orgId: string,
		actorId: string,
		meetingId: string,
	): Promise<{ id: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const row = await tx.meetingParticipant.findFirst({
				where: { orgId, meetingId, userId: actorId },
			});
			if (!row) throw new Error("PARTICIPANT_NOT_FOUND");
			const updated = await tx.meetingParticipant.update({
				where: { id: row.id },
				data: { leftAt: new Date() },
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "MeetingParticipant",
				subjectId: updated.id,
				name: "meeting.participant.left",
				payload: { meetingId },
			});
			return { id: updated.id };
		});
	}

	async createArtifact(
		orgId: string,
		actorId: string,
		meetingId: string,
		input: MeetingArtifactCreateInput,
	) {
		return withOrgContext(this.db, orgId, async (tx) => {
			const meeting = await tx.meeting.findFirst({
				where: { orgId, id: meetingId },
				select: { id: true },
			});
			if (!meeting) throw new Error("NOT_FOUND");
			if (input.fileId) {
				const file = await tx.fileAsset.findFirst({
					where: { orgId, id: input.fileId, deletedAt: null },
					select: { id: true },
				});
				if (!file) throw new Error("FILE_NOT_FOUND");
			}
			const row = await tx.meetingArtifact.create({
				data: {
					orgId,
					meetingId,
					kind: input.kind,
					contentJson:
						input.contentJson === undefined
							? Prisma.JsonNull
							: (input.contentJson as Prisma.InputJsonValue),
					transcript: input.transcript ?? null,
					language: input.language ?? null,
					fileId: input.fileId ?? null,
					pageId: input.pageId ?? null,
				},
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "MeetingArtifact",
				subjectId: row.id,
				name: "meeting.artifact.created",
				payload: { meetingId, kind: input.kind },
			});
			return row;
		});
	}

	async convertArtifact(
		orgId: string,
		actorId: string,
		meetingId: string,
		artifactId: string,
		input: MeetingArtifactConvertInput,
	): Promise<{ artifactId: string; workObjectId: string; edgeId: string }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const artifact = await tx.meetingArtifact.findFirst({
				where: { orgId, id: artifactId, meetingId },
				include: { meeting: true },
			});
			if (!artifact) throw new Error("NOT_FOUND");
			if (!["TASKS", "DECISIONS", "RESULTED_IN"].includes(artifact.kind))
				throw new Error("ARTIFACT_NOT_CONVERTIBLE");
			const typeRow = await tx.objectTypeDef.findFirst({
				where: { orgId, key: input.typeKey, isSystem: true },
			});
			if (!typeRow) throw new Error("OBJECT_TYPE_NOT_FOUND");
			const prepared = prepareWorkObjectCreate(
				{
					typeKey: typeRow.key,
					title:
						input.title ??
						`${artifact.kind === "DECISIONS" ? "Decisão" : "Tarefa"}: ${artifact.meeting.title}`,
					workspaceId: input.workspaceId ?? null,
					customFields: {},
					tags: ["meeting-artifact"],
					priority: "NORMAL",
					status: undefined,
				},
				{
					id: typeRow.id,
					key: typeRow.key,
					name: typeRow.name,
					pluralName: typeRow.pluralName,
					icon: typeRow.icon,
					isSystem: typeRow.isSystem,
					idPrefix: typeRow.idPrefix,
					schema: typeRow.schema as never,
					statusModel: typeRow.statusModel as never,
				},
			);
			const state = typeRow.statusModel as {
				states?: Array<{
					key: string;
					category:
						| "BACKLOG"
						| "TODO"
						| "IN_PROGRESS"
						| "BLOCKED"
						| "IN_REVIEW"
						| "DONE"
						| "CANCELLED";
				}>;
			};
			const initial = state.states?.find(
				(candidate) => candidate.key === prepared.status,
			);
			if (!initial) throw new Error("INVALID_STATUS");
			const objectId = randomUUID();
			const object = await tx.workObject.create({
				data: {
					id: objectId,
					orgId,
					workspaceId: prepared.workspaceId ?? null,
					typeKey: prepared.typeKey,
					typeDefId: typeRow.id,
					humanId: generateHumanId(objectId, typeRow.idPrefix),
					title: prepared.title,
					description: prepared.description ?? null,
					status: prepared.status,
					statusCategory: initial.category,
					priority: prepared.priority ?? "NORMAL",
					ownerId: actorId,
					parentObjectId: null,
					startAt: null,
					dueAt: null,
					progress: 0,
					moneyAmount: null,
					moneyCurrency: null,
					probability: null,
					secondaryDate: null,
					externalRef: null,
					severity: null,
					classification: null,
					tags: prepared.tags,
					customFields: JSON.parse(
						JSON.stringify(prepared.customFields),
					) as Prisma.InputJsonValue,
					createdBy: actorId,
				},
			});
			if (object.workspaceId)
				await tx.objectPlacement.create({
					data: {
						orgId,
						objectId: object.id,
						containerType: "WORKSPACE",
						containerId: object.workspaceId,
						position: "0",
						isPrimary: true,
					},
				});
			const relation =
				artifact.kind === "DECISIONS" ? "DECIDED_IN" : "RESULTED_IN";
			const edge = await tx.edge.create({
				data: {
					orgId,
					fromType: "work_object",
					fromId: object.id,
					toType: "meeting",
					toId: meetingId,
					relation,
					metadata: { artifactId } as Prisma.InputJsonValue,
					createdBy: actorId,
				},
			});
			await appendDomainEvent(tx, {
				orgId,
				actorId,
				actorType: "MEMBER",
				subjectType: "WorkObject",
				subjectId: object.id,
				name: "meeting.artifact.converted",
				payload: { meetingId, artifactId, workObjectId: object.id, relation },
			});
			return { artifactId, workObjectId: object.id, edgeId: edge.id };
		});
	}
}
