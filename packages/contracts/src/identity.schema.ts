import { z } from "zod";

const isoTimestamp = z.string().datetime({ offset: true });

export const IdentityUserSchema = z.object({
	id: z.string().min(1),
	email: z.string().email(),
	name: z.string().min(1),
	displayName: z.string().nullable(),
	jobTitle: z.string().nullable(),
	timezone: z.string().min(1),
	locale: z.string().min(1),
	type: z.enum([
		"MEMBER",
		"GUEST",
		"CLIENT",
		"VENDOR",
		"AGENT",
		"SERVICE_ACCOUNT",
	]),
	status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"]),
	presence: z.enum([
		"ONLINE",
		"AWAY",
		"BUSY",
		"IN_MEETING",
		"FOCUS",
		"DND",
		"OFFLINE",
	]),
});

export const IdentityOrganizationSchema = z.object({
	id: z.string().min(1),
	slug: z.string().min(1),
	name: z.string().min(1),
	logoUrl: z.string().url().nullable(),
	primaryDomain: z.string().nullable(),
	defaultLocale: z.string().min(1),
	defaultTimezone: z.string().min(1),
});

export const IdentityWorkspaceSchema = z.object({
	id: z.string().min(1),
	key: z.string().min(1),
	name: z.string().min(1),
	icon: z.string().nullable(),
	visibility: z.enum(["PUBLIC", "ORG", "TEAM", "PRIVATE"]),
});

export const IdentityTeamSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	slug: z.string().min(1),
	description: z.string().nullable(),
	role: z.enum(["LEAD", "MEMBER", "VIEWER"]),
});

export const SessionSchema = z.object({
	expiresAt: isoTimestamp,
});

export const IdentityContextSchema = z.object({
	user: IdentityUserSchema,
	organization: IdentityOrganizationSchema,
	workspaces: z.array(IdentityWorkspaceSchema),
	teams: z.array(IdentityTeamSchema),
	session: SessionSchema,
});

export const AuthRequestLinkInputSchema = z.object({
	email: z.string().email(),
});

export const AuthRequestLinkResponseSchema = z.object({
	delivered: z.boolean(),
	debugToken: z.string().min(1).optional(),
});

export const AuthVerifyLinkInputSchema = z.object({
	token: z.string().min(32),
});

export const AuthVerifyLinkResponseSchema = z.object({
	accessToken: z.string().min(1),
	expiresAt: isoTimestamp,
});

export type IdentityContext = z.infer<typeof IdentityContextSchema>;
export type AuthRequestLinkInput = z.infer<typeof AuthRequestLinkInputSchema>;
export type AuthVerifyLinkInput = z.infer<typeof AuthVerifyLinkInputSchema>;
