import { cookies } from "next/headers";
import { NextResponse } from "next/server";
const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";
async function authHeaders() { const store = await cookies(); const session = store.get(cookieName)?.value; const organization = store.get("oryon_org")?.value; return session && organization ? { "X-Oryon-Org": organization, Cookie: `${cookieName}=${encodeURIComponent(session)}` } : null; }
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { const headers = await authHeaders(); if (!headers) return NextResponse.json({ error: { message: "UNAUTHENTICATED" } }, { status: 401 }); const { id } = await context.params; const response = await fetch(`${apiUrl}/v1/files/${encodeURIComponent(id)}`, { headers, cache: "no-store" }); return NextResponse.json(await response.json(), { status: response.status }); }
