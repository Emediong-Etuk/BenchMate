"use client";

import { deriveStatus, statusPulses, statusTone, type StatusTone } from "@/lib/voice/agentStatus";
import { useVoiceStore } from "@/lib/store/voiceStore";

const toneClass: Record<StatusTone, string> = {
  neutral: "text-muted border-border",
  accent: "text-accent border-accent",
  good: "text-good border-good",
  warn: "text-warn border-warn",
  bad: "text-bad border-bad",
};

export function StatusPill() {
  const status = useVoiceStore((s) =>
    deriveStatus({
      connection: s.connection,
      muted: s.muted,
      userSpeaking: s.userSpeaking,
      awaitingReply: s.awaitingReply,
      pendingToolResults: s.pendingToolResults,
      agentPlaying: s.agentPlaying,
    }),
  );
  const tone = statusTone(status);
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border-2 bg-surface px-4 text-base font-semibold ${toneClass[tone]}`}
    >
      <span className={`h-3 w-3 rounded-full bg-current ${statusPulses(status) ? "pulse-ring" : ""}`} aria-hidden />
      {status}
    </span>
  );
}
