"use client";

import { useEffect, useState } from "react";
import { visibleCaption } from "@/lib/voice/captions";
import { useVoiceStore } from "@/lib/store/voiceStore";

/** Live user partial + agent words revealed in sync with playback. */
export function CaptionStrip() {
  const userPartial = useVoiceStore((s) => s.userPartial);
  const caption = useVoiceStore((s) => s.agentCaption);
  const [now, setNow] = useState(0);

  // 10 Hz is plenty for word-level captions and keeps rendering cheap.
  const active = Boolean(caption && !caption.final);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [active]);

  const agentText = visibleCaption(caption, now);
  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-surface p-4 text-xl leading-snug sm:text-2xl" aria-live="off">
      <p className="min-h-8">
        <span className="mr-3 align-middle text-sm font-semibold uppercase tracking-wide text-muted">You</span>
        <span>{userPartial?.text ?? ""}</span>
      </p>
      <p className="min-h-8">
        <span className="mr-3 align-middle text-sm font-semibold uppercase tracking-wide text-accent">BenchMate</span>
        <span>{agentText}</span>
      </p>
    </div>
  );
}
