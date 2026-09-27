// Small, pure formatting helpers shared by setup, bench and the notebook.

const MAX_RANGE = 96;

/**
 * "1-8, control, blank" → ["1",…,"8","control","blank"]. Ranges accept
 * "-", "–" or "to". Labels keep their typed case (NTC, A2) and are deduped
 * case-insensitively.
 */
export function parseSamples(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    out.push(label);
  };
  for (const raw of input.split(/[,;\n]/)) {
    const part = raw.trim().replace(/\s+/g, " ");
    if (!part) continue;
    const range = part.match(/^(\d+)\s*(?:-|–|—|to)\s*(\d+)$/i);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      if (hi - lo + 1 <= MAX_RANGE) {
        for (let n = lo; n <= hi; n++) push(String(n));
        continue;
      }
    }
    push(part);
  }
  return out;
}

/** ["1","2","3","5","control"] → "1–3, 5, control" */
export function formatSampleList(samples: string[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < samples.length) {
    const cur = samples[i]!;
    if (/^\d+$/.test(cur)) {
      let j = i;
      while (j + 1 < samples.length && /^\d+$/.test(samples[j + 1]!) && Number(samples[j + 1]) === Number(samples[j]) + 1) j++;
      parts.push(j - i >= 2 ? `${cur}–${samples[j]}` : samples.slice(i, j + 1).join(", "));
      i = j + 1;
    } else {
      parts.push(cur);
      i++;
    }
  }
  return parts.join(", ");
}

/** 60 → "1 min", 90 → "1 min 30 s", 5400 → "1 h 30 min", 45 → "45 s" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (sec || parts.length === 0) parts.push(`${sec} s`);
  return parts.join(" ");
}

/** Setup-screen duration input: "90" (seconds), "1:30", "2 min", "1.5 h". Empty → null; invalid → undefined. */
export function parseDurationInput(input: string): number | null | undefined {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s) > 0 ? Number(s) : undefined;
  const clock = s.match(/^(\d+):([0-5]\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]) || undefined;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)$/);
  if (!m) return undefined;
  const unit = m[2]!.startsWith("h") ? 3600 : m[2]!.startsWith("m") ? 60 : 1;
  const v = Math.round(Number(m[1]) * unit);
  return v > 0 ? v : undefined;
}

/** Spoken duration for announcements: 600 → "10 minutes", 90 → "1 minute 30 seconds". */
export function formatDurationSpoken(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (h) parts.push(unit(h, "hour"));
  if (m) parts.push(unit(m, "minute"));
  if (sec || parts.length === 0) parts.push(unit(sec, "second"));
  return parts.join(" ");
}
