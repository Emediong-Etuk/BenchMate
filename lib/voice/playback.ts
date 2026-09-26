import { WIRE_SAMPLE_RATE, int16ToFloat } from "./pcm";

// Agent audio playback: 24 kHz PCM16 chunks scheduled back to back on an
// AudioContext.
//
// Graph: sources → duckGain → volumeGain → destination
//   - volumeGain: user volume 0–150 % (brief §8.3)
//   - duckGain: drops to DUCK_LEVEL the moment the user starts speaking, so
//     barge-in feels instant without discarding audio from a reply that a
//     back-channel ("uh-huh") doesn't interrupt (NOTES.md C8). A confirmed
//     interruption (reply.done status "interrupted") calls flush().

const START_LEAD_S = 0.08; // jitter cushion before the first chunk of a burst
const DUCK_LEVEL = 0.15;

export type PlaybackListener = (playing: boolean) => void;

export class Playback {
  private ctx: AudioContext | null = null;
  private volumeGain: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private playing = false;
  private volumePct = 100;
  private readonly listeners = new Set<PlaybackListener>();

  /** Must be called from a user gesture (autoplay policy). Safe to call twice. */
  async init(): Promise<void> {
    if (!this.ctx) {
      let ctx: AudioContext;
      try {
        ctx = new AudioContext({ sampleRate: WIRE_SAMPLE_RATE });
      } catch {
        ctx = new AudioContext(); // createBuffer(…, 24000) still works; the context resamples
      }
      this.ctx = ctx;
      this.volumeGain = ctx.createGain();
      this.duckGain = ctx.createGain();
      this.duckGain.connect(this.volumeGain);
      this.volumeGain.connect(ctx.destination);
      this.applyVolume();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get volume(): number {
    return this.volumePct;
  }

  onPlayingChange(fn: PlaybackListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Schedule one chunk. Returns the performance.now() time at which this chunk
   * will start being heard, or null if playback isn't initialised.
   */
  enqueue(samples: Int16Array): number | null {
    const ctx = this.ctx;
    if (!ctx || !this.duckGain || samples.length === 0) return null;
    const buffer = ctx.createBuffer(1, samples.length, WIRE_SAMPLE_RATE);
    buffer.getChannelData(0).set(int16ToFloat(samples));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.duckGain);

    const now = ctx.currentTime;
    const startAt = this.nextStartTime > now ? this.nextStartTime : now + START_LEAD_S;
    src.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      src.disconnect();
      if (this.sources.size === 0) this.setPlaying(false);
    };
    this.setPlaying(true);
    const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    return performance.now() + (startAt - now + latency) * 1000;
  }

  /** Stop everything scheduled right now (confirmed interruption). */
  flush(): void {
    for (const src of this.sources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // already stopped
      }
      src.disconnect();
    }
    this.sources.clear();
    this.nextStartTime = 0;
    this.unduck();
    this.setPlaying(false);
  }

  duck(): void {
    this.rampDuck(DUCK_LEVEL);
  }

  unduck(): void {
    this.rampDuck(1);
  }

  /** 0–150 (%). */
  setVolume(pct: number): void {
    this.volumePct = Math.max(0, Math.min(150, Math.round(pct)));
    this.applyVolume();
  }

  /** Short sine tone through the volume path (mic check "Test voice", chimes). */
  playTone(freq = 660, durationS = 0.35, when = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.volumeGain) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.4, t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + durationS);
    osc.connect(env).connect(this.volumeGain);
    osc.start(t0);
    osc.stop(t0 + durationS + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  async close(): Promise<void> {
    this.flush();
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.volumeGain = null;
    this.duckGain = null;
  }

  private rampDuck(level: number): void {
    if (!this.ctx || !this.duckGain) return;
    const g = this.duckGain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(level, this.ctx.currentTime, 0.015);
  }

  private applyVolume(): void {
    if (!this.ctx || !this.volumeGain) return;
    this.volumeGain.gain.setTargetAtTime(this.volumePct / 100, this.ctx.currentTime, 0.02);
  }

  private setPlaying(p: boolean): void {
    if (p === this.playing) return;
    this.playing = p;
    for (const fn of this.listeners) fn(p);
  }
}
