import { bridge } from './bridge';
import { useApp } from '../state/stores';
import { startRecording } from '@recast/capture';
import type { CaptureHost } from '@recast/capture';

/**
 * Wires the capture package to the main-process host and starts the pipeline.
 * Called after countdown; the window ref comes from the app store.
 */

export const captureHost: CaptureHost = {
  createSession: (sessionId, manifest) => bridge().invoke('capture:createSession', { sessionId, manifest } as never) as never,
  writeSegment: async (sessionId, file, data) => {
    await bridge().invoke('capture:writeSegment', { sessionId, file, data } as never);
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

/** Maps raw getDisplayMedia rejections to messages a user can act on. */
function friendlyDisplayMediaError(e: unknown): Error {
  const name = (e as DOMException)?.name ?? '';
  if (name === 'NotAllowedError') {
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
  return e instanceof Error ? e : new Error(String(e));
}

async function requestDisplayMedia(frameRate: number, withAudio: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate },
      audio: withAudio,
    });
  } catch (e) {
    if (!withAudio) throw friendlyDisplayMediaError(e);
    // Some platforms reject audio-constrained display requests outright —
    // recording must still work, so retry video-only.
    try {
      return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate } });
    } catch {
      throw friendlyDisplayMediaError(e);
    }
  }
}

export async function startRecordingFlow({ sessionId, startEpochMs }: FlowArgs): Promise<void> {
  const opts = (await import('../state/stores')).useRecorder.getState();
  const app = useApp.getState();
  const showToast = app.showToast;

  // 1) Ask the main process for the display stream. The display-media handler
  // registered at bootstrap supplies the source chosen in the picker.
  const wantSystemAudio = Boolean(opts.systemAudio && app.platform?.capabilities.systemAudio);
  const displayStream = await requestDisplayMedia(opts.fps, wantSystemAudio);
  const videoTrack = displayStream.getVideoTracks()[0];
  void videoTrack;
  if (!videoTrack) throw new Error('No screen source was returned.');

  // 2) Mic stream.
  const audioSources: Array<{ label: 'mic' | 'system'; stream: MediaStream }> = [];
  if (opts.micEnabled) {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioSources.push({ label: 'mic', stream: mic });
    } catch {
      showToast('Microphone unavailable — recording continues without mic audio.', 'error');
    }
  }
  const systemTrack = displayStream.getAudioTracks()[0];
  if (opts.systemAudio && systemTrack) {
    audioSources.push({ label: 'system', stream: new MediaStream([systemTrack]) });
  }

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
        useApp.getState().setRecorderState({
          phase: stats.phase,
          sessionId,
          elapsedUs: stats.elapsedUs,
          bytes: stats.bytes,
          droppedFrames: stats.droppedFrames,
          totalFrames: stats.totalFrames,
          micMeterDb: null,
          diskFreeMb: app.platform ? -1 : -1,
        });
      },
      onError: (message) => showToast(message, 'error'),
    },
  );

  (await import('../state/stores')).useApp.setState({ recorderState: {
    phase: 'recording',
    sessionId,
    elapsedUs: 0,
    bytes: 0,
    droppedFrames: 0,
    totalFrames: 0,
    micMeterDb: null,
    diskFreeMb: -1,
  } });

  // Expose the handle to the main-process stop flow via the app context
  // mirrored in a module-level singleton (the main process stops through IPC
  // → recorder:stop → main-side handle; the renderer stop is driven by the
  // same handle reference).
  setRendererRecorderHandle(handle);
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
  const { manifest, audioFiles } = await handle.stop();
  for (const a of audioFiles) {
    await bridge().invoke('capture:attachAudio', { sessionId, label: a.label, file: a.file, data: a.bytes });
  }
  releaseRendererRecorder();
  const { projectId } = await bridge().invoke('recorder:stop', undefined);
  void manifest;
  return projectId;
}
