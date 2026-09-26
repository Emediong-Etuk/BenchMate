import { z } from "zod";

// Server → client events, shaped from the events reference AND the payloads
// we observed in probes (NOTES.md §2). Unknown extra fields are tolerated
// (zod strips them); unknown event types parse as `{ type: "unknown" }`.

// Observed: a float epoch-seconds number. The docs show an ISO string.
const timestamp = z.union([z.number(), z.string()]).optional();

const SessionReady = z.object({
  type: z.literal("session.ready"),
  session_id: z.string(),
  expires_at: z.number().optional(),
  resume_token: z.string().optional(),
  config: z.unknown().optional(),
  timestamp,
});

const SessionUpdated = z.object({
  type: z.literal("session.updated"),
  config: z.unknown().optional(),
  timestamp,
});

const SessionEnded = z.object({
  type: z.literal("session.ended"),
  session_duration_seconds: z.number().optional(),
  audio_duration_seconds: z.number().nullable().optional(),
  timestamp,
});

const SessionError = z.object({
  type: z.literal("session.error"),
  code: z.string(),
  message: z.string().optional().default(""),
  param: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  timestamp,
});

const SpeechStarted = z.object({ type: z.literal("input.speech.started"), timestamp });
const SpeechStopped = z.object({ type: z.literal("input.speech.stopped"), timestamp });

const UserDelta = z.object({
  type: z.literal("transcript.user.delta"),
  item_id: z.string(),
  text: z.string(),
  timestamp,
});

const UserFinal = z.object({
  type: z.literal("transcript.user"),
  item_id: z.string(),
  text: z.string(),
  timestamp,
});

const ReplyStarted = z.object({
  type: z.literal("reply.started"),
  reply_id: z.string(),
  item_id: z.string().optional(),
  timestamp,
});

const ReplyAudio = z.object({
  type: z.literal("reply.audio"),
  data: z.string(),
  timestamp,
});

const AgentDelta = z.object({
  type: z.literal("transcript.agent.delta"),
  reply_id: z.string(),
  item_id: z.string().optional(),
  delta: z.string(),
  start_ms: z.number().nullable().optional(),
  end_ms: z.number().nullable().optional(),
  timestamp,
});

const AgentFinal = z.object({
  type: z.literal("transcript.agent"),
  reply_id: z.string(),
  item_id: z.string().optional(),
  text: z.string(),
  interrupted: z.boolean().optional().default(false),
  timestamp,
});

const ReplyDone = z.object({
  type: z.literal("reply.done"),
  reply_id: z.string(),
  status: z.enum(["completed", "interrupted"]).catch("completed"),
  timestamp,
});

const ToolCall = z.object({
  type: z.literal("tool.call"),
  call_id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).catch({}),
  timestamp,
});

export const ServerEventSchema = z.discriminatedUnion("type", [
  SessionReady,
  SessionUpdated,
  SessionEnded,
  SessionError,
  SpeechStarted,
  SpeechStopped,
  UserDelta,
  UserFinal,
  ReplyStarted,
  ReplyAudio,
  AgentDelta,
  AgentFinal,
  ReplyDone,
  ToolCall,
]);

export type ServerEvent = z.infer<typeof ServerEventSchema>;
export type ServerEventType = ServerEvent["type"];
export type EventOf<T extends ServerEventType> = Extract<ServerEvent, { type: T }>;

export type ParsedEvent =
  | { ok: true; event: ServerEvent }
  | { ok: false; type: string; error: string; raw: unknown };

/** Parse one raw WebSocket text frame. Never throws. */
export function parseServerEvent(raw: string): ParsedEvent {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, type: "invalid_json", error: "Frame is not valid JSON", raw };
  }
  const result = ServerEventSchema.safeParse(json);
  if (result.success) return { ok: true, event: result.data };
  const type =
    typeof json === "object" && json !== null && typeof (json as { type?: unknown }).type === "string"
      ? (json as { type: string }).type
      : "unknown";
  return { ok: false, type, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), raw: json };
}

/** Codes the docs list as transient; everything else is fatal for the session. */
export const RETRYABLE_ERROR_CODES = new Set(["at_capacity", "concurrency_exceeded", "internal_error"]);

// ---- Client → server messages ----

export type ToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execution_mode?: "interactive" | "hold";
  timeout_seconds?: number;
};

export type SessionConfig = {
  system_prompt?: string;
  greeting?: string;
  tools?: ToolDefinition[];
  input?: {
    language_codes?: string[];
    keyterms?: string[];
    transcription_prompt?: string;
    transcription_mode?: "min_latency" | "balanced" | "max_accuracy";
    voice_focus?: "near-field" | "far-field";
    turn_detection?: { vad_threshold?: number };
  };
  output?: { voice?: string; volume?: number };
};

export type ClientMessage =
  | { type: "session.update"; session: SessionConfig }
  | { type: "session.resume"; session_id: string }
  | { type: "input.audio"; audio: string }
  | { type: "tool.result"; call_id: string; result: string; is_error?: boolean }
  | { type: "reply.create"; instructions?: string }
  | { type: "conversation.message"; role: "user" | "system"; content: string }
  | { type: "session.end" };
