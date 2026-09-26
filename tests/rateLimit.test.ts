import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit per window, per key", () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("a", 10).ok).toBe(true);
    expect(rl.check("a", 20)).toEqual({ ok: false, retryAfterMs: 980 });
    expect(rl.check("b", 20).ok).toBe(true);
    expect(rl.check("a", 1001).ok).toBe(true);
  });

  it("reads the first x-forwarded-for address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("local");
  });
});
