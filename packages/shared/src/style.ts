import { z } from 'zod';

export const BackgroundType = z.enum(['solid', 'gradient', 'mesh', 'echo', 'image', 'transparent']);
export type BackgroundType = z.infer<typeof BackgroundType>;

export const BackgroundSchema = z.object({
  type: BackgroundType,
  color: z.string().optional(),
  gradient: z
    .object({ from: z.string(), to: z.string(), angleDeg: z.number().min(0).max(360) })
    .optional(),
  imageFile: z.string().optional(),
  echo: z.object({ blurPx: z.number(), dim: z.number().min(0).max(1), scale: z.number() }).optional(),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const ShadowLevel = z.enum(['none', 'soft', 'medium', 'large']);
export type ShadowLevel = z.infer<typeof ShadowLevel>;

export const FrameSchema = z.object({
  paddingPx: z.number().min(0).max(160),
  radiusPx: z.number().min(0).max(80),
  borderWidthPx: z.number().min(0).max(16),
  borderColor: z.string(),
  shadow: ShadowLevel,
  background: BackgroundSchema,
});
export type Frame = z.infer<typeof FrameSchema>;

export const CursorStyleSchema = z.object({
  look: z.enum(['native', 'dot', 'pointer', 'circle']),
  sizePx: z.number().min(8).max(96),
  color: z.string(),
  outlineColor: z.string(),
  outlineWidthPx: z.number().min(0).max(8),
  shadow: z.boolean(),
  ripple: z.boolean(),
  pressScale: z.number().min(0.6).max(1.4),
  /** Fade the rendered cursor out after N ms without movement (0 = never). */
  idleFadeMs: z.number().min(0).max(5_000),
  /** Overshoot bounce when the mouse button is released (Screen-Studio style). */
  clickBounce: z.boolean().default(false),
  /** Color of the click ripple/ring. */
  rippleColor: z.string().default('#FFFFFF'),
  /** 0 = raw captured motion, 1 = very smooth (exponential lag). */
  cursorSmoothing: z.number().min(0).max(1).default(0),
  /** Draw a fading motion trail behind the cursor. */
  trail: z.boolean().default(false),
});
export type CursorStyle = z.infer<typeof CursorStyleSchema>;

export const CaptionStyleSchema = z.object({
  style: z.enum(['clean', 'bold', 'boxed', 'pill', 'karaoke']),
  sizePx: z.number().min(12).max(96),
  color: z.string(),
  highlightColor: z.string(),
  backgroundOpacity: z.number().min(0).max(1),
  position: z.enum(['bottom', 'lower-third']),
});
export type CaptionStyleConfig = z.infer<typeof CaptionStyleSchema>;

/** Face-cam picture-in-picture (Screen-Studio style overlay). Rendered only
 *  when the session actually recorded a camera track — the schema is honest
 *  about availability: project.media.camera drives enablement at draw time. */
export const FacecamSchema = z.object({
  enabled: z.boolean().default(false),
  /** Corner placement on the final composition. */
  position: z.enum(['tl', 'tr', 'bl', 'br']).default('br'),
  /** Display width as a fraction of output width (0.08–0.45). */
  widthFraction: z.number().min(0.08).max(0.45).default(0.22),
  /** Circular crop (crops the source to a centered square first). */
  round: z.boolean().default(true),
  /** Flip horizontally (self-view convention). */
  mirror: z.boolean().default(true),
  /** Margin from the composition edge as a fraction of output height. */
  marginFraction: z.number().min(0.01).max(0.2).default(0.04),
  shadow: z.boolean().default(true),
  borderWidthPx: z.number().min(0).max(12).default(2),
  borderColor: z.string().default('#FFFFFF26'),
  opacity: z.number().min(0.3).max(1).default(1),
});
export type Facecam = z.infer<typeof FacecamSchema>;

export const DEFAULT_FACECAM: Facecam = {
  enabled: false,
  position: 'br',
  widthFraction: 0.22,
  round: true,
  mirror: true,
  marginFraction: 0.04,
  shadow: true,
  borderWidthPx: 2,
  borderColor: '#FFFFFF26',
  opacity: 1,
};

export const StylePresetSchema = z.object({
  format: z.literal('recaststyle'),
  version: z.literal(1),
  id: z.string(),
  name: z.string().min(1).max(64),
  builtin: z.boolean(),
  aspect: z.string(),
  aspectCustom: z.object({ w: z.number(), h: z.number() }).optional(),
  frame: FrameSchema,
  cursor: CursorStyleSchema,
  captions: CaptionStyleSchema,
  /** Face-cam placement. Optional-with-default keeps every existing
   *  .recaststyle file and saved project parsing unchanged. */
  facecam: FacecamSchema.default(DEFAULT_FACECAM),
});
export type StylePreset = z.infer<typeof StylePresetSchema>;

const cleanFrame = (background: Background): Frame => ({
  paddingPx: 0,
  radiusPx: 0,
  borderWidthPx: 0,
  borderColor: '#00000000',
  shadow: 'none',
  background,
});

function preset(
  id: string,
  name: string,
  aspect: string,
  frame: Frame,
  cursor: Partial<CursorStyle>,
  captions: Partial<CaptionStyleConfig> = {},
): StylePreset {
  return {
    format: 'recaststyle',
    version: 1,
    id,
    name,
    builtin: true,
    aspect,
    frame,
    cursor: {
      look: 'pointer',
      sizePx: 24,
      color: '#FFFFFF',
      outlineColor: '#101418',
      outlineWidthPx: 1,
      shadow: true,
      ripple: false,
      pressScale: 0.85,
      idleFadeMs: 0,
      clickBounce: false,
      rippleColor: '#FFFFFF',
      cursorSmoothing: 0,
      trail: false,
      ...cursor,
    },
    captions: {
      style: 'clean',
      sizePx: 36,
      color: '#FFFFFF',
      highlightColor: '#7C8CF8',
      backgroundOpacity: 0.55,
      position: 'bottom',
      ...captions,
    },
    facecam: DEFAULT_FACECAM,
  };
}

/** The six factory presets. Shipped in code; user presets are `.recaststyle` files. */
export const BUILTIN_PRESETS: StylePreset[] = [
  preset('cosmic-studio', 'Cosmic Studio', '16:9', {
    paddingPx: 36,
    radiusPx: 16,
    borderWidthPx: 1,
    borderColor: '#FFFFFF1F',
    shadow: 'large',
    background: { type: 'gradient', gradient: { from: '#1E2235', to: '#0B0D14', angleDeg: 140 } },
  }, {
    look: 'pointer',
    sizePx: 28,
    color: '#FFFFFF',
    outlineColor: '#0B0D14',
    outlineWidthPx: 2,
    ripple: true,
    rippleColor: '#7C8CF8',
    cursorSmoothing: 0.45,
    clickBounce: true,
  }, {
    style: 'boxed',
    sizePx: 42,
    highlightColor: '#7C8CF8',
    position: 'bottom',
  }),
  preset('clean-light', 'Clean Light', 'source', cleanFrame({ type: 'transparent' }), {
    look: 'pointer',
    sizePx: 26,
    color: '#0B0E12',
    outlineColor: '#FFFFFF',
    outlineWidthPx: 1.5,
    cursorSmoothing: 0.35,
    clickBounce: true,
    ripple: true,
    rippleColor: '#3B82F6',
  }),
  preset('clean-dark', 'Clean Dark', 'source', cleanFrame({ type: 'transparent' }), {
    look: 'pointer',
    sizePx: 26,
    color: '#F5F7FA',
    outlineColor: '#0B0E12',
    outlineWidthPx: 1.5,
    cursorSmoothing: 0.35,
    clickBounce: true,
  }),
  preset('soft-studio', 'Soft Studio', 'source', {
    paddingPx: 24,
    radiusPx: 16,
    borderWidthPx: 1,
    borderColor: '#FFFFFF14',
    shadow: 'soft',
    background: { type: 'gradient', gradient: { from: '#1B2030', to: '#0E1015', angleDeg: 160 } },
  }, {
    ripple: true,
    rippleColor: '#9BA8FF',
    shadow: true,
    cursorSmoothing: 0.4,
    clickBounce: true,
  }),
  preset('bold-punch', 'Bold Punch', '16:9', {
    paddingPx: 40,
    radiusPx: 24,
    borderWidthPx: 2,
    borderColor: '#7C8CF8',
    shadow: 'medium',
    background: { type: 'solid', color: '#101418' },
  }, {
    look: 'circle',
    sizePx: 30,
    color: '#FFD666',
    outlineColor: '#101418',
    outlineWidthPx: 2,
    ripple: true,
    rippleColor: '#FFD666',
    pressScale: 0.8,
    cursorSmoothing: 0.45,
    clickBounce: true,
    trail: true,
  }, {
    style: 'bold',
    sizePx: 44,
  }),
  preset('social-vertical', 'Social Vertical', '9:16', {
    paddingPx: 0,
    radiusPx: 0,
    borderWidthPx: 0,
    borderColor: '#00000000',
    shadow: 'none',
    background: { type: 'echo', echo: { blurPx: 48, dim: 0.35, scale: 1.1 } },
  }, {
    look: 'pointer',
    sizePx: 28,
    ripple: true,
    rippleColor: '#FFFFFF',
    cursorSmoothing: 0.4,
    clickBounce: true,
  }, {
    style: 'boxed',
    sizePx: 40,
    position: 'bottom',
  }),
  preset('minimal-mono', 'Minimal Mono', 'source', {
    paddingPx: 16,
    radiusPx: 8,
    borderWidthPx: 0,
    borderColor: '#00000000',
    shadow: 'large',
    background: { type: 'solid', color: '#0A0C10' },
  }, {
    look: 'dot',
    sizePx: 18,
    color: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidthPx: 0,
    idleFadeMs: 1500,
  }),
];

export function getBuiltinPreset(id: string): StylePreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}

export const DEFAULT_PRESET_ID = 'cosmic-studio';
