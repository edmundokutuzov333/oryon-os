import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function authHeaders(): Promise<Record<string, string> | null> {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const organization = store.get("oryon_org")?.value;
	if (!session || !organization) return null;
	return {
		"X-Oryon-Org": organization,
		Cookie: `${cookieName}=${encodeURIComponent(session)}`,
	};
}

async function proxy(request: Request, segments: string[]): Promise<Response> {
	const headers = await authHeaders();
	if (!headers)
		return NextResponse.json(
			{ error: { message: "UNAUTHENTICATED" } },
			{ status: 401 },
		);
	const path = segments.join("/");
	const body =
		request.method === "GET" || request.method === "HEAD"
			? undefined
			: await request.text();
	const requestHeaders: Record<string, string> = { ...headers };
	if (body)
		requestHeaders["Content-Type"] =
			request.headers.get("content-type") ?? "application/json";
	if (request.method !== "GET" && request.method !== "HEAD")
		requestHeaders["Idempotency-Key"] =
			request.headers.get("idempotency-key") ?? crypto.randomUUID();
	const response = await fetch(`${apiUrl}/v1/domain-templates/${path}`, {
		method: request.method,
		headers: requestHeaders,
		body,
		cache: "no-store",
	});
	return NextResponse.json(await response.json(), { status: response.status });
}

export async function GET(
	request: Request,
	context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
	return proxy(request, (await context.params).segments);
}
export async function POST(
	request: Request,
	context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
	return proxy(request, (await context.params).segments);
}
