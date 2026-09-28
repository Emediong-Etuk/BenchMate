"use client";

import { useSyncExternalStore } from "react";

const KEY = "benchmate:tips-dismissed";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function write(collapsed: boolean) {
  try {
    if (collapsed) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

const GROUPS: [string, string[]][] = [
  ["Move", ["“Start”", "“Next”", "“Go back”", "“Say that again”"]],
  ["Record", ["“Sample 2, 245 nanograms per microliter”", "“Tube 4 looks cloudy”"]],
  ["Timers", ["“Ten-minute timer”", "“How long is left?”"]],
  ["Fix", ["“Scratch that”", "“No, 254 not 245”"]],
  ["Finish", ["“I’m done”"]],
];

/** "What can I say?" card. Open on first use; collapsing it is remembered in this browser. */
export function FirstRunTips() {
  const collapsed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => true,
  );
  return (
    <section className="rounded-3xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => write(!collapsed)}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-3 rounded-3xl px-5 py-4 text-left"
      >
        <span className="font-semibold text-text">What can I say?</span>
        <span className="text-sm text-muted">{collapsed ? "Show" : "Hide"}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-3 px-5 pb-5">
          {GROUPS.map(([label, phrases]) => (
            <div key={label} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-faint">{label}</span>
              <div className="flex flex-wrap gap-1.5">
                {phrases.map((p) => (
                  <span key={p} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-muted">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="pt-1 text-sm text-faint">Speak naturally. You can interrupt BenchMate any time.</p>
        </div>
      )}
    </section>
  );
}
