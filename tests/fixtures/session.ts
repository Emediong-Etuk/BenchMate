import type { BenchSession } from "@/lib/store/types";

export function makeSession(overrides: Partial<BenchSession> = {}): BenchSession {
  return {
    id: "s-test",
    protocol: {
      id: "p-test",
      title: "Mini test protocol",
      source: "sample",
      keyterms: ["Buffer P1"],
      createdAt: "2026-09-26T10:00:00.000Z",
      steps: [
        { number: 1, text: "Add 250 µL Buffer P1.", durationSeconds: null, reagents: ["Buffer P1"] },
        { number: 2, text: "Centrifuge 1 min at 13,000 x g.", durationSeconds: 60, reagents: [] },
        { number: 3, text: "Incubate 10 minutes at room temperature.", durationSeconds: 600, reagents: [] },
        { number: 4, text: "Measure the concentration.", durationSeconds: null, reagents: [] },
      ],
    },
    samples: ["1", "2", "3", "control"],
    startedAt: "2026-09-26T10:00:00.000Z",
    assemblyaiSessionIds: [],
    currentStep: 0,
    stepEvents: [],
    entries: [],
    timers: [],
    transcript: [],
    settings: { voice: "alba", transcriptionMode: "balanced", voiceFocus: "far-field", volume: 100 },
    ...overrides,
  };
}
