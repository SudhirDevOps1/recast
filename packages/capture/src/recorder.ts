import { RECORDING } from '@recast/shared';
import type { SessionManifest } from '@recast/shared';
import type { CaptureHost, RecorderCallbacks, RecorderStats, StartOptions } from './host';
import { AudioCapture, type AudioSource } from './audio-mixer';
import { resolveVideoEncoder, SegmentWriter } from './segment-writer';

/**
 * Screen recorder orchestration (renderer side).
 *
 * Pipeline: display stream → (optional crop) → VideoFrame → VideoEncoder →
 * SegmentWriter → 2 s MP4 fragments on disk. Cursor input arrives from the
 * main process over IPC and is persisted there directly; this file only
 * handles video/audio.
 */

interface MediaStreamTrackProcessorLike<T> {
  readable: ReadableStream<T>;
}

// eslint-disable-next-line no-var -- ambient declaration requires var
declare var MediaStreamTrackProcessor: {
  prototype: MediaStreamTrackProcessorLike<VideoFrame>;
  new (init: { track: MediaStreamTrack }): MediaStreamTrackProcessorLike<VideoFrame>;
};

export interface RecorderHandle {
  pause(): void;
  resume(): void;
  stop(): Promise<{ manifest: SessionManifest; audioFiles: Array<{ label: string; file: string; bytes: ArrayBuffer }> }>;
  stats(): RecorderStats;
}

function bitrateForQuality(width: number, height: number, fps: number): number {
  // 0.12 bits per pixel at reference, adjusted by frame rate.
  const pixels = width * height;
  const base = pixels * 0.12 * (fps / 30);
  return Math.round(Math.min(48_000_000, Math.max(2_500_000, base)));
}

export async function startRecording(
  videoTrack: MediaStreamTrack,
  audioSources: AudioSource[],
  opts: StartOptions,
  host: CaptureHost,
  callbacks: RecorderCallbacks,
): Promise<RecorderHandle> {
  const settings = videoTrack.getSettings();
  const srcW = settings.width ?? 1920;
  const srcH = settings.height ?? 1080;

  // Quality cap: downscale at ingest when the source exceeds the target.
  let outW = srcW;
  let outH = srcH;
  if (opts.quality !== 'source') {
    const target = Number.parseInt(opts.quality, 10); // e.g. 1080
    if (srcH > target) {
      outH = target;
      outW = Math.round((srcW / srcH) * target);
    }
  }
  // Keep even dimensions — required by H.264.
  outW -= outW % 2;
  outH -= outH % 2;

  const crop = opts.cropRect;
  const encW = crop ? crop.w - (crop.w % 2) : outW;
  const encH = crop ? crop.h - (crop.h % 2) : outH;

  const { config } = await resolveVideoEncoder(
    encW,
    encH,
    opts.fps,
    bitrateForQuality(encW, encH, opts.fps),
    true,
  );

  const sessionId = opts.sessionId;
  const manifest: SessionManifest = {
    schemaVersion: 1,
    id: sessionId,
    startedAtEpochMs: Date.now(),
    state: 'active',
    video: { width: encW, height: encH, fps: opts.fps, codec: 'avc1' },
    audio:
      audioSources.length > 0
        ? { codec: 'opus', sampleRate: RECORDING.SAMPLE_RATE, channels: 2, file: audioSources[0]!.label === 'mic' ? 'mic.webm' : 'system.webm' }
        : null,
    camera: null,
    screen: { segments: [] },
    pausedUs: 0,
  };
  await host.createSession(sessionId, manifest);

  const writer = new SegmentWriter(host, sessionId, opts.fps);
  const audio = new AudioCapture();
  if (audioSources.length > 0) {
    try {
      await audio.start(audioSources);
    } catch (e) {
      callbacks.onError(`Audio capture failed: ${(e as Error).message}`);
    }
  }

  let encoder: VideoEncoder | null = null;
  let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  let pumpActive = false;

  let paused = false;
  let pausedStartedAtUs = 0;
  let pausedTotalUs = 0;
  let dropped = 0;
  let total = 0;
  let bytes = 0;
  let lastFrameUs = -1;
  let phase: RecorderStats['phase'] = 'recording';
  let stopping = false;

  // Capture clock: epoch-anchored so main-process cursor events (which use
  // (Date.now() − sessionStartEpochMs) × 1000) line up with video frames.
  // Paused time is excluded from both clocks.
  const clockStartMs = opts.startEpochMs;
  const captureTimeUs = (): number =>
    Math.round((Date.now() - clockStartMs - pausedTotalUs / 1000) * 1000);

  // Chromium attaches the decoderConfig (with the AVC description) only to
  // the FIRST output chunk of the stream. Every new segment muxer needs it:
  // without it the muxer crashes on finalize (null colorSpace) and the
  // recording silently freezes after the first ~2 s segment. Cache the first
  // metadata and forward it whenever a chunk arrives without one.
  let lastVideoMeta: EncodedVideoChunkMetadata | undefined;

  encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const tUs = chunk.timestamp;
      if (Number.isFinite(tUs) && tUs >= 0) {
        if (meta?.decoderConfig) lastVideoMeta = meta;
        // Later chunks may still carry a metadata object WITHOUT a
        // decoderConfig — only a decoderConfig-bearing metadata can
        // initialize a fresh segment muxer, so fall back to the cached one.
        const effectiveMeta = meta?.decoderConfig ? meta : lastVideoMeta;
        // Never swallow mux/segment errors: a failed write must surface in the
        // UI (and stop the byte counter from silently freezing).
        writer
          .addVideoChunk(chunk, effectiveMeta, tUs, encW, encH)
          .then(() => {
            writer.updateLastSegmentEnd(tUs + (chunk.duration ?? 0));
          })
          .catch((e: Error) => {
            console.error('recast: segment write failed', e);
            callbacks.onError(`Segment write failed: ${e.message}`);
            void encoder?.flush().catch(() => undefined);
            stopping = true;
          });
        bytes = writer.totalBytes;
      }
    },
    error: (e) => callbacks.onError(`Encoder error: ${e.message}`),
  });
  encoder.configure(config);

  const processFrame = async (frame: VideoFrame): Promise<void> => {
    total += 1;
    if (paused) {
      frame.close();
      return;
    }
    const tUs = captureTimeUs();
    if (lastFrameUs >= 0 && tUs <= lastFrameUs) {
      frame.close();
      dropped += 1;
      return;
    }
    lastFrameUs = tUs;

    let encodable: VideoFrame = frame;
    if (crop) {
      encodable = new VideoFrame(frame, {
        visibleRect: { x: crop.x, y: crop.y, width: crop.w, height: crop.h },
        timestamp: tUs,
        duration: 1_000_000 / opts.fps,
      });
      frame.close();
    }
    const keyFrame = Math.floor(tUs / (RECORDING.KEYFRAME_INTERVAL_S * 1_000_000)) !==
      Math.floor((tUs - 1_000_000 / opts.fps) / (RECORDING.KEYFRAME_INTERVAL_S * 1_000_000)) ||
      total === 1;
    if (encoder && encoder.encodeQueueSize > 3) {
      dropped += 1;
      encodable.close();
    } else if (encoder) {
      encoder.encode(encodable, { keyFrame });
      encodable.close();
    }
  };

  // Frame pump: MediaStreamTrackProcessor when available (no copy), otherwise
  // a hidden video element sampled on rAF (documented fallback).
  const pump = async (): Promise<void> => {
    pumpActive = true;
    try {
      if (typeof MediaStreamTrackProcessor !== 'undefined') {
        const processor = new MediaStreamTrackProcessor({ track: videoTrack });
        reader = processor.readable.getReader();
        while (!stopping) {
          const { value: frame, done } = await reader.read();
          if (done || !frame) break;
          await processFrame(frame);
        }
      } else {
        const video = document.createElement('video');
        video.srcObject = new MediaStream([videoTrack]);
        video.muted = true;
        await video.play();
        while (!stopping) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          if (video.readyState >= 2) {
            const frame = new VideoFrame(video, { timestamp: captureTimeUs() });
            await processFrame(frame);
          }
        }
      }
    } catch (e) {
      if (!stopping) callbacks.onError(`Capture pipeline error: ${(e as Error).message}`);
    } finally {
      pumpActive = false;
    }
  };

  void pump();

  const statsTimer = setInterval(() => {
    callbacks.onStats({
      phase,
      elapsedUs: Math.max(0, captureTimeUs()),
      bytes: writer.totalBytes || bytes,
      droppedFrames: dropped,
      totalFrames: total,
      segmentCount: writer.writtenSegments.length,
    });
  }, 250);

  return {
    pause() {
      if (paused) return;
      paused = true;
      pausedStartedAtUs = performance.now() * 1000;
      phase = 'paused';
      audio.setMuted('mic', true);
      audio.setMuted('system', true);
    },
    resume() {
      if (!paused) return;
      paused = false;
      pausedTotalUs += performance.now() * 1000 - pausedStartedAtUs;
      phase = 'recording';
      audio.setMuted('mic', false);
      audio.setMuted('system', false);
    },
    async stop() {
      stopping = true;
      phase = 'stopping';
      try {
        await reader?.cancel().catch(() => undefined);
        // Let the pump unwind, then flush what's still in flight.
        const deadline = Date.now() + 1_000;
        while (pumpActive && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 20));
        }
        await encoder?.flush();
        encoder?.close();
        // Drain the ordered chunk queue, then close the final segment.
        await writer.flush();
        const audioFiles = await audio.stop();
        videoTrack.stop();
        clearInterval(statsTimer);

        const segments = writer.writtenSegments;
        const finalManifest: SessionManifest = {
          ...manifest,
          state: 'completed',
          screen: { segments },
          pausedUs: Math.round(pausedTotalUs),
        };
        await host.writeManifest(sessionId, finalManifest);
        return { manifest: finalManifest, audioFiles };
      } catch (e) {
        clearInterval(statsTimer);
        callbacks.onError(`Stop failed: ${(e as Error).message}`);
        throw e;
      }
    },
    stats() {
      return {
        phase,
        elapsedUs: Math.max(0, captureTimeUs()),
        bytes: writer.totalBytes || bytes,
        droppedFrames: dropped,
        totalFrames: total,
        segmentCount: writer.writtenSegments.length,
      };
    },
  };
}
