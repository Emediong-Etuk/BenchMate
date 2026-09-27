import type { SampleDef } from "./index";

// Generic alkaline-lysis spin-column miniprep, written from general lab
// knowledge (not copied from any kit handbook).
export const miniprep: SampleDef = {
  id: "miniprep",
  title: "Plasmid DNA miniprep (generic alkaline lysis, spin column)",
  blurb: "14 steps with volumes, speeds in × g, and incubation times.",
  defaultSamples: "1-4",
  keyterms: [
    "resuspension buffer",
    "lysis buffer",
    "neutralization buffer",
    "RNase A",
    "spin column",
    "collection tube",
    "wash buffer",
    "elution buffer",
    "flow-through",
    "E. coli",
  ],
  steps: [
    {
      text: "Pellet 1.5 mL of overnight E. coli culture by centrifuging at 8,000 x g for 2 minutes, then discard the supernatant.",
      durationSeconds: 120,
      reagents: [],
    },
    {
      text: "Resuspend the pellet completely in 250 µL of chilled resuspension buffer containing RNase A by pipetting or vortexing.",
      durationSeconds: null,
      reagents: ["resuspension buffer", "RNase A"],
    },
    {
      text: "Add 250 µL of lysis buffer and gently invert the tube 4 to 6 times until the solution turns clear. Do not vortex.",
      durationSeconds: null,
      reagents: ["lysis buffer"],
    },
    { text: "Let the lysis proceed at room temperature for no longer than 5 minutes.", durationSeconds: 300, reagents: [] },
    {
      text: "Add 350 µL of neutralization buffer and immediately invert the tube 4 to 6 times until a white precipitate forms.",
      durationSeconds: null,
      reagents: ["neutralization buffer"],
    },
    { text: "Centrifuge at 13,000 x g for 10 minutes to pellet the cell debris.", durationSeconds: 600, reagents: [] },
    {
      text: "Transfer the cleared supernatant to a spin column seated in a collection tube, without disturbing the white pellet.",
      durationSeconds: null,
      reagents: [],
    },
    { text: "Centrifuge the column at 13,000 x g for 1 minute and discard the flow-through.", durationSeconds: 60, reagents: [] },
    {
      text: "Add 500 µL of wash buffer 1, centrifuge at 13,000 x g for 1 minute, and discard the flow-through.",
      durationSeconds: 60,
      reagents: ["wash buffer 1"],
    },
    {
      text: "Add 750 µL of ethanol wash buffer, centrifuge at 13,000 x g for 1 minute, and discard the flow-through.",
      durationSeconds: 60,
      reagents: ["ethanol wash buffer"],
    },
    { text: "Centrifuge the empty column at 13,000 x g for 1 minute to remove residual ethanol.", durationSeconds: 60, reagents: [] },
    { text: "Move the column into a clean, labeled 1.5 mL microcentrifuge tube.", durationSeconds: null, reagents: [] },
    {
      text: "Add 50 µL of elution buffer to the center of the membrane and let it stand for 1 minute.",
      durationSeconds: 60,
      reagents: ["elution buffer"],
    },
    {
      text: "Centrifuge at 13,000 x g for 1 minute to elute the DNA, then measure the concentration and 260/280 ratio.",
      durationSeconds: 60,
      reagents: [],
    },
  ],
};
