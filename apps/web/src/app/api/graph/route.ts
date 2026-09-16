import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function headersForSession(): Promise<HeadersInit | null> {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const organization = store.get("oryon_org")?.value;
	if (!session || !organization) return null;
	return { "X-Oryon-Org": organization, Cookie: `${cookieName}=${encodeURIComponent(session)}` };
}

export async function GET(request: Request): Promise<Response> {
	const headers = await headersForSession();
	if (!headers) return NextResponse.json({ error: { message: "UNAUTHENTICATED" } }, { status: 401 });
	const url = new URL(request.url);
	const target = `${apiUrl}/v1/graph/traverse${url.search}`;
	const response = await fetch(target, { headers, cache: "no-store" });
	return NextResponse.json(await response.json(), { status: response.status });
}
