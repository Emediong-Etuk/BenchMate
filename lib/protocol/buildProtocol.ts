import { extractDurationSeconds } from "./fallbackParser";
import { findMissingNumbers } from "./numberCheck";
import type { LlmProtocol } from "./schema";
import type { ParseResult, ParseSource, Protocol, ProtocolSource } from "./types";

/**
 * LLM/fallback output → Protocol + number check (brief §11.2 step 3).
 *
 * Durations are derived deterministically from each step's own text rather
 * than trusted from the model: in testing, qwen3.5-4b returned "30 minutes"
 * as 30. A step gets a duration only when it states exactly one explicit
 * duration, which is the brief's rule anyway.
 */
export function buildParseResult(
  input: string,
  data: LlmProtocol,
  meta: { source: ParseSource; protocolSource: ProtocolSource; title?: string; note?: string; id: string; now: Date },
  log: (msg: string) => void = () => undefined,
): ParseResult {
  const title = meta.title?.trim() || data.title.trim() || "Untitled protocol";
  const protocol: Protocol = {
    id: meta.id,
    title,
    source: meta.protocolSource,
    steps: data.steps.map((s, i) => {
      const durationSeconds = extractDurationSeconds(s.text);
      if (s.duration_seconds !== durationSeconds) {
        log(`[parse-protocol] step ${i + 1}: model duration ${s.duration_seconds} → text-derived ${durationSeconds}`);
      }
      return { number: i + 1, text: s.text, durationSeconds, reagents: s.reagents };
    }),
    keyterms: data.keyterms,
    createdAt: meta.now.toISOString(),
  };
  const missingNumbers = findMissingNumbers(input, [title, ...protocol.steps.map((s) => s.text)]);
  return { protocol, source: meta.source, missingNumbers, ...(meta.note ? { note: meta.note } : {}) };
}
