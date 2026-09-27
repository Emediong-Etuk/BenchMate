import { describe, expect, it } from "vitest";
import { backoffMs, chooseMode, rolloverAt } from "@/lib/voice/reconnect";

describe("reconnect policy", () => {
  it("backs off 1, 2, 4, 8 s then stays at 8 s", () => {
    expect([0, 1, 2, 3, 4, 9].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it("resumes inside the 30 s grace window, otherwise starts fresh", () => {
    expect(chooseMode({ sessionId: "sess_1", droppedAt: 0, now: 29_000, resumeFailed: false })).toBe("resume");
    expect(chooseMode({ sessionId: "sess_1", droppedAt: 0, now: 31_000, resumeFailed: false })).toBe("fresh");
    expect(chooseMode({ sessionId: "sess_1", droppedAt: 0, now: 1_000, resumeFailed: true })).toBe("fresh");
    expect(chooseMode({ sessionId: null, droppedAt: 0, now: 1_000, resumeFailed: false })).toBe("fresh");
  });

  it("rolls over 5 minutes before expiry, or halfway for short sessions", () => {
    const ready = 1_000_000;
    expect(rolloverAt(ready, (ready + 3 * 3600_000) / 1000)).toBe(ready + 3 * 3600_000 - 300_000);
    expect(rolloverAt(ready, (ready + 120_000) / 1000)).toBe(ready + 60_000);
  });
});
