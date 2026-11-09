import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { Segment } from '@recast/shared';
import { RECORDING } from '@recast/shared';
import type { CaptureHost } from './host';

/**
 * Segmented MP4 writing. Every ~2 s a new muxer is opened and the previous
 * one is finalized and handed to the host. A crash loses at most the current
 * segment; every closed segment is a complete, playable MP4.
 *
 * Concurrency note: the encoder's output callback fires synchronously per
 * chunk, but segment rollover awaits an IPC write. Without ordering, two
 * boundary chunks can race the muxer swap — one muxer gets replaced
 * mid-flight (losing chunks) and an uninitialized one can be finalized
 * without ever seeing the decoderConfig, which crashes mp4-muxer
 * ("Cannot read properties of null (reading 'colorSpace')") and silently
 * freezes the recording after the first segment. Every chunk is therefore
 * routed through a strict promise tail.
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
  private chunksInSegment = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly host: CaptureHost,
    private readonly sessionId: string,
    private readonly fps: number,
    /** Actual encoded codec — the muxer must declare it truthfully or the
     *  segment decodes as garbage (VP9 chunks into an 'avc' track produced
     *  playable-looking MP4s that fail on the first decoded frame). */
    private readonly videoCodec: 'avc' | 'vp9' = 'avc',
  ) {}

  get totalBytes(): number {
    return this.bytes;
  }

  get writtenSegments(): Segment[] {
    return this.segments;
  }

  /** Route one encoded chunk into the active segment (strictly ordered). */
  addVideoChunk(
    chunk: EncodedVideoChunk,
    meta: EncodedVideoChunkMetadata | undefined,
    timestampUs: number,
    width: number,
    height: number,
  ): Promise<void> {
    const run = this.tail.then(() => this.routeChunk(chunk, meta, timestampUs, width, height));
    // Keep the tail unpoisoned; the returned promise still rejects so the
    // caller can surface the error to the UI.
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async routeChunk(
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
      this.chunksInSegment = 0;
      this.muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: this.videoCodec,
          width,
          height,
          frameRate: this.fps,
        },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      });
    }
    this.muxer.addVideoChunk(chunk, meta, timestampUs);
    this.chunksInSegment += 1;
  }

  async closeSegment(): Promise<void> {
    if (!this.muxer || !this.meta) return;
    const m = this.muxer;
    const meta = this.meta;
    const chunks = this.chunksInSegment;
    this.muxer = null;
    this.meta = null;
    this.chunksInSegment = 0;
    // Never finalize an empty track: mp4-muxer requires the decoderConfig
    // (delivered with the first chunk) to emit the sample description.
    if (chunks === 0) return;
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

  /** Drain every queued chunk, then close the open segment. */
  async flush(): Promise<void> {
    await this.tail.catch(() => undefined);
    await this.closeSegment();
  }

  /** True segment end times — fixed up by the recorder as frames land. */
  updateLastSegmentEnd(timestampUs: number): void {
    const last = this.segments[this.segments.length - 1];
    if (last && timestampUs > last.endUs) last.endUs = timestampUs;
  }
}

/** True when the codec is VP9 — the muxer must then be WebM, not MP4. */
export function isVp9(config: VideoEncoderConfig): boolean {
  return config.codec.startsWith('vp09');
}
