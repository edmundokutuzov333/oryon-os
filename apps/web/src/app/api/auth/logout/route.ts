import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

export async function POST() {
	const cookieStore = await cookies();
	const org = cookieStore.get("oryon_org")?.value;
	const session = cookieStore.get(cookieName)?.value;
	if (org && session) {
		await fetch(`${apiUrl}/v1/auth/logout`, {
			method: "POST",
			headers: {
				"X-Oryon-Org": org,
				"Idempotency-Key": randomUUID(),
				Cookie: `${cookieName}=${encodeURIComponent(session)}`,
			},
			cache: "no-store",
		});
	}
	cookieStore.delete(cookieName);
	cookieStore.delete("oryon_org");
	return NextResponse.json({ data: { loggedOut: true } });
}
