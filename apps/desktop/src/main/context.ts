/**
 * Shared singletons for the main process, created once at app start.
 * Kept in one module to avoid circular imports between services.
 */
import type { LibraryStore } from './store';
import type { SessionService } from './sessions';
import type { InputSampler } from './input-sampler';
import type { Settings, RecorderStartRequest } from '@recast/shared';
import type { RecorderHandle } from '@recast/capture';

export interface AppContext {
  library: LibraryStore;
  sessions: SessionService;
  settings: Settings;
  mainWindow: Electron.BrowserWindow | null;
  toolbarWindow: Electron.BrowserWindow | null;
  areaWindow: Electron.BrowserWindow | null;
  recorderHandle: RecorderHandle | null;
  inputSampler: InputSampler | null;
  activeSessionId: string | null;
  sessionStartEpochMs: number;
  recorderRequest: RecorderStartRequest | null;
  /** Scale factor (DIP → physical px) of the display granted to getDisplayMedia.
   *  Stamped into the session manifest so cursor coords can be converted to
   *  video pixel space. Null until a display-media grant happens this run. */
  activeDisplayScaleFactor: number | null;
  lastMicMeterDb: number | null;
  lastDiskFreeMb: number;
  activeExportIds: Set<string>;
}

let ctx: AppContext | null = null;

export function setContext(c: AppContext): void {
  ctx = c;
}

export function context(): AppContext {
  if (!ctx) throw new Error('App context not initialized');
  return ctx;
}

export function settingsStore(): Settings {
  return context().settings;
}
