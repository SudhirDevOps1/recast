import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { Segment } from '@recast/shared';
import { RECORDING } from '@recast/shared';
import type { CaptureHost } from './host';

/**
 * Segmented MP4 writing. Every ~2 s a new muxer is opened and the previous
 * one is finalized and handed to the host. A crash loses at most the current
 * segment; every closed segment is a complete, playable MP4.
 */

interface SegmentMeta {
  id: string;
  file: string;
  startUs: number;
  width: number;
  height: number;
}

export class SegmentWriter {
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private meta: SegmentMeta | null = null;
  private segments: Segment[] = [];
  private segmentIndex = 0;
  private bytes = 0;

  constructor(
    private readonly host: CaptureHost,
    private readonly sessionId: string,
    private readonly fps: number,
  ) {}

  get totalBytes(): number {
    return this.bytes;
  }

  get writtenSegments(): Segment[] {
    return this.segments;
  }

  /** Route one encoded chunk into the active segment. */
  async addVideoChunk(
    chunk: EncodedVideoChunk,
    meta: EncodedVideoChunkMetadata | undefined,
    timestampUs: number,
    width: number,
    height: number,
  ): Promise<void> {
    // Open a new segment when none is open or the current one is full length.
    if (!this.muxer || !this.meta || timestampUs - this.meta.startUs >= RECORDING.SEGMENT_MS * 1_000) {
      await this.closeSegment();
      this.meta = {
        id: `seg-${String(this.segmentIndex).padStart(4, '0')}`,
        file: `seg-${String(this.segmentIndex).padStart(4, '0')}.mp4`,
        startUs: timestampUs,
        width,
        height,
      };
      this.segmentIndex += 1;
      this.muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width,
          height,
          frameRate: this.fps,
        },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      });
    }
    this.muxer.addVideoChunk(chunk, meta, timestampUs);
  }

  async closeSegment(): Promise<void> {
    if (!this.muxer || !this.meta) return;
    const m = this.muxer;
    const meta = this.meta;
    this.muxer = null;
    this.meta = null;
    m.finalize();
    const { buffer } = m.target as ArrayBufferTarget;
    if (!buffer || buffer.byteLength === 0) return;
    const endUs = meta.startUs + (RECORDING.SEGMENT_MS * 1_000);
    await this.host.writeSegment(this.sessionId, meta.file, buffer);
    const size = buffer.byteLength;
    this.bytes += size;
    this.segments.push({
      id: meta.id,
      file: meta.file,
      startUs: meta.startUs,
      endUs: Math.max(endUs, meta.startUs + 1),
      width: meta.width,
      height: meta.height,
      sizeBytes: size,
    });
  }

  /** True segment end times — fixed up by the recorder as frames land. */
  updateLastSegmentEnd(timestampUs: number): void {
    const last = this.segments[this.segments.length - 1];
    if (last && timestampUs > last.endUs) last.endUs = timestampUs;
  }
}

/**
 * Encoder configuration fallback chain, resolved once per session:
 *   HW H.264 → SW H.264 (Chromium OpenH264) → error surfaced to the UI.
 * The resolved path string is shown in Settings → Export diagnostics.
 */
export interface ResolvedVideoEncoder {
  config: VideoEncoderConfig;
  path: string;
}

export async function resolveVideoEncoder(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
  preferHardware: boolean,
): Promise<ResolvedVideoEncoder> {
  const candidates: Array<{ cfg: VideoEncoderConfig; path: string }> = [
    {
      cfg: {
        codec: 'avc1.640028',
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware',
        avc: { format: 'avc' },
        latencyMode: 'quality',
      },
      path: 'Hardware H.264 (WebCodecs)',
    },
    {
      cfg: {
        codec: 'avc1.42E01F',
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'no-preference',
        avc: { format: 'avc' },
        latencyMode: 'quality',
      },
      path: 'Software H.264 (WebCodecs)',
    },
    {
      cfg: {
        codec: 'vp09.00.10.08',
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'no-preference',
        latencyMode: 'quality',
      },
      path: 'Software VP9 (WebCodecs, WebM fallback)',
    },
  ];
  void preferHardware;
  for (const { cfg, path } of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported(cfg);
      if (support.supported) return { config: cfg, path };
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error('No supported video encoder configuration found on this machine.');
}

/** True when the codec is VP9 — the muxer must then be WebM, not MP4. */
export function isVp9(config: VideoEncoderConfig): boolean {
  return config.codec.startsWith('vp09');
}
