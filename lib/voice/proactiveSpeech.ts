// When may the app make the agent speak unprompted (timer announcements)?
// Brief §8.6. Pure: the controller feeds events and a clock, and asks
// decide() on every tick.
//
// The *queue* isn't kept here: pending announcements are simply the session's
// timers with status "done" and announced false, so they survive reloads.
//
// Rules:
// - Only when idle: the latest reply-related event is reply.done, or no reply
//   has happened since session.ready.
// - Never while the user is speaking; wait SPEECH_SETTLE_MS after
//   input.speech.stopped (if a reply starts meanwhile, wait for its done).
// - Never while tool results are pending.
// - One announcement in flight at a time: after sending reply.create, the next
//   reply.started marks it announced. No reply.started within
//   AWAIT_TIMEOUT_MS → it goes back to pending and is retried.

export const SPEECH_SETTLE_MS = 800;
export const AWAIT_TIMEOUT_MS = 6_000;

export type ProactiveState = {
  ready: boolean;
  lastEvent: "ready" | "reply.started" | "reply.done" | null;
  userSpeaking: boolean;
  speechStoppedAt: number | null;
  awaiting: { timerId: string; sentAt: number } | null;
};

export const initialProactive: ProactiveState = {
  ready: false,
  lastEvent: null,
  userSpeaking: false,
  speechStoppedAt: null,
  awaiting: null,
};

export type ProactiveEvent =
  | { type: "session.ready" }
  | { type: "disconnected" }
  | { type: "reply.started" }
  | { type: "reply.done" }
  | { type: "input.speech.started" }
  | { type: "input.speech.stopped"; now: number }
  | { type: "sent"; timerId: string; now: number };

export type ProactiveOutput = { state: ProactiveState; announced?: string };

export function reduceProactive(state: ProactiveState, ev: ProactiveEvent): ProactiveOutput {
  switch (ev.type) {
    case "session.ready":
      return { state: { ...initialProactive, ready: true, lastEvent: "ready" } };
    case "disconnected":
      return { state: initialProactive };
    case "reply.started": {
      const next = { ...state, lastEvent: "reply.started" as const, speechStoppedAt: null };
      if (state.awaiting) return { state: { ...next, awaiting: null }, announced: state.awaiting.timerId };
      return { state: next };
    }
    case "reply.done":
      return { state: { ...state, lastEvent: "reply.done" } };
    case "input.speech.started":
      return { state: { ...state, userSpeaking: true, speechStoppedAt: null } };
    case "input.speech.stopped":
      return { state: { ...state, userSpeaking: false, speechStoppedAt: ev.now } };
    case "sent":
      return { state: { ...state, awaiting: { timerId: ev.timerId, sentAt: ev.now } } };
  }
}

export type DecideInput = {
  now: number;
  /** Timer ids awaiting announcement, oldest first. */
  pending: string[];
  pendingToolResults: number;
  /** Extra hold (e.g. the session is finishing). */
  hold?: boolean;
};

/** Returns the timer to announce now (then call reduce "sent"), plus a possibly updated state (timeouts). */
export function decide(state: ProactiveState, input: DecideInput): { state: ProactiveState; send: string | null } {
  let s = state;
  if (s.awaiting) {
    if (input.now - s.awaiting.sentAt < AWAIT_TIMEOUT_MS) return { state: s, send: null };
    s = { ...s, awaiting: null }; // no reply.started: retry
  }
  if (!s.ready || input.hold || input.pending.length === 0) return { state: s, send: null };
  if (s.lastEvent !== "reply.done" && s.lastEvent !== "ready") return { state: s, send: null };
  if (s.userSpeaking || input.pendingToolResults > 0) return { state: s, send: null };
  if (s.speechStoppedAt !== null && input.now - s.speechStoppedAt < SPEECH_SETTLE_MS) return { state: s, send: null };
  return { state: s, send: input.pending[0]! };
}
