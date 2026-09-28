"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useBenchController } from "@/lib/bench/useBenchController";
import { useBenchStore } from "@/lib/store/benchStore";
import { useHydratedBenchStore } from "@/lib/store/useHydrated";
import { useVoiceStore } from "@/lib/store/voiceStore";
import { buttonClass } from "@/components/ui/button";
import { Logo } from "@/components/ui/Logo";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { CaptionStrip } from "./CaptionStrip";
import { DebugPanel } from "./DebugPanel";
import { FirstRunTips } from "./FirstRunTips";
import { LogFeed } from "./LogFeed";
import { SettingsDrawer } from "./SettingsDrawer";
import { StatusPill } from "./StatusPill";
import { StepCard } from "./StepCard";
import { TimerPanel } from "./TimerPanel";
import { VoiceLevelMeter } from "./VoiceLevelMeter";

export function BenchClient() {
  const hydrated = useHydratedBenchStore();
  const session = useBenchStore((s) => s.sessions.find((x) => x.id === s.activeSessionId && !x.endedAt));
  const showDebug = useBenchStore((s) => s.settings.showDebug);
  const connection = useVoiceStore((s) => s.connection);
  const connectionMessage = useVoiceStore((s) => s.connectionMessage);
  const muted = useVoiceStore((s) => s.muted);
  const ctl = useBenchController();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);

  const live = connection === "ready";
  const connecting = connection === "connecting";
  const reconnecting = connection === "reconnecting";

  // Reload mid-session (brief §8.7, §14): restore and reconnect automatically
  // with the reconnect greeting. If the browser holds audio until a tap, the
  // overlay below asks for one.
  const autoTried = useRef(false);
  const hasHistory = Boolean(session && session.assemblyaiSessionIds.length > 0);
  const { connect } = ctl;
  useEffect(() => {
    if (!hydrated || !hasHistory || autoTried.current || connection !== "idle") return;
    autoTried.current = true;
    void connect();
  }, [hydrated, hasHistory, connection, connect]);

  // Keyboard fallbacks (brief §12): Space mute, ←/→ steps, T type, D debug.
  const ctlRef = useRef(ctl);
  useEffect(() => {
    ctlRef.current = ctl;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const c = ctlRef.current;
      if (e.key === " ") {
        e.preventDefault();
        if (useVoiceStore.getState().connection === "ready") c.setMuted(!useVoiceStore.getState().muted);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        c.navigateByKey("next");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        c.navigateByKey("previous");
      } else if (e.key === "d" || e.key === "D") {
        const s = useBenchStore.getState();
        s.updateSettings({ showDebug: !s.settings.showDebug });
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        useBenchStore.getState().updateSettings({ showDebug: true });
        requestAnimationFrame(() => textRef.current?.focus());
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!confirmEnd) return;
    const id = setTimeout(() => setConfirmEnd(false), 4000);
    return () => clearTimeout(id);
  }, [confirmEnd]);

  if (!hydrated) return <main className="p-8 text-muted">Loading…</main>;
  if (!session) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-20">
          <h1 className="text-2xl font-semibold">No session running</h1>
          <p className="text-muted">Choose a protocol on the home screen, check the steps, then press Start.</p>
          <Link href="/" className={buttonClass("primary", "lg", "w-fit")}>
            Choose a protocol
          </Link>
        </main>
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-border/70 pb-4">
        <Link href="/" className="rounded-xl" title="Home (your session keeps its place)" aria-label="BenchMate home">
          <Logo compact />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-text">{session.protocol.title}</h1>
          <p className="text-sm text-faint">
            <ElapsedClock since={session.startedAt} />
          </p>
        </div>
        <StatusPill />
        <button
          type="button"
          onClick={() => ctl.setMuted(!muted)}
          disabled={!live}
          aria-pressed={muted}
          className={buttonClass("secondary", "md", `min-h-12 ${muted ? "border-warn/60 text-warn" : ""}`)}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings" className={buttonClass("secondary", "md", "min-h-12 w-12 px-0 text-xl")}>
          ⚙
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirmEnd) void ctl.endByButton();
            else setConfirmEnd(true);
          }}
          className={buttonClass(confirmEnd ? "danger" : "secondary", "md", "min-h-12")}
        >
          {confirmEnd ? "Tap again to finish" : "Finish"}
        </button>
      </header>

      {muted && live && (
        <div role="alert" className="rounded-2xl border border-warn/40 bg-warn/10 px-6 py-3 text-center text-lg font-medium text-warn">
          Your microphone is muted. Press Space or Unmute when you want BenchMate to hear you.
        </div>
      )}

      {ctl.audioBlocked && (
        <button
          type="button"
          onClick={ctl.resumeAudio}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-bg/90 px-6 text-center backdrop-blur-sm"
        >
          <span className="text-3xl font-semibold text-text">Tap anywhere to continue</span>
          <span className="max-w-md text-lg text-muted">The browser paused sound after the page reloaded. Everything you recorded is still here.</span>
        </button>
      )}

      {reconnecting && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn/[0.07] px-5 py-4 text-lg text-text">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-warn border-t-transparent" aria-hidden />
          <span>
            {connectionMessage ?? "Reconnecting…"} <span className="text-muted">Keep working. Everything is saved and BenchMate will pick up where you left off.</span>
          </span>
        </div>
      )}

      {connecting && hasHistory && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-5 py-3 text-lg text-text">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
          Reconnecting to pick up where you left off…
        </div>
      )}

      {!live && !reconnecting && !(connecting && hasHistory) && (
        <section className="fade-up flex flex-col gap-5 rounded-3xl border border-accent/30 bg-accent-soft/50 p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-8">
          <button type="button" onClick={() => void ctl.connect()} disabled={connecting} className={buttonClass("primary", "xl", "w-full shrink-0 rounded-3xl sm:w-auto sm:min-w-64")}>
            {connecting ? "Connecting…" : connection === "idle" && !hasHistory ? "Start listening" : "Reconnect"}
          </button>
          <div className="min-w-0 flex-1">
            {connection === "error" || connection === "offline" ? (
              <p className="text-lg text-bad" role="alert">
                {connectionMessage ?? "The voice connection stopped."} <span className="text-muted">Everything you recorded is saved.</span>
              </p>
            ) : (
              <>
                <p className="text-lg text-text">Ready when you are.</p>
                <p className="text-muted">Press the button, allow the microphone, then just talk. Say &ldquo;start&rdquo; to hear step 1.</p>
              </>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <StepCard session={session} />
          <CaptionStrip />
          {live && <VoiceLevelMeter className="opacity-80" />}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <TimerPanel timers={session.timers} onDismiss={ctl.dismissTimer} />
          <LogFeed entries={session.entries} />
          <FirstRunTips />
          {showDebug && <DebugPanel onSendText={ctl.sendText} canSend={live} inputRef={textRef} />}
        </div>
      </div>

      <p className="no-print text-center text-xs text-faint">Keyboard: Space mute · ← → change step · T type instead of speaking · D developer panel</p>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} onVolume={ctl.setVolume} />
    </main>
  );
}

function ElapsedClock({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="tabular-nums" title="Session time">
      Running for {h ? `${h}:` : ""}
      {String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </span>
  );
}
