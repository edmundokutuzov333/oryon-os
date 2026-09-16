import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import {
	AuthRequestLinkInputSchema,
	AuthVerifyLinkInputSchema,
	IdentityContextSchema,
	type IdentityContext,
} from "@oryon/contracts/identity";
import { getPrisma } from "@oryon/db";

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

async function getRedis(): Promise<RedisClientType> {
	if (!redis.isOpen) {
		redisConnectPromise ??= redis.connect().then(() => undefined);
		await redisConnectPromise;
	}
	return redis;
}

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

function base64Url(value: string | Buffer): string {
	return Buffer.from(value).toString("base64url");
}

function signJwt(payload: Record<string, string | number>): string {
	const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = base64Url(JSON.stringify(payload));
	const signature = createHmac("sha256", jwtSecret).update(`${header}.${body}`).digest();
	return `${header}.${body}.${base64Url(signature)}`;
}

function verifyJwt(token: string): Record<string, string | number> {
	const parts = token.split(".");
	if (parts.length !== 3) throw new Error("Invalid token");
	const [header, body, encodedSignature] = parts as [string, string, string];
	const expected = createHmac("sha256", jwtSecret).update(`${header}.${body}`).digest();
	const received = Buffer.from(encodedSignature, "base64url");
	if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
		throw new Error("Invalid token signature");
	}
	const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown;
	if (typeof payload !== "object" || payload === null) throw new Error("Invalid token payload");
	const claims = payload as Record<string, unknown>;
	if (
		typeof claims.sub !== "string" ||
		typeof claims.orgId !== "string" ||
		typeof claims.sid !== "string" ||
		typeof claims.exp !== "number" ||
		claims.exp <= Math.floor(Date.now() / 1000)
	) {
		throw new Error("Expired token");
	}
	return {
		sub: claims.sub,
		orgId: claims.orgId,
		sid: claims.sid,
		exp: claims.exp,
	};
}

async function withOrg<T>(orgId: string, operation: (tx: Parameters<Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]>[0]) => Promise<T>): Promise<T> {
	const prisma = getPrisma();
	return prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
		return operation(tx);
	});
}

async function loadIdentity(orgId: string, userId: string, expiresAt: Date): Promise<IdentityContext> {
	return withOrg(orgId, async (tx) => {
		const [user, organization] = await Promise.all([
			tx.user.findFirst({ where: { id: userId, orgId, deletedAt: null } }),
			tx.organization.findFirst({ where: { id: orgId, deletedAt: null } }),
		]);

		if (!user || !organization) throw new Error("Identity not found");
		if (user.status !== "ACTIVE") throw new Error("Identity is not active");

		const [workspaces, memberships] = await Promise.all([
			tx.workspace.findMany({ where: { orgId, deletedAt: null }, orderBy: { name: "asc" } }),
			tx.teamMember.findMany({
				where: { orgId, userId },
				include: { team: true },
				orderBy: { joinedAt: "asc" },
			}),
		]);

		return IdentityContextSchema.parse({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				displayName: user.displayName,
				jobTitle: user.jobTitle,
				timezone: user.timezone,
				locale: user.locale,
				type: user.type,
				status: user.status,
				presence: user.presence,
			},
			organization: {
				id: organization.id,
				slug: organization.slug,
				name: organization.name,
				logoUrl: organization.logoUrl,
				primaryDomain: organization.primaryDomain,
				defaultLocale: organization.defaultLocale,
				defaultTimezone: organization.defaultTimezone,
			},
			workspaces: workspaces.map((workspace) => ({
				id: workspace.id,
				key: workspace.key,
				name: workspace.name,
				icon: workspace.icon,
				visibility: workspace.visibility,
			})),
			teams: memberships.map((membership) => ({
				id: membership.team.id,
				name: membership.team.name,
				slug: membership.team.slug,
				description: membership.team.description,
				role: membership.role,
			})),
			session: { expiresAt: expiresAt.toISOString() },
		});
	});
}

export async function requestMagicLink(orgId: string, rawInput: unknown): Promise<{ delivered: boolean; debugToken?: string }> {
	const input = AuthRequestLinkInputSchema.parse(rawInput);
	return withOrg(orgId, async (tx) => {
		const user = await tx.user.findFirst({
			where: { orgId, email: input.email.toLowerCase(), deletedAt: null },
		});
		if (!user || user.status !== "ACTIVE") {
			return { delivered: true };
		}

		const token = randomBytes(32).toString("base64url");
		const redisClient = await getRedis();
		const key = `oryon:magic:${hash(token)}`;
		await redisClient.set(
			key,
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
	});
}

export async function verifyMagicLink(orgId: string, rawInput: unknown): Promise<{ accessToken: string; expiresAt: string; sessionToken: string }> {
	const input = AuthVerifyLinkInputSchema.parse(rawInput);
	const redisClient = await getRedis();
	const verificationKey = `oryon:magic:${hash(input.token)}`;
	const record = await redisClient.get(verificationKey);
	if (!record) throw new Error("Invalid or expired verification token");
	const parsed = JSON.parse(record) as { orgId: string; userId: string; email: string };
	if (parsed.orgId !== orgId) throw new Error("Organization mismatch");
	await redisClient.del(verificationKey);

	const now = Math.floor(Date.now() / 1000);
	const expiresAtUnix = now + accessTtlSeconds;
	const sessionToken = randomBytes(32).toString("base64url");
	const sessionId = randomBytes(16).toString("hex");
	const sessionExpiresAt = new Date((now + sessionTtlSeconds) * 1000);
	await redisClient.set(
		`oryon:session:${hash(sessionToken)}`,
		JSON.stringify({ sessionId, orgId, userId: parsed.userId, createdAt: now, lastSeenAt: now }),
		{ EX: sessionTtlSeconds },
	);

	await withOrg(orgId, async (tx) => {
		await tx.user.updateMany({
			where: { id: parsed.userId, orgId },
			data: { emailVerified: new Date(), lastSeenAt: new Date(), presence: "ONLINE" },
		});
		await tx.domainEvent.create({
			data: {
				orgId,
				name: "identity.session.created",
				version: 1,
				actorId: parsed.userId,
				actorType: "MEMBER",
				subjectType: "User",
				subjectId: parsed.userId,
				payload: { sessionId },
			},
		});
	});

	const accessToken = signJwt({
		iss: "oryon-api",
		aud: "oryon",
		sub: parsed.userId,
		orgId,
		sid: sessionId,
		iat: now,
		exp: expiresAtUnix,
		jti: randomBytes(16).toString("hex"),
	});

	return { accessToken, expiresAt: new Date(expiresAtUnix * 1000).toISOString(), sessionToken };
}

export async function resolveSessionToken(token: string): Promise<{ userId: string; orgId: string; sessionId: string; expiresAt: Date }> {
	const redisClient = await getRedis();
	const key = `oryon:session:${hash(token)}`;
	const raw = await redisClient.get(key);
	if (!raw) throw new Error("Session not found");
	const ttl = await redisClient.ttl(key);
	if (ttl <= 0) throw new Error("Session expired");
	const session = JSON.parse(raw) as { userId: string; orgId: string; sessionId: string };
	await redisClient.set(key, JSON.stringify({ ...session, lastSeenAt: Math.floor(Date.now() / 1000) }), { EX: ttl });
	return { ...session, expiresAt: new Date(Date.now() + ttl * 1000) };
}

export async function resolveBearerToken(token: string): Promise<{ userId: string; orgId: string; sessionId: string; expiresAt: Date }> {
	const claims = verifyJwt(token);
	const session = await resolveSessionById(claims.sid as string, claims.orgId as string, claims.sub as string);
	return session;
}

async function resolveSessionById(sessionId: string, orgId: string, userId: string) {
	const redisClient = await getRedis();
	const scanPattern = "oryon:session:*";
	for await (const keys of redisClient.scanIterator({ MATCH: scanPattern, COUNT: 100 })) {
		for (const key of Array.isArray(keys) ? keys : [keys]) {
			const raw = await redisClient.get(key);
			if (!raw) continue;
			const session = JSON.parse(raw) as { sessionId: string; orgId: string; userId: string };
			if (session.sessionId === sessionId && session.orgId === orgId && session.userId === userId) {
				const ttl = await redisClient.ttl(key);
				if (ttl <= 0) throw new Error("Session expired");
				return { userId, orgId, sessionId, expiresAt: new Date(Date.now() + ttl * 1000) };
			}
		}
	}
	throw new Error("Session revoked");
}

export async function revokeSession(token: string): Promise<void> {
	const redisClient = await getRedis();
	await redisClient.del(`oryon:session:${hash(token)}`);
}

export async function authenticate(rawToken: string, mode: "bearer" | "session") {
	if (mode === "bearer") return resolveBearerToken(rawToken);
	return resolveSessionToken(rawToken);
}

export async function identityForSession(session: { userId: string; orgId: string; expiresAt: Date }): Promise<IdentityContext> {
	return loadIdentity(session.orgId, session.userId, session.expiresAt);
}
