// Client-side help for barge-in (NOTES.md C18).
//
// While the agent's voice plays, the browser's echo canceller also turns the
// user's voice down (double-talk suppression): measured ~1/3 of its normal
// level. The server only counts speech as an interruption above a much higher
// level while its reply is playing (~2/3 of full scale in our probes), so
// "wait, stop" went unheard and the agent kept talking. Two fixes:
//
// 1. Boost the mic by BARGE_IN_BOOST only while agent audio is audible, with
//    a soft limiter so loud speech doesn't wrap. When the agent is silent the
//    mic is sent unchanged.
// 2. Duck the agent the moment the mic shows sustained speech-level energy,
//    instead of waiting ~1 s for the server's input.speech.started. A quieter
//    agent also means less echo, so the canceller suppresses the user less.
//
// The server still decides what counts as an interruption (semantic barge-in:
// "uh-huh" doesn't interrupt), and reply.done(interrupted) still does the hard
// flush.

export const BARGE_IN_BOOST = 2.5;
/** Chunk peak (0–1, after the boost) that counts as speech rather than residual echo or room noise. */
export const LOCAL_SPEECH_PEAK = 0.12;
/** Consecutive loud chunks (~100 ms each) before ducking locally. */
export const LOCAL_SPEECH_CHUNKS = 2;
/** Quiet time after the last loud chunk before a local duck is released. */
export const LOCAL_RELEASE_MS = 900;

const LIMIT_KNEE = 0.8;

/** Soft limiter: linear below the knee, smoothly approaching 1.0 above it. */
export function softLimit(x: number): number {
  const a = Math.abs(x);
  if (a <= LIMIT_KNEE) return x;
  const over = (a - LIMIT_KNEE) / (1 - LIMIT_KNEE);
  return Math.sign(x) * (LIMIT_KNEE + (1 - LIMIT_KNEE) * Math.tanh(over));
}

/**
 * Applies a gain that ramps linearly from `from` to `to` across the chunk
 * (no clicks at the boundary), then the soft limiter. Returns the new samples
 * and their peak (0–1).
 */
export function applyGain(samples: Int16Array, from: number, to: number): { samples: Int16Array; peak: number } {
  const out = new Int16Array(samples.length);
  const n = samples.length;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const g = n > 1 ? from + ((to - from) * i) / (n - 1) : to;
    const y = softLimit((samples[i]! / 32768) * g);
    const a = Math.abs(y);
    if (a > peak) peak = a;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(y * 32768)));
  }
  return { samples: out, peak };
}

export type BargeInState = { gain: number; loudChunks: number; lastLoudAt: number; localDuck: boolean };

export const initialBargeInState: BargeInState = { gain: 1, loudChunks: 0, lastLoudAt: 0, localDuck: false };

export type BargeInStep = {
  state: BargeInState;
  samples: Int16Array;
  /** "duck" / "unduck" when the local duck changes; null otherwise. */
  duck: "duck" | "unduck" | null;
};

/** One mic chunk. `agentAudible`: agent audio is playing right now. Pure. */
export function bargeInStep(prev: BargeInState, samples: Int16Array, agentAudible: boolean, now: number): BargeInStep {
  const target = agentAudible ? BARGE_IN_BOOST : 1;
  const { samples: out, peak } = prev.gain === 1 && target === 1 ? { samples, peak: peakOf(samples) } : applyGain(samples, prev.gain, target);

  const loud = agentAudible && peak >= LOCAL_SPEECH_PEAK;
  const loudChunks = loud ? prev.loudChunks + 1 : 0;
  const lastLoudAt = loud ? now : prev.lastLoudAt;

  let localDuck = prev.localDuck;
  let duck: BargeInStep["duck"] = null;
  if (!localDuck && loudChunks >= LOCAL_SPEECH_CHUNKS) {
    localDuck = true;
    duck = "duck";
  } else if (localDuck && (!agentAudible || now - lastLoudAt >= LOCAL_RELEASE_MS)) {
    localDuck = false;
    duck = "unduck";
  }
  return { state: { gain: target, loudChunks, lastLoudAt, localDuck }, samples: out, duck };
}

function peakOf(samples: Int16Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]!);
    if (a > peak) peak = a;
  }
  return peak / 32768;
}
