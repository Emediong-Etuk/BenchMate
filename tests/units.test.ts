import { describe, expect, it } from "vitest";
import { normalizeQuantity, normalizeUnit } from "@/lib/agent/units";

describe("normalizeUnit", () => {
  it.each([
    ["ng/ul", "ng/µL"],
    ["nanograms per microliter", "ng/µL"],
    ["ng/µL", "ng/µL"],
    ["ul", "µL"],
    ["uL", "µL"],
    ["microliters", "µL"],
    ["microlitres", "µL"],
    ["ml", "mL"],
    ["xg", "x g"],
    ["g", "g"],
    ["times g", "x g"],
    ["c", "°C"],
    ["celsius", "°C"],
    ["degrees", "°C"],
    ["°C", "°C"],
    ["rpm", "rpm"],
    ["minutes", "min"],
    ["", ""],
    ["ratio", ""],
  ])("%s → %s", (raw, out) => expect(normalizeUnit(raw)).toBe(out));

  it("passes unknown units through, trimmed", () => {
    expect(normalizeUnit("  furlongs per fortnight ")).toBe("furlongs per fortnight");
    expect(normalizeUnit(undefined)).toBe("");
  });
});

describe("normalizeQuantity", () => {
  it.each([
    ["260 over 280", "260/280"],
    ["A260/A280", "260/280"],
    ["260/230", "260/230"],
    ["OD 600", "od600"],
    ["Concentration", "concentration"],
    ["Volume", "volume"],
  ])("%s → %s", (raw, out) => expect(normalizeQuantity(raw)).toBe(out));
});
