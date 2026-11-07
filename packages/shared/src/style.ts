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
  };
}

/** The six factory presets. Shipped in code; user presets are `.recaststyle` files. */
export const BUILTIN_PRESETS: StylePreset[] = [
  preset('clean-light', 'Clean Light', 'source', cleanFrame({ type: 'transparent' }), {
    look: 'native',
  }),
  preset('clean-dark', 'Clean Dark', 'source', cleanFrame({ type: 'transparent' }), {
    look: 'pointer',
    sizePx: 26,
    color: '#F5F7FA',
    outlineColor: '#0B0E12',
    outlineWidthPx: 1.5,
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
    shadow: true,
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
    pressScale: 0.8,
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

export const DEFAULT_PRESET_ID = 'clean-dark';
