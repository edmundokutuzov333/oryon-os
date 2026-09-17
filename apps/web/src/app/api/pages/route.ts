import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";
async function authHeaders() {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const organization = store.get("oryon_org")?.value;
	return session && organization
		? {
				"Content-Type": "application/json",
				"X-Oryon-Org": organization,
				Cookie: `${cookieName}=${encodeURIComponent(session)}`,
			}
		: null;
}
async function forward(response: Response) {
	return NextResponse.json(await response.json(), { status: response.status });
}
export async function GET(request: Request) {
	const headers = await authHeaders();
	if (!headers)
		return NextResponse.json(
			{ error: { message: "UNAUTHENTICATED" } },
			{ status: 401 },
		);
	const url = new URL(request.url);
	const qs = url.searchParams.toString();
	return forward(
		await fetch(`${apiUrl}/v1/pages${qs ? `?${qs}` : ""}`, {
			headers,
			cache: "no-store",
		}),
	);
}
export async function POST(request: Request) {
	const headers = await authHeaders();
	if (!headers)
		return NextResponse.json(
			{ error: { message: "UNAUTHENTICATED" } },
			{ status: 401 },
		);
	return forward(
		await fetch(`${apiUrl}/v1/pages`, {
			method: "POST",
			headers: { ...headers, "Idempotency-Key": randomUUID() },
			body: JSON.stringify(await request.json()),
			cache: "no-store",
		}),
	);
}
