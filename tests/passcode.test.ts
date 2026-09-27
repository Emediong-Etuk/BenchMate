import { describe, expect, it } from "vitest";
import { PASS_TTL_MS, safeEqual, signPass, verifyPass } from "@/lib/server/passcode";

describe("passcode cookie", () => {
  it("verifies its own signature until expiry", async () => {
    const now = 1_000_000;
    const token = await signPass("s3cret", now);
    expect(await verifyPass("s3cret", token, now + 1000)).toBe(true);
    expect(await verifyPass("s3cret", token, now + PASS_TTL_MS + 1)).toBe(false);
  });

  it("rejects a different secret, a tampered expiry, and junk", async () => {
    const token = await signPass("s3cret", 0);
    expect(await verifyPass("other", token, 1)).toBe(false);
    const [v, exp, sig] = token.split(".");
    expect(await verifyPass("s3cret", `${v}.${Number(exp) + 1_000_000}.${sig}`, 1)).toBe(false);
    expect(await verifyPass("s3cret", "garbage", 1)).toBe(false);
    expect(await verifyPass("s3cret", undefined, 1)).toBe(false);
  });

  it("compares strings in constant time semantics", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
