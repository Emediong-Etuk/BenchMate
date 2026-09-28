import type { BenchSession, Draft, Settings } from "./types";

// Pure helpers for keeping the in-browser store and the user's account in
// step. The store is the working copy during a run (tool handlers need it
// synchronously); the account on the server is the durable record. A small
// per-user cache in localStorage bridges reloads and short network drops.

export type Prefs = {
  settings: Settings;
  researcherName: string;
  draft: Draft | null;
  activeSessionId: string | null;
};

export type LocalCache = {
  version: 2;
  userId: string;
  prefs: Prefs;
  /** Sessions changed locally and not yet confirmed saved to the account, plus the active one. */
  sessions: BenchSession[];
  unsynced: string[];
  prefsUnsynced: boolean;
  /** Sessions deleted here whose delete hasn't reached the account yet. */
  deleted: string[];
};

export const CACHE_PREFIX = "benchmate:v2:";
export const LAST_USER_KEY = "benchmate:last-user";

export function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

/** When a session last changed; older sessions without updatedAt fall back to their start time. */
export function changedAt(s: BenchSession): number {
  return Date.parse(s.updatedAt ?? s.endedAt ?? s.startedAt) || 0;
}

/**
 * Server sessions are the base. A cached copy wins only if it has unsynced
 * local changes that are newer than the server's copy; those ids are
 * returned so they get pushed.
 */
export function mergeSessions(
  server: BenchSession[],
  cached: BenchSession[],
  unsynced: ReadonlySet<string>,
): { sessions: BenchSession[]; toPush: string[] } {
  const byId = new Map(server.map((s) => [s.id, s]));
  const toPush: string[] = [];
  for (const c of cached) {
    if (!unsynced.has(c.id)) continue;
    const s = byId.get(c.id);
    if (!s || changedAt(c) > changedAt(s)) {
      byId.set(c.id, c);
      toPush.push(c.id);
    }
  }
  const sessions = [...byId.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return { sessions, toPush };
}

/** Ids whose object changed since the last successful save (the store replaces objects on every change). */
export function changedSessionIds(current: readonly BenchSession[], lastSaved: ReadonlyMap<string, BenchSession>): string[] {
  return current.filter((s) => lastSaved.get(s.id) !== s).map((s) => s.id);
}

export function prefsChanged(a: Prefs, b: Prefs | null): boolean {
  return !b || a.settings !== b.settings || a.researcherName !== b.researcherName || a.draft !== b.draft || a.activeSessionId !== b.activeSessionId;
}
