import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function authHeaders(): Promise<Record<string, string> | null> {
  const store = await cookies();
  const session = store.get(cookieName)?.value;
  const organization = store.get("oryon_org")?.value;
  if (!session || !organization) return null;
  return { "X-Oryon-Org": organization, Cookie: `${cookieName}=${encodeURIComponent(session)}` };
}

async function forward(request: Request, segments: string[], method: string): Promise<NextResponse> {
  const headers = await authHeaders();
  if (!headers) return NextResponse.json({ error: { message: "UNAUTHENTICATED" } }, { status: 401 });
  const url = new URL(`${apiUrl}/v1/${segments.map(encodeURIComponent).join("/")}`);
  const incoming = new URL(request.url);
  url.search = incoming.search;
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { "Content-Type": request.headers.get("content-type") ?? "application/json", "Idempotency-Key": request.headers.get("idempotency-key") ?? crypto.randomUUID() }),
    },
    body,
    cache: "no-store",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function GET(request: Request, context: { params: Promise<{ segments: string[] }> }) { return forward(request, (await context.params).segments, "GET"); }
export async function POST(request: Request, context: { params: Promise<{ segments: string[] }> }) { return forward(request, (await context.params).segments, "POST"); }
export async function PATCH(request: Request, context: { params: Promise<{ segments: string[] }> }) { return forward(request, (await context.params).segments, "PATCH"); }
export async function DELETE(request: Request, context: { params: Promise<{ segments: string[] }> }) { return forward(request, (await context.params).segments, "DELETE"); }
