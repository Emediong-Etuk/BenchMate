import type { LlmProtocol } from "./schema";

// Deterministic parser used when the LLM Gateway fails or returns junk
// (brief §11.2 step 2). Produces the same shape as the LLM output.

const NUMBERED = /^\s*(\d+)[.)]\s+/;
const BULLET = /^\s*[-*•·]\s+/;

const UNIT_SECONDS: Record<string, number> = {
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
  min: 60, mins: 60, minute: 60, minutes: 60,
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
};

const DURATION = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|min|hours?|hrs?|hr|h)\b/gi;
const RANGE_BEFORE = /(\d+(?:\.\d+)?\s*(?:-|–|—|to)\s*)$/i;

/**
 * Seconds for a step that states exactly one explicit duration, else null.
 * Ranges ("5–10 min") and multiple durations are ambiguous → null.
 */
export function extractDurationSeconds(text: string): number | null {
  const found: number[] = [];
  for (const m of text.matchAll(DURATION)) {
    const before = text.slice(0, m.index);
    if (RANGE_BEFORE.test(before)) return null;
    // "x g" style tokens aren't durations; guard "13,000 s" style oddities by requiring a word boundary before.
    if (/[\d,.]$/.test(before)) continue;
    const unit = UNIT_SECONDS[m[2]!.toLowerCase()];
    if (!unit) continue;
    found.push(Math.round(Number(m[1]) * unit));
  }
  if (found.length !== 1) return null;
  return found[0]! > 0 ? found[0]! : null;
}

function clean(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

export function fallbackParse(input: string): LlmProtocol {
  const text = input.replace(/\r\n?/g, "\n").trim();
  const lines = text.split("\n");
  let title = "";
  let stepTexts: string[] = [];

  const numberedCount = lines.filter((l) => NUMBERED.test(l)).length;
  const bulletCount = lines.filter((l) => BULLET.test(l)).length;

  if (numberedCount >= 2 || bulletCount >= 2) {
    const marker = numberedCount >= 2 ? NUMBERED : BULLET;
    const preamble: string[] = [];
    let current: string[] | null = null;
    for (const line of lines) {
      if (marker.test(line)) {
        if (current) stepTexts.push(current.join(" "));
        current = [line.replace(marker, "")];
      } else if (current) {
        if (line.trim()) current.push(line.trim());
      } else if (line.trim()) {
        preamble.push(line.trim());
      }
    }
    if (current) stepTexts.push(current.join(" "));
    title = preamble[0] ?? "";
  } else {
    const paragraphs = text.split(/\n\s*\n/).map((p) => clean(p)).filter(Boolean);
    const first = paragraphs[0] ?? "";
    const looksLikeTitle = paragraphs.length > 1 && first.length <= 80 && !/[.!?:]$/.test(first) && !first.includes("\n");
    if (looksLikeTitle) {
      title = first;
      stepTexts = paragraphs.slice(1);
    } else {
      stepTexts = paragraphs;
    }
  }

  const steps = stepTexts
    .map(clean)
    .filter(Boolean)
    .map((t) => ({ text: t, duration_seconds: extractDurationSeconds(t), reagents: [] as string[] }));

  return { title: clean(title).replace(/:$/, ""), steps, keyterms: [] };
}
