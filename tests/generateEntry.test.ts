import { describe, expect, it } from "vitest";
import { buildEntryModel, compareSamples, humanDuration } from "@/lib/notebook/entryModel";
import { cell, exportFileBase, generateJson, generateMarkdown } from "@/lib/notebook/generateEntry";
import { finishedSession } from "./fixtures/finishedSession";

describe("generateEntry", () => {
  it("matches the Markdown snapshot", async () => {
    const md = generateMarkdown(finishedSession(), { timeZone: "UTC" });
    await expect(md).toMatchFileSnapshot("./__snapshots__/notebook-entry.md");
  });

  it("is deterministic", () => {
    const a = generateMarkdown(finishedSession(), { timeZone: "UTC" });
    const b = generateMarkdown(finishedSession(), { timeZone: "UTC" });
    expect(a).toBe(b);
  });

  it("summarizes counts, excluding voided entries from results", () => {
    const m = buildEntryModel(finishedSession(), { timeZone: "UTC" });
    expect(m.summary).toEqual({ stepsCompleted: 4, totalSteps: 4, measurements: 4, deviations: 1, observations: 1, voided: 2, unconfirmed: 1 });
    expect(m.header.duration).toBe("1 h 12 min");
    expect(m.header.samples).toBe("1–3, control");
  });

  it("sorts measurements by sample (natural), then quantity", () => {
    const m = buildEntryModel(finishedSession(), { timeZone: "UTC" });
    expect(m.measurements.rows.map((r) => `${r[0]}:${r[1]}`)).toEqual(["1:concentration", "2:260/280", "2:concentration", "control:concentration"]);
    expect(m.measurements.rows[3]![2]).toBe("3.2 †");
  });

  it("step log uses first start and last completion per step", () => {
    const m = buildEntryModel(finishedSession(), { timeZone: "UTC" });
    expect(m.stepLog.rows[1]).toEqual(["2", "Centrifuge 1 min at 13,000 x g.", "14:01:20", "14:03:05", "1 min 45 s"]);
  });

  it("escapes table cells", () => {
    expect(cell("a | b\nc")).toBe("a \\| b c");
    expect(cell("")).toBe("—");
  });

  it("exports the full raw session as JSON and a tidy filename", () => {
    const json = JSON.parse(generateJson(finishedSession()));
    expect(json.format).toBe("benchmate-session");
    expect(json.session.entries).toHaveLength(8);
    expect(exportFileBase(finishedSession())).toBe("2026-09-26-mini-test-protocol");
  });

  it("helpers", () => {
    expect(humanDuration(45_000)).toBe("45 s");
    expect(humanDuration(8 * 60_000)).toBe("8 min");
    expect(["control", "10", "2", "none", "blank"].sort(compareSamples)).toEqual(["2", "10", "blank", "control", "none"]);
  });

  it("marks an in-progress session", () => {
    const s = { ...finishedSession(), endedAt: undefined };
    const m = buildEntryModel(s, { timeZone: "UTC", now: new Date("2026-09-26T14:30:00.000Z") });
    expect(m.header.ended).toBe("in progress");
    expect(m.header.duration).toBe("30 min (in progress)");
  });
});
