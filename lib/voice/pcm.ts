// Pure PCM helpers. The Voice Agent API speaks PCM16 little-endian, mono,
// 24 kHz, base64 inside JSON (see NOTES.md §2 Audio).

export const WIRE_SAMPLE_RATE = 24_000;
/** ~100 ms of audio at the wire rate. */
export const WIRE_CHUNK_SAMPLES = 2_400;

/** Float32 [-1, 1] → Int16, clamped. */
export function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Int16 → Float32 [-1, 1). */
export function int16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = (input[i] ?? 0) / 0x8000;
  return out;
}

/**
 * Int16 samples → base64 of their little-endian bytes.
 * Every platform we target (x86, ARM) is little-endian, so the typed array's
 * underlying bytes are already in wire order.
 */
export function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  }
  return btoa(binary);
}

/** base64 little-endian PCM16 → Int16 samples. A trailing odd byte is dropped. */
export function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length - (binary.length % 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Root-mean-square level of a block, 0..1. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * One-shot linear-interpolation resample. Output length is
 * floor(input.length * toRate / fromRate).
 */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  const r = new StreamResampler(fromRate, toRate);
  return r.process(input);
}

/**
 * Streaming linear resampler: keeps fractional position and the previous
 * sample across blocks so block boundaries don't click.
 */
export class StreamResampler {
  private readonly ratio: number;
  // Read position in the current block's coordinates. It may be in [-1, 0),
  // meaning "between the previous block's last sample and input[0]".
  private pos = 0;
  private prev = 0;

  constructor(
    readonly fromRate: number,
    readonly toRate: number,
  ) {
    if (!(fromRate > 0) || !(toRate > 0)) throw new Error("Sample rates must be positive");
    this.ratio = fromRate / toRate;
  }

  process(input: Float32Array): Float32Array {
    const n = input.length;
    if (n === 0) return new Float32Array(0);
    if (this.ratio === 1) return input.slice();
    // Interpolating at pos needs samples floor(pos) and floor(pos)+1, so only
    // positions < n-1 can be produced now; the rest wait for the next block.
    const out = new Float32Array(Math.max(0, Math.ceil((n - 1 - this.pos) / this.ratio)) + 1);
    let len = 0;
    let pos = this.pos;
    while (pos < n - 1) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = i < 0 ? this.prev : (input[i] ?? 0);
      const b = input[i + 1] ?? a;
      out[len++] = a + (b - a) * frac;
      pos += this.ratio;
    }
    this.pos = pos - n;
    this.prev = input[n - 1] ?? 0;
    return out.subarray(0, len);
  }
}

/** Accumulates Int16 samples and emits fixed-size chunks. */
export class Chunker {
  private buf: Int16Array;
  private len = 0;

  constructor(readonly chunkSize: number = WIRE_CHUNK_SAMPLES) {
    this.buf = new Int16Array(chunkSize);
  }

  push(samples: Int16Array): Int16Array[] {
    const out: Int16Array[] = [];
    let offset = 0;
    while (offset < samples.length) {
      const take = Math.min(this.chunkSize - this.len, samples.length - offset);
      this.buf.set(samples.subarray(offset, offset + take), this.len);
      this.len += take;
      offset += take;
      if (this.len === this.chunkSize) {
        out.push(this.buf);
        this.buf = new Int16Array(this.chunkSize);
        this.len = 0;
      }
    }
    return out;
  }

  reset(): void {
    this.len = 0;
  }
}
