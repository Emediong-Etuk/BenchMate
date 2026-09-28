"use client";

import { useBenchStore } from "@/lib/store/benchStore";

const LABEL = {
  saved: { text: "Saved", dot: "bg-good", tip: "Everything is saved to your account." },
  saving: { text: "Saving…", dot: "bg-accent pulse-ring", tip: "Saving your latest changes to your account." },
  offline: { text: "Offline", dot: "bg-warn", tip: "You're offline. Changes are kept in this browser and will save when you reconnect." },
  error: { text: "Not saved yet", dot: "bg-bad", tip: "Couldn't save to your account. Retrying; your changes are kept in this browser." },
} as const;

/** Small account-sync indicator. */
export function SyncBadge({ className = "" }: { className?: string }) {
  const state = useBenchStore((s) => s.syncState);
  const l = LABEL[state];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm text-muted ${className}`} title={l.tip} role="status">
      <span className={`h-2 w-2 rounded-full ${l.dot}`} aria-hidden />
      {l.text}
    </span>
  );
}
