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

/** Large countdowns (brief §12). Phase 4 adds the chime, flash and spoken announcement. */
export function TimerPanel({ timers }: { timers: Timer[] }) {
  const [now, setNow] = useState(() => Date.now());
  const visible = timers.filter((t) => t.status === "running" || (t.status === "done" && !t.announced));
  const anyRunning = visible.length > 0;

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [anyRunning]);

  if (!visible.length) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Timers</h2>
      <ul className="flex flex-col gap-2">
        {visible.map((t) => {
          const remaining = (Date.parse(t.endsAt) - now) / 1000;
          const finished = remaining <= 0;
          return (
            <li key={t.id} className={`flex items-baseline justify-between gap-3 rounded-xl border px-4 py-3 ${finished ? "border-accent bg-accent-soft" : "border-border"}`}>
              <span className="truncate text-lg">{t.label}</span>
              <span className="font-mono text-4xl font-semibold tabular-nums">{finished ? "00:00" : mmss(remaining)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
