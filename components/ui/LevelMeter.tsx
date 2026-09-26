"use client";

import { useVoiceStore } from "@/lib/store/voiceStore";

/** Live mic input level. RMS is mapped to a rough dB scale so speech fills the bar. */
export function LevelMeter({ className = "" }: { className?: string }) {
  const level = useVoiceStore((s) => s.micLevel);
  const muted = useVoiceStore((s) => s.muted);
  const db = level > 0 ? 20 * Math.log10(level) : -100;
  const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  return (
    <div className={`h-3 w-full overflow-hidden rounded-full bg-surface-2 ${className}`} aria-label="Microphone level">
      <div
        className={`h-full rounded-full transition-[width] duration-75 ${muted ? "bg-bad" : "bg-accent"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
