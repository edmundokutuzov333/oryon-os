import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function authHeaders() {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const organization = store.get("oryon_org")?.value;
	if (!session || !organization) return null;
	return {
		"Content-Type": "application/json",
		"X-Oryon-Org": organization,
		Cookie: `${cookieName}=${encodeURIComponent(session)}`,
	};
}

export async function PATCH(request: Request) {
	const headers = await authHeaders();
	if (!headers)
		return NextResponse.json(
			{ error: { message: "UNAUTHENTICATED" } },
			{ status: 401 },
		);
	const body = (await request.json()) as {
		id?: string;
		[key: string]: unknown;
	};
	if (!body.id)
		return NextResponse.json(
			{ error: { message: "VALIDATION_FAILED" } },
			{ status: 400 },
		);
	const { id, ...input } = body;
	const response = await fetch(
		`${apiUrl}/v1/work-objects/${encodeURIComponent(id)}`,
		{
			method: "PATCH",
			headers: { ...headers, "Idempotency-Key": randomUUID() },
			body: JSON.stringify(input),
			cache: "no-store",
		},
	);
	return NextResponse.json(await response.json(), { status: response.status });
}

export async function DELETE(request: Request) {
	const headers = await authHeaders();
	if (!headers)
		return NextResponse.json(
			{ error: { message: "UNAUTHENTICATED" } },
			{ status: 401 },
		);
	const body = (await request.json()) as { id?: string };
	if (!body.id)
		return NextResponse.json(
			{ error: { message: "VALIDATION_FAILED" } },
			{ status: 400 },
		);
	const response = await fetch(
		`${apiUrl}/v1/work-objects/${encodeURIComponent(body.id)}`,
		{
			method: "DELETE",
			headers: { ...headers, "Idempotency-Key": randomUUID() },
			cache: "no-store",
		},
	);
	return NextResponse.json(await response.json(), { status: response.status });
}
