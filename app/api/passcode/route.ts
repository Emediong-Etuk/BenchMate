import { NextResponse } from "next/server";
import { PASS_COOKIE, PASS_TTL_MS, safeEqual, signPass } from "@/lib/server/passcode";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

export async function POST(request: Request) {
  const secret = process.env.DEMO_PASSCODE;
  if (!secret) return NextResponse.json({ ok: true, gated: false });
  if (!limiter.check(clientIp(request.headers)).ok) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as { passcode?: unknown };
  const given = typeof body.passcode === "string" ? body.passcode.trim() : "";
  if (!given || !safeEqual(given, secret)) {
    return NextResponse.json({ error: "That passcode isn't right." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PASS_COOKIE, await signPass(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(PASS_TTL_MS / 1000),
  });
  return res;
}
