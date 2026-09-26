import { describe, expect, it, vi } from "vitest";
import { createDebouncedWriter, loadJSON, saveJSON, type StorageLike } from "@/lib/store/persistence";
import { MAX_SESSIONS, capSessions } from "@/lib/store/benchStore";
import type { BenchSession } from "@/lib/store/types";

function memoryStorage(opts: { failWrites?: boolean } = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (opts.failWrites) throw new DOMException("quota", "QuotaExceededError");
      data.set(k, v);
    },
  };
}

describe("persistence helpers", () => {
  it("round-trips JSON and survives corrupt data", () => {
    const st = memoryStorage();
    expect(saveJSON(st, { a: 1 }, "k")).toBe(true);
    expect(loadJSON(st, "k")).toEqual({ a: 1 });
    st.data.set("k", "{not json");
    expect(loadJSON(st, "k")).toBeNull();
    expect(loadJSON(null, "k")).toBeNull();
  });

  it("reports failed writes instead of throwing", () => {
    expect(saveJSON(memoryStorage({ failWrites: true }), { a: 1 }, "k")).toBe(false);
  });

  it("debounces writes and flushes on demand", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const w = createDebouncedWriter(write, 250);
    w.schedule();
    w.schedule();
    vi.advanceTimersByTime(200);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(write).toHaveBeenCalledTimes(1);
    w.schedule();
    w.flush();
    expect(write).toHaveBeenCalledTimes(2);
    w.flush(); // nothing pending
    expect(write).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("capSessions", () => {
  const mk = (id: string) => ({ id }) as BenchSession;

  it("keeps the newest sessions up to the cap", () => {
    const list = Array.from({ length: MAX_SESSIONS + 3 }, (_, i) => mk(`s${i}`));
    const out = capSessions(list, "s0");
    expect(out).toHaveLength(MAX_SESSIONS);
    expect(out[0]!.id).toBe("s0");
  });

  it("never drops the active session even if it's the oldest", () => {
    const list = Array.from({ length: MAX_SESSIONS + 2 }, (_, i) => mk(`s${i}`));
    const oldest = list[list.length - 1]!.id;
    const out = capSessions(list, oldest);
    expect(out).toHaveLength(MAX_SESSIONS);
    expect(out.map((s) => s.id)).toContain(oldest);
  });
});
