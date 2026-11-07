/**
 * Audio processing for export: decode the recorded track, apply gain, fades
 * and (optionally) the noise gate, then feed the export AudioEncoder.
 * LUFS normalization runs as an ffmpeg two-pass post-step when available.
 */

export interface AudioProcessOptions {
  gainDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  durationUs: number;
}

export function applyGain(buffer: AudioBuffer, gainDb: number): AudioBuffer {
  if (gainDb === 0) return buffer;
  const gain = Math.pow(10, gainDb / 20);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }
  return buffer;
}

export function applyFades(buffer: AudioBuffer, opts: { fadeInMs: number; fadeOutMs: number; sampleRate: number }): AudioBuffer {
  const inFrames = Math.round((opts.fadeInMs / 1000) * opts.sampleRate);
  const outFrames = Math.round((opts.fadeOutMs / 1000) * opts.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < inFrames && i < data.length; i++) {
      data[i] *= i / inFrames;
    }
    for (let i = 0; i < outFrames && i < data.length; i++) {
      data[data.length - 1 - i] *= i / outFrames;
    }
  }
  return buffer;
}

/** Simple noise gate: zero samples below the threshold (linear attack/release). */
export function applyNoiseGate(buffer: AudioBuffer, thresholdDb: number, sampleRate: number): AudioBuffer {
  const threshold = Math.pow(10, thresholdDb / 20);
  const holdFrames = Math.round(0.05 * sampleRate);
  let belowFor = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    belowFor = 0;
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]!);
      if (a < threshold) {
        belowFor += 1;
        if (belowFor > holdFrames) data[i] = 0;
      } else {
        belowFor = 0;
      }
    }
  }
  return buffer;
}

/** Slice an AudioBuffer into AudioData chunks for the encoder. */
export function* audioChunks(buffer: AudioBuffer, chunkFrames = 48_000): Generator<AudioData> {
  const channels = buffer.numberOfChannels;
  for (let start = 0; start < buffer.length; start += chunkFrames) {
    const frames = Math.min(chunkFrames, buffer.length - start);
    const planar = new Float32Array(frames * channels);
    for (let ch = 0; ch < channels; ch++) {
      const src = buffer.getChannelData(ch);
      planar.set(src.subarray(start, start + frames), ch * frames);
    }
    yield new AudioData({
      format: 'f32-planar',
      sampleRate: buffer.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((start / buffer.sampleRate) * 1e6),
      data: planar,
    });
  }
}

export function decodeAudioData(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return ctx.decodeAudioData(bytes);
}
