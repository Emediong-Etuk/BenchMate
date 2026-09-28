import { describe, expect, it } from "vitest";
import { cacheKey, changedAt, changedSessionIds, mergeSessions, prefsChanged, type Prefs } from "@/lib/store/sync";
import { DEFAULT_SETTINGS, type BenchSession } from "@/lib/store/types";

function mk(id: string, startedAt: string, updatedAt?: string): BenchSession {
  return {
    id,
    protocol: { id: "p", title: id, source: "sample", keyterms: [], createdAt: startedAt, steps: [] },
    samples: [],
    startedAt,
    updatedAt,
    assemblyaiSessionIds: [],
    currentStep: 0,
    stepEvents: [],
    entries: [],
    timers: [],
    transcript: [],
    settings: { voice: "alba", transcriptionMode: "balanced", voiceFocus: "far-field", volume: 100 },
  };
}

describe("account sync helpers", () => {
  it("keys the local cache by user", () => {
    expect(cacheKey("u1")).not.toBe(cacheKey("u2"));
  });

  it("falls back to startedAt when a session has no updatedAt", () => {
    expect(changedAt(mk("a", "2026-01-01T00:00:00Z"))).toBe(Date.parse("2026-01-01T00:00:00Z"));
  });

  it("prefers a newer unsynced cached copy and schedules it for upload", () => {
    const server = [mk("a", "2026-01-01T00:00:00Z", "2026-01-01T00:05:00Z")];
    const cached = [mk("a", "2026-01-01T00:00:00Z", "2026-01-01T00:09:00Z")];
    const out = mergeSessions(server, cached, new Set(["a"]));
    expect(out.sessions[0]!.updatedAt).toBe("2026-01-01T00:09:00Z");
    expect(out.toPush).toEqual(["a"]);
  });

  it("keeps the server copy when the cached one is older or already synced", () => {
    const server = [mk("a", "2026-01-01T00:00:00Z", "2026-01-01T00:09:00Z")];
    const older = [mk("a", "2026-01-01T00:00:00Z", "2026-01-01T00:01:00Z")];
    expect(mergeSessions(server, older, new Set(["a"])).toPush).toEqual([]);
    const newerButSynced = [mk("a", "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")];
    const out = mergeSessions(server, newerButSynced, new Set());
    expect(out.toPush).toEqual([]);
    expect(out.sessions[0]!.updatedAt).toBe("2026-01-01T00:09:00Z");
  });

  it("adds sessions that only exist locally (created offline) and sorts newest first", () => {
    const server = [mk("old", "2026-01-01T00:00:00Z")];
    const cached = [mk("new", "2026-02-01T00:00:00Z")];
    const out = mergeSessions(server, cached, new Set(["new"]));
    expect(out.sessions.map((s) => s.id)).toEqual(["new", "old"]);
    expect(out.toPush).toEqual(["new"]);
  });

  it("detects changed sessions by identity", () => {
    const a = mk("a", "2026-01-01T00:00:00Z");
    const b = mk("b", "2026-01-01T00:00:00Z");
    const saved = new Map([
      ["a", a],
      ["b", b],
    ]);
    const b2 = { ...b, currentStep: 1 };
    expect(changedSessionIds([a, b2], saved)).toEqual(["b"]);
  });

  it("detects preference changes", () => {
    const p: Prefs = { settings: DEFAULT_SETTINGS, researcherName: "", draft: null, activeSessionId: null };
    expect(prefsChanged(p, null)).toBe(true);
    expect(prefsChanged(p, p)).toBe(false);
    expect(prefsChanged({ ...p, researcherName: "Ada" }, p)).toBe(true);
  });
});
