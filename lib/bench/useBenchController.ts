"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { buildSessionConfig } from "@/lib/agent/buildSessionConfig";
import { applyCall, emptyLedger, markDropped, markSent, newTurn, type LedgerState } from "@/lib/agent/ledger";
import { renderSystemPrompt } from "@/lib/agent/systemPrompt";
import { runTool } from "@/lib/agent/toolHandlers";
import { useBenchStore } from "@/lib/store/benchStore";
import type { BenchSession, SessionTranscriptLine } from "@/lib/store/types";
import { useVoiceStore } from "@/lib/store/voiceStore";
import type { ServerEvent } from "@/lib/voice/events";
import { useVoiceClient } from "@/lib/voice/useVoiceClient";
import { FINISH_REPLY_TIMEOUT_MS, reduceFinish, type FinishEvent, type FinishState } from "./finishFlow";

// Glue between the voice client and the authoritative bench store:
// tool calls → ledger (commit semantics) → store; effects (volume, finish);
// transcript and AssemblyAI session ids into the session; keyboard
// navigation through the same handlers; screen wake lock.

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
          updateActive((s) =>
            s.assemblyaiSessionIds.includes(ev.session_id) ? s : { ...s, assemblyaiSessionIds: [...s.assemblyaiSessionIds, ev.session_id] },
          );
          break;
        case "transcript.user":
          ledgerRef.current = newTurn(ledgerRef.current);
          appendTranscript({ role: "user", text: ev.text, at });
          break;
        case "transcript.agent":
          if (ev.text.trim()) appendTranscript({ role: "agent", text: ev.text, at, ...(ev.interrupted ? { interrupted: true } : {}) });
          break;
        case "reply.started":
          stepFinish("reply.started");
          break;
        case "reply.done":
          stepFinish("reply.done");
          break;
        default:
          break;
      }
    },
    onConnection: (state) => {
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
      buildConfig: () => buildSessionConfig(active() ?? session, { settings: useBenchStore.getState().settings, isReconnect }),
      autoGainControl: settings.autoGainControl,
    });
  }, [clientRef]);

  const sendText = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      ledgerRef.current = newTurn(ledgerRef.current);
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

  return { clientRef, connect, sendText, setMuted, setVolume, navigateByKey, endByButton };
}
