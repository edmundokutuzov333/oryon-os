import type { FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";
import { AUTH_COOKIE_NAME, authenticate } from "./auth.js";
import { CommunicationEnhancedRepository } from "@oryon/db/repositories";
import { getPrisma } from "@oryon/db";

function cookieValue(raw: string | undefined, name: string): string | undefined {
	if (!raw) return undefined;
	for (const part of raw.split(";")) {
		const separator = part.indexOf("=");
		if (separator > 0 && part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
	}
	return undefined;
}

export function registerRealtime(app: FastifyInstance): Server {
	const io = new Server(app.server, { path: "/socket.io", cors: { origin: process.env.ORYON_WEB_URL ?? "http://localhost:3000", credentials: true } });
	const repository = new CommunicationEnhancedRepository(getPrisma());

	io.use(async (socket, next) => {
		try {
			const orgId = typeof socket.handshake.auth.orgId === "string" ? socket.handshake.auth.orgId : undefined;
			if (!orgId) return next(new Error("ORG_HEADER_MISSING"));
			const bearer = typeof socket.handshake.auth.token === "string" ? socket.handshake.auth.token : undefined;
			const token = bearer ?? cookieValue(socket.handshake.headers.cookie, AUTH_COOKIE_NAME);
			if (!token) return next(new Error("UNAUTHENTICATED"));
			const current = await authenticate(token, bearer ? "bearer" : "session");
			if (current.orgId !== orgId) return next(new Error("UNAUTHENTICATED"));
			socket.data.orgId = current.orgId;
			socket.data.userId = current.userId;
			next();
		} catch (error) {
			next(error instanceof Error ? error : new Error("UNAUTHENTICATED"));
		}
	});

	io.on("connection", async (socket: Socket) => {
		const orgId = socket.data.orgId as string;
		const userId = socket.data.userId as string;
		socket.join(`org:${orgId}`);
		socket.join(`user:${userId}`);
		const channels = await repository.listChannels(orgId, userId);
		for (const channel of channels) socket.join(`channel:${channel.id}`);
		socket.on("channel:join", async (channelId: unknown) => {
			if (typeof channelId !== "string") return;
			const membership = await repository.getMembership(orgId, channelId, userId);
			if (membership) socket.join(`channel:${channelId}`);
		});
		socket.on("channel:leave", (channelId: unknown) => {
			if (typeof channelId === "string") void socket.leave(`channel:${channelId}`);
		});
	});

	return io;
}
