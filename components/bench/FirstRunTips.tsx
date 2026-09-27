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

const PHRASES = ['"Next"', '"Say that again"', '"Sample 2, 245 nanograms per microliter"', '"Ten-minute timer"', '"Scratch that"', '"I\'m done"'];

/** Example phrases on first use; dismissal remembered locally. */
export function FirstRunTips() {
  const dismissed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => true,
  );
  if (dismissed) return null;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent bg-accent-soft px-4 py-3">
      <span className="font-semibold">Try saying:</span>
      {PHRASES.map((p) => (
        <span key={p} className="rounded-full bg-surface px-3 py-1 text-sm">
          {p}
        </span>
      ))}
      <button
        type="button"
        className="ml-auto min-h-11 rounded-xl px-3 text-sm font-semibold hover:bg-surface"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            // ignore
          }
          listeners.forEach((l) => l());
        }}
      >
        Got it
      </button>
    </section>
  );
}
