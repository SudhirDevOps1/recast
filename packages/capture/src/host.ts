import type { InputEvent, SessionManifest } from '@recast/shared';

/**
 * The capture package runs in the renderer and never touches Node APIs.
 * Everything disk-side goes through this host interface, implemented by the
 * preload bridge and fulfilled by the main process with atomic writes.
 */
export interface CaptureHost {
  /** Persist one finalized segment (`.part` → rename under the hood). */
  writeSegment(sessionId: string, file: string, data: ArrayBuffer): Promise<void>;
  /** Append batched input events to `cursor.jsonl` (fsynced by the main process). */
  appendInputEvents(sessionId: string, events: InputEvent[]): Promise<void>;
  /** Atomically replace the session manifest. */
  writeManifest(sessionId: string, manifest: SessionManifest): Promise<void>;
  /** Register the session directory before the first frame lands. */
  createSession(sessionId: string, manifest: SessionManifest): Promise<void>;
  /** Append bytes to one growing file (compatibility-mode WebM). */
  appendSegmentFile(sessionId: string, file: string, data: ArrayBuffer): Promise<void>;
  /** Disk space under the recordings dir, in MB. */
  diskFreeMb(): Promise<number>;
}

export interface RecorderStats {
  phase: 'recording' | 'paused' | 'stopping';
  elapsedUs: number;
  bytes: number;
  droppedFrames: number;
  totalFrames: number;
  segmentCount: number;
  /** Live mic peak (0..1) from the AudioWorklet tap; null when no mic. */
  micPeak?: number | null;
  /** True when recording runs in MediaRecorder compatibility mode. */
  compatibilityMode?: boolean;
}

export interface RecorderCallbacks {
  onStats: (stats: RecorderStats) => void;
  onError: (message: string) => void;
  /** Structured capture diagnostics (stage, message, optional detail). */
  onLog?: (stage: string, message: string, detail?: string) => void;
  /** Fires whenever a segment file is fully on disk — used for the tray size. */
  onSegmentWritten?: (file: string, sizeBytes: number) => void;
}

export interface StartOptions {
  fps: 24 | 30 | 60;
  quality: 'source' | '1080p' | '1440p' | '2160p';
  /** Crop rect in display pixels (area selection); null records the full source. */
  cropRect: { x: number; y: number; w: number; h: number } | null;
  sessionId: string;
  /** Epoch anchor shared with the main-process cursor sampler. */
  startEpochMs: number;
}
