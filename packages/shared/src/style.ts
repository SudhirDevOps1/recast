import { z } from 'zod';

export const BackgroundType = z.enum(['solid', 'gradient', 'mesh', 'echo', 'image', 'transparent', 'procedural']);
export type BackgroundType = z.infer<typeof BackgroundType>;

export const DotGridSchema = z.object({
  enabled: z.boolean().default(false),
  color: z.string().default('rgba(255, 255, 255, 0.08)'),
  sizePx: z.number().min(1).max(8).default(2),
  spacingPx: z.number().min(8).max(80).default(24),
  style: z.enum(['dots', 'grid', 'crosses']).default('dots'),
});
export type DotGrid = z.infer<typeof DotGridSchema>;

export const ProceduralBackgroundSchema = z.object({
  preset: z.enum(['aurora', 'sunset', 'midnight', 'cyber', 'obsidian']).default('aurora'),
  animationSpeed: z.number().min(0).max(2).default(0),
});
export type ProceduralBackground = z.infer<typeof ProceduralBackgroundSchema>;

export const BackgroundSchema = z.object({
  type: BackgroundType,
  color: z.string().optional(),
  gradient: z
    .object({ from: z.string(), to: z.string(), angleDeg: z.number().min(0).max(360) })
    .optional(),
  imageFile: z.string().optional(),
  echo: z.object({ blurPx: z.number(), dim: z.number().min(0).max(1), scale: z.number() }).optional(),
  dotGrid: DotGridSchema.optional(),
  procedural: ProceduralBackgroundSchema.optional(),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const WindowChromeStyle = z.enum(['macos-dark', 'macos-light', 'windows', 'glass', 'none']);
export type WindowChromeStyle = z.infer<typeof WindowChromeStyle>;

export const WindowChromeSchema = z.object({
  enabled: z.boolean().default(false),
  style: WindowChromeStyle.default('macos-dark'),
  title: z.string().max(80).default(''),
  heightPx: z.number().min(20).max(64).default(36),
  showButtons: z.boolean().default(true),
});
export type WindowChrome = z.infer<typeof WindowChromeSchema>;

export const DEFAULT_WINDOW_CHROME: WindowChrome = {
  enabled: false,
  style: 'macos-dark',
  title: '',
  heightPx: 36,
  showButtons: true,
};

export const ShadowLevel = z.enum(['none', 'soft', 'medium', 'large']);
export type ShadowLevel = z.infer<typeof ShadowLevel>;

export const FrameSchema = z.object({
  paddingPx: z.number().min(0).max(160),
  radiusPx: z.number().min(0).max(80),
  borderWidthPx: z.number().min(0).max(16),
  borderColor: z.string(),
  shadow: ShadowLevel,
  background: BackgroundSchema,
  windowChrome: WindowChromeSchema.default(DEFAULT_WINDOW_CHROME),
});
export type Frame = z.infer<typeof FrameSchema>;

export const CursorStyleSchema = z.object({
  look: z.enum(['native', 'dot', 'pointer', 'circle', 'none']),
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
  /** Darkens the viewport outside cursor radius for focused tutorials. */
  spotlight: z.boolean().default(false),
  spotlightRadiusPx: z.number().min(30).max(320).default(120),
  spotlightOpacity: z.number().min(0.1).max(0.9).default(0.45),
  /** Expands multiple staggered radar rings upon click (Recordly/Screen Studio style). */
  radarRings: z.boolean().default(false),
  radarColor: z.string().default('#7C8CF8'),
  radarRingCount: z.number().min(1).max(4).default(3),
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

export const FacecamShape = z.enum(['circle', 'squircle', 'rectangle']);
export type FacecamShape = z.infer<typeof FacecamShape>;

export const FacecamBorderGradientSchema = z.object({
  from: z.string(),
  to: z.string(),
  angleDeg: z.number().min(0).max(360).default(135),
});
export type FacecamBorderGradient = z.infer<typeof FacecamBorderGradientSchema>;

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
  shape: FacecamShape.default('circle'),
  squircleCurvature: z.number().min(0.2).max(1.0).default(0.6),
  /** Flip horizontally (self-view convention). */
  mirror: z.boolean().default(true),
  /** Margin from the composition edge as a fraction of output height. */
  marginFraction: z.number().min(0.01).max(0.2).default(0.04),
  shadow: z.boolean().default(true),
  borderWidthPx: z.number().min(0).max(12).default(2),
  borderColor: z.string().default('#FFFFFF26'),
  borderGradient: FacecamBorderGradientSchema.optional(),
  opacity: z.number().min(0.3).max(1).default(1),
});
export type Facecam = z.infer<typeof FacecamSchema>;

export const DEFAULT_FACECAM: Facecam = {
  enabled: false,
  position: 'br',
  widthFraction: 0.22,
  round: true,
  shape: 'circle',
  squircleCurvature: 0.6,
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
  windowChrome: DEFAULT_WINDOW_CHROME,
});

function preset(
  id: string,
  name: string,
  aspect: string,
  frame: Partial<Frame> & { background: Background },
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
    frame: {
      paddingPx: frame.paddingPx ?? 0,
      radiusPx: frame.radiusPx ?? 0,
      borderWidthPx: frame.borderWidthPx ?? 0,
      borderColor: frame.borderColor ?? '#00000000',
      shadow: frame.shadow ?? 'none',
      background: frame.background,
      windowChrome: frame.windowChrome ?? DEFAULT_WINDOW_CHROME,
    },
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
      spotlight: false,
      spotlightRadiusPx: 120,
      spotlightOpacity: 0.45,
      radarRings: false,
      radarColor: '#7C8CF8',
      radarRingCount: 3,
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

/** Factory presets. Shipped in code; user presets are `.recaststyle` files. */
export const BUILTIN_PRESETS: StylePreset[] = [
  preset('cosmic-studio', 'Cosmic Studio', '16:9', {
    paddingPx: 36,
    radiusPx: 16,
    borderWidthPx: 1,
    borderColor: '#FFFFFF1F',
    shadow: 'large',
    background: {
      type: 'gradient',
      gradient: { from: '#1E2235', to: '#0B0D14', angleDeg: 140 },
      dotGrid: { enabled: true, color: 'rgba(255, 255, 255, 0.08)', sizePx: 2, spacingPx: 24, style: 'dots' },
    },
    windowChrome: { enabled: true, style: 'macos-dark', title: '', heightPx: 34, showButtons: true },
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
    radarRings: true,
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
    windowChrome: { enabled: true, style: 'glass', title: '', heightPx: 32, showButtons: true },
  }, {
    ripple: true,
    rippleColor: '#9BA8FF',
    shadow: true,
    cursorSmoothing: 0.4,
    clickBounce: true,
    radarRings: true,
  }),
  preset('bold-punch', 'Bold Punch', '16:9', {
    paddingPx: 40,
    radiusPx: 24,
    borderWidthPx: 2,
    borderColor: '#7C8CF8',
    shadow: 'medium',
    background: { type: 'solid', color: '#101418' },
    windowChrome: { enabled: true, style: 'macos-dark', title: '', heightPx: 36, showButtons: true },
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
  preset('social-vertical', 'Social Vertical (9:16)', '9:16', {
    paddingPx: 16,
    radiusPx: 18,
    borderWidthPx: 1,
    borderColor: '#FFFFFF24',
    shadow: 'large',
    background: {
      type: 'gradient',
      gradient: { from: '#1B1435', to: '#090814', angleDeg: 155 },
      dotGrid: { enabled: true, color: 'rgba(255, 255, 255, 0.07)', sizePx: 2, spacingPx: 22, style: 'dots' },
    },
    windowChrome: { enabled: true, style: 'macos-dark', title: '', heightPx: 32, showButtons: true },
  }, {
    look: 'pointer',
    sizePx: 28,
    ripple: true,
    rippleColor: '#7C8CF8',
    cursorSmoothing: 0.4,
    clickBounce: true,
    radarRings: true,
  }, {
    style: 'boxed',
    sizePx: 40,
    position: 'bottom',
  }),
  preset('social-square', 'Social Square (1:1)', '1:1', {
    paddingPx: 32,
    radiusPx: 20,
    borderWidthPx: 1,
    borderColor: '#FFFFFF1C',
    shadow: 'large',
    background: {
      type: 'gradient',
      gradient: { from: '#2A1B30', to: '#0D0914', angleDeg: 140 },
      dotGrid: { enabled: true, color: 'rgba(255, 255, 255, 0.08)', sizePx: 2, spacingPx: 24, style: 'dots' },
    },
    windowChrome: { enabled: true, style: 'macos-dark', title: '', heightPx: 34, showButtons: true },
  }, {
    look: 'pointer',
    sizePx: 28,
    ripple: true,
    rippleColor: '#F472B6',
    cursorSmoothing: 0.4,
    clickBounce: true,
    radarRings: true,
  }, {
    style: 'boxed',
    sizePx: 40,
    position: 'bottom',
  }),
  preset('social-portrait', 'Social Portrait (4:5)', '4:5', {
    paddingPx: 24,
    radiusPx: 20,
    borderWidthPx: 1,
    borderColor: '#FFFFFF1F',
    shadow: 'large',
    background: {
      type: 'gradient',
      gradient: { from: '#111D2D', to: '#080C14', angleDeg: 160 },
      dotGrid: { enabled: true, color: 'rgba(255, 255, 255, 0.07)', sizePx: 2, spacingPx: 24, style: 'dots' },
    },
    windowChrome: { enabled: true, style: 'macos-dark', title: '', heightPx: 34, showButtons: true },
  }, {
    look: 'pointer',
    sizePx: 28,
    ripple: true,
    rippleColor: '#38BDF8',
    cursorSmoothing: 0.4,
    clickBounce: true,
  }, {
    style: 'boxed',
    sizePx: 38,
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
