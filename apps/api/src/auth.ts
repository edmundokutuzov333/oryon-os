import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import {
	AuthRequestLinkInputSchema,
	AuthVerifyLinkInputSchema,
	IdentityContextSchema,
	type IdentityContext,
} from "@oryon/contracts/identity";
import { IdentityRepository } from "@oryon/db/repositories";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const jwtSecret = process.env.ORYON_AUTH_JWT_SECRET;
const sessionTtlSeconds = Number(process.env.ORYON_AUTH_SESSION_TTL_SECONDS ?? "2592000");
const accessTtlSeconds = Number(process.env.ORYON_AUTH_ACCESS_TTL_SECONDS ?? "900");
const magicLinkTtlSeconds = Number(process.env.ORYON_AUTH_MAGIC_LINK_TTL_SECONDS ?? "600");
const devMode = process.env.ORYON_AUTH_DEV_MODE === "true";
const webUrl = process.env.ORYON_WEB_URL ?? "http://localhost:3000";
const fromAddress = process.env.ORYON_AUTH_FROM ?? "OryonOS <auth@oryon.os>";
const resendApiKey = process.env.RESEND_API_KEY;

if (!jwtSecret || jwtSecret.length < 32) {
	throw new Error("ORYON_AUTH_JWT_SECRET must contain at least 32 characters");
}

const redis = createClient({ url: redisUrl });
let redisConnectPromise: Promise<void> | undefined;
const identities = new IdentityRepository();

async function getRedis(): Promise<RedisClientType> {
	if (!redis.isOpen) {
		redisConnectPromise ??= redis.connect().then(() => undefined);
		await redisConnectPromise;
	}
	return redis;
}

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

function base64Url(value: string | Buffer): string {
	return Buffer.from(value).toString("base64url");
}

function signJwt(payload: Record<string, string | number>): string {
	const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = base64Url(JSON.stringify(payload));
	const signature = createHmac("sha256", jwtSecret).update(`${header}.${body}`).digest();
	return `${header}.${body}.${base64Url(signature)}`;
}

function verifyJwt(token: string): { sub: string; orgId: string; sid: string; exp: number } {
	const parts = token.split(".");
	if (parts.length !== 3) throw new Error("Invalid token");
	const [encodedHeader, encodedBody, encodedSignature] = parts as [string, string, string];
	const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { alg?: unknown; typ?: unknown };
	if (header.alg !== "HS256") throw new Error("Unsupported token algorithm");
	const expected = createHmac("sha256", jwtSecret).update(`${encodedHeader}.${encodedBody}`).digest();
	const received = Buffer.from(encodedSignature, "base64url");
	if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
		throw new Error("Invalid token signature");
	}
	const payload = JSON.parse(Buffer.from(encodedBody, "base64url").toString("utf8")) as Record<string, unknown>;
	const now = Math.floor(Date.now() / 1000);
	if (
		typeof payload.sub !== "string" ||
		typeof payload.orgId !== "string" ||
		typeof payload.sid !== "string" ||
		typeof payload.exp !== "number" ||
		payload.exp <= now
	) {
		throw new Error("Expired or malformed token");
	}
	return { sub: payload.sub, orgId: payload.orgId, sid: payload.sid, exp: payload.exp };
}

export async function requestMagicLink(
	orgId: string,
	rawInput: unknown,
): Promise<{ delivered: boolean; debugToken?: string }> {
	const input = AuthRequestLinkInputSchema.parse(rawInput);
	const user = await identities.findActiveUserByEmail(orgId, input.email);
	if (!user) return { delivered: true };

	const token = randomBytes(32).toString("base64url");
	const redisClient = await getRedis();
	await redisClient.set(
		`oryon:magic:${sha256(token)}`,
		JSON.stringify({ orgId, userId: user.id, email: user.email }),
		{ EX: magicLinkTtlSeconds },
	);

	const link = `${webUrl}/login/verify?token=${encodeURIComponent(token)}&org=${encodeURIComponent(orgId)}`;
	if (resendApiKey) {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${resendApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: fromAddress,
				to: [user.email],
				subject: "Entrar na OryonOS",
				html: `<p>Olá ${user.name},</p><p><a href="${link}">Entrar na OryonOS</a></p><p>Este link expira em ${Math.floor(magicLinkTtlSeconds / 60)} minutos.</p>`,
			}),
		});
		if (!response.ok) throw new Error(`Unable to deliver magic link: ${response.status}`);
		return { delivered: true };
	}

	if (!devMode) throw new Error("Email provider is not configured");
	return { delivered: true, debugToken: token };
}

export async function verifyMagicLink(
	orgId: string,
	rawInput: unknown,
): Promise<{ accessToken: string; expiresAt: string; sessionToken: string }> {
	const input = AuthVerifyLinkInputSchema.parse(rawInput);
	const redisClient = await getRedis();
	const verificationKey = `oryon:magic:${sha256(input.token)}`;
	const record = await redisClient.get(verificationKey);
	if (!record) throw new Error("Invalid or expired verification token");
	const parsed = JSON.parse(record) as { orgId: string; userId: string; email: string };
	if (parsed.orgId !== orgId) throw new Error("Organization mismatch");
	await redisClient.del(verificationKey);

	const now = Math.floor(Date.now() / 1000);
	const accessExpiresAt = new Date((now + accessTtlSeconds) * 1000);
	const sessionToken = randomBytes(32).toString("base64url");
	const sessionId = randomBytes(16).toString("hex");
	const sessionKey = `oryon:session:${sha256(sessionToken)}`;
	const sessionIndexKey = `oryon:session-id:${sessionId}`;
	const sessionRecord = JSON.stringify({ sessionId, orgId, userId: parsed.userId, createdAt: now, lastSeenAt: now });
	await redisClient.set(sessionKey, sessionRecord, { EX: sessionTtlSeconds });
	await redisClient.set(sessionIndexKey, sha256(sessionToken), { EX: sessionTtlSeconds });
	await identities.markAuthenticated(orgId, parsed.userId, sessionId);

	const accessToken = signJwt({
		iss: "oryon-api",
		aud: "oryon",
		sub: parsed.userId,
		orgId,
		sid: sessionId,
		iat: now,
		exp: Math.floor(accessExpiresAt.getTime() / 1000),
		jti: randomBytes(16).toString("hex"),
	});

	return { accessToken, expiresAt: accessExpiresAt.toISOString(), sessionToken };
}

export async function resolveSessionToken(token: string) {
	const redisClient = await getRedis();
	const key = `oryon:session:${sha256(token)}`;
	const raw = await redisClient.get(key);
	if (!raw) throw new Error("Session not found");
	const ttl = await redisClient.ttl(key);
	if (ttl <= 0) throw new Error("Session expired");
	const session = JSON.parse(raw) as { sessionId: string; orgId: string; userId: string };
	await redisClient.set(key, JSON.stringify({ ...session, lastSeenAt: Math.floor(Date.now() / 1000) }), { EX: ttl });
	return { userId: session.userId, orgId: session.orgId, sessionId: session.sessionId, expiresAt: new Date(Date.now() + ttl * 1000) };
}

export async function resolveBearerToken(token: string) {
	const claims = verifyJwt(token);
	const redisClient = await getRedis();
	const tokenHash = await redisClient.get(`oryon:session-id:${claims.sid}`);
	if (!tokenHash) throw new Error("Session revoked");
	const raw = await redisClient.get(`oryon:session:${tokenHash}`);
	if (!raw) throw new Error("Session revoked");
	const session = JSON.parse(raw) as { sessionId: string; orgId: string; userId: string };
	if (session.userId !== claims.sub || session.orgId !== claims.orgId || session.sessionId !== claims.sid) {
		throw new Error("Session identity mismatch");
	}
	const ttl = await redisClient.ttl(`oryon:session:${tokenHash}`);
	if (ttl <= 0) throw new Error("Session expired");
	return { userId: session.userId, orgId: session.orgId, sessionId: session.sessionId, expiresAt: new Date(Date.now() + ttl * 1000) };
}

export async function revokeSession(token: string): Promise<void> {
	const redisClient = await getRedis();
	const key = `oryon:session:${sha256(token)}`;
	const raw = await redisClient.get(key);
	if (raw) {
		const session = JSON.parse(raw) as { sessionId: string };
		await redisClient.del(`oryon:session-id:${session.sessionId}`);
	}
	await redisClient.del(key);
}

export async function authenticate(rawToken: string, mode: "bearer" | "session") {
	return mode === "bearer" ? resolveBearerToken(rawToken) : resolveSessionToken(rawToken);
}

export async function identityForSession(session: { userId: string; orgId: string; expiresAt: Date }): Promise<IdentityContext> {
	const context = await identities.getContext(session.orgId, session.userId);
	if (!context.user || !context.organization || context.user.status !== "ACTIVE") {
		throw new Error("Identity is not available");
	}
	return IdentityContextSchema.parse({
		user: {
			id: context.user.id,
			email: context.user.email,
			name: context.user.name,
			displayName: context.user.displayName,
			jobTitle: context.user.jobTitle,
			timezone: context.user.timezone,
			locale: context.user.locale,
			type: context.user.type,
			status: context.user.status,
			presence: context.user.presence,
		},
		organization: {
			id: context.organization.id,
			slug: context.organization.slug,
			name: context.organization.name,
			logoUrl: context.organization.logoUrl,
			primaryDomain: context.organization.primaryDomain,
			defaultLocale: context.organization.defaultLocale,
			defaultTimezone: context.organization.defaultTimezone,
		},
		workspaces: context.workspaces.map((workspace) => ({
			id: workspace.id,
			key: workspace.key,
			name: workspace.name,
			icon: workspace.icon,
			visibility: workspace.visibility,
		})),
		teams: context.memberships.map((membership) => ({
			id: membership.team.id,
			name: membership.team.name,
			slug: membership.team.slug,
			description: membership.team.description,
			role: membership.role,
		})),
		session: { expiresAt: session.expiresAt.toISOString() },
	});
}

export const AUTH_COOKIE_NAME = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";
