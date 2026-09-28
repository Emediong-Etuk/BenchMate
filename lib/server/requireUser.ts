import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbConfigured } from "@/lib/db";

// Route-level guard. The proxy already blocks signed-out requests; this is the
// second check, and the only source of the user id that queries filter on.

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

export type Authed = { ok: true; userId: string } | { ok: false; response: NextResponse };

export async function requireUser(request?: Request, { needsDb = false } = {}): Promise<Authed> {
  if (request && !sameOrigin(request)) return { ok: false, response: json({ error: "Cross-site request refused." }, 403) };
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, response: json({ error: "Please sign in." }, 401) };
  if (needsDb && !dbConfigured()) {
    console.error("[auth] DATABASE_URL is not set");
    return { ok: false, response: json({ error: "Account storage is not configured on the server." }, 500) };
  }
  return { ok: true, userId };
}

/** Rejects state-changing requests from other sites (belt and braces on top of SameSite cookies). */
export function sameOrigin(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers, server-to-server calls
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Reads a JSON body with a byte cap. */
export async function readJson(request: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const text = await request.text().catch(() => null);
  if (text === null) return { ok: false, response: json({ error: "Couldn't read the request." }, 400) };
  if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, response: json({ error: "That's too large to save." }, 413) };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: json({ error: "Invalid JSON." }, 400) };
  }
}
