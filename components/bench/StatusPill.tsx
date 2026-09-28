"use client";

import { deriveStatus, statusPulses, statusTone, type StatusTone } from "@/lib/voice/agentStatus";
import { useVoiceStore } from "@/lib/store/voiceStore";

const toneClass: Record<StatusTone, string> = {
  neutral: "text-muted bg-surface-2",
  accent: "text-accent bg-accent-soft",
  good: "text-good bg-good/10",
  warn: "text-warn bg-warn/10",
  bad: "text-bad bg-bad/10",
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
      className={`inline-flex min-h-12 items-center gap-2.5 rounded-full px-4 text-lg font-medium transition-colors duration-300 ${toneClass[tone]}`}
    >
      <span className={`h-3 w-3 rounded-full bg-current ${statusPulses(status) ? "pulse-ring" : ""}`} aria-hidden />
      {status}
    </span>
  );
}
