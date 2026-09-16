import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";

export async function POST(request: Request) {
	const body = await request.json();
	const response = await fetch(`${apiUrl}/v1/auth/request-link`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Oryon-Org": String(body.organization ?? ""),
			"Idempotency-Key": randomUUID(),
		},
		body: JSON.stringify({ email: body.email }),
		cache: "no-store",
	});
	return NextResponse.json(await response.json(), { status: response.status });
}
