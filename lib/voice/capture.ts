import { Chunker, StreamResampler, WIRE_SAMPLE_RATE, floatToInt16, rms } from "./pcm";

// Microphone capture → 24 kHz PCM16 chunks of ~100 ms.
//
// Constraints follow the docs, not the brief (NOTES.md C2): echo cancellation
// on, noise suppression off (the server denoises; a second layer hurts STT).
// AGC is a setting, off by default like the official starter.
//
// Sample rate (NOTES.md §2 Audio): Chromium honours AudioContext({sampleRate:
// 24000}), which skips resampling. Firefox honours it but routes around its
// echo canceller, so on Firefox we use the default rate and resample.

export type CaptureOptions = {
  deviceId?: string;
  autoGainControl?: boolean;
  onChunk: (samples: Int16Array) => void;
  /** RMS level 0..1, about 50 times a second. */
  onLevel?: (level: number) => void;
};

export class CaptureError extends Error {
  constructor(
    message: string,
    readonly kind: "permission" | "no-device" | "unsupported" | "unknown",
  ) {
    super(message);
  }
}

export class Capture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private resampler: StreamResampler | null = null;
  private readonly chunker = new Chunker();
  private opts: CaptureOptions | null = null;

  /** The rate the capture context actually runs at (for the debug panel). */
  get contextSampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  get active(): boolean {
    return this.ctx !== null;
  }

  /** The browser is holding the capture context until a user gesture. */
  get suspended(): boolean {
    return this.ctx?.state === "suspended";
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === "suspended") await this.ctx.resume().catch(() => undefined);
  }

  async start(opts: CaptureOptions): Promise<void> {
    await this.stop();
    this.opts = opts;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new CaptureError("This browser can't access the microphone (HTTPS is required).", "unsupported");
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(opts.deviceId ? { deviceId: opts.deviceId } : {}),
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: opts.autoGainControl ?? false,
        },
      });
    } catch (err) {
      throw toCaptureError(err);
    }

    const isFirefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
    try {
      if (isFirefox) throw new Error("skip 24 kHz on Firefox");
      await this.wire(new AudioContext({ sampleRate: WIRE_SAMPLE_RATE }));
    } catch {
      // Rejected rate, or the browser can't connect a mic source to a
      // non-default-rate context: fall back to the device rate and resample.
      await this.ctx?.close().catch(() => undefined);
      this.ctx = null;
      await this.wire(new AudioContext());
    }
  }

  private async wire(ctx: AudioContext): Promise<void> {
    this.ctx = ctx;
    // Don't block on resume(): without a user gesture it settles only after a tap.
    void ctx.resume().catch(() => undefined);
    await ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
    const source = ctx.createMediaStreamSource(this.stream!);
    // numberOfOutputs: 0 makes the node a sink, so it's processed without
    // routing mic audio to the speakers.
    const node = new AudioWorkletNode(ctx, "pcm-capture", { numberOfInputs: 1, numberOfOutputs: 0 });
    source.connect(node);
    this.node = node;
    this.resampler = ctx.sampleRate === WIRE_SAMPLE_RATE ? null : new StreamResampler(ctx.sampleRate, WIRE_SAMPLE_RATE);
    this.chunker.reset();
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onBlock(e.data);
  }

  private onBlock(block: Float32Array): void {
    const opts = this.opts;
    if (!opts) return;
    opts.onLevel?.(rms(block));
    const wire = this.resampler ? this.resampler.process(block) : block;
    for (const chunk of this.chunker.push(floatToInt16(wire))) opts.onChunk(chunk);
  }

  async stop(): Promise<void> {
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => undefined);
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.resampler = null;
    this.chunker.reset();
  }
}

function toCaptureError(err: unknown): CaptureError {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new CaptureError("Microphone permission was denied. Allow it in the address bar, then retry.", "permission");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new CaptureError("No microphone found. Plug one in, then retry.", "no-device");
  }
  if (name === "NotReadableError") {
    return new CaptureError("The microphone is in use by another app. Close it, then retry.", "no-device");
  }
  return new CaptureError("Couldn't start the microphone.", "unknown");
}
