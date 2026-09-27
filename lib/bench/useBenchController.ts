"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildSessionConfig } from "@/lib/agent/buildSessionConfig";
import { applyCall, emptyLedger, markDropped, markSent, newTurn, type LedgerState } from "@/lib/agent/ledger";
import { renderSystemPrompt } from "@/lib/agent/systemPrompt";
import { announcementInstructions, dismissFinished, fireDueTimers, markAnnounced, pendingAnnouncements } from "@/lib/agent/timers";
import { runTool } from "@/lib/agent/toolHandlers";
import { useBenchStore } from "@/lib/store/benchStore";
import type { BenchSession, SessionTranscriptLine } from "@/lib/store/types";
import { useVoiceStore } from "@/lib/store/voiceStore";
import type { ServerEvent } from "@/lib/voice/events";
import { decide, initialProactive, reduceProactive, type ProactiveEvent, type ProactiveState } from "@/lib/voice/proactiveSpeech";
import { rolloverAt } from "@/lib/voice/reconnect";
import { useVoiceClient } from "@/lib/voice/useVoiceClient";
import { FINISH_REPLY_TIMEOUT_MS, reduceFinish, type FinishEvent, type FinishState } from "./finishFlow";

// Glue between the voice client and the authoritative bench store:
// tool calls → ledger (commit semantics) → store; effects (volume, finish);
// transcript and AssemblyAI session ids into the session; keyboard
// navigation through the same handlers; timers + proactive announcements;
// screen wake lock.

const TIMER_TICK_MS = 250;
/** Event handlers read the clock through this (they run on events, not during render). */
const clock = () => Date.now();
const ROLLOVER_ID = "__rollover";
const ROLLOVER_ANNOUNCE_TIMEOUT_MS = 10_000;

/**
 * Test hook: localStorage "benchmate:debug-rollover-after-ms" makes the
 * rollover happen that long after session.ready. The server ignores
 * max_session_duration_seconds (NOTES C16), so there's no server-side way to
 * shorten a session for testing.
 */
function debugRolloverAfterMs(): number | null {
  try {
    const v = Number(localStorage.getItem("benchmate:debug-rollover-after-ms"));
    return Number.isFinite(v) && v >= 10_000 ? v : null;
  } catch {
    return null;
  }
}

function active(): BenchSession | undefined {
  const s = useBenchStore.getState();
  return s.sessions.find((x) => x.id === s.activeSessionId);
}

function updateActive(fn: (s: BenchSession) => BenchSession) {
  const s = useBenchStore.getState();
  if (s.activeSessionId) s.updateSession(s.activeSessionId, fn);
}

function appendTranscript(line: SessionTranscriptLine) {
  updateActive((s) => ({ ...s, transcript: [...s.transcript, line] }));
}

export function useBenchController() {
  const router = useRouter();
  const ledgerRef = useRef<LedgerState>(emptyLedger);
  const finishRef = useRef<FinishState>("idle");
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishingRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const proactiveRef = useRef<ProactiveState>(initialProactive);
  // Rollover near the session time cap (brief §8.7): announce at an idle moment, then switch.
  const rolloverRef = useRef<{ phase: "idle" | "announcing" | "speaking" | "switching"; since: number }>({ phase: "idle", since: 0 });
  const [audioBlocked, setAudioBlocked] = useState(false);

  /** Feed an event to the proactive-speech gate; a reply.started may confirm an announcement. */
  const stepProactive = (ev: ProactiveEvent) => {
    const out = reduceProactive(proactiveRef.current, ev);
    proactiveRef.current = out.state;
    if (out.announced === ROLLOVER_ID) {
      rolloverRef.current = { phase: "speaking", since: clock() };
    } else if (out.announced) {
      const id = out.announced;
      updateActive((s) => markAnnounced(s, id));
    }
  };

  // Finish logic needs the client, which needs these handlers: the handlers
  // call through this ref, filled in once the client exists.
  const finishApiRef = useRef<{ step: (e: FinishEvent) => void; finish: (o: { drain: boolean }) => Promise<void> } | null>(null);
  const stepFinish = (e: FinishEvent) => finishApiRef.current?.step(e);

  const clientRef = useVoiceClient({
    onToolCall: ({ callId, name, args }) => {
      const session = active();
      if (!session || session.endedAt) {
        return { result: { ok: false, error: "No active bench session. Tell the user to start one from the home screen." }, isError: true };
      }
      const out = applyCall(session, ledgerRef.current, { callId, name, args }, {
        now: new Date(),
        callId,
        lastUserUtterance: useVoiceStore.getState().lastUserUtterance,
        groupId: ledgerRef.current.turnId,
      });
      ledgerRef.current = out.ledger;
      useBenchStore.getState().updateSession(session.id, () => out.session);
      if (out.effects?.volume !== undefined) {
        clientRef.current?.playback.setVolume(out.effects.volume);
        useBenchStore.getState().updateSettings({ volume: out.effects.volume });
      }
      return { result: out.result, isError: out.isError };
    },
    onToolResultSent: (callId) => {
      const session = active();
      if (!session) return;
      const out = markSent(session, ledgerRef.current, callId);
      ledgerRef.current = out.ledger;
      if (out.session !== session) useBenchStore.getState().updateSession(session.id, () => out.session);
      if (out.record?.effects?.finish) stepFinish("finish_result_sent");
    },
    onToolResultsDropped: (callIds) => {
      const session = active();
      if (!session) return;
      const out = markDropped(session, ledgerRef.current, callIds, Date.now());
      ledgerRef.current = out.ledger;
      useBenchStore.getState().updateSession(session.id, () => out.session);
    },
    onEvent: (ev: ServerEvent) => {
      const at = new Date().toISOString();
      switch (ev.type) {
        case "session.ready":
          stepProactive({ type: "session.ready" });
          rolloverRef.current = { phase: "idle", since: 0 };
          updateActive((s) =>
            s.assemblyaiSessionIds.includes(ev.session_id) ? s : { ...s, assemblyaiSessionIds: [...s.assemblyaiSessionIds, ev.session_id] },
          );
          break;
        case "transcript.user":
          ledgerRef.current = newTurn(ledgerRef.current);
          updateActive((s) => dismissFinished(s)); // a finished timer flashes until the next utterance
          appendTranscript({ role: "user", text: ev.text, at });
          break;
        case "transcript.agent":
          if (ev.text.trim()) appendTranscript({ role: "agent", text: ev.text, at, ...(ev.interrupted ? { interrupted: true } : {}) });
          break;
        case "reply.started":
          stepProactive({ type: "reply.started" });
          stepFinish("reply.started");
          break;
        case "reply.done":
          stepProactive({ type: "reply.done" });
          stepFinish("reply.done");
          if (rolloverRef.current.phase === "speaking") {
            rolloverRef.current = { phase: "switching", since: clock() };
            clientRef.current?.rollover();
          }
          break;
        case "input.speech.started":
          stepProactive({ type: "input.speech.started" });
          break;
        case "input.speech.stopped":
          stepProactive({ type: "input.speech.stopped", now: clock() });
          break;
        default:
          break;
      }
    },
    onConnection: (state) => {
      if (state !== "ready") stepProactive({ type: "disconnected" });
      if (state === "ready") void acquireWakeLock();
      if (state === "ended" || state === "error") void releaseWakeLock();
    },
  });

  useEffect(() => {
    async function finish(opts: { drain: boolean }) {
      if (finishingRef.current) return;
      finishingRef.current = true;
      const session = active();
      await clientRef.current?.end({ drain: opts.drain });
      if (!session) return;
      const endedAt = new Date().toISOString();
      useBenchStore.getState().updateSession(session.id, (s) => ({
        ...s,
        endedAt,
        // A timer still running at the end is recorded as cancelled.
        timers: s.timers.map((t) => (t.status === "running" ? { ...t, status: "cancelled", finishedAt: endedAt } : t)),
      }));
      useBenchStore.setState({ activeSessionId: null });
      router.push(`/entry/${session.id}`);
    }
    function step(event: FinishEvent) {
      const out = reduceFinish(finishRef.current, event);
      finishRef.current = out.state;
      if (event === "finish_result_sent" && out.state === "armed") {
        if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
        finishTimerRef.current = setTimeout(() => step("timeout"), FINISH_REPLY_TIMEOUT_MS);
      }
      if (out.finishNow) {
        if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
        void finish({ drain: true });
      }
    }
    finishApiRef.current = { step, finish };
  }, [clientRef, router]);

  async function acquireWakeLock() {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
      }
    } catch {
      // Denied (e.g. low battery) — not fatal.
    }
  }
  async function releaseWakeLock() {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // ignore
    }
    wakeLockRef.current = null;
  }

  // The wake lock is dropped when the tab is hidden; take it back on return.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && useVoiceStore.getState().connection === "ready") void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      void releaseWakeLock();
    };
  }, []);

  // Timer engine + proactive announcements (brief §8.6). Runs whether or not
  // the voice is connected: timers still fire and chime; announcements wait.
  useEffect(() => {
    const id = setInterval(() => {
      const session = active();
      if (!session || session.endedAt) return;
      const now = new Date();
      const fired = fireDueTimers(session, now);
      if (fired.fired.length) {
        useBenchStore.getState().updateSession(session.id, () => fired.session);
        clientRef.current?.playback.playChime();
      }
      const client = clientRef.current;
      if (!client || client.connection !== "ready") return;
      const current = fired.session;

      // Rollover takes priority over timer announcements.
      const ro = rolloverRef.current;
      const readyAt = client.sessionReadyAt;
      const expiresAt = client.sessionExpiresAt;
      if (ro.phase === "announcing" && now.getTime() - ro.since > ROLLOVER_ANNOUNCE_TIMEOUT_MS) {
        rolloverRef.current = { phase: "switching", since: now.getTime() };
        client.rollover();
        return;
      }
      if (ro.phase !== "idle") return;
      const debugAfter = readyAt ? debugRolloverAfterMs() : null;
      const due = readyAt && (debugAfter !== null ? readyAt + debugAfter : expiresAt ? rolloverAt(readyAt, expiresAt) : null);
      if (due && now.getTime() >= due) {
        const gate = decide(proactiveRef.current, {
          now: now.getTime(),
          pending: [ROLLOVER_ID],
          pendingToolResults: useVoiceStore.getState().pendingToolResults,
          hold: finishingRef.current || finishRef.current !== "idle",
        });
        proactiveRef.current = gate.state;
        if (gate.send) {
          client.replyNow('Say exactly this and nothing else: "Refreshing the connection, one moment."');
          stepProactive({ type: "sent", timerId: ROLLOVER_ID, now: now.getTime() });
          rolloverRef.current = { phase: "announcing", since: now.getTime() };
        }
        return;
      }

      const pending = pendingAnnouncements(current);
      const out = decide(proactiveRef.current, {
        now: now.getTime(),
        pending: pending.map((t) => t.id),
        pendingToolResults: useVoiceStore.getState().pendingToolResults,
        hold: finishingRef.current || finishRef.current !== "idle",
      });
      proactiveRef.current = out.state;
      if (out.send) {
        const timer = pending.find((t) => t.id === out.send)!;
        client.replyNow(announcementInstructions(current, timer, now));
        stepProactive({ type: "sent", timerId: timer.id, now: now.getTime() });
      }
    }, TIMER_TICK_MS);
    return () => clearInterval(id);
  }, [clientRef]);

  // After a reload the browser may hold audio until a tap (autoplay policy).
  useEffect(() => {
    const id = setInterval(() => {
      const c = clientRef.current;
      const live = c && (c.connection === "ready" || c.connection === "connecting" || c.connection === "reconnecting");
      setAudioBlocked(Boolean(live && c.audioSuspended));
    }, 500);
    return () => clearInterval(id);
  }, [clientRef]);

  const resumeAudio = useCallback(() => void clientRef.current?.resumeAudio(), [clientRef]);

  const dismissTimer = useCallback((timerId: string) => updateActive((s) => dismissFinished(s, timerId)), []);

  const connect = useCallback(async () => {
    const client = clientRef.current;
    const session = active();
    if (!client || !session) return;
    const { settings } = useBenchStore.getState();
    client.playback.setVolume(settings.volume);
    useVoiceStore.getState().clearLog();
    // A session that already has conversation behind it gets the reconnect greeting.
    const isReconnect = session.assemblyaiSessionIds.length > 0;
    await client.connect({
      isReconnect,
      // Rebuilt for every attempt so a reconnect carries the latest state summary.
      buildConfig: (ctx) => buildSessionConfig(active() ?? session, { settings: useBenchStore.getState().settings, isReconnect: ctx.isReconnect }),
      autoGainControl: settings.autoGainControl,
    });
  }, [clientRef]);

  const sendText = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      ledgerRef.current = newTurn(ledgerRef.current);
      updateActive((s) => dismissFinished(s));
      clientRef.current?.sendText(t);
      useVoiceStore.getState().addTypedUtterance(t);
      appendTranscript({ role: "user", text: t, at: new Date().toISOString(), typed: true });
    },
    [clientRef],
  );

  const setMuted = useCallback(
    (muted: boolean) => {
      clientRef.current?.setMuted(muted);
      useVoiceStore.getState().setMuted(muted);
    },
    [clientRef],
  );

  const setVolume = useCallback(
    (level: number) => {
      clientRef.current?.playback.setVolume(level);
      useBenchStore.getState().updateSettings({ volume: level });
      updateActive((s) => ({ ...s, settings: { ...s.settings, volume: level } }));
    },
    [clientRef],
  );

  /** Keyboard ←/→: same handler as the voice tool, then tell the agent via system_prompt (NOTES C10). */
  const navigateByKey = useCallback(
    (action: "next" | "previous") => {
      const session = active();
      if (!session || session.endedAt) return;
      const out = runTool("navigate_protocol", session, { action }, { now: new Date(), callId: `kbd-${Date.now()}`, lastUserUtterance: "" });
      if (out.isError) return;
      useBenchStore.getState().updateSession(session.id, () => out.nextState);
      // Any dropped position-relative voice call is now stale.
      ledgerRef.current = { ...ledgerRef.current, dropped: ledgerRef.current.dropped.filter((d) => !d.relative) };
      const client = clientRef.current;
      if (client && client.connection === "ready") client.updateSession({ system_prompt: renderSystemPrompt(out.nextState) });
    },
    [clientRef],
  );

  const endByButton = useCallback(() => finishApiRef.current?.finish({ drain: false }), []);

  return { clientRef, connect, sendText, setMuted, setVolume, navigateByKey, endByButton, dismissTimer, audioBlocked, resumeAudio };
}
