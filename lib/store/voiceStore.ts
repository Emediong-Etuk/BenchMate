"use client";

import { create } from "zustand";
import type { ConnectionState } from "@/lib/voice/agentStatus";
import { addWord, emptyCaption, type AgentCaption } from "@/lib/voice/captions";
import type { ServerEvent } from "@/lib/voice/events";
import type { LogEntry } from "@/lib/voice/VoiceClient";

// Ephemeral voice/UI state (not persisted). The authoritative bench data
// store arrives in Phase 3.

const MAX_LOG = 400;
const MAX_TRANSCRIPT = 200;

export type DebugRow = LogEntry;
export type TranscriptLine = { role: "user" | "agent"; text: string; at: string; interrupted?: boolean; typed?: boolean };

type VoiceState = {
  connection: ConnectionState;
  connectionMessage: string | null;
  sessionId: string | null;
  muted: boolean;
  userSpeaking: boolean;
  awaitingReply: boolean;
  pendingToolResults: number;
  agentPlaying: boolean;
  micLevel: number;
  userPartial: { itemId: string; text: string } | null;
  agentCaption: AgentCaption | null;
  transcript: TranscriptLine[];
  lastUserUtterance: string;
  log: DebugRow[];

  setConnection(state: ConnectionState, message?: string): void;
  setMuted(muted: boolean): void;
  setPlaying(playing: boolean): void;
  setMicLevel(level: number): void;
  setPendingToolResults(n: number): void;
  markAwaitingReply(): void;
  /** A typed utterance counts as the user's last utterance, like a final transcript. */
  addTypedUtterance(text: string): void;
  replyAudioStarted(replyId: string, at: number): void;
  applyEvent(ev: ServerEvent): void;
  addLogs(entries: LogEntry[]): void;
  clearLog(): void;
};

export const useVoiceStore = create<VoiceState>((set) => ({
  connection: "idle",
  connectionMessage: null,
  sessionId: null,
  muted: false,
  userSpeaking: false,
  awaitingReply: false,
  pendingToolResults: 0,
  agentPlaying: false,
  micLevel: 0,
  userPartial: null,
  agentCaption: null,
  transcript: [],
  lastUserUtterance: "",
  log: [],

  setConnection: (connection, message) =>
    set(() => ({
      connection,
      connectionMessage: message ?? null,
      ...(connection !== "ready" ? { userSpeaking: false, awaitingReply: false } : {}),
      ...(connection === "ended" || connection === "error" ? { micLevel: 0, agentPlaying: false } : {}),
    })),
  setMuted: (muted) => set({ muted }),
  setPlaying: (agentPlaying) => set({ agentPlaying }),
  setMicLevel: (micLevel) => set({ micLevel }),
  setPendingToolResults: (pendingToolResults) => set({ pendingToolResults }),
  markAwaitingReply: () => set({ awaitingReply: true }),
  addTypedUtterance: (text) =>
    set((s) => ({
      awaitingReply: true,
      lastUserUtterance: text,
      transcript: trim([...s.transcript, { role: "user", text, at: new Date().toISOString(), typed: true }], MAX_TRANSCRIPT),
    })),
  replyAudioStarted: (replyId, at) =>
    set((s) => ({
      agentCaption:
        s.agentCaption && s.agentCaption.replyId === replyId
          ? { ...s.agentCaption, playbackStartedAt: at }
          : { ...emptyCaption(replyId), playbackStartedAt: at },
    })),

  applyEvent: (ev) =>
    set((s) => {
      const now = new Date().toISOString();
      switch (ev.type) {
        case "session.ready":
          return { sessionId: ev.session_id };
        case "input.speech.started":
          return { userSpeaking: true };
        case "input.speech.stopped":
          return { userSpeaking: false };
        case "transcript.user.delta":
          return { userPartial: { itemId: ev.item_id, text: ev.text } };
        case "transcript.user":
          return {
            userPartial: null,
            userSpeaking: false,
            awaitingReply: true,
            lastUserUtterance: ev.text,
            transcript: trim([...s.transcript, { role: "user", text: ev.text, at: now }], MAX_TRANSCRIPT),
          };
        case "reply.started":
          return {
            awaitingReply: false,
            agentCaption:
              s.agentCaption?.replyId === ev.reply_id ? s.agentCaption : emptyCaption(ev.reply_id),
          };
        case "transcript.agent.delta": {
          const base = s.agentCaption?.replyId === ev.reply_id ? s.agentCaption : emptyCaption(ev.reply_id);
          return { agentCaption: addWord(base, ev.delta, ev.start_ms) };
        }
        case "transcript.agent":
          return {
            transcript: trim(
              [...s.transcript, { role: "agent", text: ev.text, at: now, interrupted: ev.interrupted || undefined }],
              MAX_TRANSCRIPT,
            ),
          };
        case "reply.done": {
          // Interrupted: the caption should stop where the audio stopped, so
          // freeze it at whatever was visible; completed: show it all.
          const cap = s.agentCaption;
          if (!cap || cap.replyId !== ev.reply_id) return {};
          if (ev.status === "completed") return { agentCaption: { ...cap, final: true } };
          const elapsed = cap.playbackStartedAt === null ? -1 : performance.now() - cap.playbackStartedAt;
          const heard = cap.words.filter((w) => w.startMs === null || w.startMs <= elapsed);
          return { agentCaption: { ...cap, words: heard, final: true } };
        }
        default:
          return {};
      }
    }),

  addLogs: (entries) =>
    set((s) => (entries.length ? { log: trim([...s.log, ...entries], MAX_LOG) } : {})),
  clearLog: () => set({ log: [] }),
}));

function trim<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(arr.length - max) : arr;
}
