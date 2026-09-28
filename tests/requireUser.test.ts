import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
const { sameOrigin } = await import("@/lib/server/requireUser");

const req = (method: string, headers: Record<string, string>) => new Request("https://bench.example/api/x", { method, headers });

describe("sameOrigin", () => {
  it("allows reads and same-origin writes", () => {
    expect(sameOrigin(req("GET", { origin: "https://evil.example", host: "bench.example" }))).toBe(true);
    expect(sameOrigin(req("PUT", { origin: "https://bench.example", host: "bench.example" }))).toBe(true);
    expect(sameOrigin(req("PUT", { host: "bench.example" }))).toBe(true);
  });

  it("refuses cross-site writes", () => {
    expect(sameOrigin(req("PUT", { origin: "https://evil.example", host: "bench.example" }))).toBe(false);
    expect(sameOrigin(req("DELETE", { origin: "null", host: "bench.example" }))).toBe(false);
  });
});
