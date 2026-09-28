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
    <div className="grid gap-3 rounded-3xl border border-border bg-surface px-6 py-5 text-xl leading-snug sm:text-2xl" aria-live="off">
      <p className="flex min-h-8 gap-4">
        <span className="w-24 shrink-0 pt-1.5 text-sm text-faint">You</span>
        <span className="text-muted">{userPartial?.text ?? ""}</span>
      </p>
      <p className="flex min-h-8 gap-4">
        <span className="w-24 shrink-0 pt-1.5 text-sm text-accent">BenchMate</span>
        <span className="text-text">{agentText}</span>
      </p>
    </div>
  );
}
