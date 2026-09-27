import type { SampleDef } from "./index";

// Safe to film anywhere: colored water, no real reagents. Designed so the
// demo exercises navigation, two measurement calls, a deviation, an
// observation, and a 1-minute timer.
export const demoMock: SampleDef = {
  id: "demo-mock",
  title: "Demo: Mock bench run (colored water)",
  blurb: "8 safe steps with colored water. Exercises every voice feature in about 90 seconds.",
  defaultSamples: "1-3",
  keyterms: ["blue water", "yellow water", "mini centrifuge", "NanoDrop", "flick"],
  steps: [
    { text: "Label three 1.5 mL tubes 1, 2, and 3, and place them in the rack.", durationSeconds: null, reagents: [] },
    {
      text: "Pipette 200 µL of blue water into tube 1 and 200 µL of yellow water into tube 2.",
      durationSeconds: null,
      reagents: ["blue water", "yellow water"],
    },
    {
      text: "Pipette 100 µL of blue water and 100 µL of yellow water into tube 3, then flick the tube to mix.",
      durationSeconds: null,
      reagents: ["blue water", "yellow water"],
    },
    { text: "Let all three tubes stand at room temperature for 1 minute as a mock incubation.", durationSeconds: 60, reagents: [] },
    { text: "Close the lids and spin the tubes in the mini centrifuge for 1 minute as a mock spin.", durationSeconds: 60, reagents: [] },
    { text: "Look at each tube and note its color and whether it is clear or cloudy.", durationSeconds: null, reagents: [] },
    {
      text: "Read the mock concentration and 260/280 ratio for tubes 1 and 2 from the value card, as if from the NanoDrop.",
      durationSeconds: null,
      reagents: [],
    },
    { text: "Discard the tubes into the benchtop waste and wipe down the bench.", durationSeconds: null, reagents: [] },
  ],
};
