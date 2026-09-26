import { describe, expect, it } from "vitest";
import { buildParseResult } from "@/lib/protocol/buildProtocol";

const meta = { source: "llm" as const, protocolSource: "pasted" as const, id: "p1", now: new Date("2026-09-26T12:00:00Z") };

describe("buildParseResult", () => {
  it("derives durations from step text, overriding a wrong model value", () => {
    const input = "Gel\n1. Set for 30 minutes.\n2. Run at 120 V.";
    const logs: string[] = [];
    const r = buildParseResult(
      input,
      {
        title: "Gel",
        steps: [
          { text: "Set for 30 minutes.", duration_seconds: 30, reagents: [] },
          { text: "Run at 120 V.", duration_seconds: null, reagents: [] },
        ],
        keyterms: [],
      },
      meta,
      (m) => logs.push(m),
    );
    expect(r.protocol.steps.map((s) => s.durationSeconds)).toEqual([1800, null]);
    expect(r.protocol.steps.map((s) => s.number)).toEqual([1, 2]);
    expect(logs).toHaveLength(1);
    expect(r.missingNumbers).toEqual([]);
  });

  it("flags quantities the model dropped and falls back to a default title", () => {
    const r = buildParseResult(
      "Spin at 13,000 x g for 1 min.",
      { title: "", steps: [{ text: "Spin for 1 min.", duration_seconds: 60, reagents: [] }], keyterms: [] },
      meta,
    );
    expect(r.protocol.title).toBe("Untitled protocol");
    expect(r.missingNumbers).toEqual(["13,000"]);
  });
});
