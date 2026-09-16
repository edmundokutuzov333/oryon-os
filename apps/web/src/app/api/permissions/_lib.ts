import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

export async function proxyPermissionRequest(request: Request, path: string, includeBody = true) {
	const cookieStore = await cookies();
	const session = cookieStore.get(cookieName)?.value;
	const orgId = cookieStore.get("oryon_org")?.value;
	if (!session || !orgId) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, { status: 401 });
	const headers = new Headers({
		"X-Oryon-Org": orgId,
		Cookie: `${cookieName}=${encodeURIComponent(session)}`,
		"Idempotency-Key": randomUUID(),
	});
	if (includeBody) headers.set("Content-Type", "application/json");
	const response = await fetch(`${apiUrl}${path}`, {
		method: request.method,
		headers,
		body: includeBody ? await request.text() : undefined,
		cache: "no-store",
	});
	return NextResponse.json(await response.json(), { status: response.status });
}
