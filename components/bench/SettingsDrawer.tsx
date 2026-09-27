"use client";

import { ENGLISH_VOICES } from "@/lib/agent/voices";
import { useBenchStore } from "@/lib/store/benchStore";
import type { Settings } from "@/lib/store/types";

type Props = { open: boolean; onClose: () => void; onVolume: (v: number) => void };

/** Settings (brief §12). Voice, focus and mode apply to the next voice session. */
export function SettingsDrawer({ open, onClose, onVolume }: Props) {
  const settings = useBenchStore((s) => s.settings);
  const update = (patch: Partial<Settings>) => useBenchStore.getState().updateSettings(patch);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto bg-surface p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className="min-h-12 rounded-xl border border-border px-4 font-semibold">
            Close
          </button>
        </div>

        <label className="grid gap-1">
          <span className="font-semibold">Volume {settings.volume}%</span>
          <input
            type="range"
            min={0}
            max={150}
            step={10}
            value={settings.volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            className="min-h-12 accent-[var(--accent)]"
          />
        </label>

        <p className="-mb-2 text-sm text-muted">These apply the next time BenchMate connects.</p>
        <Select label="Voice" value={settings.voice} onChange={(voice) => update({ voice })} options={ENGLISH_VOICES.map((v) => [v.id, `${v.id} (${v.accent})`])} />
        <Select
          label="Voice focus"
          value={settings.voiceFocus}
          onChange={(v) => update({ voiceFocus: v as Settings["voiceFocus"] })}
          options={[
            ["far-field", "Far field (laptop on the bench)"],
            ["near-field", "Near field (headset)"],
          ]}
        />
        <Select
          label="Transcription"
          value={settings.transcriptionMode}
          onChange={(v) => update({ transcriptionMode: v as Settings["transcriptionMode"] })}
          options={[
            ["balanced", "Balanced (default)"],
            ["max_accuracy", "Max accuracy (waits longer)"],
            ["min_latency", "Min latency"],
          ]}
        />

        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer font-semibold">Advanced</summary>
          <div className="mt-4 grid gap-4">
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={settings.autoGainControl} onChange={(e) => update({ autoGainControl: e.target.checked })} />
              <span>Browser auto gain (helps a quiet, distant mic)</span>
            </label>
            <label className="grid gap-1">
              <span>
                VAD threshold: {settings.vadThreshold === null ? "server default (adaptive)" : settings.vadThreshold.toFixed(2)}
              </span>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={settings.vadThreshold ?? 0.5}
                onChange={(e) => update({ vadThreshold: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
              <button type="button" className="w-fit text-sm text-muted underline" onClick={() => update({ vadThreshold: null })}>
                Reset to default
              </button>
              <span className="text-xs text-muted">Only for noisy-room testing. The docs recommend better tool descriptions over VAD tuning.</span>
            </label>
          </div>
        </details>

        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={settings.showDebug} onChange={(e) => update({ showDebug: e.target.checked })} />
          <span>Show debug panel (D)</span>
        </label>
      </aside>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="grid gap-1">
      <span className="font-semibold">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-h-12 rounded-xl border border-border bg-bg px-3">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
