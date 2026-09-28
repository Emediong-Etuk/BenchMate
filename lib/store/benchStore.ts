"use client";

import { create } from "zustand";
import type { ParseResult, Protocol } from "@/lib/protocol/types";
import { parseSamples } from "@/lib/agent/format";
import { browserStorage, createDebouncedWriter, loadJSON, saveJSON } from "./persistence";
import {
  cacheKey,
  changedSessionIds,
  LAST_USER_KEY,
  mergeSessions,
  prefsChanged,
  type LocalCache,
  type Prefs,
} from "./sync";
import { DEFAULT_SETTINGS, type BenchSession, type Settings } from "./types";

// The working copy of the signed-in user's data: settings, the protocol draft,
// and bench sessions (brief §7). It loads from the account on the server and
// saves changes back in the background; a per-user localStorage cache covers
// reloads and short network drops. Tool handlers mutate the active session
// here synchronously, exactly as before accounts.

/** Full sessions kept in memory; older ones stay in the account and load on demand. */
export const MAX_SESSIONS = 30;

export type AccountUser = { id: string; name: string | null; email: string | null; image: string | null };
export type AccountStats = { sessions: number; finished: number; entries: number; seconds: number };
export type SyncState = "saved" | "saving" | "offline" | "error";

type BenchState = Prefs & {
  sessions: BenchSession[];
  hydrated: boolean;
  user: AccountUser | null;
  stats: AccountStats | null;
  syncState: SyncState;
  loadError: string | null;
  storageError: string | null;

  hydrate(): Promise<void>;
  setDraftFromParse(result: ParseResult, samplesInput?: string): void;
  setDraftProtocol(protocol: Protocol): void;
  setDraftSamples(samplesInput: string): void;
  dismissMissingNumbers(): void;
  clearDraft(): void;
  setResearcherName(name: string): void;
  updateSettings(patch: Partial<Settings>): void;
  /** Snapshot the draft into a new active session. Returns its id, or null if there's no usable draft. */
  startSession(now?: Date): string | null;
  updateSession(id: string, fn: (s: BenchSession) => BenchSession): void;
  deleteSession(id: string): void;
  /** Loads an older session from the account into memory. */
  loadSession(id: string): Promise<"ok" | "missing" | "error">;
  /** Forget this user's cached data in this browser (on sign-out / account deletion). */
  clearLocalData(): void;
};

type MeResponse = { user: AccountUser; prefs: Partial<Prefs> | null; sessions: unknown[]; stats: AccountStats };

let hydrating = false;
let persistenceUserId: string | null = null;
let lastSaved = new Map<string, BenchSession>();
let lastSavedPrefs: Prefs | null = null;
let pendingDeletes = new Set<string>();

export const useBenchStore = create<BenchState>((set, get) => ({
  hydrated: false,
  user: null,
  stats: null,
  syncState: "saved",
  loadError: null,
  storageError: null,
  settings: DEFAULT_SETTINGS,
  researcherName: "",
  draft: null,
  sessions: [],
  activeSessionId: null,

  async hydrate() {
    if (get().hydrated || hydrating || typeof window === "undefined") return;
    hydrating = true;
    try {
      let me: MeResponse | null = null;
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (res.status === 401) {
          // Outside React (store action): a full navigation is intended here.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = `/signin?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        me = (await res.json()) as MeResponse;
      } catch {
        me = null;
      }

      const storage = browserStorage();
      const userId = me?.user.id ?? loadJSON<string>(storage, LAST_USER_KEY);
      if (!userId) {
        set({ hydrated: true, loadError: "Couldn't reach your account. Check your connection and reload." });
        return;
      }
      const raw = loadJSON<LocalCache>(storage, cacheKey(userId));
      const cache = raw && raw.version === 2 && raw.userId === userId ? raw : null;
      pendingDeletes = new Set(cache?.deleted ?? []);

      const serverSessions = validSessions(me?.sessions ?? []).filter((s) => !pendingDeletes.has(s.id));
      const { sessions, toPush } = mergeSessions(serverSessions, validSessions(cache?.sessions ?? []), new Set(cache?.unsynced ?? []));

      const serverPrefs = me?.prefs ?? null;
      const usePrefsCache = Boolean(cache && (cache.prefsUnsynced || !me));
      const p: Partial<Prefs> = (usePrefsCache ? cache?.prefs : serverPrefs) ?? {};
      const prefs: Prefs = {
        settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
        researcherName: typeof p.researcherName === "string" ? p.researcherName : "",
        draft: p.draft && Array.isArray(p.draft.protocol?.steps) ? p.draft : null,
        activeSessionId: typeof p.activeSessionId === "string" ? p.activeSessionId : null,
      };

      set({
        hydrated: true,
        user: me?.user ?? null,
        stats: me?.stats ?? null,
        loadError: me ? null : "You're offline. Changes are kept in this browser and will save to your account when you reconnect.",
        syncState: me ? "saved" : "offline",
        ...prefs,
        sessions: capSessions(sessions, prefs.activeSessionId),
      });

      // Everything that came from the server counts as saved; pushed items don't.
      const pushing = new Set(toPush);
      lastSaved = new Map(me ? sessions.filter((s) => !pushing.has(s.id)).map((s) => [s.id, s]) : []);
      lastSavedPrefs = me && !cache?.prefsUnsynced ? currentPrefs() : null;
      saveJSON(storage, userId, LAST_USER_KEY);
      startPersistence(userId);
    } finally {
      hydrating = false;
    }
  },

  setDraftFromParse(result, samplesInput = "") {
    set({
      draft: {
        protocol: result.protocol,
        parseSource: result.source,
        missingNumbers: result.missingNumbers,
        note: result.note,
        samplesInput,
      },
    });
  },
  setDraftProtocol(protocol) {
    const d = get().draft;
    if (d) set({ draft: { ...d, protocol } });
  },
  setDraftSamples(samplesInput) {
    const d = get().draft;
    if (d) set({ draft: { ...d, samplesInput } });
  },
  dismissMissingNumbers() {
    const d = get().draft;
    if (d) set({ draft: { ...d, missingNumbers: [] } });
  },
  clearDraft: () => set({ draft: null }),
  setResearcherName: (researcherName) => set({ researcherName }),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  startSession(now = new Date()) {
    const { draft, settings, researcherName, sessions } = get();
    if (!draft || draft.protocol.steps.length === 0) return null;
    const protocol = renumber(draft.protocol);
    const session: BenchSession = {
      id: `s-${now.getTime().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
      protocol: structuredClone(protocol),
      researcherName: researcherName.trim() || undefined,
      samples: parseSamples(draft.samplesInput),
      startedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      assemblyaiSessionIds: [],
      currentStep: 0,
      stepEvents: [],
      entries: [],
      timers: [],
      transcript: [],
      settings: {
        voice: settings.voice,
        transcriptionMode: settings.transcriptionMode,
        voiceFocus: settings.voiceFocus,
        volume: settings.volume,
      },
    };
    set({ sessions: capSessions([session, ...sessions], session.id), activeSessionId: session.id });
    return session.id;
  },

  updateSession(id, fn) {
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== id) return x;
        const next = fn(x);
        return next === x ? x : { ...next, updatedAt: new Date().toISOString() };
      }),
    }));
  },

  deleteSession(id) {
    pendingDeletes.add(id);
    lastSaved.delete(id);
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    }));
  },

  async loadSession(id) {
    if (get().sessions.some((s) => s.id === id)) return "ok";
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (res.status === 404) return "missing";
      if (!res.ok) return "error";
      const body = (await res.json()) as { session?: unknown };
      const [session] = validSessions([body.session]);
      if (!session) return "error";
      lastSaved.set(session.id, session);
      set((s) => ({ sessions: s.sessions.some((x) => x.id === id) ? s.sessions : [...s.sessions, session] }));
      return "ok";
    } catch {
      return "error";
    }
  },

  clearLocalData() {
    const storage = browserStorage();
    const userId = persistenceUserId ?? get().user?.id;
    try {
      if (userId) storage?.removeItem(cacheKey(userId));
      storage?.removeItem(LAST_USER_KEY);
    } catch {
      // ignore
    }
    persistenceUserId = null;
  },
}));

function renumber(protocol: Protocol): Protocol {
  return { ...protocol, steps: protocol.steps.map((st, i) => ({ ...st, number: i + 1 })) };
}

function validSessions(list: unknown[]): BenchSession[] {
  return list.filter(
    (s): s is BenchSession =>
      Boolean(s) && typeof (s as BenchSession).id === "string" && Array.isArray((s as BenchSession).protocol?.steps) && Array.isArray((s as BenchSession).entries),
  );
}

/** Keep the newest MAX_SESSIONS in memory; never drop the active one. */
export function capSessions(sessions: BenchSession[], keepId: string | null): BenchSession[] {
  if (sessions.length <= MAX_SESSIONS) return sessions;
  const head = sessions.slice(0, MAX_SESSIONS);
  if (!keepId || head.some((s) => s.id === keepId)) return head;
  const keep = sessions.find((s) => s.id === keepId);
  return keep ? [...sessions.slice(0, MAX_SESSIONS - 1), keep] : head;
}

function currentPrefs(): Prefs {
  const s = useBenchStore.getState();
  return { settings: s.settings, researcherName: s.researcherName, draft: s.draft, activeSessionId: s.activeSessionId };
}

// ---- Persistence: local cache (fast, per user) + account sync (durable) ----

const SYNC_INTERVAL_MS = 2000;
const RETRY_MS = 10_000;
const STORAGE_FULL = "This browser's storage is full, so unsaved changes can't be cached locally. They'll still save to your account while you're online.";

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let syncAgain = false;

function writeCache() {
  const userId = persistenceUserId;
  if (!userId) return;
  const s = useBenchStore.getState();
  const unsynced = changedSessionIds(s.sessions, lastSaved);
  const keep = new Set([...unsynced, ...(s.activeSessionId ? [s.activeSessionId] : [])]);
  const cache: LocalCache = {
    version: 2,
    userId,
    prefs: currentPrefs(),
    sessions: s.sessions.filter((x) => keep.has(x.id)),
    unsynced,
    prefsUnsynced: prefsChanged(currentPrefs(), lastSavedPrefs),
    deleted: [...pendingDeletes],
  };
  const ok = saveJSON(browserStorage(), cache, cacheKey(userId));
  const current = s.storageError;
  if (!ok && current !== STORAGE_FULL) useBenchStore.setState({ storageError: STORAGE_FULL });
  if (ok && current) useBenchStore.setState({ storageError: null });
}

function scheduleSync(delay = SYNC_INTERVAL_MS) {
  if (syncTimer) return; // at most one save per interval, even while the log changes constantly
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncNow();
  }, delay);
}

async function syncNow(): Promise<void> {
  if (!persistenceUserId) return;
  if (syncing) {
    syncAgain = true;
    return;
  }
  syncing = true;
  let failed: "offline" | "error" | null = null;
  try {
    const s = useBenchStore.getState();
    const changed = changedSessionIds(s.sessions, lastSaved);
    const prefs = currentPrefs();
    const prefsDirty = prefsChanged(prefs, lastSavedPrefs);
    if (!changed.length && !prefsDirty && !pendingDeletes.size) {
      if (s.syncState !== "saved") useBenchStore.setState({ syncState: "saved", loadError: null });
      return;
    }
    useBenchStore.setState({ syncState: "saving" });

    for (const id of [...pendingDeletes]) {
      const res = await send(`/api/sessions/${encodeURIComponent(id)}`, "DELETE");
      if (res === "ok" || res === "gone") pendingDeletes.delete(id);
      else failed = res;
    }
    for (const id of changed) {
      const session = useBenchStore.getState().sessions.find((x) => x.id === id);
      if (!session) continue;
      const res = await send(`/api/sessions/${encodeURIComponent(id)}`, "PUT", session);
      // "gone" means the id isn't this user's; stop retrying it.
      if (res === "ok" || res === "gone") lastSaved.set(id, session);
      else failed = res;
    }
    if (prefsDirty) {
      const res = await send("/api/me/prefs", "PUT", prefs);
      if (res === "ok") lastSavedPrefs = prefs;
      else if (res !== "gone") failed = res;
    }
    useBenchStore.setState(failed ? { syncState: failed } : { syncState: "saved", loadError: null });
  } finally {
    syncing = false;
    writeCache();
    if (failed) scheduleSync(RETRY_MS);
    else if (syncAgain) {
      syncAgain = false;
      scheduleSync();
    }
  }
}

async function send(url: string, method: "PUT" | "DELETE", body?: unknown): Promise<"ok" | "gone" | "offline" | "error"> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.ok) return "ok";
    if (res.status === 404) return "gone";
    if (res.status === 401) {
      // Signed out elsewhere: keep the local cache and go to sign-in.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
      return "error";
    }
    console.error(`[sync] ${method} ${url} → ${res.status}`);
    return "error";
  } catch {
    return "offline";
  }
}

function startPersistence(userId: string) {
  if (persistenceUserId === userId) return;
  const first = persistenceUserId === null;
  persistenceUserId = userId;
  if (!first) return;
  const cacheWriter = createDebouncedWriter(writeCache);
  useBenchStore.subscribe((state, prev) => {
    if (
      state.settings !== prev.settings ||
      state.researcherName !== prev.researcherName ||
      state.draft !== prev.draft ||
      state.sessions !== prev.sessions ||
      state.activeSessionId !== prev.activeSessionId
    ) {
      cacheWriter.schedule();
      scheduleSync();
    }
  });
  window.addEventListener("pagehide", () => {
    cacheWriter.flush();
    void syncNow();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      cacheWriter.flush();
      void syncNow();
    }
  });
  window.addEventListener("online", () => void syncNow());
  // Anything merged from the cache on load (unsynced edits, deletes) goes up now.
  scheduleSync(500);
}
