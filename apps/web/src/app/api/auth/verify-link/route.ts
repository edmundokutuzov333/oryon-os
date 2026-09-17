import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

export async function POST(request: Request) {
	const body = (await request.json()) as {
		token?: unknown;
		organization?: unknown;
	};
	const organization = String(body.organization ?? "");
	const response = await fetch(`${apiUrl}/v1/auth/verify-link`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Oryon-Org": organization,
			"Idempotency-Key": randomUUID(),
		},
		body: JSON.stringify({ token: body.token }),
		cache: "no-store",
	});
	const payload = await response.json();
	if (!response.ok)
		return NextResponse.json(payload, { status: response.status });

	const next = NextResponse.json(payload);
	const setCookie = response.headers.get("set-cookie");
	if (setCookie) {
		const sessionPart = setCookie.split(";")[0];
		if (sessionPart) {
			const [name, value] = sessionPart.split("=");
			if (name === cookieName && value) {
				next.cookies.set(cookieName, decodeURIComponent(value), {
					httpOnly: true,
					secure: process.env.NODE_ENV === "production",
					sameSite: "lax",
					path: "/",
				});
			}
		}
	}
	next.cookies.set("oryon_org", organization, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
	});
	return next;
}
