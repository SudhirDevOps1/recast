/**
 * AudioWorklet processor source (evaluated via Blob URL).
 * Collects 128-frame render quanta into larger buffers and posts them to the
 * main thread as f32-planar copies, plus an RMS meter value.
 */
export const MIXER_WORKLET_SRC = /* js */ `
class RecastTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.bufferMs = opts.bufferMs || 50;
    this.channels = opts.channels || 2;
    const framesPerBuffer = Math.round((sampleRate / 1000) * this.bufferMs);
    this.framesPerBuffer = framesPerBuffer;
    this.left = new Float32Array(framesPerBuffer);
    this.right = new Float32Array(framesPerBuffer);
    this.written = 0;
    this.meterAccum = 0;
    this.meterCount = 0;
    this.meterIntervalFrames = 8; // post meter every ~8 quanta
    this.framesSinceMeter = 0;
    this.muted = false;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'mute') this.muted = !!e.data.value;
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const l = input[0];
    const r = input.length > 1 ? input[1] : input[0];
    const n = l.length;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const lv = this.muted ? 0 : l[i];
      const rv = this.muted ? 0 : (r ? r[i] : lv);
      if (this.written < this.framesPerBuffer) {
        this.left[this.written] = lv;
        this.right[this.written] = rv;
        this.written++;
      }
      const a = Math.max(Math.abs(lv), Math.abs(rv));
      if (a > peak) peak = a;
    }
    this.meterAccum = Math.max(this.meterAccum, peak);
    this.framesSinceMeter += n;

    if (this.written >= this.framesPerBuffer) {
      // f32-planar: [left..., right...]
      const out = new Float32Array(this.framesPerBuffer * 2);
      out.set(this.left, 0);
      out.set(this.right, this.framesPerBuffer);
      this.port.postMessage({ type: 'audio', data: out, frames: this.framesPerBuffer, timestamp: currentFrame }, [out.buffer]);
      this.written = 0;
    }

    if (this.framesSinceMeter >= this.meterIntervalFrames * 128) {
      this.port.postMessage({ type: 'meter', peak: this.meterAccum });
      this.meterAccum = 0;
      this.framesSinceMeter = 0;
    }
    return true;
  }
}
registerProcessor('recast-tap', RecastTap);
`;
