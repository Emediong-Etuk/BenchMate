import { describe, expect, it } from "vitest";
import { extractDurationSeconds, fallbackParse } from "@/lib/protocol/fallbackParser";
import { findMissingNumbers } from "@/lib/protocol/numberCheck";

describe("extractDurationSeconds", () => {
  it.each([
    ["Centrifuge 1 min at 13,000 x g.", 60],
    ["Incubate 5 minutes at room temperature.", 300],
    ["Vortex for 30 s.", 30],
    ["Incubate 1.5 h at 37 °C.", 5400],
    ["Heat 90 seconds.", 90],
  ])("%s → %i", (text, seconds) => {
    expect(extractDurationSeconds(text)).toBe(seconds);
  });

  it.each([
    ["Incubate 5–10 min.", "range"],
    ["Incubate 5 to 10 minutes.", "range with 'to'"],
    ["Spin 1 min, then again for 2 min.", "two durations"],
    ["Add 250 µL Buffer P1.", "no duration"],
    ["Incubate overnight.", "no explicit number"],
  ])("%s → null (%s)", (text) => {
    expect(extractDurationSeconds(text)).toBeNull();
  });
});

describe("fallbackParse", () => {
  it("splits numbered text, keeps the title and joins continuation lines", () => {
    const p = fallbackParse(
      "Quick miniprep\n\n1. Add 250 µL Buffer P1.\n   Resuspend fully.\n2) Centrifuge 1 min at 13,000 x g.\n3. Incubate 5 minutes.",
    );
    expect(p.title).toBe("Quick miniprep");
    expect(p.steps.map((s) => s.text)).toEqual([
      "Add 250 µL Buffer P1. Resuspend fully.",
      "Centrifuge 1 min at 13,000 x g.",
      "Incubate 5 minutes.",
    ]);
    expect(p.steps.map((s) => s.duration_seconds)).toEqual([null, 60, 300]);
    expect(p.keyterms).toEqual([]);
  });

  it("splits unnumbered paragraphs on blank lines, first short line as title", () => {
    const p = fallbackParse("Gel prep\n\nWeigh 1 g agarose.\n\nAdd 100 mL TAE and microwave 2 minutes.");
    expect(p.title).toBe("Gel prep");
    expect(p.steps).toHaveLength(2);
    expect(p.steps[1]!.duration_seconds).toBe(120);
  });

  it("does not steal a sentence as the title", () => {
    const p = fallbackParse("Weigh 1 g agarose.\n\nAdd 100 mL TAE.");
    expect(p.title).toBe("");
    expect(p.steps).toHaveLength(2);
  });

  it("handles bullet lists", () => {
    const p = fallbackParse("Wash\n- Add 500 µL PE.\n- Spin 1 min.");
    expect(p.title).toBe("Wash");
    expect(p.steps.map((s) => s.text)).toEqual(["Add 500 µL PE.", "Spin 1 min."]);
  });
});

describe("findMissingNumbers", () => {
  const input = "1. Add 250 µL P1.\n2. Spin 1 min at 13,000 x g.\n3. Read 260/280 of 1.86.";

  it("finds nothing missing when all quantities survive (list markers ignored)", () => {
    const parsed = ["Add 250 µL P1.", "Spin 1 min at 13000 x g.", "Read 260/280 of 1.86."];
    expect(findMissingNumbers(input, parsed)).toEqual([]);
  });

  it("flags a dropped number (the deliberately mangled parse case)", () => {
    const parsed = ["Add 250 µL P1.", "Spin 1 min.", "Read 260/280 of 186."];
    expect(findMissingNumbers(input, parsed)).toEqual(["13,000", "1.86"]);
  });

  it("reports each missing value once", () => {
    expect(findMissingNumbers("Spin 5 min. Spin 5 min again.", ["Spin."])).toEqual(["5"]);
  });
});
