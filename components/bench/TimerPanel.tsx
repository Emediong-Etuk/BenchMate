"use client";

import { useEffect, useState } from "react";
import type { Timer } from "@/lib/store/types";

function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const core = `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return h ? `${h}:${core}` : core;
}

/** Large countdowns (brief §12). A finished timer glows until the next utterance or a tap. */
export function TimerPanel({ timers, onDismiss }: { timers: Timer[]; onDismiss: (id: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const visible = timers.filter((t) => t.status === "running" || (t.status === "done" && !t.dismissed));
  const anyRunning = visible.some((t) => t.status === "running");

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [anyRunning]);

  if (!visible.length) return null;
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-5">
      <h2 className="font-semibold text-text">Timers</h2>
      <ul className="flex flex-col gap-2">
        {visible.map((t) => {
          const remaining = (Date.parse(t.endsAt) - now) / 1000;
          const finished = t.status === "done" || remaining <= 0;
          if (finished) {
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onDismiss(t.id)}
                  className="timer-flash flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-accent/50 px-4 py-3 text-left"
                  aria-label={`${t.label} timer finished. Tap to dismiss.`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-medium text-text">{t.label}</span>
                    <span className="text-sm text-accent-strong">Time&apos;s up · tap to clear</span>
                  </span>
                  <span className="font-mono text-4xl font-medium tabular-nums text-accent-strong">00:00</span>
                </button>
              </li>
            );
          }
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
              <span className="truncate text-lg text-muted">{t.label}</span>
              <span className="font-mono text-4xl font-medium tabular-nums text-text">{mmss(remaining)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
