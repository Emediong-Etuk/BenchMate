import { describe, expect, it } from "vitest";
import {
  BARGE_IN_BOOST,
  LOCAL_RELEASE_MS,
  LOCAL_SPEECH_CHUNKS,
  applyGain,
  bargeInStep,
  initialBargeInState,
  softLimit,
} from "@/lib/voice/bargeIn";

const chunk = (amp: number, n = 2400) => Int16Array.from({ length: n }, (_, i) => Math.round(amp * 32767 * Math.sin(i / 3)));

describe("softLimit", () => {
  it("is linear below the knee and never exceeds full scale", () => {
    expect(softLimit(0.5)).toBe(0.5);
    expect(softLimit(-0.5)).toBe(-0.5);
    for (const x of [0.9, 1.5, 3, 10]) {
      expect(softLimit(x)).toBeLessThanOrEqual(1);
      expect(softLimit(-x)).toBeGreaterThanOrEqual(-1);
    }
    expect(softLimit(2)).toBeGreaterThan(softLimit(1));
  });
});

describe("applyGain", () => {
  it("boosts without wrapping around", () => {
    const { samples, peak } = applyGain(chunk(0.9), BARGE_IN_BOOST, BARGE_IN_BOOST);
    expect(peak).toBeLessThan(1);
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(32767);
  });

  it("ramps from the previous gain to avoid a click", () => {
    const flat = Int16Array.from({ length: 101 }, () => 1000);
    const { samples } = applyGain(flat, 1, 2);
    expect(samples[0]).toBe(1000);
    expect(samples[100]).toBe(2000);
  });
});

describe("bargeInStep", () => {
  it("sends the mic unchanged while the agent is silent", () => {
    const input = chunk(0.3);
    const step = bargeInStep(initialBargeInState, input, false, 0);
    expect(step.samples).toBe(input);
    expect(step.duck).toBeNull();
  });

  it("boosts the mic while the agent is audible (echo canceller double-talk loss)", () => {
    let s = bargeInStep(initialBargeInState, chunk(0.1), true, 0).state; // ramps up
    const step = bargeInStep(s, chunk(0.1), true, 100);
    s = step.state;
    const peak = Math.max(...step.samples.map(Math.abs)) / 32768;
    expect(peak).toBeGreaterThan(0.1 * BARGE_IN_BOOST * 0.95);
    expect(s.gain).toBe(BARGE_IN_BOOST);
  });

  it("ducks after sustained speech over the agent, then releases when it stops", () => {
    let s = initialBargeInState;
    const ducks: (string | null)[] = [];
    for (let i = 0; i < LOCAL_SPEECH_CHUNKS; i++) {
      const step = bargeInStep(s, chunk(0.2), true, i * 100);
      s = step.state;
      ducks.push(step.duck);
    }
    expect(ducks.at(-1)).toBe("duck");
    expect(s.localDuck).toBe(true);
    // Quiet chunks: no release until LOCAL_RELEASE_MS has passed.
    let t = LOCAL_SPEECH_CHUNKS * 100;
    let released = false;
    while (t < 5000 && !released) {
      t += 100;
      const step = bargeInStep(s, chunk(0.001), true, t);
      s = step.state;
      if (step.duck === "unduck") released = true;
    }
    expect(released).toBe(true);
    expect(t - (LOCAL_SPEECH_CHUNKS - 1) * 100).toBeGreaterThanOrEqual(LOCAL_RELEASE_MS);
  });

  it("ignores a single loud blip and quiet residual echo", () => {
    let s = initialBargeInState;
    s = bargeInStep(s, chunk(0.2), true, 0).state;
    const quiet = bargeInStep(s, chunk(0.005), true, 100);
    expect(quiet.duck).toBeNull();
    expect(quiet.state.loudChunks).toBe(0);
  });

  it("never ducks while the agent is silent (normal turns)", () => {
    let s = initialBargeInState;
    for (let i = 0; i < 10; i++) {
      const step = bargeInStep(s, chunk(0.5), false, i * 100);
      expect(step.duck).toBeNull();
      s = step.state;
    }
  });
});
