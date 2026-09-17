import { cookies } from "next/headers";
import { NextResponse } from "next/server";
const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";
async function proxy(
	request: Request,
	id: string,
	action?: string,
): Promise<NextResponse> {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const organization = store.get("oryon_org")?.value;
	if (!session || !organization)
		return NextResponse.json(
			{
				error: { code: "UNAUTHENTICATED", message: "Authentication required" },
			},
			{ status: 401 },
		);
	const headers: Record<string, string> = {
		"X-Oryon-Org": organization,
		Cookie: `${cookieName}=${encodeURIComponent(session)}`,
	};
	const idem = request.headers.get("idempotency-key");
	if (idem) headers["Idempotency-Key"] = idem;
	if (request.headers.get("content-type"))
		headers["Content-Type"] = request.headers.get("content-type") as string;
	const init: RequestInit = {
		method: request.method,
		headers,
		cache: "no-store",
	};
	if (request.method !== "GET") init.body = await request.text();
	const response = await fetch(
		`${apiUrl}/v1/agent-runs/${id}${action ? `/${action}` : ""}`,
		init,
	);
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
	context: { params: Promise<{ id: string }> },
) {
	return proxy(request, (await context.params).id);
}
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const url = new URL(request.url);
	return proxy(
		request,
		(await context.params).id,
		url.pathname.endsWith("/checkpoint")
			? "checkpoint"
			: url.pathname.endsWith("/rollback")
				? "rollback"
				: undefined,
	);
}
