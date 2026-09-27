"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useBenchController } from "@/lib/bench/useBenchController";
import { useBenchStore } from "@/lib/store/benchStore";
import { useHydratedBenchStore } from "@/lib/store/useHydrated";
import { useVoiceStore } from "@/lib/store/voiceStore";
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
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold">No active bench session</h1>
        <p className="text-muted">Choose a protocol and press Start on the setup screen.</p>
        <Link href="/" className="inline-flex min-h-14 w-fit items-center rounded-2xl bg-accent px-6 font-semibold text-white dark:text-black">
          Choose a protocol
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="font-semibold text-muted hover:text-accent" title="Home (the session keeps running)">
          BenchMate
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{session.protocol.title}</h1>
        <ElapsedClock since={session.startedAt} />
        <StatusPill />
        <button
          type="button"
          onClick={() => ctl.setMuted(!muted)}
          disabled={!live}
          aria-pressed={muted}
          className={`min-h-16 min-w-16 rounded-2xl border-2 px-4 font-semibold disabled:opacity-40 ${muted ? "border-bad bg-bad text-white" : "border-border"}`}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Settings" className="min-h-16 min-w-16 rounded-2xl border-2 border-border text-2xl">
          ⚙
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirmEnd) void ctl.endByButton();
            else setConfirmEnd(true);
          }}
          className={`min-h-16 min-w-24 rounded-2xl px-5 text-lg font-semibold text-white ${confirmEnd ? "bg-bad ring-4 ring-bad/30" : "bg-bad/90"}`}
        >
          {confirmEnd ? "Tap to end" : "End"}
        </button>
      </header>

      {muted && live && (
        <div role="alert" className="rounded-2xl bg-bad px-6 py-4 text-center text-2xl font-bold tracking-wide text-white">
          MIC MUTED · press Space or Unmute
        </div>
      )}

      {!live && (
        <section className="flex flex-wrap items-center gap-4 rounded-3xl border-2 border-accent bg-surface p-6">
          <button
            type="button"
            onClick={() => void ctl.connect()}
            disabled={connecting}
            className="min-h-20 min-w-64 rounded-3xl bg-accent px-8 text-2xl font-semibold text-white disabled:opacity-60 dark:text-black"
          >
            {connecting ? "Connecting…" : connection === "idle" ? "Start listening" : "Reconnect"}
          </button>
          <div className="min-w-0 flex-1">
            {connection === "error" || connection === "offline" ? (
              <p className="text-lg text-bad" role="alert">
                {connectionMessage ?? "The voice connection stopped."} Your log is saved.
              </p>
            ) : (
              <p className="text-lg text-muted">Starts the microphone and BenchMate&apos;s voice. Everything you log is saved in this browser.</p>
            )}
          </div>
        </section>
      )}

      <FirstRunTips />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <StepCard session={session} />
          <CaptionStrip />
          {live && <VoiceLevelMeter />}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <TimerPanel timers={session.timers} onDismiss={ctl.dismissTimer} />
          <LogFeed entries={session.entries} />
          {showDebug && <DebugPanel onSendText={ctl.sendText} canSend={live} inputRef={textRef} />}
        </div>
      </div>

      <p className="no-print text-center text-xs text-muted">Keys: Space mute · ← → steps · T type instead of speaking · D debug</p>

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
    <span className="font-mono text-lg tabular-nums text-muted" title="Session time">
      {h ? `${h}:` : ""}
      {String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </span>
  );
}
