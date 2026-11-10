import { z } from 'zod';
import { StylePresetSchema } from './style';

export const AnnotationKind = z.enum([
  'pen',
  'highlighter',
  'arrow',
  'rect',
  'ellipse',
  'text',
  'spotlight',
  'click',
]);
export type AnnotationKind = z.infer<typeof AnnotationKind>;

/** Annotations are stored in source (video pixel) coordinates with timeline timing. */
export const AnnotationSchema = z.object({
  id: z.string(),
  kind: AnnotationKind,
  tInUs: z.number().min(0),
  tOutUs: z.number().min(0),
  color: z.string(),
  /** Stroke width in source px (pen/highlighter/arrow/rect/ellipse). */
  widthPx: z.number().optional(),
  /** Poly-line for pen/highlighter, [x, y] pairs in source px. */
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
  rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  text: z.string().max(500).optional(),
  fontSizePx: z.number().optional(),
});
export type Annotation = z.infer<typeof AnnotationSchema>;

export const RedactionSchema = z.object({
  id: z.string(),
  tInUs: z.number().min(0),
  tOutUs: z.number().min(0),
  mode: z.enum(['blur', 'pixelate']),
  /** Static rectangle in source px. */
  rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  /** Track cursor position when true (rect follows the cursor). */
  tracked: z.boolean().default(false),
});
export type Redaction = z.infer<typeof RedactionSchema>;

export const SegmentSchema = z.object({
  id: z.string(),
  file: z.string(),
  /** Monotonic capture timestamps in microseconds (pause time excluded). */
  startUs: z.number().min(0),
  endUs: z.number().min(0),
  width: z.number(),
  height: z.number(),
  sizeBytes: z.number().min(0),
});
export type Segment = z.infer<typeof SegmentSchema>;

/** Intro animation applied to a clip when the playhead enters it. */
export const TransitionKind = z.enum(['none', 'fade', 'slide-left', 'slide-up', 'zoom']);
export type TransitionKind = z.infer<typeof TransitionKind>;

export const ClipSchema = z.object({
  id: z.string(),
  segmentId: z.string(),
  track: z.enum(['screen']),
  sourceInUs: z.number().min(0),
  sourceOutUs: z.number().min(0),
  timelineInUs: z.number().min(0),
  speed: z.number().min(0.25).max(4).default(1),
  /** Motion intro played at the start of this clip (screen-studio style). */
  transitionIn: TransitionKind.default('none'),
  /** Intro duration in ms (clamped 120–1500). */
  transitionMs: z.number().min(120).max(1500).default(450),
});
export type Clip = z.infer<typeof ClipSchema>;

export const ZoomKeyframeSchema = z.object({
  id: z.string(),
  tUs: z.number().min(0),
  zoom: z.number().min(1).max(4),
  /** Anchor in source coordinates. */
  cx: z.number(),
  cy: z.number(),
  /**
   * Approach curve toward this keyframe. 'out' is the default silky spring;
   * 'linear'/'in'/'inout' are cubic ramps, 'pop' overshoots slightly, 'hold'
   * snaps at the keyframe time.
   */
  ease: z.enum(['in', 'out', 'hold', 'linear', 'inout', 'pop']).default('out'),
});
export type ZoomKeyframe = z.infer<typeof ZoomKeyframeSchema>;

/** Project-level motion: fade the whole composition in/out. */
export const AnimationSchema = z.object({
  fadeInMs: z.number().min(0).max(3_000).default(0),
  fadeOutMs: z.number().min(0).max(3_000).default(0),
});
export type Animation = z.infer<typeof AnimationSchema>;

export const AudioEditsSchema = z.object({
  gainDb: z.number().min(-24).max(12).default(0),
  fadeInMs: z.number().min(0).max(2000).default(0),
  fadeOutMs: z.number().min(0).max(2000).default(0),
  noiseGateDb: z.number().optional(),
  normalizeLufs: z.boolean().default(false),
  duckMusic: z.boolean().default(false),
});
export type AudioEdits = z.infer<typeof AudioEditsSchema>;

export const CaptionsSchema = z.object({
  file: z.string(),
  language: z.string(),
  /** 'auto' means language auto-detect produced this value. */
  source: z.enum(['whisper', 'import', 'manual']),
});
export type CaptionsMeta = z.infer<typeof CaptionsSchema>;

export const RecastProjectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string().min(1).max(120),
  createdAt: z.string(),
  updatedAt: z.string(),
  media: z.object({
    /** Absolute path of the recording session directory on this machine. */
    dir: z.string(),
    width: z.number(),
    height: z.number(),
    fps: z.number(),
    segments: z.array(SegmentSchema),
    audio: z.object({ file: z.string(), startUs: z.number(), endUs: z.number() }).nullable(),
    cursor: z
      .object({ file: z.string().default('cursor.jsonl'), available: z.boolean() })
      .nullable(),
    /** Face-cam segment when the session recorded one (single WebM covering
     *  the capture clock from session start). Null for older sessions. */
    camera: SegmentSchema.nullable().default(null),
  }),
  timeline: z.object({
    clips: z.array(ClipSchema),
    durationUs: z.number().min(0),
  }),
  zoom: z.object({
    enabled: z.boolean().default(true),
    mode: z.enum(['auto', 'manual', 'follow']).default('auto'),
    intensity: z.enum(['subtle', 'balanced', 'punchy']).default('balanced'),
    /** Auto-generated keyframes (cached result of computeAutoZoom). */
    autoKeyframes: z.array(ZoomKeyframeSchema).default([]),
    manualKeyframes: z.array(ZoomKeyframeSchema).default([]),
  }),
  style: StylePresetSchema,
  annotations: z.array(AnnotationSchema).default([]),
  redactions: z.array(RedactionSchema).default([]),
  audioEdits: AudioEditsSchema.default({}),
  /** Whole-video motion (fades). Defaults keep old projects rendering as before. */
  animation: AnimationSchema.default({ fadeInMs: 0, fadeOutMs: 0 }),
  captions: CaptionsSchema.nullable().default(null),
});
export type RecastProject = z.infer<typeof RecastProjectSchema>;

export const InputEventType = z.enum(['move', 'down', 'up', 'wheel', 'key']);
export type InputEventType = z.infer<typeof InputEventType>;

/** One row of `cursor.jsonl` — sampled at 60 Hz, written batched and flushed. */
export const InputEventSchema = z.object({
  /** Microseconds on the capture clock (pause time excluded). */
  tUs: z.number(),
  type: InputEventType,
  x: z.number().optional(),
  y: z.number().optional(),
  /** Logical display the coordinates belong to. */
  displayId: z.number().optional(),
  button: z.enum(['left', 'right', 'middle']).optional(),
  wheelDy: z.number().optional(),
  key: z.string().optional(),
});
export type InputEvent = z.infer<typeof InputEventSchema>;

/** `session.json` — crash-safe manifest written next to the segments. */
export const SessionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  startedAtEpochMs: z.number(),
  state: z.enum(['active', 'completed', 'crashed']),
  video: z.object({ width: z.number(), height: z.number(), fps: z.number(), codec: z.string() }),
  audio: z
    .object({ codec: z.string(), sampleRate: z.number(), channels: z.number(), file: z.string() })
    .nullable(),
  camera: z.object({ segments: z.array(SegmentSchema) }).nullable(),
  screen: z.object({ segments: z.array(SegmentSchema) }),
  pausedUs: z.number(),
  /** DIP → physical pixel factor of the recorded display. Cursor samples are
   *  stored in DIP; multiplying by this converts them to video pixel space.
   *  Optional: stamped by main at session creation; older manifests omit it. */
  displayScaleFactor: z.number().optional(),
  /** True when the session was captured in MediaRecorder compatibility mode
   *  (single growing WebM) because every WebCodecs encoder failed to
   *  configure. The library surfaces this so the codec story stays honest. */
  compatibility: z.boolean().optional(),
});
export type SessionManifest = z.infer<typeof SessionManifestSchema>;

export function makeEmptyProject(
  id: string,
  name: string,
  nowIso: string,
  style: RecastProject['style'],
): RecastProject {
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: nowIso,
    updatedAt: nowIso,
    media: {
      dir: '',
      width: 0,
      height: 0,
      fps: 30,
      segments: [],
      audio: null,
      cursor: null,
      camera: null,
    },
    timeline: { clips: [], durationUs: 0 },
    zoom: { enabled: true, mode: 'auto', intensity: 'balanced', autoKeyframes: [], manualKeyframes: [] },
    style,
    annotations: [],
    redactions: [],
    audioEdits: { gainDb: 0, fadeInMs: 0, fadeOutMs: 0, normalizeLufs: false, duckMusic: false },
    animation: { fadeInMs: 0, fadeOutMs: 0 },
    captions: null,
  };
}
