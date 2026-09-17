import { cookies } from "next/headers";
import { NextResponse } from "next/server";
const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";
export async function ALL(
	request: Request,
	context: { params: Promise<{ path: string[] }> },
) {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const org = store.get("oryon_org")?.value;
	if (!session || !org)
		return NextResponse.json(
			{
				error: {
					code: "UNAUTHENTICATED",
					httpStatus: 401,
					message: "Authentication required",
				},
			},
			{ status: 401 },
		);
	const { path } = await context.params;
	const target = `${apiUrl}/v1/platform/${path.join("/")}${new URL(request.url).search}`;
	const headers = new Headers(request.headers);
	headers.set("X-Oryon-Org", org);
	headers.set("Cookie", `${cookieName}=${encodeURIComponent(session)}`);
	headers.delete("host");
	if (
		["POST", "PATCH", "DELETE"].includes(request.method) &&
		!headers.has("Idempotency-Key")
	)
		headers.set("Idempotency-Key", crypto.randomUUID());
	const response = await fetch(target, {
		method: request.method,
		headers,
		body:
			request.method === "GET" || request.method === "HEAD"
				? undefined
				: await request.text(),
		cache: "no-store",
	});
	return new NextResponse(await response.text(), {
		status: response.status,
		headers: {
			"content-type":
				response.headers.get("content-type") ?? "application/json",
		},
	});
}
export const GET = ALL;
export const POST = ALL;
export const PATCH = ALL;
export const DELETE = ALL;
