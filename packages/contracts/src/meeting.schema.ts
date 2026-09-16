import { z } from "zod";

const iso = z.string().datetime({ offset: true });

export const MeetingProviderSchema = z.enum(["ORYON", "ZOOM", "TEAMS", "MEET", "WEBEX", "SIP"]);
export const MeetingStateSchema = z.enum(["SCHEDULED", "LIVE", "ENDED", "CANCELLED"]);
export const MeetingRoleSchema = z.enum(["ORGANIZER", "COHOST", "PRESENTER", "ATTENDEE", "OBSERVER"]);
export const RsvpStateSchema = z.enum(["PENDING", "ACCEPTED", "DECLINED", "TENTATIVE"]);
export const ArtifactKindSchema = z.enum(["RECORDING", "TRANSCRIPT", "NOTES", "SUMMARY", "DECISIONS", "TASKS", "DOCUMENT", "WHITEBOARD", "CHAT_LOG", "AI_REPORT", "CLIP"]);

const participantSchema = z.object({
  id: z.string().min(1),
  userId: z.string().nullable(),
  email: z.string().email().nullable(),
  role: MeetingRoleSchema,
  rsvp: RsvpStateSchema,
  joinedAt: iso.nullable(),
  leftAt: iso.nullable(),
  talkTimeMs: z.string().nullable(),
  user: z.object({ id: z.string(), name: z.string(), displayName: z.string().nullable(), avatarUrl: z.string().url().nullable() }).nullable(),
});

const artifactSchema = z.object({
  id: z.string().min(1),
  meetingId: z.string().min(1),
  kind: ArtifactKindSchema,
  fileId: z.string().nullable(),
  pageId: z.string().nullable(),
  contentJson: z.unknown().nullable(),
  transcript: z.string().nullable(),
  language: z.string().nullable(),
  createdAt: iso,
});

export const MeetingSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  objectId: z.string().nullable(),
  title: z.string().min(1),
  agenda: z.array(z.string()),
  startAt: iso,
  endAt: iso,
  timezone: z.string().min(1),
  roomId: z.string().nullable(),
  joinUrl: z.string().url(),
  provider: MeetingProviderSchema,
  externalRef: z.string().nullable(),
  recurrenceRule: z.string().nullable(),
  e2ee: z.boolean(),
  aiEnabled: z.boolean(),
  aiDisabledAt: iso.nullable(),
  effectivenessScore: z.number().int().min(0).max(100).nullable(),
  state: MeetingStateSchema,
  createdBy: z.string().min(1),
  createdAt: iso,
  participants: z.array(participantSchema),
  artifacts: z.array(artifactSchema),
  permissions: z.object({ read: z.boolean(), update: z.boolean(), delete: z.boolean(), comment: z.boolean(), manage: z.boolean() }),
});

export const MeetingListQuerySchema = z.object({
  from: iso.optional(),
  to: iso.optional(),
  state: MeetingStateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const MeetingCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(240),
  agenda: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  startAt: iso,
  endAt: iso,
  timezone: z.string().min(1).max(80),
  roomId: z.string().min(1).nullable().optional(),
  provider: MeetingProviderSchema.default("ORYON"),
  recurrenceRule: z.string().max(1000).nullable().optional(),
  e2ee: z.boolean().default(false),
  aiEnabled: z.boolean().default(true),
  participantUserIds: z.array(z.string().min(1)).max(100).default([]),
});

export const MeetingUpdateInputSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  agenda: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  startAt: iso.optional(),
  endAt: iso.optional(),
  timezone: z.string().min(1).max(80).optional(),
  roomId: z.string().min(1).nullable().optional(),
  recurrenceRule: z.string().max(1000).nullable().optional(),
  aiEnabled: z.boolean().optional(),
});

export const MeetingParticipantCreateInputSchema = z.object({
  userId: z.string().min(1).nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: MeetingRoleSchema.default("ATTENDEE"),
});

export const MeetingParticipantUpdateInputSchema = z.object({
  role: MeetingRoleSchema.optional(),
  rsvp: RsvpStateSchema.optional(),
});

export const MeetingStateInputSchema = z.object({ state: z.enum(["LIVE", "ENDED", "CANCELLED"]) });

export const MeetingJoinResponseSchema = z.object({
  meetingId: z.string(),
  roomName: z.string(),
  wsUrl: z.string().url(),
  token: z.string(),
  participantId: z.string(),
});

export const MeetingArtifactCreateInputSchema = z.object({
  kind: ArtifactKindSchema,
  contentJson: z.unknown().nullable().optional(),
  transcript: z.string().max(1000000).nullable().optional(),
  language: z.string().max(32).nullable().optional(),
  fileId: z.string().min(1).nullable().optional(),
  pageId: z.string().min(1).nullable().optional(),
});

export const MeetingArtifactConvertInputSchema = z.object({
  typeKey: z.string().min(1).default("task"),
  workspaceId: z.string().min(1).nullable().optional(),
  title: z.string().trim().max(500).optional(),
});

export const MeetingArtifactConvertResponseSchema = z.object({
  artifactId: z.string(),
  workObjectId: z.string(),
  edgeId: z.string(),
});

export type Meeting = z.infer<typeof MeetingSchema>;
export type MeetingListQuery = z.infer<typeof MeetingListQuerySchema>;
export type MeetingCreateInput = z.infer<typeof MeetingCreateInputSchema>;
export type MeetingUpdateInput = z.infer<typeof MeetingUpdateInputSchema>;
export type MeetingParticipantCreateInput = z.infer<typeof MeetingParticipantCreateInputSchema>;
export type MeetingParticipantUpdateInput = z.infer<typeof MeetingParticipantUpdateInputSchema>;
export type MeetingStateInput = z.infer<typeof MeetingStateInputSchema>;
export type MeetingArtifactCreateInput = z.infer<typeof MeetingArtifactCreateInputSchema>;
export type MeetingArtifactConvertInput = z.infer<typeof MeetingArtifactConvertInputSchema>;
