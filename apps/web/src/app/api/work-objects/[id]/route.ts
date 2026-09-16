import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function authHeaders(): Promise<Record<string, string> | null> {
  const store = await cookies();
  const session = store.get(cookieName)?.value;
  const organization = store.get("oryon_org")?.value;
  if (!session || !organization) return null;
  return { "Content-Type": "application/json", "X-Oryon-Org": organization, Cookie: `${cookieName}=${encodeURIComponent(session)}` };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = await authHeaders();
  if (!headers) return NextResponse.json({ error: { message: "UNAUTHENTICATED" } }, { status: 401 });
  const { id } = await context.params;
  const response = await fetch(`${apiUrl}/v1/work-objects/${encodeURIComponent(id)}`, { headers, cache: "no-store" });
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = await authHeaders();
  if (!headers) return NextResponse.json({ error: { message: "UNAUTHENTICATED" } }, { status: 401 });
  const { id } = await context.params;
  const body = await request.text();
  const response = await fetch(`${apiUrl}/v1/work-objects/${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, body, cache: "no-store" });
  return NextResponse.json(await response.json(), { status: response.status });
}
