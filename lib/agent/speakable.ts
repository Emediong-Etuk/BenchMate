// Speakable rendering of protocol/measurement text (NOTES.md C11: the agent
// read "13,000 x g" as "1 3 0 0 0 x g"). Only for what the agent SAYS; the
// exact text stays authoritative in the store and the notebook.

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r || !h) {
    if (r < 20) parts.push(ONES[r]!);
    else parts.push(TENS[Math.floor(r / 10)]! + (r % 10 ? `-${ONES[r % 10]}` : ""));
  }
  return parts.join(" ");
}

/** Integer → English words (0 … 999,999,999). */
export function integerToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1e9) return String(n);
  if (n < 1000) return under1000(n);
  const parts: string[] = [];
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  if (millions) parts.push(`${under1000(millions)} million`);
  if (thousands) parts.push(`${under1000(thousands)} thousand`);
  if (rest) parts.push(under1000(rest));
  return parts.join(" ");
}

/** 260 → "two sixty", 205 → "two oh five", 200 → "two hundred". */
function ratioWords(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (r === 0) return integerToWords(n);
  return `${ONES[h]} ${r < 10 ? `oh ${ONES[r]}` : under1000(r)}`;
}

const UNIT_WORDS: [RegExp, string][] = [
  [/(\d)\s*(?:ng|nanograms?)\s*\/\s*(?:µ|μ|u)L\b/g, "$1 nanograms per microliter"],
  [/(\d)\s*(?:µ|μ|u)g\s*\/\s*mL\b/g, "$1 micrograms per milliliter"],
  [/(\d)\s*(?:µ|μ|u)L\b/g, "$1 microliters"],
  [/(\d)\s*mL\b/g, "$1 milliliters"],
  [/(\d)\s*(?:µ|μ|u)M\b/g, "$1 micromolar"],
  [/(\d)\s*mM\b/g, "$1 millimolar"],
  [/(\d)\s*(?:µ|μ|u)g\b/g, "$1 micrograms"],
  [/(\d)\s*ng\b/g, "$1 nanograms"],
  [/(\d)\s*mg\b/g, "$1 milligrams"],
  [/(\d)\s*(?:x|×)\s*g\b/g, "$1 times g"],
  [/(\d)\s*°\s*C\b/g, "$1 degrees Celsius"],
  [/(\d)\s*rpm\b/g, "$1 R P M"],
  [/\b1\s*min\b/g, "1 minute"],
  [/(\d)\s*min\b/g, "$1 minutes"],
  [/\b1\s*h\b/g, "1 hour"],
  [/(\d)\s*h\b/g, "$1 hours"],
  [/\b1\s*s\b/g, "1 second"],
  [/(\d)\s*s\b/g, "$1 seconds"],
];

export function toSpeakable(text: string): string {
  let out = text;
  // Negative temperatures: "-20 °C" → "minus 20 °C" (before unit words).
  out = out.replace(/(^|[\s(])[-−–](\d+(?:\.\d+)?)\s*°\s*C/g, "$1minus $2 °C");
  // Units first, while the numbers are still digits.
  for (const [re, rep] of UNIT_WORDS) out = out.replace(re, rep);
  // Absorbance ratios as scientists say them: "260/280" → "two sixty over two eighty".
  out = out.replace(/\b(\d{3})\/(\d{3})\b/g, (_m, a: string, b: string) => `${ratioWords(Number(a))} over ${ratioWords(Number(b))}`);
  // Integers ≥ 100 (with or without separators) → words: TTS reads "245" as
  // "2 4 5" and "13,000" digit by digit (NOTES C11). Decimals stay digits.
  out = out.replace(/(?<![\d.])(?:\d{1,3}(?:,\d{3})+|\d{3,9})(?![\d.,]\d|\d)/g, (m) => integerToWords(Number(m.replace(/,/g, ""))));
  return out;
}
