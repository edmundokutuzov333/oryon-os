import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function authHeaders(
	request: Request,
): Promise<Record<string, string> | null> {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const organization = store.get("oryon_org")?.value;
	if (!session || !organization) return null;
	const headers: Record<string, string> = {
		"X-Oryon-Org": organization,
		Cookie: `${cookieName}=${encodeURIComponent(session)}`,
	};
	const contentType = request.headers.get("content-type");
	if (contentType) headers["Content-Type"] = contentType;
	const idempotency = request.headers.get("idempotency-key");
	if (idempotency) headers["Idempotency-Key"] = idempotency;
	return headers;
}

async function proxy(
	request: Request,
	path: string[],
	method: string,
): Promise<NextResponse> {
	const headers = await authHeaders(request);
	if (!headers)
		return NextResponse.json(
			{
				error: { code: "UNAUTHENTICATED", message: "Authentication required" },
			},
			{ status: 401 },
		);
	const init: RequestInit = { method, headers, cache: "no-store" };
	if (method !== "GET" && method !== "HEAD") init.body = await request.text();
	const response = await fetch(`${apiUrl}/v1/agents/${path.join("/")}`, init);
	return new NextResponse(await response.text(), {
		status: response.status,
		headers: {
			"Content-Type":
				response.headers.get("content-type") ?? "application/json",
		},
	});
}
export async function GET(
	request: Request,
	context: { params: Promise<{ path: string[] }> },
) {
	return proxy(request, (await context.params).path ?? [], "GET");
}
export async function POST(
	request: Request,
	context: { params: Promise<{ path: string[] }> },
) {
	return proxy(request, (await context.params).path ?? [], "POST");
}
export async function PATCH(
	request: Request,
	context: { params: Promise<{ path: string[] }> },
) {
	return proxy(request, (await context.params).path ?? [], "PATCH");
}
