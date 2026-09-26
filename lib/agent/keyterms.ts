// input.keyterms builder (brief §9.3, NOTES.md §2 keyterms): ≤100 terms in
// priority order, deduped case-insensitively.

export const MAX_KEYTERMS_TOTAL = 100;
const MAX_SAMPLE_TERMS = 15;
const MAX_PROTOCOL_TERMS = 60;
const MAX_BASE_TERMS = 25;

// Rarer lab words only: the docs warn that common English words dilute the
// boost (so "pellet", "vortex" and plain numbers are left out).
export const BASE_LAB_VOCAB = [
  "BenchMate",
  "microliters",
  "nanograms per microliter",
  "times g",
  "rpm",
  "NanoDrop",
  "Qubit",
  "OD600",
  "260/280",
  "260/230",
  "supernatant",
  "eluate",
  "lysate",
  "microcentrifuge",
  "aliquot",
  "thermocycler",
  "spin column",
  "flow-through",
  "resuspend",
  "nuclease-free",
];

/** Sample labels worth boosting: short numbers are already well recognized. */
function sampleTerms(samples: string[]): string[] {
  return samples.filter((s) => !/^\d{1,2}$/.test(s));
}

export function buildKeyterms(input: { samples: string[]; protocolKeyterms: string[] }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (terms: string[], cap: number) => {
    let added = 0;
    for (const raw of terms) {
      if (added >= cap || out.length >= MAX_KEYTERMS_TOTAL) break;
      const t = raw.trim().replace(/\s+/g, " ");
      const key = t.toLowerCase();
      if (!t || t.length > 50 || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      added++;
    }
  };
  add(sampleTerms(input.samples), MAX_SAMPLE_TERMS);
  add(input.protocolKeyterms, MAX_PROTOCOL_TERMS);
  add(BASE_LAB_VOCAB, MAX_BASE_TERMS);
  return out;
}
