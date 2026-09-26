"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CaptionStrip } from "@/components/bench/CaptionStrip";
import { DebugPanel } from "@/components/bench/DebugPanel";
import { StatusPill } from "@/components/bench/StatusPill";
import { VoiceLevelMeter } from "@/components/bench/VoiceLevelMeter";
import { DEFAULT_VOICE_SETTINGS, buildDevSessionConfig, type VoiceSettings } from "@/lib/agent/devSessionConfig";
import { ENGLISH_VOICES } from "@/lib/agent/voices";
import { useVoiceStore } from "@/lib/store/voiceStore";
import { useVoiceClient } from "@/lib/voice/useVoiceClient";

export function VoiceCheck() {
  const clientRef = useVoiceClient();
  const connection = useVoiceStore((s) => s.connection);
  const message = useVoiceStore((s) => s.connectionMessage);
  const muted = useVoiceStore((s) => s.muted);
  const transcript = useVoiceStore((s) => s.transcript);
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [volume, setVolume] = useState(100);
  const [showDebug, setShowDebug] = useState(true);
  const textRef = useRef<HTMLInputElement>(null);

  const live = connection === "ready";
  const busy = connection === "connecting";

  async function start() {
    const client = clientRef.current;
    if (!client) return;
    useVoiceStore.getState().clearLog();
    await client.connect({ buildConfig: () => buildDevSessionConfig(settings) });
  }

  async function stop() {
    await clientRef.current?.end();
  }

  function toggleMute() {
    const client = clientRef.current;
    if (!client) return;
    const next = !client.isMuted;
    client.setMuted(next);
    useVoiceStore.getState().setMuted(next);
  }

  function sendText(text: string) {
    clientRef.current?.sendText(text);
    useVoiceStore.getState().addTypedUtterance(text.trim());
  }

  // Keyboard fallbacks: Space = mute, D = debug, T = focus text box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (e.key === " ") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === "d" || e.key === "D") {
        setShowDebug((v) => !v);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setShowDebug(true);
        requestAnimationFrame(() => textRef.current?.focus());
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // toggleMute only reads refs and store getters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_28rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/" className="text-lg font-semibold">
            BenchMate
          </Link>
          <span className="text-muted">· voice check</span>
          <div className="ml-auto flex items-center gap-3">
            <StatusPill />
          </div>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
          <div className="flex flex-wrap gap-3">
            {live || busy ? (
              <button
                type="button"
                onClick={stop}
                className="min-h-16 min-w-40 rounded-2xl bg-bad px-6 text-lg font-semibold text-white"
              >
                End
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                className="min-h-16 min-w-40 rounded-2xl bg-accent px-6 text-lg font-semibold text-white dark:text-black"
              >
                {connection === "error" || connection === "offline" ? "Retry" : "Start talking"}
              </button>
            )}
            <button
              type="button"
              onClick={toggleMute}
              disabled={!live}
              aria-pressed={muted}
              className={`min-h-16 min-w-40 rounded-2xl border-2 px-6 text-lg font-semibold disabled:opacity-40 ${
                muted ? "border-bad bg-bad text-white" : "border-border"
              }`}
            >
              {muted ? "MIC MUTED" : "Mute (Space)"}
            </button>
          </div>

          {message && (connection === "error" || connection === "offline") && (
            <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-bad">
              {message}
            </p>
          )}

          <div className="grid gap-2">
            <span className="text-sm text-muted">Mic level</span>
            <VoiceLevelMeter />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Voice (next session)</span>
              <select
                value={settings.voice}
                disabled={live || busy}
                onChange={(e) => setSettings({ ...settings, voice: e.target.value })}
                className="min-h-12 rounded-xl border border-border bg-bg px-3 text-base"
              >
                {ENGLISH_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} ({v.accent})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Voice focus (next session)</span>
              <select
                value={settings.voiceFocus}
                disabled={live || busy}
                onChange={(e) => setSettings({ ...settings, voiceFocus: e.target.value as VoiceSettings["voiceFocus"] })}
                className="min-h-12 rounded-xl border border-border bg-bg px-3 text-base"
              >
                <option value="far-field">far-field (laptop)</option>
                <option value="near-field">near-field (headset)</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Volume {volume}%</span>
              <input
                type="range"
                min={0}
                max={150}
                step={10}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  clientRef.current?.playback.setVolume(v);
                }}
                className="min-h-12 accent-[var(--accent)]"
              />
            </label>
          </div>
        </section>

        <CaptionStrip />

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Transcript</h2>
          <ol className="grid max-h-72 gap-1 overflow-y-auto text-base">
            {transcript.map((line, i) => (
              <li key={i}>
                <span className={`font-semibold ${line.role === "agent" ? "text-accent" : ""}`}>
                  {line.role === "agent" ? "BenchMate" : "You"}:
                </span>{" "}
                {line.text}
                {line.typed && <span className="ml-2 text-xs text-muted">(typed)</span>}
                {line.interrupted && <span className="ml-2 text-xs text-warn">(interrupted)</span>}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {showDebug && <DebugPanel onSendText={sendText} canSend={live} inputRef={textRef} />}
    </main>
  );
}
