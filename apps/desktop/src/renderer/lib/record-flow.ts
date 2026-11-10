import { bridge } from './bridge';
import { useApp, useRecorder } from '../state/stores';
import { startRecording } from '@recast/capture';
import type { CaptureHost } from '@recast/capture';
import { logCapture } from './capture-log';

/**
 * Wires the capture package to the main-process host and starts the pipeline.
 *
 * Ordering matters: `acquireCaptureSources` MUST run inside the click's
 * transient-activation window (before any countdown) — Chromium rejects
 * getDisplayMedia() fired seconds after the gesture, which is exactly what
 * the old countdown-first flow did with 5 s / 10 s countdowns.
 */

export const captureHost: CaptureHost = {
  createSession: (sessionId, manifest) => bridge().invoke('capture:createSession', { sessionId, manifest } as never) as never,
  writeSegment: async (sessionId, file, data) => {
    await bridge().invoke('capture:writeSegment', { sessionId, file, data } as never);
  },
  appendSegmentFile: async (sessionId, file, data) => {
    await bridge().invoke('capture:appendSegmentFile', { sessionId, file, data } as never);
  },
  appendInputEvents: async (sessionId, events) => {
    await bridge().invoke('capture:appendInput', { sessionId, events } as never);
  },
  writeManifest: async (sessionId, manifest) => {
    await bridge().invoke('capture:writeManifest', { sessionId, manifest } as never);
  },
  diskFreeMb: async () => bridge().invoke('capture:diskFreeMb', undefined),
};

interface FlowArgs {
  sessionId: string;
  startEpochMs: number;
  /** Streams acquired synchronously on click, before the countdown. */
  acquired: AcquiredSources;
}

/** Error that can carry a toast action button (e.g. "Open permissions"). */
export class RecordingError extends Error {
  readonly action?: { label: string; run: () => void };

  constructor(message: string, action?: { label: string; run: () => void }) {
    super(message);
    this.name = 'RecordingError';
    this.action = action;
  }
}

function openScreenPermissions(): void {
  void bridge()
    .invoke('permissions:openSystemSettings', { kind: 'screen' } as never)
    .catch(() => undefined);
}

/** Asks main why the display-media handler denied, to disambiguate denials. */
async function lastDisplayDenyReason(): Promise<string | null> {
  try {
    const deny = await bridge().invoke('capture:lastDisplayDeny', undefined);
    if (!deny) return null;
    return deny.reason === 'no-source'
      ? 'No screen or window source was available to record.'
      : `Screen capture request failed in the main process (${deny.detail}).`;
  } catch {
    return null;
  }
}

/** Maps raw getDisplayMedia rejections to messages a user can act on. */
async function friendlyDisplayMediaError(e: unknown): Promise<Error> {
  const name = (e as DOMException)?.name ?? '';
  if (name === 'NotAllowedError') {
    const deny = await lastDisplayDenyReason();
    if (deny) return new RecordingError(deny);
    return new RecordingError(
      'Screen capture was denied — grant the screen-recording permission and try again.',
      { label: 'Open permissions', run: openScreenPermissions },
    );
  }
  if (name === 'NotFoundError') {
    return new Error('No screen or window source is available to record.');
  }
  if (name === 'NotSupportedError' || name === 'InvalidStateError') {
    return new Error('Screen capture is not available in this environment.');
  }
  if (e instanceof Error) {
    // Never let a raw DOMException name reach the toast unnamed.
    return new Error(`${e.name || 'Error'}: ${e.message}`);
  }
  return new Error(String(e));
}

async function requestDisplayMedia(frameRate: number, withAudio: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate },
      audio: withAudio,
    });
  } catch (e) {
    if (!withAudio) throw await friendlyDisplayMediaError(e);
    // Some platforms reject audio-constrained display requests outright —
    // recording must still work, so retry video-only.
    try {
      return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate } });
    } catch {
      throw await friendlyDisplayMediaError(e);
    }
  }
}

export interface AcquiredSources {
  displayStream: MediaStream;
  audioSources: Array<{ label: 'mic' | 'system'; stream: MediaStream }>;
  /** Camera track when face-cam recording was enabled and granted. */
  cameraTrack: MediaStreamTrack | null;
}

/** Stops every track of an acquisition that never made it into a recording. */
export function releaseAcquiredSources(acquired: AcquiredSources | null): void {
  if (!acquired) return;
  acquired.displayStream.getTracks().forEach((t) => t.stop());
  for (const s of acquired.audioSources) s.stream.getTracks().forEach((t) => t.stop());
  acquired.cameraTrack?.stop();
}

/**
 * Acquires the display stream + mic synchronously (call inside the click
 * handler, before any countdown). Keeps tracks alive; the caller hands the
 * result to startRecordingFlow once the countdown finishes.
 */
export async function acquireCaptureSources(
  showToast: (message: string, tone?: 'info' | 'error' | 'success', action?: { label: string; run: () => void }) => void,
): Promise<AcquiredSources> {
  const opts = useRecorder.getState();
  const app = useApp.getState();

  // 1) Display stream — must happen while the click activation is fresh.
  const wantSystemAudio = Boolean(opts.systemAudio && app.platform?.capabilities.systemAudio);
  const displayStream = await requestDisplayMedia(opts.fps, wantSystemAudio);
  const videoTrack = displayStream.getVideoTracks()[0];
  if (!videoTrack) {
    displayStream.getTracks().forEach((t) => t.stop());
    throw new Error('No screen source was returned by the system.');
  }
  const vs = videoTrack.getSettings();
  logCapture('display-media', 'info', 'display stream granted', `${vs.width ?? '?'}x${vs.height ?? '?'} · ${videoTrack.label || 'unnamed'}`);

  // 2) Mic stream — uses the device picked in the recorder, with a fallback
  //    to the system default when the exact device vanished (unplug).
  const audioSources: Array<{ label: 'mic' | 'system'; stream: MediaStream }> = [];
  if (opts.micEnabled) {
    const micConstraint: MediaTrackConstraints = opts.micDeviceId
      ? { deviceId: { exact: opts.micDeviceId } }
      : {};
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { ...micConstraint, echoCancellation: true } });
      audioSources.push({ label: 'mic', stream: mic });
      logCapture('audio-init', 'info', 'mic acquired', mic.getAudioTracks()[0]?.label || 'default device');
    } catch (e) {
      const err = e as Error;
      logCapture('audio-init', 'warn', 'selected mic unavailable — retrying default', `${err.name}: ${err.message}`);
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioSources.push({ label: 'mic', stream: mic });
        showToast('The selected microphone was unavailable — using the default device.', 'info');
      } catch (e2) {
        const err2 = e2 as Error;
        logCapture('audio-init', 'warn', 'no mic available — recording continues without mic audio', `${err2.name}: ${err2.message}`);
        showToast('Microphone unavailable — recording continues without mic audio.', 'error');
      }
    }
  }

  const systemTrack = displayStream.getAudioTracks()[0];
  if (opts.systemAudio && systemTrack) {
    audioSources.push({ label: 'system', stream: new MediaStream([systemTrack]) });
    logCapture('audio-init', 'info', 'system audio track acquired (loopback)');
  }

  // 3) Camera track — best effort. A camera failure must never block the
  //    screen recording; the take just goes out without the face cam.
  let cameraTrack: MediaStreamTrack | null = null;
  if (opts.cameraEnabled) {
    const wantExact = Boolean(opts.cameraDeviceId && opts.cameraDeviceId !== 'default');
    const attempt = async (exact: boolean): Promise<MediaStreamTrack | null> => {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: exact
          ? { deviceId: { exact: opts.cameraDeviceId! } }
          : { width: { ideal: 960 }, height: { ideal: 720 } },
      });
      return cam.getVideoTracks()[0] ?? null;
    };
    try {
      cameraTrack = await attempt(wantExact);
      if (!cameraTrack && wantExact) cameraTrack = await attempt(false);
      if (cameraTrack) {
        const cs = cameraTrack.getSettings();
        logCapture('camera', 'info', 'camera acquired', `${cs.width ?? '?'}x${cs.height ?? '?'} · ${cameraTrack.label || 'default camera'}`);
      }
    } catch (e) {
      const err = e as Error;
      // Exact-device failure gets one default-device retry before giving up.
      if (wantExact) {
        try {
          cameraTrack = await attempt(false);
          logCapture('camera', 'warn', 'selected camera unavailable — using default', `${err.name}: ${err.message}`);
        } catch (e2) {
          const err2 = e2 as Error;
          logCapture('camera', 'warn', 'no camera available — recording continues without face cam', `${err2.name}: ${err2.message}`);
          showToast('Camera unavailable — recording continues without the face cam.', 'error');
        }
      } else {
        logCapture('camera', 'warn', 'camera unavailable — recording continues without face cam', `${err.name}: ${err.message}`);
        showToast('Camera unavailable — recording continues without the face cam.', 'error');
      }
    }
  }

  return { displayStream, audioSources, cameraTrack };
}

export async function startRecordingFlow({ sessionId, startEpochMs, acquired }: FlowArgs): Promise<void> {
  const opts = (await import('../state/stores')).useRecorder.getState();
  const app = useApp.getState();
  const showToast = app.showToast;

  const { displayStream, audioSources, cameraTrack } = acquired;
  const videoTrack = displayStream.getVideoTracks()[0];
  if (!videoTrack) {
    releaseAcquiredSources(acquired);
    throw new Error('The acquired screen source disappeared before recording started.');
  }

  // Face-cam recorder (MediaRecorder — independent of the WebCodecs screen
  // pipeline, so a camera problem can never destabilize the screen take).
  const camera = cameraTrack ? startCameraRecorder(cameraTrack) : null;

  // Real disk headroom, polled while recording (never a hardcoded -1).
  let cachedDiskFreeMb = -1;
  let lastDiskPoll = 0;
  const pollDisk = async (): Promise<number> => {
    if (Date.now() - lastDiskPoll < 2_000) return cachedDiskFreeMb;
    lastDiskPoll = Date.now();
    try {
      const v = await captureHost.diskFreeMb();
      if (typeof v === 'number' && Number.isFinite(v)) cachedDiskFreeMb = v;
    } catch {
      /* keep the last known value */
    }
    return cachedDiskFreeMb;
  };
  void pollDisk();

  // 3) Start the pipeline (segmented WebCodecs encoder under the hood).
  const handle = await startRecording(
    videoTrack,
    audioSources,
    {
      fps: opts.fps,
      quality: opts.quality,
      cropRect: opts.areaRect,
      sessionId,
      startEpochMs,
    },
    captureHost,
    {
      onStats: (stats) => {
        void pollDisk().then((diskFreeMb) => {
          // AudioWorklet peak (0..1) → dBFS. Silence is a real reading
          // (-100 dB), not a null — null means "no mic" here.
          const micMeterDb =
            stats.micPeak == null ? null : Math.max(-100, 20 * Math.log10(Math.max(stats.micPeak, 1e-5)));
          useApp.getState().setRecorderState({
            phase: stats.phase,
            sessionId,
            elapsedUs: stats.elapsedUs,
            bytes: stats.bytes,
            droppedFrames: stats.droppedFrames,
            totalFrames: stats.totalFrames,
            micMeterDb,
            diskFreeMb,
          });
          // Broadcast live state to main process -> tray & floating toolbar!
          bridge().send('recorder:stats', {
            phase: stats.phase,
            elapsedUs: stats.elapsedUs,
            bytes: stats.bytes,
            micMeterDb,
            sessionId,
          });
        });
      },
      onError: (message) => {
        logCapture('pipeline', 'error', message);
        showToast(message, 'error');
      },
      onLog: (stage, message, detail) => {
        logCapture(stage, stage === 'encoder-probe' || stage === 'segment-write' ? 'warn' : 'info', message, detail);
      },
    },
  );

  if (handle.compatibilityMode) {
    logCapture('compat', 'warn', `recording in compatibility mode (${handle.encoderPath})`);
    showToast('Hardware encoders unavailable — recording in compatibility mode (WebM).', 'info');
  } else {
    logCapture('pipeline', 'info', `recording started via ${handle.encoderPath}`);
  }

  (await import('../state/stores')).useApp.setState({ recorderState: {
    phase: 'recording',
    sessionId,
    elapsedUs: 0,
    bytes: 0,
    droppedFrames: 0,
    totalFrames: 0,
    micMeterDb: null,
    diskFreeMb: cachedDiskFreeMb,
  } });

  // Expose the handle to the main-process stop flow via the app context
  // mirrored in a module-level singleton (the main process stops through IPC
  // → recorder:stop → main-side handle; the renderer stop is driven by the
  // same handle reference).
  setRendererRecorderHandle(camera ? wrapHandleWithCamera(handle, camera, sessionId) : handle);
}

// ---------------------------------------------------------------------------
// Face-cam recording (additive, MediaRecorder-based)
// ---------------------------------------------------------------------------

interface CameraRecording {
  recorder: MediaRecorder;
  track: MediaStreamTrack;
  chunks: Blob[];
  width: number;
  height: number;
  stopped: boolean;
}

function pickCameraMime(): string {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const c of candidates) {
    try {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* keep probing */
    }
  }
  return '';
}

function startCameraRecorder(track: MediaStreamTrack): CameraRecording | null {
  try {
    const mime = pickCameraMime();
    const recorder = new MediaRecorder(new MediaStream([track]), {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 1_500_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(2_000); // timeslice keeps memory flat on long takes
    const s = track.getSettings();
    logCapture('camera', 'info', 'face-cam recorder started', `${s.width ?? '?'}x${s.height ?? '?'}${mime ? ` · ${mime}` : ''}`);
    return {
      recorder,
      track,
      chunks,
      width: s.width ?? 640,
      height: s.height ?? 480,
      stopped: false,
    };
  } catch (e) {
    logCapture('camera', 'warn', 'face-cam recorder failed to start — continuing without it', (e as Error).message);
    return null;
  }
}

/** Forwards pause/resume to the camera and finalizes the cam file + manifest
 *  on stop. Returned manifest carries `camera` so the project gets the PiP. */
function wrapHandleWithCamera(
  handle: import('@recast/capture').RecorderHandle,
  camera: CameraRecording,
  sessionId: string,
): import('@recast/capture').RecorderHandle {
  return {
    pause: () => {
      handle.pause();
      try {
        if (camera.recorder.state === 'recording') camera.recorder.pause();
      } catch {
        /* camera pause is best-effort */
      }
    },
    resume: () => {
      handle.resume();
      try {
        if (camera.recorder.state === 'paused') camera.recorder.resume();
      } catch {
        /* camera resume is best-effort */
      }
    },
    stats: handle.stats,
    get encoderPath() {
      return handle.encoderPath;
    },
    get compatibilityMode() {
      return handle.compatibilityMode;
    },
    async stop() {
      const result = await handle.stop();
      try {
        if (!camera.stopped) {
          camera.stopped = true;
          await new Promise<void>((resolve) => {
            const r = camera.recorder;
            const done = (): void => resolve();
            r.addEventListener('stop', done, { once: true });
            try {
              if (r.state !== 'inactive') r.stop();
              else done();
            } catch {
              done();
            }
            // Never hang the take on a stuck camera stream.
            setTimeout(done, 3_000);
          });
        }
        const blob = new Blob(camera.chunks, { type: camera.recorder.mimeType || 'video/webm' });
        if (blob.size > 0) {
          const bytes = await blob.arrayBuffer();
          await captureHost.writeSegment(sessionId, 'cam-0.webm', bytes);
          const endUs = result.manifest.screen.segments.reduce((acc, s) => Math.max(acc, s.endUs), 0);
          await captureHost.writeManifest(sessionId, {
            ...result.manifest,
            camera: {
              segments: [
                {
                  id: 'cam-0',
                  file: 'cam-0.webm',
                  startUs: 0,
                  endUs,
                  width: camera.width,
                  height: camera.height,
                  sizeBytes: blob.size,
                },
              ],
            },
          });
          logCapture('camera', 'info', 'face-cam finalized', `cam-0.webm · ${(blob.size / 1_000_000).toFixed(1)} MB`);
          return {
            ...result,
            manifest: {
              ...result.manifest,
              camera: {
                segments: [
                  {
                    id: 'cam-0',
                    file: 'cam-0.webm',
                    startUs: 0,
                    endUs,
                    width: camera.width,
                    height: camera.height,
                    sizeBytes: blob.size,
                  },
                ],
              },
            },
          };
        }
      } catch (e) {
        logCapture('camera', 'warn', 'face-cam finalize failed — screen take is unaffected', (e as Error).message);
      }
      camera.track.stop();
      return result;
    },
  };
}

let currentHandle: import('@recast/capture').RecorderHandle | null = null;

export function setRendererRecorderHandle(handle: import('@recast/capture').RecorderHandle): void {
  currentHandle = handle;
}

export function rendererRecorderHandle(): import('@recast/capture').RecorderHandle | null {
  return currentHandle;
}

export function releaseRendererRecorder(): void {
  currentHandle = null;
}

/** Full stop flow: flush encoder + segments, attach audio, finalize project. */
export async function stopRecordingFlow(): Promise<string | null> {
  const handle = currentHandle;
  if (!handle) return null;
  const sessionId = useApp.getState().recorderState?.sessionId ?? '';
  try {
    const { manifest, audioFiles } = await handle.stop();
    logCapture('muxer', 'info', `stop flow finalized`, `${manifest.screen.segments.length} segment(s)${manifest.compatibility ? ' · compatibility mode' : ''}`);
    for (const a of audioFiles) {
      try {
        await bridge().invoke('capture:attachAudio', { sessionId, label: a.label, file: a.file, data: a.bytes });
      } catch (ae) {
        logCapture('audio-init', 'warn', `attachAudio failed for ${a.label}`, (ae as Error).message);
      }
    }
  } catch (err) {
    logCapture('pipeline', 'error', 'handle.stop() encountered an error', (err as Error).message);
  } finally {
    releaseRendererRecorder();
  }

  try {
    const { projectId } = await bridge().invoke('recorder:stop', undefined);
    return projectId;
  } catch (e) {
    logCapture('pipeline', 'error', 'bridge recorder:stop failed', (e as Error).message);
    return null;
  }
}
