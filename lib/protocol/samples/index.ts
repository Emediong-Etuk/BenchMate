import type { Protocol } from "../types";
import { demoMock } from "./demoMock";
import { miniprep } from "./miniprep";
import { pcrSetup } from "./pcrSetup";

export type SampleDef = {
  id: string;
  title: string;
  blurb: string;
  keyterms: string[];
  defaultSamples: string;
  steps: { text: string; durationSeconds: number | null; reagents: string[] }[];
};

export const SAMPLES: SampleDef[] = [demoMock, miniprep, pcrSetup];

export function sampleById(id: string): SampleDef | undefined {
  return SAMPLES.find((s) => s.id === id);
}

export function sampleToProtocol(def: SampleDef, now: Date = new Date()): Protocol {
  return {
    id: `${def.id}-${now.getTime().toString(36)}`,
    title: def.title,
    source: "sample",
    steps: def.steps.map((s, i) => ({ number: i + 1, text: s.text, durationSeconds: s.durationSeconds, reagents: s.reagents })),
    keyterms: [...def.keyterms],
    createdAt: now.toISOString(),
  };
}
