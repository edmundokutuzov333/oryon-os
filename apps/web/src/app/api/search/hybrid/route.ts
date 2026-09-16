import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function authHeaders(): Promise<Record<string, string> | null> {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const organization = store.get("oryon_org")?.value;
	return session && organization ? { "X-Oryon-Org": organization, Cookie: `${cookieName}=${encodeURIComponent(session)}` } : null;
}

export async function GET(request: Request): Promise<NextResponse> {
	const headers = await authHeaders();
	if (!headers) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, { status: 401 });
	const url = new URL(request.url);
	const response = await fetch(`${apiUrl}/v1/search/hybrid?${url.searchParams.toString()}`, { headers, cache: "no-store" });
	return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" } });
}
