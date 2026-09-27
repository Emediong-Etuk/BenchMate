// Unit normalization for logged measurements (brief §10.2). Unknown units
// pass through unchanged (trimmed) so nothing the user said is lost.

const ALIASES: [RegExp, string][] = [
  [/^(ng\/(u|µ|μ)l|nanograms? per micro ?lit(er|re)s?|ng per (u|µ|μ)l)$/i, "ng/µL"],
  [/^(pg\/(u|µ|μ)l|picograms? per micro ?lit(er|re)s?)$/i, "pg/µL"],
  [/^((u|µ|μ)g\/(u|µ|μ)l|micrograms? per micro ?lit(er|re)s?)$/i, "µg/µL"],
  [/^((u|µ|μ)g\/ml|micrograms? per milli ?lit(er|re)s?)$/i, "µg/mL"],
  [/^(mg\/ml|milligrams? per milli ?lit(er|re)s?)$/i, "mg/mL"],
  [/^((u|µ|μ)l|micro ?lit(er|re)s?|mics?)$/i, "µL"],
  [/^(ml|milli ?lit(er|re)s?|mls)$/i, "mL"],
  [/^(l|lit(er|re)s?)$/i, "L"],
  [/^(nl|nano ?lit(er|re)s?)$/i, "nL"],
  [/^(ng|nanograms?)$/i, "ng"],
  [/^((u|µ|μ)g|micrograms?)$/i, "µg"],
  [/^(mg|milligrams?)$/i, "mg"],
  [/^(g|grams?)$/i, "g"],
  [/^(x ?g|× ?g|times g|rcf|g-force|g force)$/i, "x g"],
  [/^(rpm|revolutions per minute)$/i, "rpm"],
  [/^(°c|º c|° c|c|celsius|degrees?( celsius| c)?|deg c)$/i, "°C"],
  [/^(s|sec|secs|seconds?)$/i, "s"],
  [/^(min|mins|minutes?)$/i, "min"],
  [/^(h|hr|hrs|hours?)$/i, "h"],
  [/^(mm|millimolar)$/i, "mM"],
  [/^((u|µ|μ)m|micromolar)$/i, "µM"],
  [/^(nm|nanomolar)$/i, "nM"],
  [/^(m|molar)$/i, "M"],
  [/^(%|percent|per ?cent)$/i, "%"],
  [/^(v|volts?)$/i, "V"],
  [/^(ratio|none|unitless|no unit)$/i, ""],
];

export function normalizeUnit(raw: string | null | undefined): string {
  const u = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!u) return "";
  for (const [re, canonical] of ALIASES) if (re.test(u)) return canonical;
  return u;
}

/** "260 over 280", "A260/A280", "260-280" → "260/280"; otherwise lowercase trimmed. */
export function normalizeQuantity(raw: string): string {
  const q = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const ratio = q.match(/^a?(\d{3})\s*(?:\/|over|to|-|:)\s*a?(\d{3})(?: ratio)?$/);
  if (ratio) return `${ratio[1]}/${ratio[2]}`;
  if (/^(od ?600|od600|optical density( at 600)?)$/.test(q)) return "od600";
  if (/^(conc\.?|concentration)$/.test(q)) return "concentration";
  if (q === "p h") return "ph";
  return q;
}
