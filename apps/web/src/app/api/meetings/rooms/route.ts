import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

export async function GET() {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const organization = store.get("oryon_org")?.value;
	if (!session || !organization) return NextResponse.json({ error: { message: "UNAUTHENTICATED" } }, { status: 401 });
	const response = await fetch(`${apiUrl}/v1/rooms`, { headers: { "X-Oryon-Org": organization, Cookie: `${cookieName}=${encodeURIComponent(session)}` }, cache: "no-store" });
	return NextResponse.json(await response.json(), { status: response.status });
}
