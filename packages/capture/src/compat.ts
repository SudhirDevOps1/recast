import type { SessionManifest } from '@recast/shared';
import type { CaptureHost, RecorderStats } from './host';
import type { AudioSource } from './audio-mixer';
import type { EncoderProbeLog } from './encoder-probe';

/**
 * MediaRecorder compatibility mode — the last rung of the encoder ladder.
 *
 * If every WebCodecs VideoEncoder candidate fails to configure (broken GPU
 * driver, exotic Linux build, VM without OpenH264), recording must still
 * produce a file. MediaRecorder is always present in Chromium. The result is
 * a single growing WebM (VP8/VP9 + embedded audio) written through the host
 * in 2 s appends, with `compatibility: true` stamped in the manifest so the
 * library and the export pipeline tell the truth about the codec.
 */

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function pickCompatMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

export async function startCompatRecording(
  videoTrack: MediaStreamTrack,
  audioSources: AudioSource[],
  opts: { fps: 24 | 30 | 60; sessionId: string; startEpochMs: number },
  host: CaptureHost,
  callbacks: { onStats: (stats: RecorderStats) => void; onError: (message: string) => void },
  log: EncoderProbeLog,
): Promise<import('./recorder').RecorderHandle> {
  const mime = pickCompatMimeType();
  if (!mime) {
    throw new Error(
      'No video encoder and no MediaRecorder fallback are available on this machine. ' +
        'Send Settings → Diagnostics → Copy diagnostics bundle so this can be fixed.',
    );
  }

  const settings = videoTrack.getSettings();
  const srcW = settings.width ?? 1920;
  const srcH = settings.height ?? 1080;
  const outW = srcW - (srcW % 2);
  const outH = srcH - (srcH % 2);
  const videoCodec = mime.includes('vp9') ? 'vp9' : 'vp8';

  const manifest: SessionManifest = {
    schemaVersion: 1,
    id: opts.sessionId,
    startedAtEpochMs: opts.startEpochMs,
    state: 'active',
    video: { width: outW, height: outH, fps: opts.fps, codec: videoCodec },
    audio: null, // audio tracks are embedded in the WebM in compat mode
    camera: null,
    screen: { segments: [] },
    pausedUs: 0,
    compatibility: true,
  };
  await host.createSession(opts.sessionId, manifest);

  const stream = new MediaStream([videoTrack, ...audioSources.flatMap((s) => s.stream.getAudioTracks())]);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });

  const FILE = 'screen.webm';
  let bytes = 0;
  let paused = false;
  let pausedStartedAtMs = 0;
  let pausedTotalMs = 0;
  let phase: RecorderStats['phase'] = 'recording';

  recorder.ondataavailable = (e) => {
    if (!e.data || e.data.size === 0) return;
    bytes += e.data.size;
    void e.data
      .arrayBuffer()
      .then((buf) => host.appendSegmentFile(opts.sessionId, FILE, buf))
      .catch((err: Error) => {
        callbacks.onError(`Compatibility-mode write failed: ${err.message}`);
      });
  };
  recorder.onerror = (e) => {
    const detail = (e as unknown as { error?: { message?: string } }).error?.message ?? 'unknown MediaRecorder error';
    callbacks.onError(`Compatibility-mode recorder error: ${detail}`);
  };

  recorder.start(2_000);
  log(`compatibility mode active: MediaRecorder ${mime}`, 'WebCodecs configure failed on every candidate');

  const statsTimer = setInterval(() => {
    const elapsedMs = Math.max(0, Date.now() - opts.startEpochMs - pausedTotalMs);
    callbacks.onStats({
      phase,
      elapsedUs: Math.round(elapsedMs * 1_000),
      bytes,
      droppedFrames: 0,
      totalFrames: 0,
      segmentCount: bytes > 0 ? 1 : 0,
      compatibilityMode: true,
    });
  }, 250);

  return {
    pause() {
      if (paused) return;
      paused = true;
      pausedStartedAtMs = Date.now();
      phase = 'paused';
      try {
        recorder.pause();
      } catch (e) {
        log(`compat pause failed`, (e as Error).message);
      }
    },
    resume() {
      if (!paused) return;
      paused = false;
      pausedTotalMs += Date.now() - pausedStartedAtMs;
      phase = 'recording';
      try {
        recorder.resume();
      } catch (e) {
        log(`compat resume failed`, (e as Error).message);
      }
    },
    async stop() {
      phase = 'stopping';
      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      try {
        recorder.stop();
        await done;
      } catch (e) {
        log(`compat stop failed`, (e as Error).message);
      }
      clearInterval(statsTimer);
      stream.getTracks().forEach((t) => t.stop());

      const elapsedMs = Math.max(0, Date.now() - opts.startEpochMs - pausedTotalMs);
      const finalManifest: SessionManifest = {
        ...manifest,
        state: 'completed',
        screen: {
          segments: [
            {
              id: 'compat',
              file: FILE,
              startUs: 0,
              endUs: Math.max(1, Math.round(elapsedMs * 1_000)),
              width: outW,
              height: outH,
              sizeBytes: bytes,
            },
          ],
        },
        pausedUs: Math.round(pausedTotalMs * 1_000),
      };
      await host.writeManifest(opts.sessionId, finalManifest);
      return { manifest: finalManifest, audioFiles: [] };
    },
    stats() {
      const elapsedMs = Math.max(0, Date.now() - opts.startEpochMs - pausedTotalMs);
      return {
        phase,
        elapsedUs: Math.round(elapsedMs * 1_000),
        bytes,
        droppedFrames: 0,
        totalFrames: 0,
        segmentCount: bytes > 0 ? 1 : 0,
        compatibilityMode: true,
      };
    },
    get encoderPath(): string {
      return `Compatibility mode · ${mime}`;
    },
    get compatibilityMode(): boolean {
      return true;
    },
  };
}
