import { ArrayBufferTarget as WebMTarget, Muxer as WebMMuxer } from 'webm-muxer';
import { Muxer as Mp4Muxer, StreamTarget } from 'mp4-muxer';
import { buildTimeMap, timelineToSource, segmentLocalTimeUs, US_PER_S } from '@recast/shared';
import type { RecastProject } from '@recast/shared';
import {
  computeComposition,
  drawComposition,
  type CaptionLine,
  type CanvasImageSourceLike,
  type CursorSampleLike,
  type FollowStep,
} from '@recast/editor';
import { exportBitrate, resolveAudioEncoder, resolveExportEncoder, type ExportEncoderChoice } from './encoders';
import { applyFades, applyGain, applyNoiseGate, audioChunks, decodeAudioData } from './audio';

/**
 * Frame-clock export. The clock is a deterministic loop over frame times —
 * never requestAnimationFrame. Frames are decoded by seeking hidden video
 * elements (sample-exact), composed by the shared compositor, encoded by the
 * chosen WebCodecs encoder, and muxed to disk incrementally via the host.
 */

export interface ExportHost {
  /** Positional writes into `<destination>.part` (MP4 muxers write out of order). */
  writeChunkAt(destination: string, position: number, data: Uint8Array): Promise<void>;
  /** Finalize: fsync + rename `.part` → final name. */
  finalizeFile(destination: string): Promise<void>;
  /** Discard the `.part` file (cancel path). */
  discardPartial(destination: string): Promise<void>;
  readFile(path: string): Promise<ArrayBuffer>;
  writeFrameImage(dir: string, index: number, png: ArrayBuffer): Promise<void>;
  ffmpegGif(frameDir: string, fps: number, width: number, outFile: string): Promise<boolean>;
  ffmpegProres(frameDir: string, fps: number, outFile: string): Promise<boolean>;
  ffmpegLoudnorm(file: string, targetLufs: number): Promise<boolean>;
  ffprobeDurationUs(file: string): Promise<number | null>;
  makeTempFrameDir(): Promise<string>;
  cleanupDir(dir: string): Promise<void>;
}

export interface ExportRequest {
  destination: string;
  format: 'mp4' | 'webm' | 'hevc' | 'prores' | 'gif';
  fps: 24 | 30 | 60;
  shortEdge: number;
  cancelCheck: () => boolean;
}

export interface ExportDeps {
  project: RecastProject;
  zoomTrack: FollowStep[];
  cursorEvents: CursorSampleLike[];
  getCaptionsAt: (tUs: number) => CaptionLine[];
  /** Hidden, muted video element per segment, ready for seeks. */
  getVideoElement: (segmentId: string) => HTMLVideoElement | null;
  getBackgroundImage: (() => CanvasImageSourceLike | null) | null;
  /** Face-cam decode element (null when the take has no camera track). */
  getCameraElement?: (() => HTMLVideoElement | null) | null;
  preferHardware: boolean;
  /** ffmpeg-backed features; when false the exporter degrades to core formats. */
  hasFfmpeg: boolean;
  normalizeLufs: boolean;
  noiseGateDb: number | null;
}

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  encodeFps: number;
  stage: 'rendering' | 'muxing' | 'verifying' | 'done' | 'cancelled' | 'failed';
  usedPath: string;
  error?: string;
}

function seekTo(video: HTMLVideoElement, sourceSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.error) {
      reject(new Error(`Segment media failed to load — export aborted. (video error ${video.error.code}: ${video.error.message || 'no detail'})`));
      return;
    }
    const target = Math.max(0, Math.min(sourceSec, (video.duration || 0) - 0.001));
    if (Math.abs(video.currentTime - target) < 1 / 480 && video.readyState >= 2) {
      resolve();
      return;
    }
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`Segment media failed to load — export aborted. (video error ${video.error?.code ?? '?'} on seek)`));
    };
    const cleanup = (): void => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onErr);
    video.currentTime = target;
    // Safety timeout: never hang the export on a stuck seek — but a timeout
    // without metadata is a load failure, so fail loudly instead of crawling
    // at 1.5 s/frame (the old behavior made broken exports look like hangs).
    setTimeout(() => {
      if (video.readyState < 2 && !video.error) {
        cleanup();
        reject(new Error('Segment video is not decodable — export aborted. If this persists, check the recast-media protocol or re-record.'));
        return;
      }
      cleanup();
      resolve();
    }, 3_000);
  });
}

export async function runExport(
  req: ExportRequest,
  deps: ExportDeps,
  host: ExportHost,
  onProgress: (p: ExportProgress) => void,
): Promise<{ file: string; usedPath: string; durationUs: number; verified: boolean }> {
  const { project } = deps;
  const map = buildTimeMap(project.timeline.clips);
  if (map.durationUs === 0) throw new Error('Nothing to export — the timeline is empty.');

  const fps = req.fps;
  const frameDurUs = 1_000_000 / fps;
  const totalFrames = Math.ceil(map.durationUs / frameDurUs);
  // Output size from the style aspect; 'source' follows the recording.
  const aspect = project.style.aspect;
  let outW: number;
  let outH = req.shortEdge;
  if (aspect === '9:16') {
    outW = req.shortEdge * 0.5625;
    outH = req.shortEdge;
  } else if (aspect === '1:1') {
    outW = req.shortEdge;
  } else if (aspect === '4:5') {
    outW = req.shortEdge * 0.8;
    outH = req.shortEdge;
  } else if (aspect === '21:9') {
    outW = Math.round(req.shortEdge * 2.3333);
  } else {
    const srcAr = project.media.width && project.media.height ? project.media.width / project.media.height : 16 / 9;
    if (srcAr < 1) {
      outW = req.shortEdge;
      outH = Math.round(req.shortEdge / srcAr);
    } else {
      outW = Math.round(req.shortEdge * srcAr);
      outH = req.shortEdge;
    }
  }
  outW -= outW % 2;
  outH -= outH % 2;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { alpha: true })!;

  let choice: ExportEncoderChoice;
  if (req.format === 'prores' || req.format === 'gif') {
    // Rendered through the frame pipe → ffmpeg; no WebCodecs encoder here.
    choice = { config: null as unknown as VideoEncoderConfig, path: `FFmpeg ${req.format === 'gif' ? 'GIF (palettegen)' : 'ProRes 422 (libprores)'}`, container: 'mp4' };
  } else {
    choice = await resolveExportEncoder(outW, outH, fps, exportBitrate(outH, fps, req.format), req.format, deps.preferHardware);
  }

  // Audio: decode + process FIRST (no encoding yet) — the muxer must declare
  // the audio track at construction (mp4-muxer throws on chunks for an
  // undeclared track, which silently dropped ALL audio before this fix).
  let audioCtx: AudioContext | null = null;
  let audio: {
    config: AudioEncoderConfig;
    mp4Codec: 'aac' | 'opus';
    chunks: AudioData[];
  } | null = null;
  try {
    if (project.media.audio && project.media.audio.file && deps.hasFfmpeg) {
      const bytes = await host.readFile(`${project.media.dir}/${project.media.audio.file}`);
      audioCtx = new AudioContext();
      let buffer = await decodeAudioData(audioCtx, bytes);
      const edits = project.audioEdits;
      if (edits.noiseGateDb != null) buffer = applyNoiseGate(buffer, edits.noiseGateDb, buffer.sampleRate);
      buffer = applyGain(buffer, edits.gainDb);
      buffer = applyFades(buffer, { fadeInMs: edits.fadeInMs, fadeOutMs: edits.fadeOutMs, sampleRate: buffer.sampleRate });
      const { codec } = await resolveAudioEncoder(buffer.sampleRate);
      const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
      const config: AudioEncoderConfig = {
        codec: codec === 'aac' ? 'mp4a.40.2' : 'opus',
        sampleRate: buffer.sampleRate,
        numberOfChannels: channels,
        bitrate: codec === 'aac' ? 192_000 : 160_000,
      };
      audio = { config, mp4Codec: codec, chunks: Array.from(audioChunks(buffer)) };
    }
  } catch {
    // Audio is best-effort; video still exports without it.
    audio = null;
  } finally {
    if (audioCtx) void audioCtx.close();
  }

  // Muxer: incremental StreamTarget for MP4 (moov at end; a faststart remux
  // follows when ffmpeg is available), WebM via BufferTarget for small files.
  // WebM is Opus-only (AAC is invalid in WebM); MP4 takes the resolved codec.
  let muxer: Mp4Muxer<StreamTarget> | WebMMuxer<WebMTarget> | null = null;

  if (req.format === 'mp4' || req.format === 'hevc') {
    muxer = new Mp4Muxer({
      target: new StreamTarget({
        onData: (data, position) => {
          void host.writeChunkAt(req.destination, position, data);
        },
        chunked: true,
      }),
      // The VP9 fallback (machines without any H.264 encoder) must declare
      // the actual codec in the MP4 track, not hardcode 'avc'.
      video: { codec: choice.config?.codec?.startsWith('vp09') ? 'vp9' : 'avc', width: outW, height: outH },
      ...(audio
        ? { audio: { codec: audio.mp4Codec, numberOfChannels: audio.config.numberOfChannels, sampleRate: audio.config.sampleRate } }
        : {}),
      fastStart: false,
      firstTimestampBehavior: 'offset',
    });
  } else if (req.format === 'webm') {
    muxer = new WebMMuxer({
      target: new WebMTarget(),
      video: { codec: 'V_VP9', width: outW, height: outH, frameRate: fps },
      ...(audio
        ? { audio: { codec: 'A_OPUS' as const, numberOfChannels: audio.config.numberOfChannels, sampleRate: audio.config.sampleRate } }
        : {}),
      firstTimestampBehavior: 'offset',
    });
  }

  // Encode the decoded audio into the (now audio-aware) muxer.
  if (audio && muxer) {
    try {
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer?.addAudioChunk(chunk, meta),
        error: () => undefined,
      });
      audioEncoder.configure(audio.config);
      for (const chunk of audio.chunks) {
        audioEncoder.encode(chunk);
        chunk.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
    } catch {
      // Audio is best-effort — the muxed audio track simply stays shorter.
    }
  } else if (audio) {
    for (const chunk of audio.chunks) chunk.close();
  }

  let encoder: VideoEncoder | null = null;
  let encoderFailure: string | null = null;
  if (req.format !== 'prores' && req.format !== 'gif') {
    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer?.addVideoChunk(chunk, meta);
      },
      error: (e) => {
        // Throwing inside a callback becomes an unhandled rejection the loop
        // never sees — capture it and fail the loop explicitly instead.
        encoderFailure = `Export encoder error: ${e.message}`;
      },
    });
    encoder.configure(choice.config);
  }

  // Audio: decode once, process, encode at export quality.
  // (moved above the muxer — see the audio plan block)

  // GIF/ProRes frame-pipe rendering.
  const framePipe = req.format === 'gif' || req.format === 'prores';
  let frameDir: string | null = null;
  if (framePipe) {
    if (!deps.hasFfmpeg) {
      throw new Error(
        `${req.format === 'gif' ? 'GIF' : 'ProRes'} export requires the FFmpeg safety net. Install it in Settings → Media engine.`,
      );
    }
    frameDir = await host.makeTempFrameDir();
  }

  const scratch = document.createElement('canvas');
  const cameraSeg = project.media.camera;
  const drawDeps = {
    getFrame: (): CanvasImageSourceLike | null => {
      const hit = timelineToSource(map, currentTUs);
      if (!hit) return null;
      return deps.getVideoElement(hit.clip.segmentId);
    },
    scratch,
    getBackgroundImage: deps.getBackgroundImage ?? undefined,
    getCameraFrame: deps.getCameraElement ?? undefined,
  };

  let currentTUs = 0;
  const started = performance.now();
  let lastProgressAt = started;
  let framesDone = 0;

  try {
    for (let f = 0; f < totalFrames; f++) {
      if (encoderFailure) throw new Error(encoderFailure);
      if (req.cancelCheck()) {
        onProgress({ frame: f, totalFrames, encodeFps: 0, stage: 'cancelled', usedPath: choice.path });
        if (frameDir) await host.cleanupDir(frameDir);
        await host.discardPartial(req.destination).catch(() => undefined);
        return { file: req.destination, usedPath: choice.path, durationUs: 0, verified: false };
      }
      currentTUs = f * frameDurUs;
      const hit = timelineToSource(map, currentTUs);
      if (hit) {
        const video = deps.getVideoElement(hit.clip.segmentId);
        if (video) {
          // Segment files carry a segment-local timeline (mp4-muxer writes
          // `firstTimestampBehavior: 'offset'`) — capture-clock times must
          // map through segmentLocalTimeUs() or every segment after the
          // first seeks past its end (black export after ~2 s clips).
          const seg = project.media.segments.find((s) => s.id === hit.clip.segmentId);
          await seekTo(video, segmentLocalTimeUs(hit.sourceUs, seg?.startUs ?? 0) / US_PER_S);
        }
        // Face-cam element rides the same capture clock (single cam file
        // starting at 0, so its mapping is identity-safe).
        if (cameraSeg && deps.getCameraElement) {
          const camVideo = deps.getCameraElement();
          if (camVideo) {
            const camDur = Math.max(0, cameraSeg.endUs - cameraSeg.startUs);
            const camUs = Math.min(segmentLocalTimeUs(hit.sourceUs, cameraSeg.startUs), camDur);
            await seekTo(camVideo, camUs / US_PER_S).catch(() => undefined);
          }
        }
      }
      const pose = deps.zoomTrack.length > 0 ? interpPose(deps.zoomTrack, currentTUs) : { scale: 1, cx: project.media.width / 2, cy: project.media.height / 2 };
      const comp = computeComposition(project, currentTUs, outW, outH, {
        pose,
        cursorEvents: deps.cursorEvents,
        getCaptionsAt: deps.getCaptionsAt,
        showSafeGuides: false,
        clipIn: clipIntroAt(map, currentTUs),
        totalDurationUs: map.durationUs,
      });
      drawComposition(ctx, comp, project, drawDeps);

      if (framePipe) {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'));
        if (blob) {
          await host.writeFrameImage(frameDir!, f, await blob.arrayBuffer());
        }
      } else {
        const frame = new VideoFrame(canvas, {
          timestamp: currentTUs,
          duration: frameDurUs,
        });
        const keyFrame = f % (2 * fps) === 0;
        encoder!.encode(frame, { keyFrame });
        frame.close();
        if (encoder!.encodeQueueSize > 8) {
          // Drain with a hard deadline AND the encoder's error flag — a dead
          // encoder never drains, and an unbounded poll hangs the export
          // silently (this used to spin forever after an encoder error).
          await new Promise<void>((resolve, reject) => {
            const started = Date.now();
            const check = (): void => {
              if (encoderFailure) {
                reject(new Error(encoderFailure));
                return;
              }
              if (encoder!.encodeQueueSize <= 2) {
                resolve();
                return;
              }
              if (Date.now() - started > 30_000) {
                reject(new Error('Export encoder queue stalled — aborted.'));
                return;
              }
              setTimeout(check, 4);
            };
            check();
          });
        }
      }

      framesDone = f + 1;
      const now = performance.now();
      if (now - lastProgressAt > 250) {
        const encodeFps = framesDone / ((now - started) / 1000);
        onProgress({ frame: framesDone, totalFrames, encodeFps, stage: 'rendering', usedPath: choice.path });
        lastProgressAt = now;
        // Yield to keep the UI responsive between frames.
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }

    if (framePipe) {
      onProgress({ frame: totalFrames, totalFrames, encodeFps: 0, stage: 'muxing', usedPath: choice.path });
      const ok =
        req.format === 'gif'
          ? await host.ffmpegGif(frameDir!, fps, Math.min(outW, 1280), req.destination)
          : await host.ffmpegProres(frameDir!, fps, req.destination);
      await host.cleanupDir(frameDir!);
      if (!ok) throw new Error('FFmpeg encode failed — see Settings → Media engine for diagnostics.');
    } else {
      await encoder!.flush();
      encoder!.close();
      if (muxer instanceof WebMMuxer) {
        muxer.finalize();
        const { buffer } = muxer.target as WebMTarget;
        if (buffer) await host.writeChunkAt(req.destination, 0, new Uint8Array(buffer));
      } else if (muxer) {
        // MP4 finalize writes the moov through the StreamTarget — without it
        // no bytes ever reached the .part file and the rename in
        // finalizeExport failed with ENOENT (export "succeeded" into nothing).
        muxer.finalize();
      }
      await host.finalizeFile(req.destination);
    }

    // Optional post passes: loudnorm (audio) and faststart remux (mp4).
    let usedPath = choice.path;
    if (req.format === 'mp4' || req.format === 'hevc') {
      if (deps.normalizeLufs && deps.hasFfmpeg) {
        const ok = await host.ffmpegLoudnorm(req.destination, -14);
        if (ok) usedPath += ' + FFmpeg loudnorm −14 LUFS';
      }
    }

    onProgress({ frame: totalFrames, totalFrames, encodeFps: 0, stage: 'verifying', usedPath });
    const durationUs = await host.ffprobeDurationUs(req.destination);
    const verified = durationUs != null && durationUs > map.durationUs * 0.9;
    onProgress({ frame: totalFrames, totalFrames, encodeFps: 0, stage: 'done', usedPath });
    return { file: req.destination, usedPath, durationUs: durationUs ?? map.durationUs, verified };
  } catch (e) {
    onProgress({ frame: framesDone, totalFrames, encodeFps: 0, stage: 'failed', usedPath: choice.path, error: (e as Error).message });
    if (frameDir) await host.cleanupDir(frameDir).catch(() => undefined);
    throw e;
  }
}

function interpPose(track: FollowStep[], tUs: number): { scale: number; cx: number; cy: number } {
  if (track.length === 0) return { scale: 1, cx: 0, cy: 0 };
  if (tUs <= track[0]!.tUs) return track[0]!.pose;
  const last = track[track.length - 1]!;
  if (tUs >= last.tUs) return last.pose;
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid]!.tUs <= tUs) lo = mid;
    else hi = mid;
  }
  const a = track[lo]!;
  const b = track[hi]!;
  const f = (tUs - a.tUs) / Math.max(1, b.tUs - a.tUs);
  return {
    scale: a.pose.scale + (b.pose.scale - a.pose.scale) * f,
    cx: a.pose.cx + (b.pose.cx - a.pose.cx) * f,
    cy: a.pose.cy + (b.pose.cy - a.pose.cy) * f,
  };
}

/** Intro transition of the clip active at tUs, or null when none applies. */
function clipIntroAt(
  map: ReturnType<typeof buildTimeMap>,
  tUs: number,
): { type: RecastProject['timeline']['clips'][number]['transitionIn']; progress: number } | null {
  for (const { clip, tIn } of map.clips) {
    const tOut = tIn + Math.max(0, Math.round((clip.sourceOutUs - clip.sourceInUs) / clip.speed));
    if (tUs >= tIn && tUs < tOut) {
      if (clip.transitionIn === 'none') return null;
      const localUs = tUs - tIn;
      const durUs = Math.max(1, clip.transitionMs) * 1_000;
      const progress = Math.min(1, Math.max(0, localUs / durUs));
      return { type: clip.transitionIn, progress };
    }
  }
  return null;
}
