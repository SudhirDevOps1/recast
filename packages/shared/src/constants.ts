/** Canonical Recast identity values. Do not rename — see AGENTS.md. */
export const PRODUCT_NAME = 'Recast';
export const APP_ID = 'app.recast.desktop';
export const URL_SCHEME = 'recast';
export const PROJECT_EXT = '.recast';
export const STYLE_EXT = '.recaststyle';
export const IPC_VERSION = 2;

export const GITHUB_URL = 'https://github.com/SudhirDevOps1/recast';
export const GITHUB_RELEASES_URL = `${GITHUB_URL}/releases/latest`;

/** Recording pipeline constants. */
export const RECORDING = {
  /** Fragment length on disk. A crash can only lose the current fragment. */
  SEGMENT_MS: 2_000,
  KEYFRAME_INTERVAL_S: 2,
  CURSOR_SAMPLE_HZ: 60,
  INPUT_FLUSH_MS: 100,
  SAMPLE_RATE: 48_000,
  MAX_WIDTH: 3840,
  MAX_HEIGHT: 2160,
  FPS_OPTIONS: [24, 30, 60] as const,
  DROPPED_WARN_PCT: 2,
  DISK_MIN_FREE_MB: 1024,
} as const;

export const COUNTDOWN_OPTIONS = [0, 3, 5, 10] as const;

export const ZOOM = {
  CLUSTER_WINDOW_MS: 1_200,
  CLUSTER_RADIUS_PX: 80,
  PRE_ROLL_MS: 300,
  POST_ROLL_MS: 600,
  /** Follow-cursor dead zone as a fraction of the viewport. */
  FOLLOW_DEAD_ZONE: 0.18,
  /** Max pan speed in source px/s for follow mode. */
  FOLLOW_MAX_PAN_PXPS: 2400,
  INTENSITIES: {
    subtle: { zoom: 1.25, omegaHz: 1.0 },
    balanced: { zoom: 1.6, omegaHz: 1.2 },
    punchy: { zoom: 2.0, omegaHz: 1.5 },
  } as Record<ZoomIntensity, { zoom: number; omegaHz: number }>,
} as const;

export type ZoomIntensity = 'subtle' | 'balanced' | 'punchy';
export const ZOOM_INTENSITIES: ZoomIntensity[] = ['subtle', 'balanced', 'punchy'];

export const AUDIO = {
  TARGET_LUFS: -14,
  GAIN_MIN_DB: -24,
  GAIN_MAX_DB: 12,
  NOISE_GATE_DEFAULT_DB: -48,
  FADE_MAX_MS: 2_000,
} as const;

export const EXPORT_FORMATS = ['mp4', 'webm', 'hevc', 'prores', 'gif'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_RESOLUTIONS = ['720p', '1080p', '1440p', '2160p', 'source'] as const;
export type ExportResolution = (typeof EXPORT_RESOLUTIONS)[number];

/** Average bitrate targets (Mbps) used for size estimates, per height. */
export const ESTIMATE_BITRATE_MBPS: Record<number, number> = {
  720: 6,
  1080: 12,
  1440: 20,
  2160: 40,
};

export const ASPECTS = [
  { id: 'source', label: 'Source' },
  { id: '16:9', label: '16:9 Landscape' },
  { id: '9:16', label: '9:16 Vertical' },
  { id: '1:1', label: '1:1 Square' },
  { id: '4:5', label: '4:5 Portrait' },
  { id: '21:9', label: '21:9 Wide' },
  { id: 'custom', label: 'Custom' },
] as const;
export type AspectId = (typeof ASPECTS)[number]['id'];

export const CURSOR_LOOKS = ['native', 'dot', 'pointer', 'circle'] as const;
export type CursorLook = (typeof CURSOR_LOOKS)[number];

export const CAPTION_STYLES = ['clean', 'bold', 'boxed', 'pill', 'karaoke'] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export const DEFAULT_HOTKEYS = {
  recordStop: 'CommandOrControl+Alt+R',
  pauseResume: 'CommandOrControl+Alt+P',
} as const;

export const TIME = {
  /** Editor autosave interval in ms. */
  AUTOSAVE_MS: 5_000,
  /** ffmpeg -version validation timeout. */
  VERSION_TIMEOUT_MS: 2_000,
} as const;
