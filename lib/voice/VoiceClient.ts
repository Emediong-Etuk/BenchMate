import { Capture, CaptureError } from "./capture";
import {
  RETRYABLE_ERROR_CODES,
  parseServerEvent,
  type ClientMessage,
  type ServerEvent,
  type SessionConfig,
} from "./events";
import { base64ToInt16, int16ToBase64 } from "./pcm";
import { Playback } from "./playback";
import { initialQueueState, reduceQueue, type PendingResult, type QueueInput, type QueueState } from "./toolResultQueue";
import type { ConnectionState } from "./agentStatus";

// WebSocket state machine for one bench session (brief §8). Owns the socket,
// mic capture and playback. UI state lives elsewhere; this class reports
// through `handlers`.

const WS_URL = "wss://agents.assemblyai.com/v1/ws";
const READY_TIMEOUT_MS = 12_000;
const END_TIMEOUT_MS = 3_000;
const UNDUCK_AFTER_SPEECH_MS = 600;

export type LogEntry = {
  at: number; // Date.now()
  dir: "in" | "out" | "local";
  type: string;
  detail?: string;
  bytes?: number;
};

export type ToolOutcome = { result: unknown; isError?: boolean };

export type VoiceClientHandlers = {
  onConnection(state: ConnectionState, message?: string): void;
  onEvent(event: ServerEvent): void;
  onLog(entry: LogEntry): void;
  onPlayingChange(playing: boolean): void;
  onMicLevel?(level: number): void;
  /** First audible audio of a reply (performance.now() time), for caption timing. */
  onReplyAudioStart?(replyId: string, at: number): void;
  onPendingToolResults?(count: number): void;
  /** Run a client-side tool. Throwing becomes an is_error result. */
  onToolCall?(call: { callId: string; name: string; args: Record<string, unknown> }): Promise<ToolOutcome> | ToolOutcome;
  /** A result was actually sent (Phase 3: entry → confirmed). */
  onToolResultSent?(callId: string): void;
  /** Results dropped because the reply was interrupted (Phase 3: → unconfirmed). */
  onToolResultsDropped?(callIds: string[]): void;
};

export type ConnectOptions = {
  buildConfig: () => SessionConfig;
  deviceId?: string;
  autoGainControl?: boolean;
};

export class VoiceClient {
  readonly playback = new Playback();
  private readonly capture = new Capture();
  private ws: WebSocket | null = null;
  private state: ConnectionState = "idle";
  private sessionId: string | null = null;
  private expiresAt: number | null = null;
  private muted = false;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private unduckTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: QueueState = initialQueueState;
  private currentReplyId: string | null = null;
  private replyAudioStarted = false;
  private droppingAudio = false;
  private sessionEnded = false;
  private endResolver: (() => void) | null = null;
  private opts: ConnectOptions | null = null;
  private readonly unsubscribePlayback: () => void;

  constructor(private readonly handlers: VoiceClientHandlers) {
    this.unsubscribePlayback = this.playback.onPlayingChange((p) => handlers.onPlayingChange(p));
  }

  get connection(): ConnectionState {
    return this.state;
  }
  get currentSessionId(): string | null {
    return this.sessionId;
  }
  get sessionExpiresAt(): number | null {
    return this.expiresAt;
  }
  get isMuted(): boolean {
    return this.muted;
  }
  get captureSampleRate(): number | null {
    return this.capture.contextSampleRate;
  }

  /** Call from a user gesture: audio contexts need one. */
  async connect(opts: ConnectOptions): Promise<void> {
    if (this.state === "connecting" || this.state === "ready") return;
    this.opts = opts;
    this.setState("connecting");
    this.sessionEnded = false;
    this.queue = initialQueueState;

    try {
      await this.playback.init();
      await this.capture.start({
        deviceId: opts.deviceId,
        autoGainControl: opts.autoGainControl,
        onChunk: (s) => this.sendAudio(s),
        onLevel: (l) => this.handlers.onMicLevel?.(l),
      });
      this.log("local", "mic.started", `capture context ${this.capture.contextSampleRate} Hz`);
    } catch (err) {
      const msg = err instanceof CaptureError ? err.message : "Couldn't start audio.";
      this.fail(msg);
      return;
    }

    let token: string;
    try {
      token = await fetchToken();
    } catch (err) {
      await this.capture.stop();
      this.fail(err instanceof Error ? err.message : "Couldn't get a voice token.");
      return;
    }
    if (this.connection !== "connecting") {
      // end() was called while we were fetching the token.
      await this.capture.stop();
      return;
    }

    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    this.readyTimer = setTimeout(() => {
      if (this.state === "connecting") {
        this.log("local", "ready.timeout", `no session.ready within ${READY_TIMEOUT_MS / 1000} s`);
        this.teardownSocket();
        void this.capture.stop();
        this.fail("The voice service didn't respond in time.");
      }
    }, READY_TIMEOUT_MS);

    ws.onopen = () => this.send({ type: "session.update", session: opts.buildConfig() });
    ws.onmessage = (e) => {
      if (typeof e.data === "string") this.onFrame(e.data);
    };
    ws.onclose = (e) => this.onClose(ws, e);
    ws.onerror = () => this.log("local", "ws.error");
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.log("local", muted ? "mic.muted" : "mic.unmuted");
  }

  /**
   * Dev harness / on-stage backup: a typed utterance.
   * Probes showed conversation.message content never reaches the model
   * (NOTES.md C10), so the text rides in reply.create instructions instead.
   */
  sendText(text: string): void {
    const content = text.trim();
    if (!content) return;
    this.send({
      type: "reply.create",
      instructions: `The user typed this instead of speaking: ${JSON.stringify(content)}. Handle it exactly as if they had said it aloud.`,
    });
  }

  replyNow(instructions?: string): void {
    this.send(instructions ? { type: "reply.create", instructions } : { type: "reply.create" });
  }

  updateSession(session: SessionConfig): void {
    this.send({ type: "session.update", session });
  }

  /** Clean end: session.end → wait for session.ended (max 3 s) → cleanup. */
  async end(): Promise<void> {
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN && !this.sessionEnded) {
      const ended = new Promise<void>((resolve) => {
        this.endResolver = resolve;
        setTimeout(resolve, END_TIMEOUT_MS);
      });
      this.send({ type: "session.end" });
      await ended;
      this.endResolver = null;
    }
    this.teardownSocket();
    await this.capture.stop();
    this.playback.flush();
    this.setState("ended");
  }

  /** Synchronous best-effort end for pagehide (docs: no async work there). */
  endOnPageHide(): void {
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN && !this.sessionEnded) {
      ws.send(JSON.stringify({ type: "session.end" } satisfies ClientMessage));
    }
  }

  async dispose(): Promise<void> {
    await this.end();
    this.unsubscribePlayback();
    await this.playback.close();
  }

  // ---------------------------------------------------------------- internals

  private onFrame(raw: string): void {
    const parsed = parseServerEvent(raw);
    if (!parsed.ok) {
      this.log("in", parsed.type, `unparsed: ${parsed.error}`);
      return;
    }
    const ev = parsed.event;
    this.logIn(ev);

    switch (ev.type) {
      case "session.ready":
        this.clearReadyTimer();
        this.sessionId = ev.session_id;
        this.expiresAt = ev.expires_at ?? null;
        this.queue = initialQueueState;
        this.setState("ready");
        break;
      case "session.ended":
        this.sessionEnded = true;
        this.endResolver?.();
        break;
      case "session.error":
        this.onSessionError(ev.code, ev.message);
        break;
      case "input.speech.started":
        this.clearUnduckTimer();
        this.playback.duck();
        this.applyQueue({ type: "input.speech.started" });
        break;
      case "input.speech.stopped":
        this.clearUnduckTimer();
        this.unduckTimer = setTimeout(() => this.playback.unduck(), UNDUCK_AFTER_SPEECH_MS);
        break;
      case "reply.started":
        this.clearUnduckTimer();
        this.playback.unduck();
        this.currentReplyId = ev.reply_id;
        this.replyAudioStarted = false;
        this.droppingAudio = false;
        this.applyQueue({ type: "reply.started" });
        break;
      case "reply.audio":
        this.onReplyAudio(ev.data);
        break;
      case "reply.done":
        if (ev.status === "interrupted") {
          this.playback.flush();
          this.droppingAudio = true; // ignore stragglers until the next reply
        }
        this.applyQueue({ type: "reply.done", status: ev.status });
        break;
      case "tool.call":
        void this.runTool(ev.call_id, ev.name, ev.arguments);
        break;
      default:
        break;
    }
    this.handlers.onEvent(ev);
  }

  private onReplyAudio(data: string): void {
    if (this.droppingAudio) return;
    const at = this.playback.enqueue(base64ToInt16(data));
    if (at !== null && !this.replyAudioStarted && this.currentReplyId) {
      this.replyAudioStarted = true;
      this.handlers.onReplyAudioStart?.(this.currentReplyId, at);
    }
  }

  private async runTool(callId: string, name: string, args: Record<string, unknown>): Promise<void> {
    let outcome: ToolOutcome;
    try {
      if (!this.handlers.onToolCall) throw new Error(`Tool '${name}' is not available in this build.`);
      outcome = await this.handlers.onToolCall({ callId, name, args });
    } catch (err) {
      outcome = { result: { error: err instanceof Error ? err.message : String(err) }, isError: true };
    }
    let result: string;
    try {
      result = JSON.stringify(outcome.result ?? { ok: true });
    } catch {
      result = JSON.stringify({ error: `Tool '${name}' produced a result that couldn't be encoded.` });
      outcome.isError = true;
    }
    this.applyQueue({ type: "result_ready", result: { callId, result, isError: Boolean(outcome.isError) } });
  }

  private applyQueue(input: QueueInput): void {
    const out = reduceQueue(this.queue, input);
    this.queue = out.state;
    for (const r of out.send) this.sendToolResult(r);
    if (out.dropped.length) {
      this.log("local", "tool.results.dropped", out.dropped.map((d) => d.callId).join(", "));
      this.handlers.onToolResultsDropped?.(out.dropped.map((d) => d.callId));
    }
    this.handlers.onPendingToolResults?.(this.queue.pending.length);
  }

  private sendToolResult(r: PendingResult): void {
    this.send({ type: "tool.result", call_id: r.callId, result: r.result, ...(r.isError ? { is_error: true } : {}) });
    this.handlers.onToolResultSent?.(r.callId);
  }

  private onSessionError(code: string, message: string): void {
    const retryable = RETRYABLE_ERROR_CODES.has(code);
    // Client-message errors leave the session alive (events reference).
    const survivable = [
      "invalid_format",
      "invalid_audio",
      "invalid_value",
      "immutable_field",
      "invalid_config",
      "audio_rate_violation",
    ].includes(code);
    if (survivable) return;
    this.teardownSocket();
    void this.capture.stop();
    this.playback.flush();
    this.fail(friendlyError(code, message), retryable);
  }

  private onClose(ws: WebSocket, e: CloseEvent): void {
    if (ws !== this.ws) return; // stale socket
    this.log("local", "ws.close", `code ${e.code}${e.reason ? ` · ${e.reason}` : ""}`);
    this.clearReadyTimer();
    this.ws = null;
    if (this.state === "ended" || this.state === "error") return;
    void this.capture.stop();
    this.playback.flush();
    if (this.sessionEnded) {
      this.setState("ended");
      return;
    }
    // Phase 6 adds reconnect/resume here. For now, surface it.
    if (this.state === "connecting") {
      this.fail(
        e.code === 1006
          ? "Couldn't open the voice connection (network or expired token)."
          : `The voice service closed the connection (code ${e.code}).`,
        true,
      );
    } else {
      this.setState("offline", "Connection lost.");
    }
  }

  private sendAudio(samples: Int16Array): void {
    if (this.state !== "ready" || this.muted) return;
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "input.audio", audio: int16ToBase64(samples) } satisfies ClientMessage));
    this.handlers.onLog({ at: Date.now(), dir: "out", type: "input.audio", bytes: samples.byteLength });
  }

  private send(msg: ClientMessage): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      this.log("local", "send.skipped", `${msg.type} (socket not open)`);
      return;
    }
    ws.send(JSON.stringify(msg));
    if (msg.type !== "input.audio") this.log("out", msg.type, summarizeOut(msg));
  }

  private logIn(ev: ServerEvent): void {
    if (ev.type === "reply.audio") {
      this.handlers.onLog({ at: Date.now(), dir: "in", type: ev.type, bytes: Math.floor((ev.data.length * 3) / 4) });
      return;
    }
    this.log("in", ev.type, summarizeIn(ev));
  }

  private log(dir: LogEntry["dir"], type: string, detail?: string): void {
    this.handlers.onLog({ at: Date.now(), dir, type, detail });
  }

  private setState(state: ConnectionState, message?: string): void {
    this.state = state;
    this.handlers.onConnection(state, message);
  }

  private fail(message: string, retryable = false): void {
    this.clearReadyTimer();
    this.log("local", "error", `${message}${retryable ? " (retryable)" : ""}`);
    this.setState("error", message);
  }

  private teardownSocket(): void {
    this.clearReadyTimer();
    this.clearUnduckTimer();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
  }

  private clearUnduckTimer(): void {
    if (this.unduckTimer) clearTimeout(this.unduckTimer);
    this.unduckTimer = null;
  }
}

async function fetchToken(): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/voice-token", { cache: "no-store" });
  } catch {
    throw new Error("Couldn't reach the BenchMate server. Check the network.");
  }
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error ?? `Token request failed (${res.status}).`);
  return body.token;
}

function friendlyError(code: string, message: string): string {
  switch (code) {
    case "at_capacity":
    case "concurrency_exceeded":
      return "The voice service is busy right now. Retrying usually works.";
    case "internal_error":
      return "The voice service hit an internal error.";
    case "unauthorized":
    case "UNAUTHORIZED":
      return "The voice token was rejected or expired.";
    case "session_expired":
      return "The voice session reached its time limit.";
    default:
      return message ? `Voice service error: ${message}` : `Voice service error (${code}).`;
  }
}

function summarizeIn(ev: ServerEvent): string | undefined {
  switch (ev.type) {
    case "session.ready":
      return ev.session_id;
    case "session.error":
      return `${ev.code}: ${ev.message}`;
    case "transcript.user.delta":
    case "transcript.user":
      return ev.text;
    case "transcript.agent.delta":
      return `${ev.delta.trim()} @${ev.start_ms ?? "?"}ms`;
    case "transcript.agent":
      return `${ev.interrupted ? "[interrupted] " : ""}${ev.text}`;
    case "reply.started":
      return ev.reply_id;
    case "reply.done":
      return `${ev.reply_id} · ${ev.status}`;
    case "tool.call":
      return `${ev.name}(${JSON.stringify(ev.arguments)}) · ${ev.call_id}`;
    case "session.ended":
      return `${ev.session_duration_seconds ?? "?"} s`;
    default:
      return undefined;
  }
}

function summarizeOut(msg: ClientMessage): string | undefined {
  switch (msg.type) {
    case "session.update":
      return Object.keys(msg.session).join(", ");
    case "tool.result":
      return `${msg.call_id}${msg.is_error ? " [error]" : ""} ${msg.result.slice(0, 160)}`;
    case "reply.create":
      return msg.instructions;
    case "conversation.message":
      return `${msg.role}: ${msg.content}`;
    case "session.resume":
      return msg.session_id;
    default:
      return undefined;
  }
}
