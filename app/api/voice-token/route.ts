import { NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/server/rateLimit";
import { requireUser } from "@/lib/server/requireUser";

// Mints a single-use Voice Agent API token (NOTES.md §2 Auth) for a signed-in
// user. The API key never leaves this handler.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN_URL = "https://agents.assemblyai.com/v1/token";
const EXPIRES_IN_SECONDS = 120;
const MAX_SESSION_DURATION_SECONDS = 10_800;

// Reconnect attempts each need a fresh token, so leave headroom for a flaky network.
const limiter = createRateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 });

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

export async function GET(request: Request) {
  const a = await requireUser(request);
  if (!a.ok) return a.response;

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    console.error("[voice-token] ASSEMBLYAI_API_KEY is not set");
    return json({ error: "Voice service is not configured on the server." }, 500);
  }

  const limit = limiter.check(a.userId);
  if (!limit.ok) {
    const seconds = Math.ceil(limit.retryAfterMs / 1000);
    return json({ error: `Too many connection attempts. Try again in ${seconds} s.` }, 429, {
      "Retry-After": String(seconds),
    });
  }

  const url = new URL(TOKEN_URL);
  url.searchParams.set("expires_in_seconds", String(EXPIRES_IN_SECONDS));
  url.searchParams.set("max_session_duration_seconds", String(MAX_SESSION_DURATION_SECONDS));

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[voice-token] upstream ${res.status}: ${detail.slice(0, 300)}`);
      const status = res.status === 429 ? 429 : 502;
      return json({ error: `Voice service refused the token request (${res.status}).` }, status);
    }
    const body = (await res.json()) as { token?: unknown; expires_in_seconds?: unknown };
    if (typeof body.token !== "string") {
      console.error("[voice-token] upstream response had no token");
      return json({ error: "Voice service returned an unexpected response." }, 502);
    }
    return json({ token: body.token, expires_in_seconds: body.expires_in_seconds ?? EXPIRES_IN_SECONDS });
  } catch (err) {
    console.error("[voice-token] request failed:", err instanceof Error ? err.message : err);
    return json({ error: "Couldn't reach the voice service. Check the network and retry." }, 502);
  }
}
