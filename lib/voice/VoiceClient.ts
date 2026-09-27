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
import { MAX_RECONNECT_ATTEMPTS, MAX_RETRYABLE_ATTEMPTS, RESUME_FAILURE_CODES, backoffMs, chooseMode, type ReconnectMode } from "./reconnect";
import { initialQueueState, reduceQueue, type PendingResult, type QueueInput, type QueueState } from "./toolResultQueue";
import type { ConnectionState } from "./agentStatus";

// WebSocket state machine for one bench session (brief §8). Owns the socket,
// mic capture and playback. UI state lives elsewhere; this class reports
// through `handlers`.
//
// Lifecycle (brief §8.7): the socket can drop and be replaced while audio
// capture and playback keep running, so reconnects need no user gesture.
// Every attempt fetches a fresh single-use token; one session.resume is tried
// inside the 30 s grace window, otherwise a fresh session starts with the
// reconnect config (greeting + state summary in the system prompt).

const WS_URL = "wss://agents.assemblyai.com/v1/ws";
const READY_TIMEOUT_MS = 12_000;
const END_TIMEOUT_MS = 3_000;
const UNDUCK_AFTER_SPEECH_MS = 600;

const SURVIVABLE_ERRORS = new Set(["invalid_format", "invalid_audio", "invalid_value", "immutable_field", "invalid_config", "audio_rate_violation"]);

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
  /** A result was actually sent (entry → confirmed). */
  onToolResultSent?(callId: string): void;
  /** Results dropped because the reply was interrupted or the socket died (→ unconfirmed). */
  onToolResultsDropped?(callIds: string[]): void;
};

export type ConnectOptions = {
  /** Built fresh for every connection attempt; isReconnect picks the reconnect greeting. */
  buildConfig: (ctx: { isReconnect: boolean }) => SessionConfig;
  deviceId?: string;
  autoGainControl?: boolean;
  /** The first connection of this page already continues an earlier session (e.g. after a reload). */
  isReconnect?: boolean;
};

export class VoiceClient {
  readonly playback = new Playback();
  private readonly capture = new Capture();
  private ws: WebSocket | null = null;
  private state: ConnectionState = "idle";
  private sessionId: string | null = null;
  private expiresAt: number | null = null;
  private readyAt: number | null = null;
  private muted = false;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private unduckTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: QueueState = initialQueueState;
  private currentReplyId: string | null = null;
  private replyAudioStarted = false;
  private droppingAudio = false;
  private sessionEnded = false;
  private endResolver: (() => void) | null = null;
  private opts: ConnectOptions | null = null;
  // Reconnect bookkeeping
  private socketGen = 0;
  private attemptMode: ReconnectMode | null = null;
  private droppedAt = 0;
  private resumeFailed = false;
  private attempts = 0;
  private retryableAttempts = 0;
  private rollingOver = false;
  private readonly unsubscribePlayback: () => void;
  private readonly onOnline = () => {
    if (this.state === "reconnecting" && this.reconnectTimer) {
      this.log("local", "network.online", "retrying now");
      this.clearReconnectTimer();
      void this.attempt();
    }
  };

  constructor(private readonly handlers: VoiceClientHandlers) {
    this.unsubscribePlayback = this.playback.onPlayingChange((p) => handlers.onPlayingChange(p));
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
  }

  get connection(): ConnectionState {
    return this.state;
  }
  get currentSessionId(): string | null {
    return this.sessionId;
  }
  /** Epoch seconds when the current session hits its maximum duration. */
  get sessionExpiresAt(): number | null {
    return this.expiresAt;
  }
  /** Date.now() at the current session's session.ready. */
  get sessionReadyAt(): number | null {
    return this.readyAt;
  }
  get isMuted(): boolean {
    return this.muted;
  }
  get captureSampleRate(): number | null {
    return this.capture.contextSampleRate;
  }
  /** True when the browser is holding audio until a user gesture (e.g. after a reload). */
  get audioSuspended(): boolean {
    return this.playback.suspended || this.capture.suspended;
  }

  /** Resume audio contexts; call from a user gesture. */
  async resumeAudio(): Promise<void> {
    await Promise.all([this.playback.resume(), this.capture.resume()]);
  }

  /** Start listening. Prefer calling from a user gesture: audio contexts need one. */
  async connect(opts: ConnectOptions): Promise<void> {
    if (this.state === "connecting" || this.state === "ready" || this.state === "reconnecting") return;
    this.opts = opts;
    this.sessionEnded = false;
    this.resumeFailed = true; // nothing to resume on a manual (re)start
    this.attempts = 0;
    this.retryableAttempts = 0;
    this.setState("connecting");

    try {
      await this.ensureAudio(opts);
    } catch (err) {
      this.fail(err instanceof CaptureError ? err.message : "Couldn't start audio.");
      return;
    }
    if (this.connection !== "connecting") return; // end() called meanwhile
    await this.openSocket("fresh", Boolean(opts.isReconnect));
  }

  /**
   * Planned switch to a new session before the server's time cap (brief §8.7).
   * session.end → session.ended → fresh session with the reconnect config.
   */
  rollover(): void {
    if (this.state !== "ready") return;
    this.rollingOver = true;
    this.log("local", "rollover", "switching to a new session before the time limit");
    this.send({ type: "session.end" });
    // If session.ended never arrives, switch anyway.
    setTimeout(() => {
      if (this.rollingOver && this.state === "ready") {
        this.teardownSocket();
        this.beginReconnect("fresh-now");
      }
    }, END_TIMEOUT_MS);
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

  /**
   * Clean end: session.end → wait for session.ended (max 3 s) → cleanup.
   * With drain, first let already-received speech finish playing (max 12 s).
   */
  async end(opts: { drain?: boolean } = {}): Promise<void> {
    if (opts.drain) await this.waitForPlaybackIdle(12_000);
    this.clearReconnectTimer();
    const ws = this.ws;
    const wasOpen = ws && ws.readyState === WebSocket.OPEN && !this.sessionEnded;
    this.setState("ended"); // from here on, closes are expected
    if (wasOpen) {
      const ended = new Promise<void>((resolve) => {
        this.endResolver = resolve;
        setTimeout(resolve, END_TIMEOUT_MS);
      });
      this.send({ type: "session.end" });
      await ended;
      this.endResolver = null;
    }
    this.teardownSocket();
    this.dropPendingResults();
    await this.capture.stop();
    this.playback.flush();
  }

  private waitForPlaybackIdle(maxMs: number): Promise<void> {
    if (!this.playback.isPlaying) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(done, maxMs);
      const off = this.playback.onPlayingChange((p) => {
        if (!p) done();
      });
      function done() {
        clearTimeout(timer);
        off();
        resolve();
      }
    });
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
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
    this.unsubscribePlayback();
    await this.playback.close();
  }

  // ------------------------------------------------------------- connection

  private async ensureAudio(opts: ConnectOptions): Promise<void> {
    await this.playback.init();
    if (this.capture.active) return;
    await this.capture.start({
      deviceId: opts.deviceId,
      autoGainControl: opts.autoGainControl,
      onChunk: (s) => this.sendAudio(s),
      onLevel: (l) => this.handlers.onMicLevel?.(l),
    });
    this.log("local", "mic.started", `capture context ${this.capture.contextSampleRate} Hz${this.audioSuspended ? " (suspended until a tap)" : ""}`);
  }

  /** One connection attempt: fresh token → socket → session.resume or session.update. */
  private async openSocket(mode: ReconnectMode, isReconnect: boolean): Promise<void> {
    const gen = ++this.socketGen;
    this.attemptMode = mode;
    this.sessionEnded = false;
    let token: string;
    try {
      token = await fetchToken();
    } catch (err) {
      if (gen !== this.socketGen) return;
      this.attemptFailed(err instanceof Error ? err.message : "Couldn't get a voice token.");
      return;
    }
    if (gen !== this.socketGen || (this.state !== "connecting" && this.state !== "reconnecting")) return;

    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    this.readyTimer = setTimeout(() => {
      if (this.ws !== ws || this.state === "ready") return;
      this.log("local", "ready.timeout", `no session.ready within ${READY_TIMEOUT_MS / 1000} s`);
      this.teardownSocket();
      this.attemptFailed("The voice service didn't respond in time.");
    }, READY_TIMEOUT_MS);

    ws.onopen = () => {
      if (mode === "resume" && this.sessionId) {
        this.log("local", "reconnect", `trying session.resume ${this.sessionId}`);
        this.send({ type: "session.resume", session_id: this.sessionId });
      } else {
        this.send({ type: "session.update", session: this.opts!.buildConfig({ isReconnect }) });
      }
    };
    ws.onmessage = (e) => {
      if (this.ws === ws && typeof e.data === "string") this.onFrame(e.data);
    };
    ws.onclose = (e) => this.onClose(ws, e);
    ws.onerror = () => this.log("local", "ws.error");
  }

  /** Unexpected drop (or planned rollover / server-side end): start the reconnect loop. */
  private beginReconnect(kind: "drop" | "fresh-now"): void {
    this.dropPendingResults();
    this.playback.flush();
    this.droppedAt = Date.now();
    this.resumeFailed = kind === "fresh-now";
    this.rollingOver = false;
    this.attempts = 0;
    this.setState("reconnecting", kind === "drop" ? "Connection lost. Reconnecting…" : "Refreshing the connection…");
    void this.attempt();
  }

  private async attempt(): Promise<void> {
    this.clearReconnectTimer();
    if (this.state !== "reconnecting") return;
    const mode = chooseMode({ sessionId: this.sessionId, droppedAt: this.droppedAt, now: Date.now(), resumeFailed: this.resumeFailed });
    this.log("local", "reconnect.attempt", `#${this.attempts + 1} (${mode})`);
    await this.openSocket(mode, true);
  }

  /** A connection attempt failed before session.ready. */
  private attemptFailed(message: string, opts: { retryable?: boolean } = {}): void {
    this.clearReadyTimer();
    if (this.state === "connecting") {
      // First connection of this run: retryable service errors back off (1/2/4/8 s), others need a manual retry.
      if (opts.retryable && this.retryableAttempts < MAX_RETRYABLE_ATTEMPTS) {
        const delay = backoffMs(this.retryableAttempts++);
        this.log("local", "retry", `${message} Retrying in ${delay / 1000} s.`);
        this.reconnectTimer = setTimeout(() => void this.openSocket("fresh", Boolean(this.opts?.isReconnect)), delay);
        return;
      }
      void this.capture.stop();
      this.fail(message, opts.retryable);
      return;
    }
    if (this.state !== "reconnecting") return;
    this.attempts++;
    if (this.attempts >= MAX_RECONNECT_ATTEMPTS) {
      void this.capture.stop();
      this.fail("Couldn't reconnect to the voice service. Your log is saved; tap Reconnect to try again.");
      return;
    }
    const delay = backoffMs(this.attempts - 1);
    this.log("local", "reconnect.wait", `${message} Next try in ${delay / 1000} s.`);
    this.reconnectTimer = setTimeout(() => void this.attempt(), delay);
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
        this.clearReconnectTimer();
        this.sessionId = ev.session_id;
        this.expiresAt = ev.expires_at ?? null;
        this.readyAt = Date.now();
        this.queue = initialQueueState;
        this.attempts = 0;
        this.retryableAttempts = 0;
        this.resumeFailed = false;
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
    const gen = this.socketGen;
    let outcome: ToolOutcome;
    try {
      if (!this.handlers.onToolCall) throw new Error(`Tool '${name}' is not available in this build.`);
      outcome = await this.handlers.onToolCall({ callId, name, args });
    } catch (err) {
      outcome = { result: { error: err instanceof Error ? err.message : String(err) }, isError: true };
    }
    if (gen !== this.socketGen) {
      // The socket this call came from is gone; its result can never be sent.
      this.handlers.onToolResultsDropped?.([callId]);
      return;
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

  /** Socket gone: queued results can't be sent any more (entries → unconfirmed). */
  private dropPendingResults(): void {
    this.applyQueue({ type: "reset" });
  }

  private sendToolResult(r: PendingResult): void {
    this.send({ type: "tool.result", call_id: r.callId, result: r.result, ...(r.isError ? { is_error: true } : {}) });
    this.handlers.onToolResultSent?.(r.callId);
  }

  private onSessionError(code: string, message: string): void {
    // Client-message errors leave the session alive (events reference).
    if (SURVIVABLE_ERRORS.has(code)) return;
    const retryable = RETRYABLE_ERROR_CODES.has(code);

    if (this.attemptMode === "resume" && RESUME_FAILURE_CODES.has(code) && this.state === "reconnecting") {
      // Expected (NOTES C5): fall straight through to a fresh session.
      this.log("local", "reconnect", `resume failed (${code}); starting a fresh session`);
      this.resumeFailed = true;
      this.teardownSocket();
      void this.attempt();
      return;
    }
    this.teardownSocket();
    if (this.state === "ready") {
      if (retryable) {
        this.beginReconnect("drop");
        return;
      }
      void this.capture.stop();
      this.playback.flush();
      this.dropPendingResults();
      this.fail(friendlyError(code, message));
      return;
    }
    // Before session.ready (connecting or reconnecting).
    this.attemptFailed(friendlyError(code, message), { retryable: retryable || this.state === "reconnecting" });
  }

  private onClose(ws: WebSocket, e: CloseEvent): void {
    if (ws !== this.ws) return; // stale socket
    this.log("local", "ws.close", `code ${e.code}${e.reason ? ` · ${e.reason}` : ""}`);
    this.clearReadyTimer();
    this.ws = null;
    switch (this.state) {
      case "ended":
      case "error":
      case "idle":
        return;
      case "ready":
        // Clean server end (rollover, time cap) or a network drop: either way keep going.
        this.beginReconnect(this.sessionEnded || this.rollingOver ? "fresh-now" : "drop");
        return;
      case "connecting":
        this.attemptFailed(
          e.code === 1006 ? "Couldn't open the voice connection (network or expired token)." : `The voice service closed the connection (code ${e.code}).`,
          { retryable: true },
        );
        return;
      case "reconnecting":
      case "offline":
        this.attemptFailed(`Connection attempt closed (code ${e.code}).`);
        return;
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

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
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
