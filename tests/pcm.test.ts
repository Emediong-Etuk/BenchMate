import { describe, expect, it } from "vitest";
import {
  Chunker,
  StreamResampler,
  base64ToInt16,
  floatToInt16,
  int16ToBase64,
  int16ToFloat,
  resampleLinear,
  rms,
} from "@/lib/voice/pcm";

function sine(freq: number, rate: number, seconds: number): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.8 * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

/** Estimate frequency from positive-going zero crossings. */
function estimateFreq(samples: Float32Array, rate: number): number {
  const crossings: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (a < 0 && b >= 0) crossings.push(i - 1 + -a / (b - a));
  }
  const periods = crossings.length - 1;
  return (periods * rate) / (crossings[crossings.length - 1]! - crossings[0]!);
}

describe("resampling", () => {
  it("48k → 24k halves the length (±1 sample)", () => {
    const input = sine(440, 48_000, 1);
    const out = resampleLinear(input, 48_000, 24_000);
    expect(Math.abs(out.length - 24_000)).toBeLessThanOrEqual(1);
  });

  it("preserves a sine's frequency within 0.5%", () => {
    const out = resampleLinear(sine(1000, 48_000, 0.5), 48_000, 24_000);
    expect(Math.abs(estimateFreq(out, 24_000) - 1000)).toBeLessThan(5);
  });

  it("handles non-integer ratios (44.1k → 24k)", () => {
    const input = sine(440, 44_100, 1);
    const out = resampleLinear(input, 44_100, 24_000);
    expect(Math.abs(out.length - 24_000)).toBeLessThanOrEqual(2);
    expect(Math.abs(estimateFreq(out, 24_000) - 440)).toBeLessThan(3);
  });

  it("streaming in 128-frame blocks matches one-shot output", () => {
    const input = sine(700, 48_000, 0.25);
    const oneShot = resampleLinear(input, 48_000, 24_000);
    const r = new StreamResampler(48_000, 24_000);
    const parts: number[] = [];
    for (let i = 0; i < input.length; i += 128) parts.push(...r.process(input.subarray(i, i + 128)));
    expect(parts.length).toBeGreaterThanOrEqual(oneShot.length - 1);
    const n = Math.min(parts.length, oneShot.length);
    for (let i = 0; i < n; i++) expect(parts[i]).toBeCloseTo(oneShot[i]!, 6);
  });

  it("streaming 44.1k in odd block sizes has no discontinuities", () => {
    const input = sine(300, 44_100, 0.3);
    const r = new StreamResampler(44_100, 24_000);
    const out: number[] = [];
    let i = 0;
    const sizes = [128, 77, 300, 1, 512];
    let k = 0;
    while (i < input.length) {
      const size = sizes[k++ % sizes.length]!;
      out.push(...r.process(input.subarray(i, i + size)));
      i += size;
    }
    // Max step between samples of a 300 Hz, 0.8-amplitude sine at 24 kHz ≈ 0.063.
    let maxStep = 0;
    for (let j = 1; j < out.length; j++) maxStep = Math.max(maxStep, Math.abs(out[j]! - out[j - 1]!));
    expect(maxStep).toBeLessThan(0.07);
  });

  it("identity rate passes samples through", () => {
    const input = new Float32Array([0.1, -0.2, 0.3]);
    expect(Array.from(resampleLinear(input, 24_000, 24_000))).toEqual(Array.from(input));
  });
});

describe("float ↔ int16", () => {
  it("clamps out-of-range values", () => {
    const out = floatToInt16(new Float32Array([2, -2, 1, -1, 0]));
    expect(Array.from(out)).toEqual([32767, -32768, 32767, -32768, 0]);
  });

  it("round-trips within quantisation error", () => {
    const input = new Float32Array([0.5, -0.25, 0.001]);
    const back = int16ToFloat(floatToInt16(input));
    input.forEach((v, i) => expect(back[i]).toBeCloseTo(v, 3));
  });
});

describe("base64", () => {
  it("round-trips int16 samples", () => {
    const samples = new Int16Array([0, 1, -1, 32767, -32768, 12345]);
    expect(Array.from(base64ToInt16(int16ToBase64(samples)))).toEqual(Array.from(samples));
  });

  it("encodes little-endian bytes", () => {
    // 0x0102 → bytes 02 01 → base64 "AgE="
    expect(int16ToBase64(new Int16Array([0x0102]))).toBe("AgE=");
  });

  it("handles large buffers (> one String.fromCharCode batch)", () => {
    const samples = new Int16Array(50_000).map((_, i) => (i * 7) % 65536 - 32768);
    expect(Array.from(base64ToInt16(int16ToBase64(samples)))).toEqual(Array.from(samples));
  });

  it("round-trips a subarray view", () => {
    const whole = new Int16Array([9, 8, 7, 6]);
    expect(Array.from(base64ToInt16(int16ToBase64(whole.subarray(1, 3))))).toEqual([8, 7]);
  });
});

describe("Chunker", () => {
  it("emits fixed-size chunks and keeps the remainder", () => {
    const c = new Chunker(4);
    expect(c.push(new Int16Array([1, 2, 3]))).toEqual([]);
    const out = c.push(new Int16Array([4, 5, 6, 7, 8, 9]));
    expect(out.map((a) => Array.from(a))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    c.reset();
    expect(c.push(new Int16Array([10, 11, 12, 13])).map((a) => Array.from(a))).toEqual([[10, 11, 12, 13]]);
  });
});

describe("rms", () => {
  it("is ~0.707·A for a sine", () => {
    expect(rms(sine(440, 48_000, 0.5))).toBeCloseTo(0.8 / Math.SQRT2, 2);
    expect(rms(new Float32Array())).toBe(0);
  });
});
