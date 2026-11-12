import type { Clip } from '@recast/shared';

/**
 * FrameSync — drives the hidden `<video>` decode elements behind the canvas
 * preview so they actually deliver the frame the playhead is asking for.
 *
 * v0.1.2 and earlier never seeked or played these elements: the preview sat
 * frozen on frame 0, segment switches flashed while the next file decoded,
 * and compositor drawComposition() filled the screen rect solid black
 * whenever no frame was paintable — the "random black screen" reports.
 *
 * Behaviour:
 *  - Paused/scrubbing: issue a precise seek when drift > seekToleranceUs and
 *    redraw when `seeked` (or a new presented frame) lands.
 *  - Playing: play() the active segment at the clip's speed, pause the rest,
 *    and hard-resync when drift exceeds resyncToleranceUs.
 *  - getFrame() returns the element only when it can actually be painted
 *    (readyState ≥ HAVE_CURRENT_DATA and roughly at the requested time);
 *    otherwise it returns the last successfully presented frame as an
 *    offscreen snapshot, so the canvas never collapses to black.
 */

export interface FrameSyncOptions {
  /** µs of drift tolerated while paused before a seek is issued. */
  seekToleranceUs?: number;
  /** µs of drift tolerated during playback before a hard resync. */
  resyncToleranceUs?: number;
  /** Called whenever a fresh frame became paintable (seek done, frame presented). */
  onFrame?: (segmentId: string) => void;
  /** Snapshot canvas factory (injectable for tests / offscreen contexts). */
  createSnapshotCanvas?: (w: number, h: number) => HTMLCanvasElement | null;
}

/** Snapshot canvas height cap — preserve full 4K/1080p preview fidelity. */
const SNAPSHOT_MAX_H = 2160;

type VideoLike = HTMLVideoElement;

interface SegmentBinding {
  video: VideoLike;
  snapshot: HTMLCanvasElement | null;
  /** true while a seek() is in flight and we have not seen `seeked` yet. */
  seeking: boolean;
  /** Last requested time (seconds) — dedupes redundant seeks. */
  lastTargetSec: number | null;
  /** requestVideoFrameCallback handle, when supported. */
  rVfcId: number | null;
  onSeeked: () => void;
  onLoaded: () => void;
  onPresented: () => void;
}

export class FrameSync {
  private bindings = new Map<string, SegmentBinding>();
  private opts: Required<FrameSyncOptions>;
  private playingId: string | null = null;
  private rate = 1;
  private destroyed = false;

  public constructor(opts: FrameSyncOptions = {}) {
    this.opts = {
      seekToleranceUs: opts.seekToleranceUs ?? 40_000,
      resyncToleranceUs: opts.resyncToleranceUs ?? 120_000,
      onFrame: opts.onFrame ?? (() => undefined),
      createSnapshotCanvas:
        opts.createSnapshotCanvas ??
        ((w, h) => {
          if (typeof document === 'undefined') return null; // non-DOM test env
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          return c;
        }),
    };
  }

  /** (Re)bind the element set — called when the segment list changes. */
  public setVideos(videos: Map<string, VideoLike>): void {
    if (this.destroyed) return;
    for (const [id, b] of this.bindings) {
      if (!videos.has(id)) this.unbind(id, b);
    }
    for (const [id, video] of videos) {
      if (this.bindings.has(id)) continue;
      const binding: SegmentBinding = {
        video,
        snapshot: null,
        seeking: false,
        lastTargetSec: null,
        rVfcId: null,
        onSeeked: () => {
          binding.seeking = false;
          this.captureSnapshot(id, binding);
          this.opts.onFrame(id);
        },
        onLoaded: () => {
          this.captureSnapshot(id, binding);
          this.opts.onFrame(id);
        },
        onPresented: () => {
          this.captureSnapshot(id, binding);
          this.opts.onFrame(id);
        },
      };
      video.addEventListener('seeked', binding.onSeeked);
      video.addEventListener('loadeddata', binding.onLoaded);
      video.addEventListener('canplay', binding.onLoaded);
      // Preferred signal during playback — fires once per decoded frame.
      type RVFCVideo = VideoLike & {
        requestVideoFrameCallback?: (cb: (now: number) => void) => number;
      };
      const rvfc = (video as RVFCVideo).requestVideoFrameCallback?.bind(video);
      if (rvfc) {
        const loop = (): void => {
          if (this.destroyed || this.playingId !== id) return;
          binding.onPresented();
          binding.rVfcId = rvfc(loop);
        };
        binding.rVfcId = rvfc(loop);
      }
      this.bindings.set(id, binding);
    }
  }

  private unbind(id: string, binding: SegmentBinding): void {
    binding.video.removeEventListener('seeked', binding.onSeeked);
    binding.video.removeEventListener('loadeddata', binding.onLoaded);
    binding.video.removeEventListener('canplay', binding.onLoaded);
    this.bindings.delete(id);
  }

  public destroy(): void {
    this.destroyed = true;
    this.pauseAll();
    for (const [id, b] of [...this.bindings]) this.unbind(id, b);
  }

  /** Pause every bound element and forget the "playing" pointer. */
  public pauseAll(): void {
    this.playingId = null;
    for (const b of this.bindings.values()) {
      if (!b.video.paused) b.video.pause();
    }
  }

  /** Seek `segmentId` to `sourceUs` (no-op when already within tolerance). */
  public seekTo(segmentId: string, sourceUs: number): void {
    const b = this.bindings.get(segmentId);
    if (!b || this.destroyed) return;
    const target = sourceUs / 1e6;
    if (b.lastTargetSec != null && Math.abs(b.video.currentTime - target) <= this.opts.seekToleranceUs / 1e6) {
      if (b.video.readyState >= 2) {
        this.captureSnapshot(segmentId, b);
        return; // already paintable at this time
      }
    }
    b.lastTargetSec = target;
    try {
      b.seeking = true;
      b.video.currentTime = target;
    } catch {
      b.seeking = false;
    }
  }

  /** Play `segmentId` at `speed`. `others='pause'` pauses every other bound
   *  element (screen segments); 'keep' leaves them untouched (face cam runs
   *  alongside the screen video). Drift-resyncs when far off. */
  public play(segmentId: string, sourceUs: number, speed: number, others: 'pause' | 'keep' = 'pause'): void {
    const b = this.bindings.get(segmentId);
    if (!b || this.destroyed) return;
    if (others === 'pause') {
      for (const [id, other] of this.bindings) {
        if (id !== segmentId && !other.video.paused) other.video.pause();
      }
    }
    const targetRate = Math.max(0.0625, Math.min(16, speed || 1));
    if (b.video.playbackRate !== targetRate) {
      try {
        b.video.playbackRate = targetRate;
      } catch {
        /* some engines clamp; not fatal */
      }
    }
    this.rate = targetRate;
    const target = sourceUs / 1e6;
    const driftUs = Math.abs(b.video.currentTime - target) * 1e6;
    if (driftUs > this.opts.resyncToleranceUs) {
      this.seekTo(segmentId, sourceUs);
    }
    this.playingId = segmentId;
    if (b.video.paused || b.video.ended) {
      if (b.video.ended && driftUs < 40_000 && target >= (b.video.duration || 0) - 0.05) {
        // At the very end of the file — restart so the last frames loop
        // visually instead of freezing (playhead clamps, video stays put).
        try {
          b.video.currentTime = target;
        } catch {
          /* ignore */
        }
      }
      void b.video.play()?.catch(() => undefined);
    }
  }

  /** Playback rate most recently requested (used by tests). */
  public get currentRate(): number {
    return this.rate;
  }

  /** true when the element is playing under our control. */
  public isPlaying(segmentId: string): boolean {
    return this.playingId === segmentId && !this.bindings.get(segmentId)?.video.paused;
  }

  /**
   * Draw-time frame provider. Returns the element when it is paintable at
   * `sourceUs`, otherwise the last presented snapshot, otherwise null.
   * The compositor draws background layers regardless; returning the
   * snapshot instead of null is what kills the black flashes.
   */
  public getFrame(segmentId: string, sourceUs: number): VideoLike | HTMLCanvasElement | null {
    if (this.destroyed) return null;
    const b = this.bindings.get(segmentId);
    if (!b) return null;
    const v = b.video;
    const target = sourceUs / 1e6;
    const ready = v.readyState >= 2 && !v.error;
    const inRange = Math.abs(v.currentTime - target) <= this.opts.resyncToleranceUs / 1e6;
    if (ready && inRange) {
      this.captureSnapshot(segmentId, b);
      return v;
    }
    // Not paintable right now: seek (redraw arrives via `seeked`) and fall
    // back to the snapshot so the preview keeps showing real content.
    if (!b.seeking && Math.abs(v.currentTime - target) > this.opts.seekToleranceUs / 1e6) {
      this.seekTo(segmentId, sourceUs);
    }
    // Return the cached snapshot if available; if ready but no snapshot yet,
    // return the live video rather than collapsing to null.
    return b.snapshot ?? (ready ? v : null);
  }

  /** true when at least one segment has ever presented a decodable frame. */
  public get hasAnyFrame(): boolean {
    for (const b of this.bindings.values()) if (b.snapshot) return true;
    return false;
  }

  /** Test/inspection hook. */
  public snapshotFor(segmentId: string): HTMLCanvasElement | null {
    return this.bindings.get(segmentId)?.snapshot ?? null;
  }

  private captureSnapshot(segmentId: string, b: SegmentBinding): void {
    const v = b.video;
    if (v.readyState < 2 || v.error || v.videoWidth === 0) return;
    const scale = Math.min(1, SNAPSHOT_MAX_H / v.videoHeight);
    const w = Math.max(2, Math.round(v.videoWidth * scale));
    const h = Math.max(2, Math.round(v.videoHeight * scale));
    let c = b.snapshot;
    if (!c) {
      c = this.opts.createSnapshotCanvas(w, h);
      b.snapshot = c;
      if (!c) return;
    }
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(v as unknown as CanvasImageSource, 0, 0, w, h);
    } catch {
      /* frame vanished mid-draw — keep the previous snapshot */
    }
  }
}

/** Clip helper: source time the compositor wants for the active clip. */
export function clipSourceUs(clip: Clip, tInUs: number, tUs: number): number {
  const local = Math.max(0, tUs - tInUs) * clip.speed;
  return clip.sourceInUs + local;
}
