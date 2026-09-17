import { cookies } from "next/headers";
import { NextResponse } from "next/server";
const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";
async function forward(request: Request, id: string, action?: string) {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const org = store.get("oryon_org")?.value;
	if (!session || !org)
		return NextResponse.json(
			{
				error: { code: "UNAUTHENTICATED", message: "Authentication required" },
			},
			{ status: 401 },
		);
	const headers: Record<string, string> = {
		"X-Oryon-Org": org,
		Cookie: `${cookieName}=${encodeURIComponent(session)}`,
	};
	if (action) {
		headers["Content-Type"] =
			request.headers.get("content-type") ?? "application/json";
		headers["Idempotency-Key"] =
			request.headers.get("idempotency-key") ?? crypto.randomUUID();
	}
	const init: RequestInit = {
		method: action ? "POST" : "GET",
		headers,
		cache: "no-store",
	};
	if (action) init.body = await request.text();
	const response = await fetch(
		`${apiUrl}/v1/workflow-runs/${id}${action ? `/${action}` : ""}`,
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
	return forward(request, (await context.params).id);
}
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const url = new URL(request.url);
	return forward(
		request,
		(await context.params).id,
		url.pathname.endsWith("/approve") ? "approve" : undefined,
	);
}
