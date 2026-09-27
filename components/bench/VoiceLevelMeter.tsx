"use client";

import { LevelMeter } from "@/components/ui/LevelMeter";
import { useVoiceStore } from "@/lib/store/voiceStore";

export function VoiceLevelMeter({ className }: { className?: string }) {
  const level = useVoiceStore((s) => s.micLevel);
  const muted = useVoiceStore((s) => s.muted);
  return <LevelMeter level={level} muted={muted} className={className} />;
}
