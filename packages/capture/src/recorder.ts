import { RECORDING } from '@recast/shared';
import type { SessionManifest } from '@recast/shared';
import type { CaptureHost, RecorderCallbacks, RecorderStats, StartOptions } from './host';
import { AudioCapture, type AudioSource } from './audio-mixer';
import { SegmentWriter } from './segment-writer';
import { probeEncoderChain, EncoderUnsupportedError } from './encoder-probe';
import { startCompatRecording } from './compat';

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
  /** Human-readable encoder path actually in use ("Hardware H.264 · High", …). */
  readonly encoderPath: string;
  /** True when recording runs in MediaRecorder compatibility mode. */
  readonly compatibilityMode: boolean;
}

function bitrateForQuality(width: number, height: number, fps: number): number {
  // Screen recording has sharp text, syntax code, and UI chrome.
  // 0.20 bits/pixel at 30 fps is crystal-clear while avoiding GPU encoder backpressure and frame drops.
  // ~2.5 Mbps at 720p/1366x768, ~5 Mbps at 1080p, up to 16 Mbps at 4K.
  const pixels = width * height;
  const base = pixels * 0.20 * (fps / 30);
  return Math.round(Math.min(16_000_000, Math.max(2_500_000, base)));
}

export async function startRecording(
  videoTrack: MediaStreamTrack,
  audioSources: AudioSource[],
  opts: StartOptions,
  host: CaptureHost,
  callbacks: RecorderCallbacks,
): Promise<RecorderHandle> {
  const log = (stage: string, message: string, detail?: string): void => {
    console.debug(`recast:${stage}`, message, detail ?? '');
    callbacks.onLog?.(stage, message, detail);
  };

  const settings = videoTrack.getSettings();
  const srcW = settings.width ?? 1920;
  const srcH = settings.height ?? 1080;
  log('display-media', `video track granted`, `${srcW}x${srcH} @${settings.frameRate ?? '?'}fps · ${videoTrack.label || 'unnamed source'}`);

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
  const bitrate = bitrateForQuality(encW, encH, opts.fps);

  // Stage encoder-probe/encoder-configure: configure-probe the whole fallback
  // chain BEFORE anything else. isConfigSupported() alone has been observed
  // to claim support and still throw NotSupportedError at configure() —
  // that raw DOMException was the "Recording failed: Not supported" toast.
  let probed;
  try {
    probed = await probeEncoderChain(encW, encH, opts.fps, bitrate, (m, d) => log('encoder-probe', m, d));
  } catch (e) {
    if (e instanceof EncoderUnsupportedError) {
      // Recording must never fail outright: MediaRecorder compatibility mode.
      log('encoder-probe', 'all WebCodecs candidates failed — entering compatibility mode', e.message);
      return startCompatRecording(
        videoTrack,
        audioSources,
        { fps: opts.fps, sessionId: opts.sessionId, startEpochMs: opts.startEpochMs },
        host,
        { onStats: callbacks.onStats, onError: callbacks.onError },
        (m, d) => log('compat', m, d),
      );
    }
    const err = e as Error;
    log('encoder-probe', 'unexpected probe failure', `${err.name}: ${err.message}`);
    throw new Error(`Recording failed at encoder-probe: ${err.name} — ${err.message}`);
  }
  const { config } = probed;

  // The muxer and the manifest must tell the truth about the codec: the
  // fallback chain can land on VP9 when the machine has no H.264 encoder,
  // and mislabeled segments decode as garbage (black preview, dead export).
  const isVp9Stream = config.codec.startsWith('vp09');
  const muxerCodec: 'avc' | 'vp9' = isVp9Stream ? 'vp9' : 'avc';
  const manifestCodec = isVp9Stream ? 'vp9' : 'avc1';

  const sessionId = opts.sessionId;
  const manifest: SessionManifest = {
    schemaVersion: 1,
    id: sessionId,
    startedAtEpochMs: Date.now(),
    state: 'active',
    video: { width: encW, height: encH, fps: opts.fps, codec: manifestCodec },
    audio:
      audioSources.length > 0
        ? { codec: 'opus', sampleRate: RECORDING.SAMPLE_RATE, channels: 2, file: audioSources[0]!.label === 'mic' ? 'mic.webm' : 'system.webm' }
        : null,
    camera: null,
    screen: { segments: [] },
    pausedUs: 0,
  };
  await host.createSession(sessionId, manifest);

  const writer = new SegmentWriter(host, sessionId, opts.fps, muxerCodec);
  const audio = new AudioCapture();
  if (audioSources.length > 0) {
    try {
      await audio.start(audioSources);
      log('audio-init', `audio sources started`, audioSources.map((s) => s.label).join(' + '));
    } catch (e) {
      const err = e as Error;
      log('audio-init', 'audio capture failed — continuing video-only', `${err.name}: ${err.message}`);
      callbacks.onError(`Audio capture failed: ${err.message}`);
    }
  }

  let encoder: VideoEncoder | null = null;
  let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  let pumpActive = false;
  let latestMicPeak: number | null = null;

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
            log('segment-write', 'segment write failed', e.message);
            callbacks.onError(`Segment write failed: ${e.message}`);
            void encoder?.flush().catch(() => undefined);
            stopping = true;
          });
        bytes = writer.totalBytes;
      }
    },
    error: (e) => {
      log('encoder', 'asynchronous encoder error', `${e.name}: ${e.message}`);
      callbacks.onError(`Encoder error: ${e.message}`);
    },
  });
  // The probe proved this exact config configures and drains a canary frame;
  // a failure here is a race and gets a stage-named structured error.
  try {
    encoder.configure(config);
    log('encoder-configure', `configured ${probed.path}`, `${config.codec} ${encW}x${encH}@${opts.fps} · ${(bitrate / 1_000_000).toFixed(1)} Mbps`);
  } catch (e) {
    const err = e as Error;
    log('encoder-configure', `configure threw after a successful probe`, `${err.name}: ${err.message}`);
    try {
      encoder.close();
    } catch {
      /* nothing to close */
    }
    throw new Error(
      `Recording failed at encoder-configure (${probed.path}): ${err.name} — ${err.message}. ` +
        'Send Settings → Diagnostics → Copy diagnostics bundle.',
    );
  }

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

    const encodable = new VideoFrame(frame, {
      ...(crop ? { visibleRect: { x: crop.x, y: crop.y, width: crop.w, height: crop.h } } : {}),
      timestamp: tUs,
      duration: Math.round(1_000_000 / opts.fps),
    });
    frame.close();
    const keyFrame = Math.floor(tUs / (RECORDING.KEYFRAME_INTERVAL_S * 1_000_000)) !==
      Math.floor((tUs - 1_000_000 / opts.fps) / (RECORDING.KEYFRAME_INTERVAL_S * 1_000_000)) ||
      total === 1;
    if (encoder && encoder.encodeQueueSize > 16) {
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
    void audio.meter('mic').then((peak) => {
      latestMicPeak = peak;
    });
    callbacks.onStats({
      phase,
      elapsedUs: Math.max(0, captureTimeUs()),
      bytes: writer.totalBytes || bytes,
      droppedFrames: dropped,
      totalFrames: total,
      segmentCount: writer.writtenSegments.length,
      micPeak: latestMicPeak,
      compatibilityMode: false,
    });
  }, 250);

  const encoderPath = probed.path;
  const compatibilityMode = false;

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
        // Immediately halt screen acquisition to release GPU/D3D capture buffers
        videoTrack.stop();
        await reader?.cancel().catch(() => undefined);
        // Let the pump unwind, then flush what's still in flight.
        const deadline = Date.now() + 800;
        while (pumpActive && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 20));
        }

        // Flush encoder with safety timeout so hardware stalls never freeze the stop button
        if (encoder) {
          await Promise.race([
            encoder.flush(),
            new Promise((resolve) => setTimeout(resolve, 2_500)),
          ]).catch(() => undefined);
          try {
            encoder.close();
          } catch {
            /* ignore if already closed */
          }
        }

        // Drain the ordered chunk queue and write final segment with timeout
        await Promise.race([
          writer.flush(),
          new Promise((resolve) => setTimeout(resolve, 3_000)),
        ]).catch((e) => {
          log('muxer', 'writer flush warning', (e as Error).message);
        });

        const audioFiles = await audio.stop().catch(() => []);
        clearInterval(statsTimer);
        log('muxer', 'recording finalized', `${writer.writtenSegments.length} segment(s) · ${((writer.totalBytes || 0) / 1_000_000).toFixed(1)} MB · ${encoderPath}`);

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
        videoTrack.stop();
        const err = e as Error;
        log('muxer', 'stop flow failed', `${err.name}: ${err.message}`);
        callbacks.onError(`Stop failed: ${err.message}`);
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
        micPeak: latestMicPeak,
        compatibilityMode: false,
      };
    },
    get encoderPath(): string {
      return encoderPath;
    },
    get compatibilityMode(): boolean {
      return compatibilityMode;
    },
  };
}
