import type { BenchSession } from "@/lib/store/types";

// input.transcription_prompt (brief §9.4). Context, not instructions: the
// docs say behavioural commands are ignored. Verified compatible with
// keyterms (NOTES.md §2). Max 1750 chars.

export const MAX_TRANSCRIPTION_PROMPT = 1750;

export function buildTranscriptionPrompt(session: BenchSession): string {
  const base =
    "A molecular biology bench session. The speaker is a scientist reading through a lab protocol step by step and reporting what they did and measured. " +
    "They say volumes and concentrations with units such as microliters (µL), milliliters (mL), nanograms per microliter (ng/µL), times g (× g), rpm, degrees Celsius (°C), minutes and seconds, " +
    'absorbance ratios such as 260/280 and 260/230 spoken as "260 over 280", and OD600 readings. ' +
    'Sample and tube labels are usually numbers ("sample two", "tube four") or short names like "control" or "blank".';
  const reagents = [...new Set([...session.protocol.keyterms, ...session.protocol.steps.flatMap((s) => s.reagents)])];
  let prompt = `${base} Protocol: ${session.protocol.title}.`;
  if (reagents.length) {
    const lead = " Reagents and equipment mentioned include ";
    let list = "";
    for (const r of reagents) {
      const next = list ? `${list}, ${r}` : r;
      if (prompt.length + lead.length + next.length + 1 > MAX_TRANSCRIPTION_PROMPT) break;
      list = next;
    }
    if (list) prompt += `${lead}${list}.`;
  }
  return prompt.slice(0, MAX_TRANSCRIPTION_PROMPT);
}
