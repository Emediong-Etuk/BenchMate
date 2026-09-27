// Minimal in-memory sliding-window rate limiter. Per server instance only,
// which is fine for a demo: it stops accidental token-minting loops.

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  function check(key: string, now: number = Date.now()): RateLimitResult {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return { ok: false, retryAfterMs: windowMs - (now - recent[0]!) };
    }
    recent.push(now);
    hits.set(key, recent);
    // Opportunistic cleanup so the map can't grow without bound.
    if (hits.size > 5_000) {
      for (const [k, ts] of hits) if (ts.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return { ok: true };
  }

  return { check };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "local";
}
