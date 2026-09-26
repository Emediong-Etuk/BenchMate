import type { SampleDef } from "./index";

// Generic 25 µL PCR setup, written from general lab knowledge.
export const pcrSetup: SampleDef = {
  id: "pcr-setup",
  title: "PCR reaction setup (generic, 25 µL reactions)",
  blurb: "10 steps: master mix, controls, and a thermocycler program.",
  defaultSamples: "1-6, NTC, positive",
  keyterms: [
    "master mix",
    "dNTP mix",
    "forward primer",
    "reverse primer",
    "polymerase",
    "no-template control",
    "thermocycler",
    "nuclease-free water",
    "PCR buffer",
  ],
  steps: [
    {
      text: "Thaw the PCR buffer, dNTP mix, primers, and template DNA on ice. Keep the polymerase at -20 °C until needed.",
      durationSeconds: null,
      reagents: ["PCR buffer", "dNTP mix", "primers", "template DNA", "polymerase"],
    },
    { text: "Vortex and briefly spin down each thawed reagent.", durationSeconds: null, reagents: [] },
    {
      text: "Label thin-walled PCR tubes for each sample, a no-template control, and a positive control.",
      durationSeconds: null,
      reagents: [],
    },
    {
      text: "Prepare a master mix on ice for all reactions plus one extra. Per 25 µL reaction, combine 16.75 µL nuclease-free water, 2.5 µL 10x PCR buffer, 0.5 µL 10 mM dNTP mix, and 1.25 µL each of 10 µM forward and reverse primer.",
      durationSeconds: null,
      reagents: ["nuclease-free water", "PCR buffer", "dNTP mix", "forward primer", "reverse primer"],
    },
    {
      text: "Add 0.25 µL of polymerase per reaction to the master mix last, then mix gently by pipetting. Do not vortex.",
      durationSeconds: null,
      reagents: ["polymerase"],
    },
    { text: "Dispense 22.5 µL of master mix into each labeled tube.", durationSeconds: null, reagents: ["master mix"] },
    {
      text: "Add 2.5 µL of template DNA to each sample tube, 2.5 µL of nuclease-free water to the no-template control, and 2.5 µL of control template to the positive control.",
      durationSeconds: null,
      reagents: ["template DNA", "nuclease-free water"],
    },
    { text: "Cap the tubes, flick gently, and spin down briefly to collect the liquid.", durationSeconds: null, reagents: [] },
    {
      text: "Run the thermocycler: 95 °C for 2 minutes; 30 cycles of 95 °C for 30 seconds, 55 °C for 30 seconds, and 72 °C for 1 minute; then 72 °C for 5 minutes; hold at 4 °C.",
      durationSeconds: null,
      reagents: [],
    },
    { text: "Record the thermocycler run number and store the products at 4 °C until analysis.", durationSeconds: null, reagents: [] },
  ],
};
