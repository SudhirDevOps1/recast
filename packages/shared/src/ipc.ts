import { z } from 'zod';
import { IPC_VERSION } from './constants';
import { RecastProjectSchema, type RecastProject } from './project';
import { StylePresetSchema, type StylePreset } from './style';

// ---------------------------------------------------------------------------
// Shared payload schemas
// ---------------------------------------------------------------------------

export const SettingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).default('dark'),
  language: z.enum(['en', 'hi']).default('en'),
  launchAtLogin: z.boolean().default(false),
  autoCheckUpdates: z.boolean().default(false),
  updateChannel: z.enum(['stable', 'beta']).default('stable'),
  exportDir: z.string().default(''),
  countdownSec: z.union([z.literal(0), z.literal(3), z.literal(5), z.literal(10)]).default(3),
  preferHardwareEncoder: z.boolean().default(true),
  defaultPresetId: z.string().default('clean-dark'),
  hotkeyRecordStop: z.string().default('CommandOrControl+Alt+R'),
  hotkeyPauseResume: z.string().default('CommandOrControl+Alt+P'),
  showKeystrokeHud: z.boolean().default(false),
  /** Set once the first-run onboarding has been completed or dismissed —
   *  without persisting it the Welcome dialog would reopen on every launch
   *  and its modal overlay blocks all other clicks until dismissed. */
  firstRunDone: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const PlatformInfoSchema = z.object({
  platform: z.enum(['win32', 'darwin', 'linux']),
  arch: z.string(),
  osVersion: z.string(),
  sessionType: z.enum(['x11', 'wayland', 'windows', 'macos']).nullable(),
  dataDir: z.string(),
  isPortable: z.boolean(),
  versions: z.object({
    app: z.string(),
    electron: z.string(),
    chrome: z.string(),
    node: z.string(),
  }),
  capabilities: z.object({
    systemAudio: z.boolean(),
    systemAudioNote: z.string(),
    cursorTracking: z.boolean(),
    globalHotkeys: z.boolean(),
    areaSelection: z.boolean(),
    windowCapture: z.boolean(),
  }),
});
export type PlatformInfo = z.infer<typeof PlatformInfoSchema>;

export const SourceIdSchema = z.string().min(1);
export type SourceId = string;

export const ScreenSourceSchema = z.object({
  id: SourceIdSchema,
  displayId: z.number(),
  name: z.string(),
  width: z.number(),
  height: z.number(),
  scaleFactor: z.number(),
  isPrimary: z.boolean(),
  /** Live desktopCapturer preview (PNG data URL), null when unavailable. */
  thumbnailDataUrl: z.string().nullable(),
});
export type ScreenSource = z.infer<typeof ScreenSourceSchema>;

export const WindowSourceSchema = z.object({
  id: SourceIdSchema,
  name: z.string(),
  app: z.string(),
  width: z.number(),
  height: z.number(),
  /** Live desktopCapturer preview (PNG data URL), null when unavailable. */
  thumbnailDataUrl: z.string().nullable(),
});
export type WindowSource = z.infer<typeof WindowSourceSchema>;

export const DeviceInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  default: z.boolean(),
});
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

export const ListSourcesResponseSchema = z.object({
  screens: z.array(ScreenSourceSchema),
  windows: z.array(WindowSourceSchema),
  mics: z.array(DeviceInfoSchema),
  cameras: z.array(DeviceInfoSchema),
});
export type ListSourcesResponse = z.infer<typeof ListSourcesResponseSchema>;

export const RecorderStartRequestSchema = z.object({
  screenId: z.string().optional(),
  windowId: z.string().optional(),
  area: z
    .object({ displayId: z.number(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .optional(),
  micDeviceId: z.string().nullable().default(null),
  systemAudio: z.boolean().default(false),
  cameraDeviceId: z.string().nullable().default(null),
  countdownSec: z.union([z.literal(0), z.literal(3), z.literal(5), z.literal(10)]).default(3),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(30),
  quality: z.enum(['source', '1080p', '1440p', '2160p']).default('source'),
});
export type RecorderStartRequest = z.infer<typeof RecorderStartRequestSchema>;

export const RecorderStateSchema = z.object({
  phase: z.enum(['idle', 'countdown', 'recording', 'paused', 'stopping']),
  sessionId: z.string().nullable(),
  elapsedUs: z.number(),
  bytes: z.number(),
  droppedFrames: z.number(),
  totalFrames: z.number(),
  micMeterDb: z.number().nullable(),
  diskFreeMb: z.number(),
});
export type RecorderState = z.infer<typeof RecorderStateSchema>;

export const ProjectMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  durationUs: z.number(),
  width: z.number(),
  height: z.number(),
  hasCaptions: z.boolean(),
  thumbnailFile: z.string().nullable(),
});
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;

export const ExportRunRequestSchema = z.object({
  projectId: z.string(),
  format: z.enum(['mp4', 'webm', 'hevc', 'prores', 'gif']),
  resolution: z.enum(['720p', '1080p', '1440p', '2160p', 'source']),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  destination: z.string(),
});
export type ExportRunRequest = z.infer<typeof ExportRunRequestSchema>;

export const ExportProgressEventSchema = z.object({
  exportId: z.string(),
  frame: z.number(),
  totalFrames: z.number(),
  bytesWritten: z.number(),
  encodeFps: z.number(),
  stage: z.enum(['rendering', 'muxing', 'verifying', 'done', 'cancelled', 'failed']),
  usedPath: z.string(),
  error: z.string().optional(),
});
export type ExportProgressEvent = z.infer<typeof ExportProgressEventSchema>;

export const FfmpegStatusSchema = z.object({
  available: z.boolean(),
  path: z.string().nullable(),
  ffprobePath: z.string().nullable(),
  version: z.string().nullable(),
  source: z.enum(['env', 'bundled', 'user', 'system', 'none']),
  canInstall: z.boolean(),
});
export type FfmpegStatus = z.infer<typeof FfmpegStatusSchema>;

export const CaptionModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  sizeMb: z.number(),
  downloaded: z.boolean(),
  language: z.enum(['en', 'multi']),
});
export type CaptionModel = z.infer<typeof CaptionModelSchema>;

export const PermissionStatusSchema = z.object({
  screen: z.enum(['granted', 'denied', 'not-determined', 'unsupported']),
  microphone: z.enum(['granted', 'denied', 'not-determined', 'unsupported']),
  camera: z.enum(['granted', 'denied', 'not-determined', 'unsupported']),
});
export type PermissionStatus = z.infer<typeof PermissionStatusSchema>;

/** One structured capture-diagnostic entry (NDJSON in capture.log). */
export const CaptureLogEntrySchema = z.object({
  ts: z.number(),
  stage: z.string().min(1).max(64),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().max(500),
  detail: z.string().max(800).optional(),
});
export type CaptureLogEntry = z.infer<typeof CaptureLogEntrySchema>;

// ---------------------------------------------------------------------------
// Request/response contracts. Both ends validate with these schemas.
// ---------------------------------------------------------------------------

export interface IpcContractBase {
  req: z.ZodTypeAny;
  res: z.ZodTypeAny;
}

function def(req: z.ZodTypeAny, res: z.ZodTypeAny): IpcContractBase {
  return { req, res };
}

export const IPC = {
  'app:getPlatformInfo': def(z.void(), PlatformInfoSchema),
  'app:getSettings': def(z.void(), SettingsSchema),
  'app:setSettings': def(SettingsSchema.partial(), SettingsSchema),
  'app:revealInFolder': def(z.object({ path: z.string().min(1) }), z.void()),
  'app:openUrl': def(z.object({ url: z.string().url() }), z.void()),

  'permissions:get': def(z.void(), PermissionStatusSchema),
  'permissions:request': def(z.object({ kind: z.enum(['microphone', 'camera']) }), PermissionStatusSchema),
  'permissions:openSystemSettings': def(
    z.object({ kind: z.enum(['screen', 'microphone', 'camera']) }),
    z.void(),
  ),

  'sources:list': def(z.void(), ListSourcesResponseSchema),
  'area:pick': def(z.object({ displayId: z.number() }), z.object({ rect: z.object({
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  }).nullable() })),
  'area:selected': def(z.object({ rect: z.object({
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  }).nullable() }), z.void()),

  'recorder:start': def(RecorderStartRequestSchema, z.object({ sessionId: z.string(), startEpochMs: z.number() })),
  'recorder:pause': def(z.void(), z.void()),
  'recorder:resume': def(z.void(), z.void()),
  'recorder:stop': def(z.void(), z.object({ projectId: z.string().nullable() })),
  'recorder:triggerStop': def(z.void(), z.void()),
  'recorder:minimizeMainWindow': def(z.void(), z.void()),
  'recorder:getState': def(z.void(), RecorderStateSchema),

  /** Internal capture-host channels (renderer → main disk writes). */
  'capture:createSession': def(z.object({ sessionId: z.string(), manifest: z.unknown() }), z.void()),
  'capture:writeSegment': def(z.object({ sessionId: z.string(), file: z.string(), data: z.unknown() }), z.void()),
  'capture:appendInput': def(z.object({ sessionId: z.string(), events: z.array(z.unknown()) }), z.void()),
  'capture:writeManifest': def(z.object({ sessionId: z.string(), manifest: z.unknown() }), z.void()),
  'capture:attachAudio': def(z.object({ sessionId: z.string(), label: z.string(), file: z.string(), data: z.unknown() }), z.void()),
  'capture:diskFreeMb': def(z.void(), z.number()),
  'capture:appendSegmentFile': def(z.object({ sessionId: z.string(), file: z.string(), data: z.unknown() }), z.void()),
  'capture:appendLog': def(z.object({ entries: z.array(CaptureLogEntrySchema).max(200) }), z.void()),
  'capture:lastDisplayDeny': def(
    z.void(),
    z.object({ reason: z.string(), detail: z.string(), at: z.number() }).nullable(),
  ),
  'capture:readCursor': def(
    z.object({ sessionId: z.string() }),
    z.object({
      samples: z.array(z.unknown()),
      clicks: z.array(z.unknown()),
      keys: z.array(z.unknown()).optional(),
    }),
  ),
  'capture:readCaptions': def(z.object({ path: z.string() }), z.string().nullable()),
  'capture:appendAnnotation': def(z.object({ sessionId: z.string(), annotation: z.unknown() }), z.void()),

  /** Export host channels (renderer renders/encodes; main writes disk). */
  'export:beginChunked': def(z.object({ exportId: z.string(), destination: z.string() }), z.void()),
  'export:writeChunkAt': def(z.object({ exportId: z.string(), position: z.number(), data: z.unknown() }), z.void()),
  'export:finalize': def(z.object({ exportId: z.string() }), z.void()),
  'export:discard': def(z.object({ exportId: z.string() }), z.void()),
  'export:readFile': def(z.object({ path: z.string() }), z.unknown()),
  'export:tempFrameDir': def(z.void(), z.string()),
  'export:writeFrameImage': def(z.object({ dir: z.string(), index: z.number(), png: z.unknown() }), z.void()),
  'export:cleanupDir': def(z.object({ dir: z.string() }), z.void()),
  'export:ffmpegGif': def(z.object({ frameDir: z.string(), fps: z.number(), width: z.number(), outFile: z.string(), loop: z.number().optional() }), z.boolean()),
  'export:ffmpegProres': def(z.object({ frameDir: z.string(), fps: z.number(), outFile: z.string() }), z.boolean()),
  'export:ffmpegLoudnorm': def(z.object({ file: z.string(), targetLufs: z.number() }), z.boolean()),
  'export:probeDuration': def(z.object({ file: z.string() }), z.number().nullable()),

  'library:list': def(z.void(), z.array(ProjectMetaSchema)),
  'library:open': def(z.object({ id: z.string() }), RecastProjectSchema.nullable()),
  'library:delete': def(z.object({ id: z.string() }), z.void()),
  'library:createSample': def(z.void(), z.object({ projectId: z.string().nullable() })),
  'library:importMedia': def(z.object({ path: z.string() }), z.object({ projectId: z.string().nullable(), error: z.string().optional() })),

  'projects:save': def(z.object({ project: RecastProjectSchema }), z.void()),
  'projects:generateThumbnails': def(
    z.object({ projectId: z.string() }),
    z.object({ thumbnails: z.array(z.object({ segmentId: z.string(), dataUrl: z.string() })) }),
  ),
  'projects:waveform': def(
    z.object({ audioFile: z.string() }),
    z.object({ peaks: z.array(z.number()), durationUs: z.number() }),
  ),

  'styles:import': def(z.void(), z.object({ preset: StylePresetSchema.nullable(), error: z.string().optional() })),
  'styles:export': def(z.object({ preset: StylePresetSchema, targetPath: z.string().optional() }), z.object({ path: z.string().nullable() })),
  /** Pick a background image and copy it into the session dir (additive). */
  'styles:pickBackgroundImage': def(
    z.object({ projectId: z.string() }),
    z.object({ path: z.string().nullable(), error: z.string().optional() }),
  ),

  'export:estimate': def(
    z.object({ projectId: z.string(), format: z.enum(['mp4', 'webm', 'hevc', 'prores', 'gif']), resolution: z.enum(['720p', '1080p', '1440p', '2160p', 'source']), fps: z.number() }),
    z.object({ durationUs: z.number(), estimatedBytes: z.number(), estimatedSeconds: z.number() }),
  ),
  'export:run': def(ExportRunRequestSchema, z.object({ exportId: z.string() })),
  'export:cancel': def(z.object({ exportId: z.string() }), z.void()),
  'export:suggestFilename': def(
    z.object({ projectId: z.string(), format: z.enum(['mp4', 'webm', 'hevc', 'prores', 'gif']) }),
    z.object({ name: z.string(), dir: z.string(), exists: z.boolean() }),
  ),
  'export:pickDestination': def(
    z.object({ defaultName: z.string() }),
    z.object({ path: z.string().nullable() }),
  ),

  'captions:models': def(z.void(), z.array(CaptionModelSchema)),
  'captions:downloadModel': def(z.object({ id: z.string() }), z.void()),
  'captions:transcribe': def(
    z.object({ projectId: z.string(), modelId: z.string(), language: z.string().default('auto') }),
    z.object({ ok: z.boolean(), error: z.string().optional() }),
  ),
  'captions:import': def(z.object({ projectId: z.string() }), z.object({ ok: z.boolean(), error: z.string().optional() })),
  'captions:exportFile': def(
    z.object({ projectId: z.string(), kind: z.enum(['srt', 'vtt']) }),
    z.object({ path: z.string().nullable() }),
  ),

  'ffmpeg:status': def(z.void(), FfmpegStatusSchema),
  'ffmpeg:install': def(z.void(), z.object({ started: z.boolean() })),

  'diagnostics:bundle': def(z.void(), z.string()),
  'diagnostics:copy': def(z.void(), z.void()),

  'updater:check': def(z.void(), z.object({ available: z.boolean(), version: z.string().nullable() })),
  'updater:download': def(z.void(), z.void()),
  'updater:install': def(z.void(), z.object({ started: z.boolean(), blockedReason: z.string().nullable() })),
} satisfies Record<string, IpcContractBase>;

export type IpcContract = typeof IPC;
export type IpcChannel = keyof IpcContract & string;
export type IpcRequest<C extends IpcChannel> = typeof IPC[C] extends { req: infer R } ? (R extends z.ZodType<infer T> ? T : never) : never;
export type IpcResponse<C extends IpcChannel> = typeof IPC[C] extends { res: infer R } ? (R extends z.ZodType<infer T> ? T : never) : never;

// ---------------------------------------------------------------------------
// Main → renderer events
// ---------------------------------------------------------------------------

export const EVENTS = {
  'recorder:state': RecorderStateSchema,
  'export:progress': ExportProgressEventSchema,
  'whisper:progress': z.object({
    projectId: z.string(),
    stage: z.enum(['extracting', 'transcribing', 'writing', 'done', 'failed']),
    pct: z.number().min(0).max(100),
    error: z.string().optional(),
  }),
  'whisper:download': z.object({
    modelId: z.string(),
    pct: z.number().min(0).max(100),
    done: z.boolean(),
    error: z.string().optional(),
  }),
  'ffmpeg:download': z.object({ pct: z.number(), done: z.boolean(), error: z.string().optional() }),
  'updater:state': z.object({
    phase: z.enum(['idle', 'checking', 'available', 'downloading', 'ready', 'error']),
    version: z.string().nullable(),
    message: z.string().nullable(),
  }),
  'session:crashed': z.object({ sessionId: z.string() }),
  'recorder:requestStop': z.void(),
  'recorder:hotkey': z.object({ action: z.enum(['toggle-record', 'toggle-pause']) }),
  'app:open-project': z.object({ 0: z.string() }).or(z.string()),
  'app:export-project': z.object({ 0: z.string() }).or(z.string()),
  'app:about': z.void(),
} satisfies Record<string, z.ZodTypeAny>;

export type EventContract = typeof EVENTS;
export type EventChannel = keyof EventContract & string;
export type EventPayload<C extends EventChannel> = typeof EVENTS[C] extends z.ZodType<infer T> ? T : never;

/** Used by unit tests and the preload bridge to assert the contract version. */
export function assertIpcVersion(version: number): void {
  if (version !== IPC_VERSION) {
    throw new Error(`IPC contract mismatch: expected ${IPC_VERSION}, got ${version}`);
  }
}

export type Project = RecastProject;
export type { StylePreset };
