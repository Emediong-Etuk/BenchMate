"use client";

import { create } from "zustand";
import type { ParseResult, Protocol } from "@/lib/protocol/types";
import { parseSamples } from "@/lib/agent/format";
import { browserStorage, createDebouncedWriter, loadJSON, saveJSON } from "./persistence";
import { DEFAULT_SETTINGS, type BenchSession, type Draft, type Settings } from "./types";

// The authoritative, persisted store: settings, the protocol draft being
// reviewed, and bench sessions (brief §7, §14). Phase 3 adds the tool
// handlers that mutate the active session.

export const MAX_SESSIONS = 20;

type Persisted = {
  version: 1;
  settings: Settings;
  researcherName: string;
  draft: Draft | null;
  sessions: BenchSession[];
  activeSessionId: string | null;
};

type BenchState = Omit<Persisted, "version"> & {
  hydrated: boolean;
  storageError: string | null;

  hydrate(): void;
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
};

const STORAGE_FULL = "Browser storage is full, so recent changes may not be saved. Delete an old session from the home screen.";

let persistenceStarted = false;

export const useBenchStore = create<BenchState>((set, get) => ({
  hydrated: false,
  storageError: null,
  settings: DEFAULT_SETTINGS,
  researcherName: "",
  draft: null,
  sessions: [],
  activeSessionId: null,

  hydrate() {
    if (get().hydrated) return;
    const saved = loadJSON<Partial<Persisted>>(browserStorage());
    set({
      hydrated: true,
      settings: { ...DEFAULT_SETTINGS, ...(saved?.settings ?? {}) },
      researcherName: typeof saved?.researcherName === "string" ? saved.researcherName : "",
      draft: saved?.draft && Array.isArray(saved.draft.protocol?.steps) ? saved.draft : null,
      sessions: Array.isArray(saved?.sessions) ? saved.sessions.filter((s) => s && Array.isArray(s.protocol?.steps)) : [],
      activeSessionId: typeof saved?.activeSessionId === "string" ? saved.activeSessionId : null,
    });
    startPersistence();
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
      id: `s-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      protocol: structuredClone(protocol),
      researcherName: researcherName.trim() || undefined,
      samples: parseSamples(draft.samplesInput),
      startedAt: now.toISOString(),
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
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? fn(x) : x)) }));
  },

  deleteSession(id) {
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    }));
  },
}));

function renumber(protocol: Protocol): Protocol {
  return { ...protocol, steps: protocol.steps.map((st, i) => ({ ...st, number: i + 1 })) };
}

/** Keep the newest MAX_SESSIONS; never drop the active one. */
export function capSessions(sessions: BenchSession[], keepId: string | null): BenchSession[] {
  if (sessions.length <= MAX_SESSIONS) return sessions;
  const head = sessions.slice(0, MAX_SESSIONS);
  if (!keepId || head.some((s) => s.id === keepId)) return head;
  const keep = sessions.find((s) => s.id === keepId);
  return keep ? [...sessions.slice(0, MAX_SESSIONS - 1), keep] : head;
}

function snapshot(): Persisted {
  const s = useBenchStore.getState();
  return {
    version: 1,
    settings: s.settings,
    researcherName: s.researcherName,
    draft: s.draft,
    sessions: s.sessions,
    activeSessionId: s.activeSessionId,
  };
}

function startPersistence() {
  if (persistenceStarted || typeof window === "undefined") return;
  persistenceStarted = true;
  const writer = createDebouncedWriter(() => {
    const ok = saveJSON(browserStorage(), snapshot());
    const current = useBenchStore.getState().storageError;
    if (!ok && current !== STORAGE_FULL) useBenchStore.setState({ storageError: STORAGE_FULL });
    if (ok && current) useBenchStore.setState({ storageError: null });
  });
  useBenchStore.subscribe((state, prev) => {
    // Ignore changes to the non-persisted fields.
    if (
      state.settings !== prev.settings ||
      state.researcherName !== prev.researcherName ||
      state.draft !== prev.draft ||
      state.sessions !== prev.sessions ||
      state.activeSessionId !== prev.activeSessionId
    ) {
      writer.schedule();
    }
  });
  window.addEventListener("pagehide", () => writer.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") writer.flush();
  });
}
