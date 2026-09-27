// Verifies no quantities were lost in parsing (brief §11.2 step 3): every
// numeric token in the input must appear somewhere in the parsed protocol.

const LIST_MARKER = /^\s*\d+[.)]\s+/gm;
const NUMBER = /\d+(?:[.,]\d+)*/g;

/** "13,000" and "13000" compare equal; "1.86" stays distinct from "186". */
function normalize(token: string): string {
  // Commas followed by exactly 3 digits are thousands separators.
  return token.replace(/,(?=\d{3}(?!\d))/g, "").replace(/,/g, ".");
}

export function extractNumbers(text: string): string[] {
  return text.replace(LIST_MARKER, "").match(NUMBER) ?? [];
}

export function findMissingNumbers(input: string, parsedTexts: string[]): string[] {
  const present = new Set(extractNumbers(parsedTexts.join("\n")).map(normalize));
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const token of extractNumbers(input)) {
    const n = normalize(token);
    if (present.has(n) || seen.has(n)) continue;
    seen.add(n);
    missing.push(token);
  }
  return missing;
}
