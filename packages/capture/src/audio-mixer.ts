import { ArrayBufferTarget as WebMTarget, Muxer as WebMMuxer } from 'webm-muxer';
import { RECORDING } from '@recast/shared';
import { MIXER_WORKLET_SRC } from './audio-worklet';

/**
 * Per-source audio capture. Mic and system audio each run through their own
 * AudioWorklet tap and their own Opus encoder; tracks stay separate on disk
 * (see docs/recording.md) and are mixed at edit time.
 */

export interface AudioSource {
  label: 'mic' | 'system';
  stream: MediaStream;
}

interface ActiveSource {
  label: string;
  ctx: AudioContext;
  encoder: AudioEncoder;
  muxer: WebMMuxer<WebMTarget>;
  node: AudioWorkletNode;
  chunks: number;
  bytes: number;
}

let workletUrl: string | null = null;

async function ensureWorkletModule(ctx: AudioContext): Promise<void> {
  if (!workletUrl) {
    const blob = new Blob([MIXER_WORKLET_SRC], { type: 'application/javascript' });
    workletUrl = URL.createObjectURL(blob);
  }
  await ctx.audioWorklet.addModule(workletUrl);
}

export class AudioCapture {
  private sources: ActiveSource[] = [];

  async start(sources: AudioSource[]): Promise<void> {
    for (const src of sources) {
      await this.startOne(src);
    }
  }

  private async startOne(src: AudioSource): Promise<void> {
    const ctx = new AudioContext({ sampleRate: RECORDING.SAMPLE_RATE, latencyHint: 'interactive' });
    await ensureWorkletModule(ctx);
    const node = new AudioWorkletNode(ctx, 'recast-tap', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { bufferMs: 50, channels: 2 },
    });

    const muxer = new WebMMuxer({
      target: new WebMTarget(),
      audio: { codec: 'A_OPUS', sampleRate: RECORDING.SAMPLE_RATE, numberOfChannels: 2 },
    });

    const encoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: (e) => {
        console.error(`audio encoder (${src.label})`, e);
      },
    });
    encoder.configure({
      codec: 'opus',
      sampleRate: RECORDING.SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: 128_000,
      opus: { frameDuration: 20_000 },
    });

    const sourceNode = ctx.createMediaStreamSource(src.stream);
    sourceNode.connect(node);

    node.port.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; data?: Float32Array; frames?: number; timestamp?: number; peak?: number };
      if (msg.type === 'audio' && msg.data && msg.frames) {
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: RECORDING.SAMPLE_RATE,
          numberOfFrames: msg.frames,
          numberOfChannels: 2,
          timestamp: ctx.currentTime * 1e6,
          data: msg.data.buffer as ArrayBuffer,
        });
        if (encoder.encodeQueueSize < 8) {
          encoder.encode(audioData);
        }
        audioData.close();
      }
    };

    this.sources.push({ label: src.label, ctx, encoder, muxer, node, chunks: 0, bytes: 0 });
  }

  /** Live input meter (0..1) for the given source, or null when absent. */
  async meter(label: 'mic' | 'system'): Promise<number | null> {
    const s = this.sources.find((a) => a.label === label);
    if (!s) return null;
    return new Promise<number | null>((resolve) => {
      const handler = (e: MessageEvent) => {
        const msg = e.data as { type: string; peak?: number };
        if (msg.type === 'meter') {
          s.node.port.removeEventListener('message', handler);
          resolve(msg.peak ?? 0);
        }
      };
      s.node.port.addEventListener('message', handler);
      setTimeout(() => {
        s.node.port.removeEventListener('message', handler);
        resolve(null);
      }, 300);
    });
  }

  /** Set a temporary mute on a source (used while the recorder is paused). */
  setMuted(label: 'mic' | 'system', muted: boolean): void {
    const s = this.sources.find((a) => a.label === label);
    if (s) s.node.port.postMessage({ type: 'mute', value: muted });
  }

  /** Finalize all sources; returns per-source WebM byte arrays. */
  async stop(): Promise<Array<{ label: string; file: string; bytes: ArrayBuffer }>> {
    const out: Array<{ label: string; file: string; bytes: ArrayBuffer }> = [];
    for (const s of this.sources) {
      try {
        await s.encoder.flush();
        s.encoder.close();
        s.muxer.finalize();
        const { buffer } = s.muxer.target as WebMTarget;
        if (buffer && buffer.byteLength > 0) {
          out.push({ label: s.label, file: `${s.label}.webm`, bytes: buffer });
        }
        s.node.disconnect();
        void s.ctx.close();
      } catch (e) {
        console.error(`audio source ${s.label} finalize failed`, e);
      }
    }
    this.sources = [];
    return out;
  }
}
