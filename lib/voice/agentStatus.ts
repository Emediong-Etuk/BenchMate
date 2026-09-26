// Derives the status pill (brief §8.4) from raw facts. Pure and testable.

export type ConnectionState =
  | "idle" // never started
  | "connecting"
  | "ready"
  | "reconnecting"
  | "offline"
  | "error"
  | "ended";

export type AgentStatus =
  | "Idle"
  | "Connecting"
  | "Listening"
  | "Hearing you"
  | "Thinking"
  | "Speaking"
  | "Reconnecting"
  | "Muted"
  | "Offline"
  | "Error"
  | "Ended";

export type StatusInputs = {
  connection: ConnectionState;
  muted: boolean;
  /** Between input.speech.started and input.speech.stopped. */
  userSpeaking: boolean;
  /** After transcript.user (or a typed message) until reply.started. */
  awaitingReply: boolean;
  /** Tool results queued but not yet sent. */
  pendingToolResults: number;
  /** Agent audio is audibly playing (playback can outlast reply.done). */
  agentPlaying: boolean;
};

export function deriveStatus(s: StatusInputs): AgentStatus {
  switch (s.connection) {
    case "idle":
      return "Idle";
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    case "offline":
      return "Offline";
    case "error":
      return "Error";
    case "ended":
      return "Ended";
    case "ready":
      break;
  }
  if (s.agentPlaying && !s.userSpeaking) return "Speaking";
  if (s.muted) return "Muted";
  if (s.userSpeaking) return "Hearing you";
  if (s.awaitingReply || s.pendingToolResults > 0) return "Thinking";
  return "Listening";
}

export type StatusTone = "neutral" | "accent" | "good" | "warn" | "bad";

export function statusTone(status: AgentStatus): StatusTone {
  switch (status) {
    case "Listening":
      return "good";
    case "Hearing you":
    case "Speaking":
      return "accent";
    case "Thinking":
    case "Connecting":
    case "Reconnecting":
      return "warn";
    case "Muted":
    case "Offline":
    case "Error":
      return "bad";
    default:
      return "neutral";
  }
}

/** Statuses that get the subtle pulse animation. */
export function statusPulses(status: AgentStatus): boolean {
  return status === "Hearing you" || status === "Speaking";
}
