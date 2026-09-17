import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
const buckets = new Map<string, { count: number; resetAt: number }>();
export function installSecurityHardening(app: FastifyInstance): void {
	app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
		const origin = request.headers.origin;
		const allowed = process.env.ORYON_CORS_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
		if (origin && allowed.length > 0 && !allowed.includes(origin)) return reply.code(403).send({ error: { code: "CORS_ORIGIN_DENIED", httpStatus: 403, message: "Origin is not allowed", requestId: request.id } });
		const forwarded = request.headers["x-forwarded-for"];
		const client = typeof forwarded === "string" ? (forwarded.split(",")[0]?.trim() || request.ip) : request.ip;
		const now = Date.now();
		const windowMs = Number(process.env.ORYON_RATE_LIMIT_WINDOW_MS ?? "60000");
		const max = Number(process.env.ORYON_RATE_LIMIT_MAX ?? "300");
		const current = buckets.get(client);
		if (!current || current.resetAt <= now) buckets.set(client, { count: 1, resetAt: now + windowMs });
		else { current.count += 1; if (current.count > max) return reply.code(429).header("Retry-After", String(Math.ceil((current.resetAt - now) / 1000))).send({ error: { code: "RATE_LIMITED", httpStatus: 429, message: "Too many requests", requestId: request.id } }); }
	});
	app.addHook("onSend", async (_request, reply) => { reply.header("X-Content-Type-Options", "nosniff"); reply.header("X-Frame-Options", "DENY"); reply.header("Referrer-Policy", "strict-origin-when-cross-origin"); reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()"); reply.header("Cross-Origin-Resource-Policy", "same-site"); if (process.env.NODE_ENV === "production") reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains"); });
}
