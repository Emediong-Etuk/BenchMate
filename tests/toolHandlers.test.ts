import { describe, expect, it } from "vitest";
import { MAX_RUNNING_TIMERS, readbackFor, runTool, type ToolCtx } from "@/lib/agent/toolHandlers";
import type { BenchSession } from "@/lib/store/types";
import { makeSession } from "./fixtures/session";

let n = 0;
const ctx = (over: Partial<ToolCtx> = {}): ToolCtx => ({
  now: new Date("2026-09-26T10:05:00.000Z"),
  callId: `c${++n}`,
  lastUserUtterance: "test utterance",
  ...over,
});

function run(s: BenchSession, name: string, args: Record<string, unknown> = {}, c = ctx()) {
  return runTool(name, s, args, c);
}
const at = (s: BenchSession, step: number) => ({ ...s, currentStep: step });

describe("navigate_protocol", () => {
  it("next from not-started starts step 1 with exact and speakable text", () => {
    const out = run(makeSession(), "navigate_protocol", { action: "next" });
    expect(out.isError).toBe(false);
    expect(out.nextState.currentStep).toBe(1);
    expect(out.result).toMatchObject({ ok: true, step_number: 1, total_steps: 4, step_text: "Add 250 µL Buffer P1.", is_last_step: false });
    expect(out.result.say).toBe("Step 1. Add two hundred fifty microliters Buffer P1.");
    expect(out.nextState.stepEvents).toEqual([{ stepNumber: 1, startedAt: "2026-09-26T10:05:00.000Z" }]);
  });

  it("next completes the current step and advances", () => {
    const s1 = run(makeSession(), "navigate_protocol", { action: "next" }).nextState;
    const out = run(s1, "navigate_protocol", { action: "next" }, ctx({ now: new Date("2026-09-26T10:06:00.000Z") }));
    expect(out.nextState.currentStep).toBe(2);
    expect(out.result).toMatchObject({ completed_step_number: 1, duration_seconds: 60 });
    expect(out.result.say).toBe("Step 2. Centrifuge 1 minute at thirteen thousand times g.");
    expect(out.nextState.stepEvents[0]!.completedAt).toBe("2026-09-26T10:06:00.000Z");
  });

  it("next on the final step is an instructive error", () => {
    const s = at(makeSession(), 4);
    const out = run(s, "navigate_protocol", { action: "next" });
    expect(out.isError).toBe(true);
    expect(out.result.error).toBe("Already on the final step (4 of 4). Ask whether they want to finish the session.");
    expect(out.nextState).toBe(s);
  });

  it("previous moves back without touching completion; errors at step 1 and before start", () => {
    const s = { ...at(makeSession(), 3), stepEvents: [{ stepNumber: 3, startedAt: "x" }] };
    const out = run(s, "navigate_protocol", { action: "previous" });
    expect(out.nextState.currentStep).toBe(2);
    expect(out.nextState.stepEvents[0]!.completedAt).toBeUndefined();
    expect(run(at(makeSession(), 1), "navigate_protocol", { action: "previous" }).result.error).toBe("Already at step 1 of 4.");
    expect(run(makeSession(), "navigate_protocol", { action: "previous" }).isError).toBe(true);
  });

  it("goto validates the range", () => {
    expect(run(at(makeSession(), 1), "navigate_protocol", { action: "goto", step_number: 3 }).nextState.currentStep).toBe(3);
    expect(run(makeSession(), "navigate_protocol", { action: "goto", step_number: 20 }).result.error).toBe(
      "There is no step 20; the protocol has 4 steps. Ask which step they meant.",
    );
    expect(run(makeSession(), "navigate_protocol", { action: "goto" }).isError).toBe(true);
  });

  it("repeat/current don't change state; error before start", () => {
    const s = at(makeSession(), 2);
    for (const action of ["repeat", "current"]) {
      const out = run(s, "navigate_protocol", { action });
      expect(out.nextState).toBe(s);
      expect(out.result.step_number).toBe(2);
    }
    expect(run(makeSession(), "navigate_protocol", { action: "repeat" }).result.error).toBe(
      "The protocol hasn't started yet. Ask if they want to start at step 1.",
    );
  });

  it("rejects unknown actions", () => {
    expect(run(makeSession(), "navigate_protocol", { action: "skip" }).isError).toBe(true);
  });
});

describe("record_measurement", () => {
  it("logs one entry per reading with normalized units, shared callId, and a readback", () => {
    const c = ctx({ lastUserUtterance: "sample two 245 nanograms per microliter 260 over 280 is 1.86" });
    const out = run(
      at(makeSession(), 4),
      "record_measurement",
      {
        measurements: [
          { sample_id: "2", quantity: "Concentration", value: 245, unit: "nanograms per microliter" },
          { sample_id: "2", quantity: "260 over 280", value: 1.86, unit: "" },
        ],
      },
      c,
    );
    expect(out.isError).toBe(false);
    expect(out.nextState.entries).toHaveLength(2);
    expect(out.nextState.entries.every((e) => e.callId === c.callId && e.status === "pending" && e.stepNumber === 4)).toBe(true);
    expect(out.nextState.entries[0]!.sourceUtterance).toBe(c.lastUserUtterance);
    expect(out.nextState.entries[0]!.payload).toEqual({ sampleId: "2", quantity: "concentration", value: 245, unit: "ng/µL" });
    expect(out.result.readback).toBe("sample 2: 245 ng/µL; 260/280 1.86");
    expect(out.result.say).toBe("sample 2: two hundred forty-five nanograms per microliter; two sixty over two eighty 1.86");
    expect(out.result.warning).toBeUndefined();
    expect(out.entryIds).toHaveLength(2);
  });

  it("defaults sample to 'none' and warns about samples not in the run", () => {
    const out = run(makeSession(), "record_measurement", {
      measurements: [
        { quantity: "volume", value: 50, unit: "ul" },
        { sample_id: "9", quantity: "concentration", value: 10, unit: "ng/ul" },
      ],
    });
    expect(out.nextState.entries[0]!.payload).toMatchObject({ sampleId: "none", unit: "µL" });
    expect(out.result.warning).toBe("Sample '9' isn't in this run's sample list (1–3, control). It was logged anyway; confirm with the user.");
  });

  it("rejects non-finite values without logging anything", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "245"]) {
      const out = run(makeSession(), "record_measurement", { measurements: [{ quantity: "concentration", value, unit: "ng/µL" }] });
      expect(out.isError).toBe(true);
      expect(out.nextState.entries).toHaveLength(0);
    }
    expect(run(makeSession(), "record_measurement", { measurements: [] }).isError).toBe(true);
  });

  it("validates an explicit step number", () => {
    const ok = run(makeSession(), "record_measurement", { measurements: [{ quantity: "ph", value: 7.4, unit: "" }], step_number: 2 });
    expect(ok.nextState.entries[0]!.stepNumber).toBe(2);
    const bad = run(makeSession(), "record_measurement", { measurements: [{ quantity: "ph", value: 7.4, unit: "" }], step_number: 9 });
    expect(bad.isError).toBe(true);
  });

  it("readback groups by sample", () => {
    expect(
      readbackFor([
        { sampleId: "1", quantity: "concentration", value: 182, unit: "ng/µL" },
        { sampleId: "1", quantity: "260/280", value: 1.91, unit: "" },
        { sampleId: "none", quantity: "temperature", value: 37, unit: "°C" },
      ]),
    ).toBe("sample 1: 182 ng/µL; 260/280 1.91. temperature 37 °C");
  });
});

describe("record_measurement (flat, one reading per call)", () => {
  it("accepts the flat schema and normalizes spoken units", () => {
    const out = run(at(makeSession(), 4), "record_measurement", { sample_id: "2", quantity: "concentration", value: 245, unit: "nanograms per microliter" });
    expect(out.nextState.entries[0]!.payload).toEqual({ sampleId: "2", quantity: "concentration", value: 245, unit: "ng/µL" });
    const ratio = run(makeSession(), "record_measurement", { sample_id: "2", quantity: "260 over 280", value: 1.86 });
    expect(ratio.nextState.entries[0]!.payload).toEqual({ sampleId: "2", quantity: "260/280", value: 1.86, unit: "" });
  });

  it("voids every entry from one utterance even when split across calls", () => {
    let s = makeSession();
    s = run(s, "log_observation", { text: "earlier" }, ctx({ groupId: "u1", now: new Date("2026-09-26T10:01:00Z") })).nextState;
    s = run(s, "record_measurement", { sample_id: "2", quantity: "concentration", value: 245, unit: "ng/ul" }, ctx({ groupId: "u2", now: new Date("2026-09-26T10:02:00Z") })).nextState;
    s = run(s, "record_measurement", { sample_id: "2", quantity: "260 over 280", value: 1.86 }, ctx({ groupId: "u2", now: new Date("2026-09-26T10:02:00Z") })).nextState;
    const out = run(s, "void_last_entry", {}, ctx({ groupId: "u3" }));
    expect(out.nextState.entries.map((e) => e.status)).toEqual(["pending", "voided", "voided"]);
    expect(out.result.voided).toHaveLength(2);
  });
});

describe("log_deviation / log_observation", () => {
  it("logs a deviation with planned/actual", () => {
    const out = run(at(makeSession(), 2), "log_deviation", { description: "Spun 3 min instead of 1.", planned: "1 min", actual: "3 min" });
    expect(out.nextState.entries[0]).toMatchObject({ kind: "deviation", stepNumber: 2, payload: { description: "Spun 3 min instead of 1.", planned: "1 min", actual: "3 min" } });
    expect(out.result).toMatchObject({ ok: true, step_number: 2, planned: "1 min" });
    expect(run(makeSession(), "log_deviation", { description: " " }).isError).toBe(true);
  });

  it("logs an observation, with a sample warning when unknown", () => {
    const out = run(at(makeSession(), 3), "log_observation", { text: "Tube 4 looks cloudy.", sample_id: "4" });
    expect(out.nextState.entries[0]).toMatchObject({ kind: "observation", payload: { text: "Tube 4 looks cloudy.", sampleId: "4" } });
    expect(out.result.warning).toMatch(/'4' isn't in this run/);
    expect(run(makeSession(), "log_observation", {}).isError).toBe(true);
  });
});

describe("void_last_entry", () => {
  it("voids every entry from the most recent call as a unit, keeping them for audit", () => {
    let s = makeSession();
    s = run(s, "log_observation", { text: "first" }, ctx({ now: new Date("2026-09-26T10:01:00Z") })).nextState;
    s = run(
      s,
      "record_measurement",
      { measurements: [{ sample_id: "1", quantity: "concentration", value: 1, unit: "ng/µL" }, { sample_id: "1", quantity: "260/280", value: 2, unit: "" }] },
      ctx({ now: new Date("2026-09-26T10:02:00Z") }),
    ).nextState;
    const out = run(s, "void_last_entry", {}, ctx({ now: new Date("2026-09-26T10:03:00Z") }));
    expect(out.nextState.entries.map((e) => e.status)).toEqual(["pending", "voided", "voided"]);
    expect(out.nextState.entries[1]!.voidedAt).toBe("2026-09-26T10:03:00.000Z");
    expect(out.result.voided).toEqual(["measurement: sample 1 concentration 1 ng/µL", "measurement: sample 1 260/280 2"]);
    // Next void hits the older entry.
    const again = run(out.nextState, "void_last_entry");
    expect(again.nextState.entries.map((e) => e.status)).toEqual(["voided", "voided", "voided"]);
    expect(run(again.nextState, "void_last_entry").result.error).toBe("There are no entries to void yet.");
  });
});

describe("timers", () => {
  it("starts a timer with a default label and local end time", () => {
    const c = ctx();
    const out = run(at(makeSession(), 3), "start_timer", { duration_seconds: 600 }, c);
    const t = out.nextState.timers[0]!;
    expect(t).toMatchObject({ label: "step 3", durationSeconds: 600, status: "running", announced: false, endsAt: "2026-09-26T10:15:00.000Z" });
    const end = new Date("2026-09-26T10:15:00.000Z");
    expect(out.result.ends_at_local).toBe(`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`);
    expect(out.result.duration_spoken).toBe("10 min");
  });

  it("enforces the running-timer limit and duration bounds", () => {
    let s = makeSession();
    for (let i = 0; i < MAX_RUNNING_TIMERS; i++) s = run(s, "start_timer", { duration_seconds: 60, label: `t${i}` }).nextState;
    expect(run(s, "start_timer", { duration_seconds: 60 }).result.error).toMatch(/already 5 timers running/);
    expect(run(makeSession(), "start_timer", { duration_seconds: 0 }).isError).toBe(true);
    expect(run(makeSession(), "start_timer", { duration_seconds: 90.5 }).isError).toBe(true);
  });

  it("lists running timers with seconds remaining", () => {
    const s = run(makeSession(), "start_timer", { duration_seconds: 600, label: "incubation" }).nextState;
    const out = run(s, "list_timers", {}, ctx({ now: new Date("2026-09-26T10:10:00.000Z") }));
    expect(out.result.timers).toEqual([{ label: "incubation", seconds_remaining: 300 }]);
    expect(run(makeSession(), "list_timers").result.timers).toEqual([]);
  });

  it("cancels by fuzzy label, or the only timer, and reports ambiguity", () => {
    let s = run(makeSession(), "start_timer", { duration_seconds: 600, label: "Incubation" }).nextState;
    expect(run(s, "cancel_timer").nextState.timers[0]!.status).toBe("cancelled");
    s = run(s, "start_timer", { duration_seconds: 60, label: "spin" }).nextState;
    expect(run(s, "cancel_timer").result.error).toBe("2 timers are running (Incubation, spin). Ask which one to cancel.");
    const out = run(s, "cancel_timer", { label: "incub" });
    expect(out.result).toMatchObject({ ok: true, cancelled: "Incubation" });
    expect(run(s, "cancel_timer", { label: "gel" }).result.error).toMatch(/No running timer matches 'gel'/);
    expect(run(makeSession(), "cancel_timer").result.error).toBe("No timers are running.");
  });
});

describe("set_volume", () => {
  it("steps by 20, clamps 0–150, and emits an effect", () => {
    const up = run(makeSession(), "set_volume", { change: "up" });
    expect(up.result).toMatchObject({ ok: true, level: 120 });
    expect(up.effects).toEqual({ volume: 120 });
    expect(up.nextState.settings.volume).toBe(120);
    const s140 = { ...makeSession(), settings: { ...makeSession().settings, volume: 140 } };
    expect(run(s140, "set_volume", { change: "up" }).result.level).toBe(150);
    expect(run(makeSession(), "set_volume", { change: "set", level: 30 }).result.level).toBe(30);
    expect(run(makeSession(), "set_volume", { change: "set" }).isError).toBe(true);
  });
});

describe("finish_session", () => {
  it("reports counts, completes the final step, and requests finish", () => {
    let s = at(makeSession(), 4);
    s = { ...s, stepEvents: [{ stepNumber: 1, startedAt: "a", completedAt: "b" }, { stepNumber: 4, startedAt: "c" }] };
    s = run(s, "log_observation", { text: "ok" }).nextState;
    s = run(s, "log_deviation", { description: "d" }).nextState;
    s = run(s, "void_last_entry").nextState;
    const out = run(s, "finish_session");
    expect(out.result).toMatchObject({ ok: true, steps_completed: 2, total_steps: 4, measurements: 0, deviations: 0, observations: 1 });
    expect(out.effects).toEqual({ finish: true });
  });
});

it("unknown tools return an error", () => {
  expect(run(makeSession(), "make_coffee").isError).toBe(true);
});
