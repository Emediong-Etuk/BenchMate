import type { SessionConfig } from "@/lib/voice/events";
import type { BenchSession, Settings } from "@/lib/store/types";
import { MAX_KEYTERMS_TOTAL, buildKeyterms } from "./keyterms";
import { renderSystemPrompt } from "./systemPrompt";
import { TOOLS } from "./tools";
import { MAX_TRANSCRIPTION_PROMPT, buildTranscriptionPrompt } from "./transcriptionPrompt";

// Assembles the session.update payload (brief §9.1).

export type BuildOptions = { isReconnect?: boolean; settings: Settings };

export function greetingFor(session: BenchSession, isReconnect: boolean): string {
  const total = session.protocol.steps.length;
  if (isReconnect) {
    return session.currentStep > 0 ? `Reconnected. You're on step ${session.currentStep} of ${total}.` : "Reconnected. Say \"start\" when you're ready.";
  }
  return `BenchMate ready. ${session.protocol.title}, ${total} steps. Say "start" when you're ready.`;
}

export function buildSessionConfig(session: BenchSession, opts: BuildOptions): SessionConfig {
  const { settings } = opts;
  const config: SessionConfig = {
    system_prompt: renderSystemPrompt(session),
    greeting: greetingFor(session, Boolean(opts.isReconnect)),
    tools: TOOLS,
    input: {
      language_codes: ["en"],
      keyterms: buildKeyterms({ samples: session.samples, protocolKeyterms: session.protocol.keyterms }),
      transcription_prompt: buildTranscriptionPrompt(session),
      transcription_mode: settings.transcriptionMode,
      voice_focus: settings.voiceFocus,
      ...(settings.vadThreshold !== null ? { turn_detection: { vad_threshold: settings.vadThreshold } } : {}),
    },
    output: { voice: settings.voice },
  };
  validateSessionConfig(config);
  return config;
}

/** Enforce the documented limits before sending (brief §9.1). Throws on violation. */
export function validateSessionConfig(config: SessionConfig): void {
  const problems: string[] = [];
  const kt = config.input?.keyterms ?? [];
  if (kt.length > MAX_KEYTERMS_TOTAL) problems.push(`keyterms has ${kt.length} entries (max ${MAX_KEYTERMS_TOTAL})`);
  const tp = config.input?.transcription_prompt ?? "";
  if (tp.length > MAX_TRANSCRIPTION_PROMPT) problems.push(`transcription_prompt is ${tp.length} chars (max ${MAX_TRANSCRIPTION_PROMPT})`);
  const vad = config.input?.turn_detection?.vad_threshold;
  if (vad !== undefined && (vad < 0 || vad > 1)) problems.push(`vad_threshold ${vad} is outside 0–1`);
  if (!config.system_prompt?.trim()) problems.push("system_prompt is empty");
  if (problems.length) throw new Error(`Invalid session config: ${problems.join("; ")}`);
}
