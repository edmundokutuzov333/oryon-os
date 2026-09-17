import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function authHeaders(): Promise<HeadersInit | null> {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const organization = store.get("oryon_org")?.value;
	if (!session || !organization) return null;
	return {
		"Content-Type": "application/json",
		"X-Oryon-Org": organization,
		Cookie: `${cookieName}=${encodeURIComponent(session)}`,
		"Idempotency-Key": randomUUID(),
	};
}

export async function POST(request: Request): Promise<Response> {
	const headers = await authHeaders();
	if (!headers)
		return NextResponse.json(
			{ error: { message: "UNAUTHENTICATED" } },
			{ status: 401 },
		);
	const response = await fetch(`${apiUrl}/v1/edges`, {
		method: "POST",
		headers,
		body: JSON.stringify(await request.json()),
		cache: "no-store",
	});
	return NextResponse.json(await response.json(), { status: response.status });
}
