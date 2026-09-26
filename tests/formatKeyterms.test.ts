import { describe, expect, it } from "vitest";
import { formatDuration, formatSampleList, parseSamples } from "@/lib/agent/format";
import { BASE_LAB_VOCAB, MAX_KEYTERMS_TOTAL, buildKeyterms } from "@/lib/agent/keyterms";

describe("parseSamples", () => {
  it("expands ranges and keeps named samples", () => {
    expect(parseSamples("1-4, Control, blank")).toEqual(["1", "2", "3", "4", "Control", "blank"]);
    expect(parseSamples("3–1; NTC\nA2")).toEqual(["1", "2", "3", "NTC", "A2"]);
  });
  it("dedupes and ignores empties and giant ranges", () => {
    expect(parseSamples("1, 1, , 2 to 3")).toEqual(["1", "2", "3"]);
    expect(parseSamples("1-500")).toEqual(["1-500"]);
  });
});

describe("formatSampleList", () => {
  it("compresses consecutive runs", () => {
    expect(formatSampleList(["1", "2", "3", "5", "6", "control"])).toBe("1–3, 5, 6, control");
  });
});

describe("formatDuration", () => {
  it.each([
    [60, "1 min"],
    [90, "1 min 30 s"],
    [5400, "1 h 30 min"],
    [45, "45 s"],
    [0, "0 s"],
  ])("%i → %s", (s, text) => expect(formatDuration(s)).toBe(text));
});

describe("buildKeyterms", () => {
  it("orders samples, then protocol terms, then base vocab, deduped", () => {
    const terms = buildKeyterms({ samples: ["1", "2", "control", "NTC"], protocolKeyterms: ["Buffer P1", "nanodrop", "RNase A"] });
    expect(terms.slice(0, 5)).toEqual(["control", "NTC", "Buffer P1", "nanodrop", "RNase A"]);
    expect(terms.filter((t) => t.toLowerCase() === "nanodrop")).toHaveLength(1);
    expect(terms).toContain("BenchMate");
  });

  it("caps each tier and the total at 100", () => {
    const samples = Array.from({ length: 40 }, (_, i) => `S-${i}`);
    const protocolKeyterms = Array.from({ length: 90 }, (_, i) => `reagent ${i}`);
    const terms = buildKeyterms({ samples, protocolKeyterms });
    expect(terms.length).toBeLessThanOrEqual(MAX_KEYTERMS_TOTAL);
    expect(terms.filter((t) => t.startsWith("S-"))).toHaveLength(15);
    expect(terms.filter((t) => t.startsWith("reagent"))).toHaveLength(60);
    expect(terms.length).toBe(15 + 60 + BASE_LAB_VOCAB.length);
  });
});

import { parseDurationInput } from "@/lib/agent/format";

describe("parseDurationInput", () => {
  it.each([
    ["90", 90],
    ["1:30", 90],
    ["2 min", 120],
    ["1.5 h", 5400],
    ["45s", 45],
    ["", null],
  ])("%s → %s", (input, out) => expect(parseDurationInput(input)).toBe(out));

  it.each(["abc", "0", "5 parsecs", "1:75"])("%s is invalid", (input) => expect(parseDurationInput(input)).toBeUndefined());
});
