// BenchMate capture worklet. Deliberately dumb: it batches the mic's Float32
// frames (at the context's own sample rate) into ~20 ms blocks and posts them
// to the main thread. Resampling, Int16 conversion and chunking all happen in
// lib/voice/pcm.ts, which is unit-tested.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._size = Math.max(128, Math.round(sampleRate * 0.02));
    this._buf = new Float32Array(this._size);
    this._len = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let offset = 0;
    while (offset < ch.length) {
      const take = Math.min(this._size - this._len, ch.length - offset);
      this._buf.set(ch.subarray(offset, offset + take), this._len);
      this._len += take;
      offset += take;
      if (this._len === this._size) {
        const out = this._buf;
        this.port.postMessage(out, [out.buffer]);
        this._buf = new Float32Array(this._size);
        this._len = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
