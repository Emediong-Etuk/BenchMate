import type { SessionConfig } from "@/lib/voice/events";

// Phase 1 only: a minimal agent for exercising the voice loop. Replaced by
// buildSessionConfig() (protocol-aware prompt, tools, keyterms) in Phase 3.

export type VoiceSettings = {
  voice: string;
  voiceFocus: "near-field" | "far-field";
  transcriptionMode: "min_latency" | "balanced" | "max_accuracy";
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voice: "alba",
  voiceFocus: "far-field", // NOTES.md C3: docs recommend far-field for laptop mics
  transcriptionMode: "balanced",
};

export function buildDevSessionConfig(settings: VoiceSettings): SessionConfig {
  return {
    system_prompt: [
      "You are BenchMate, a hands-free voice assistant for a scientist at a lab bench.",
      "Replies are one or two short sentences unless the user asks for detail. No filler, no lists, no markdown, no exclamation marks.",
      "Answer general lab questions helpfully. Say numbers and units in full.",
    ].join("\n"),
    greeting: "BenchMate voice check. I'm listening.",
    input: {
      language_codes: ["en"],
      keyterms: ["BenchMate", "NanoDrop", "microliters", "supernatant"],
      transcription_mode: settings.transcriptionMode,
      voice_focus: settings.voiceFocus,
    },
    output: { voice: settings.voice },
  };
}
