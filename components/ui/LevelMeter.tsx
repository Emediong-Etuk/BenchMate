"use client";

/** Mic input level. RMS is mapped to a rough dB scale so speech fills the bar. */
export function LevelMeter({ level, muted = false, className = "" }: { level: number; muted?: boolean; className?: string }) {
  const db = level > 0 ? 20 * Math.log10(level) : -100;
  const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  return (
    <div
      className={`h-3 w-full overflow-hidden rounded-full bg-surface-2 ${className}`}
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={`h-full rounded-full transition-[width] duration-75 ${muted ? "bg-bad" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
