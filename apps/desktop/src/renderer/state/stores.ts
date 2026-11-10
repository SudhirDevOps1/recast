import { create } from 'zustand';
import type { Settings, PlatformInfo, ProjectMeta, RecastProject, RecorderState, FfmpegStatus } from '@recast/shared';
import { bridge } from '../lib/bridge';

interface AppStore {
  settings: Settings;
  platform: PlatformInfo | null;
  ffmpeg: FfmpegStatus | null;
  library: ProjectMeta[];
  route: 'library' | 'record' | 'editor' | 'export' | 'settings';
  projectId: string | null;
  recorderState: RecorderState | null;
  toast: { message: string; tone: 'info' | 'error' | 'success'; action?: ToastAction } | null;
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  refreshPlatform: () => Promise<void>;
  refreshFfmpeg: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  navigate: (route: AppStore['route'], projectId?: string) => void;
  setRecorderState: (s: RecorderState | null) => void;
  showToast: (message: string, tone?: 'info' | 'error' | 'success', action?: ToastAction) => void;
}

/** A button rendered inside a toast (e.g. "Open permissions" on capture denials). */
export interface ToastAction {
  label: string;
  run: () => void;
}

export const useApp = create<AppStore>((set, get) => ({
  settings: {
    theme: 'dark',
    language: 'en',
    launchAtLogin: false,
    autoCheckUpdates: false,
    updateChannel: 'stable',
    exportDir: '',
    countdownSec: 3,
    preferHardwareEncoder: true,
    defaultPresetId: 'clean-dark',
    hotkeyRecordStop: 'CommandOrControl+Alt+R',
    hotkeyPauseResume: 'CommandOrControl+Alt+P',
    showKeystrokeHud: false,
    firstRunDone: false,
  },
  platform: null,
  ffmpeg: null,
  library: [],
  route: 'library',
  projectId: null,
  recorderState: null,
  toast: null,

  setSettings: async (patch) => {
    const next = await bridge().invoke('app:setSettings', patch);
    set({ settings: next });
    document.documentElement.dataset.theme = next.theme === 'system' ? 'dark' : next.theme;
  },
  refreshPlatform: async () => {
    set({ platform: await bridge().invoke('app:getPlatformInfo', undefined) });
  },
  refreshFfmpeg: async () => {
    set({ ffmpeg: await bridge().invoke('ffmpeg:status', undefined) });
  },
  refreshLibrary: async () => {
    set({ library: await bridge().invoke('library:list', undefined) });
  },
  navigate: (route, projectId) => set({ route, projectId: projectId ?? get().projectId }),
  setRecorderState: (s) => set({ recorderState: s }),
  showToast: (message, tone = 'info', action) => {
    set({ toast: { message, tone, action } });
    setTimeout(() => {
      // Only clear if this toast is still the newest one.
      const cur = get().toast;
      if (cur?.message === message) set({ toast: null });
    }, action ? 8_000 : 4_000);
  },
}));

// ---------------- Editor store (one project open at a time) ----------------

export interface EditorStore {
  project: RecastProject | null;
  currentTimeUs: number;
  playing: boolean;
  zoomTrackReady: boolean;
  /** Timeline selection: the clip being inspected (null = none). */
  selectedClipId: string | null;
  setSelectedClip: (id: string | null) => void;
  /** Undo/redo stacks of structural snapshots (capped at 50). */
  undoStack: RecastProject[];
  redoStack: RecastProject[];
  setProject: (p: RecastProject | null) => void;
  /** Commit with one undo step. */
  commit: (next: RecastProject) => void;
  /** Begin a drag gesture: push one undo entry for everything until endDrag. */
  beginDrag: () => void;
  /** Update the project during a drag WITHOUT pushing undo (call beginDrag first). */
  patch: (next: RecastProject) => void;
  undo: () => void;
  redo: () => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  /** Debounced autosave — invoked 5 s after the last edit. */
  save: () => Promise<void>;
}

let saveTimer: NodeJS.Timeout | null = null;

export const useEditor = create<EditorStore>((set, get) => ({
  project: null,
  currentTimeUs: 0,
  playing: false,
  zoomTrackReady: false,
  selectedClipId: null,
  setSelectedClip: (id) => set({ selectedClipId: id }),
  undoStack: [],
  redoStack: [],
  setProject: (p) => set({ project: p, currentTimeUs: 0, undoStack: [], redoStack: [], selectedClipId: null }),
  commit: (next) => {
    const { project, undoStack } = get();
    if (!project) return;
    const undo = [...undoStack.slice(-49), project];
    set({ project: next, undoStack: undo, redoStack: [] });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().save(), 5_000);
  },
  beginDrag: () => {
    const { project, undoStack } = get();
    if (!project) return;
    set({ undoStack: [...undoStack.slice(-49), project], redoStack: [] });
  },
  patch: (next) => {
    if (!get().project) return;
    set({ project: next });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().save(), 5_000);
  },
  undo: () => {
    const { project, undoStack, redoStack } = get();
    if (!project || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1]!;
    set({
      project: prev,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack.slice(-49), project],
    });
  },
  redo: () => {
    const { project, undoStack, redoStack } = get();
    if (!project || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    set({
      project: next,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack.slice(-49), project],
    });
  },
  setTime: (t) => set({ currentTimeUs: Math.max(0, t) }),
  setPlaying: (p) => set({ playing: p }),
  save: async () => {
    const { project } = get();
    if (!project) return;
    await bridge().invoke('projects:save', { project });
  },
}));

// ---------------- Recorder store ----------------

export interface RecorderStore {
  micEnabled: boolean;
  systemAudio: boolean;
  cameraEnabled: boolean;
  /** Selected microphone device id (null = system default). */
  micDeviceId: string | null;
  /** Selected camera device id (null = system default). */
  cameraDeviceId: string | null;
  countdownSec: 0 | 3 | 5 | 10;
  fps: 24 | 30 | 60;
  quality: 'source' | '1080p' | '1440p' | '2160p';
  selectedScreenId: string | null;
  selectedWindowId: string | null;
  areaRect: { x: number; y: number; w: number; h: number } | null;
  set: (patch: Partial<Omit<RecorderStore, 'set'>>) => void;
}

export const useRecorder = create<RecorderStore>((set) => ({
  micEnabled: false,
  systemAudio: false,
  cameraEnabled: false,
  micDeviceId: null,
  cameraDeviceId: null,
  countdownSec: 3,
  fps: 30,
  quality: 'source',
  selectedScreenId: null,
  selectedWindowId: null,
  areaRect: null,
  set: (patch) => set(patch),
}));
