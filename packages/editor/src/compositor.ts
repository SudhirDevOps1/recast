import { clamp, buildTimeMap, timelineToSource } from '@recast/shared';
import type { Annotation, RecastProject, Redaction, TransitionKind } from '@recast/shared';
import type { ZoomPose } from './zoom-math';
import { evalEase } from './easing';

/**
 * The compositor is a pure function of (project, time) → draw plan, shared by
 * preview and export. That is what guarantees they render identically.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CanvasImageSourceLike =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas
  | VideoFrame;

export interface CursorDrawInfo {
  x: number;
  y: number;
  visible: boolean;
  alpha: number;
  pressed: boolean;
  /** ms since last click, for the ripple animation; null when no recent click. */
  rippleMs: number | null;
  /** 1 = neutral; press and release-bounce scale the cursor. */
  scale: number;
  /** Fading motion-trail points in output coords (oldest first, may be empty). */
  trail: Array<{ x: number; y: number; alpha: number }>;
}

export interface RenderAnnotation {
  annotation: Annotation;
  /** Mapped to output coordinates. */
  points: Array<[number, number]>;
  rect: Rect | null;
  fontSizePx: number;
  widthPx: number;
}

export interface RenderRedaction {
  redaction: Redaction;
  rect: Rect;
}

export interface CaptionLine {
  text: string;
  startUs: number;
  endUs: number;
}

/** Intro motion of the active clip: eased layer alpha (+ screen-rect offset applied upstream). */
export interface ClipIntro {
  type: Exclude<TransitionKind, 'none'>;
  /** Eased 0..1 opacity of the screen layer (0 at clip start, 1 when done). */
  alpha: number;
}

/** Face-cam picture-in-picture placement, resolved in output coords. */
export interface FacecamRect {
  rect: Rect;
  /** w/2 for circular cams; radiusPx otherwise. */
  radiusPx: number;
  /** Circular mode crops the source to a centered square. */
  round: boolean;
  shape?: 'circle' | 'squircle' | 'rectangle';
  squircleCurvature?: number;
  mirror: boolean;
  shadow: boolean;
  borderWidthPx: number;
  borderColor: string;
  borderGradient?: { from: string; to: string; angleDeg: number };
  opacity: number;
}

export interface KeycapEvent {
  key: string;
  ageMs: number;
}

export interface Composition {
  outW: number;
  outH: number;
  background: RecastProject['style']['frame']['background'];
  /** Outer window rectangle containing window chrome + inner screen. */
  windowRect?: Rect;
  /** Window chrome configuration resolved for drawing. */
  windowChrome?: {
    enabled: boolean;
    style: 'macos-dark' | 'macos-light' | 'windows' | 'glass' | 'none';
    title: string;
    heightPx: number;
    showButtons: boolean;
  };
  /** Where the full source frame maps at zoom = 1. */
  screenRect: Rect;
  radiusPx: number;
  borderWidthPx: number;
  borderColor: string;
  shadow: 'none' | 'soft' | 'medium' | 'large';
  visibleSrc: Rect;
  pose: ZoomPose;
  cursor: CursorDrawInfo | null;
  cursorStyle: RecastProject['style']['cursor'];
  annotations: RenderAnnotation[];
  redactions: RenderRedaction[];
  captions: CaptionLine[];
  captionStyle: RecastProject['style']['captions'];
  /** Active clip intro transition, null when none is playing. */
  intro: ClipIntro | null;
  /** Whole-video fade (in/out) — black overlay alpha 0..1, null when idle. */
  fadeOverlay: { alpha: number } | null;
  /** 0..1 progress of the active clip for speed effects (unused visually). */
  showSafeGuides: boolean;
  /** Face-cam PiP — null unless style.facecam.enabled and a camera segment exists. */
  facecam: FacecamRect | null;
  /** Active keystroke overlays to display with keycaps */
  keystrokes: KeycapEvent[];
}

export interface CursorSampleLike {
  tUs: number;
  x: number;
  y: number;
  type: string;
  button?: string;
  key?: string;
}

export interface ComposeDeps {
  pose: ZoomPose;
  /** Input events near time t (for cursor pos, press state, ripples, idle fade). */
  cursorEvents: CursorSampleLike[];
  getCaptionsAt: (tUs: number) => CaptionLine[];
  showSafeGuides?: boolean;
  /** Intro transition of the clip active at tUs, with raw 0..1 progress. */
  clipIn?: { type: TransitionKind; progress: number } | null;
  /** Timeline duration — required for project fade in/out to evaluate. */
  totalDurationUs?: number;
  /** Recorded keystrokes near time t (if available) */
  keystrokeEvents?: Array<{ tUs: number; key: string }>;
}

/** Output canvas size for a project at a given short-edge resolution. */
export function outputSize(project: RecastProject, resolutionShortEdge: number): { w: number; h: number } {
  const aspect = project.style.aspect;
  const custom = project.style.aspectCustom;
  let aw: number;
  let ah: number;
  if (aspect === 'source' || !custom) {
    const { width, height } = project.media;
    if (!width || !height) return { w: resolutionShortEdge, h: resolutionShortEdge };
    aw = width;
    ah = height;
  } else {
    aw = custom.w;
    ah = custom.h;
  }
  const ar = aw / ah;
  if (ar >= 1) {
    return { w: Math.round(resolutionShortEdge * ar), h: resolutionShortEdge };
  }
  return { w: resolutionShortEdge, h: Math.round(resolutionShortEdge / ar) };
}

function aspectSize(project: RecastProject): { aw: number; ah: number } {
  const aspect = project.style.aspect;
  if (aspect === 'custom' && project.style.aspectCustom) {
    return { aw: project.style.aspectCustom.w, ah: project.style.aspectCustom.h };
  }
  const m = /^(\d+):(\d+)$/.exec(aspect);
  if (m) return { aw: Number(m[1]), ah: Number(m[2]) };
  return { aw: project.media.width || 16, ah: project.media.height || 9 };
}

/**
 * Canvas layout: content rect (aspect box) inside the canvas, then the screen
 * video rect inside the content rect with style padding. Background fills the
 * whole canvas.
 */
export function computeComposition(project: RecastProject, tUs: number, outW: number, outH: number, deps: ComposeDeps): Composition {
  const style = project.style;
  const { aw, ah } = aspectSize(project);

  // Content rect: the aspect box letterboxed inside the canvas.
  const ar = aw / ah;
  let cw = outW;
  let ch = outW / ar;
  if (ch > outH) {
    ch = outH;
    cw = outH * ar;
  }
  const contentRect: Rect = { x: (outW - cw) / 2, y: (outH - ch) / 2, w: cw, h: ch };

  // Screen rect: fit the source video (or cropped region) into content rect with padding.
  const pad = (style.frame.paddingPx / 1000) * outH; // style padding is per-mille of output height
  const effectiveW = project.crop && project.crop.w > 0 ? project.crop.w : (project.media.width || 1920);
  const effectiveH = project.crop && project.crop.h > 0 ? project.crop.h : (project.media.height || 1080);
  const srcAr = effectiveW / effectiveH;

  const chromeCfg = style.frame.windowChrome;
  const chromeEnabled = Boolean(chromeCfg?.enabled);
  const chromeH = chromeEnabled ? Math.max(18, Math.min(54, (chromeCfg.heightPx || 34) * (outH / 1080))) : 0;

  // Fit the combined card (window chrome + video) into contentRect with padding.
  // Video maintains true srcAr: sw = sh * srcAr.
  // Total window height = sh + chromeH.
  const availW = Math.max(1, contentRect.w - 2 * pad);
  const availH = Math.max(1, contentRect.h - 2 * pad);

  let sw = availW;
  let sh = sw / srcAr;
  if (sh + chromeH > availH) {
    sh = Math.max(1, availH - chromeH);
    sw = sh * srcAr;
  }

  const windowRect: Rect = {
    x: contentRect.x + (contentRect.w - sw) / 2,
    y: contentRect.y + (contentRect.h - (sh + chromeH)) / 2,
    w: Math.max(1, sw),
    h: Math.max(1, sh + chromeH),
  };

  let screenRect: Rect = {
    x: windowRect.x,
    y: windowRect.y + chromeH,
    w: windowRect.w,
    h: Math.max(1, sh),
  };

  const pose = deps.pose;
  const maxW = Math.max(1, effectiveW);
  const maxH = Math.max(1, effectiveH);
  const visW = Math.min(maxW, maxW / pose.scale);
  const visH = Math.min(maxH, maxH / pose.scale);
  const cropOffsetX = project.crop ? project.crop.x : 0;
  const cropOffsetY = project.crop ? project.crop.y : 0;
  const localCx = pose.cx - cropOffsetX;
  const localCy = pose.cy - cropOffsetY;
  const minX = 0;
  const maxX = Math.max(0, maxW - visW);
  const minY = 0;
  const maxY = Math.max(0, maxH - visH);
  const vx = clamp(localCx - visW / 2, minX, maxX) + cropOffsetX;
  const vy = clamp(localCy - visH / 2, minY, maxY) + cropOffsetY;
  const visibleSrc: Rect = {
    x: vx,
    y: vy,
    w: visW,
    h: visH,
  };

  // Cursor mapping: source coords → output coords through the visible region.
  const timeMap = buildTimeMap(project.timeline.clips);
  const hit = timelineToSource(timeMap, tUs);
  const sourceTUs = hit ? hit.sourceUs : tUs;
  const cursor = mapCursor(project, sourceTUs, deps.cursorEvents, screenRect, visibleSrc, style.cursor);

  // Clip intro transition: offset/zoom the screen card before cursor and
  // annotation mapping so overlays ride along with the motion.
  let intro: ClipIntro | null = null;
  if (deps.clipIn && deps.clipIn.type !== 'none') {
    const p = clamp(deps.clipIn.progress, 0, 1);
    const e = evalEase('out', p);
    if (deps.clipIn.type === 'slide-left') {
      screenRect = { ...screenRect, x: screenRect.x + (1 - e) * outW * 0.12 };
    } else if (deps.clipIn.type === 'slide-up') {
      screenRect = { ...screenRect, y: screenRect.y + (1 - e) * outH * 0.1 };
    } else if (deps.clipIn.type === 'zoom') {
      const grow = 1 + (1 - e) * 0.08;
      const cxr = screenRect.x + screenRect.w / 2;
      const cyr = screenRect.y + screenRect.h / 2;
      screenRect = {
        x: cxr - (screenRect.w * grow) / 2,
        y: cyr - (screenRect.h * grow) / 2,
        w: screenRect.w * grow,
        h: screenRect.h * grow,
      };
    }
    intro = { type: deps.clipIn.type, alpha: e };
  }

  const radiusPx = (style.frame.radiusPx / 1000) * outH;
  const annotations = mapAnnotations(project, tUs, screenRect, visibleSrc, outH);
  const redactions = mapRedactions(project, tUs, screenRect, visibleSrc);

  // Face-cam PiP: only when enabled AND the session actually has a camera
  // segment (the schema toggle is honest about availability).
  const fcStyle = style.facecam;
  const cam = project.media.camera;
  let facecam: FacecamRect | null = null;
  if (fcStyle.enabled && cam && cam.width > 0 && cam.height > 0) {
    const w = clamp(fcStyle.widthFraction * outW, 16, outW);
    const camAspect = cam.width / cam.height;
    const effectiveShape =
      fcStyle.shape === 'squircle'
        ? 'squircle'
        : fcStyle.round === false
        ? 'rectangle'
        : (fcStyle.shape ?? 'circle');
    const isSquare = effectiveShape === 'circle' || effectiveShape === 'squircle';
    const h = isSquare ? w : w / camAspect;
    const margin = fcStyle.marginFraction * outH;
    const x = fcStyle.position === 'tl' || fcStyle.position === 'bl' ? margin : outW - w - margin;
    const y = fcStyle.position === 'tl' || fcStyle.position === 'tr' ? margin : outH - h - margin;
    facecam = {
      rect: { x, y, w, h },
      radiusPx: effectiveShape === 'circle' ? w / 2 : Math.min(14, w / 8),
      round: effectiveShape === 'circle',
      shape: effectiveShape,
      squircleCurvature: fcStyle.squircleCurvature ?? 0.6,
      mirror: fcStyle.mirror,
      shadow: fcStyle.shadow,
      borderWidthPx: (fcStyle.borderWidthPx / 1000) * outH,
      borderColor: fcStyle.borderColor,
      borderGradient: fcStyle.borderGradient,
      opacity: fcStyle.opacity,
    };
  }

  // Whole-video fade in/out over black.
  let fadeOverlay: { alpha: number } | null = null;
  const fadeInUs = (project.animation?.fadeInMs ?? 0) * 1_000;
  const fadeOutUs = (project.animation?.fadeOutMs ?? 0) * 1_000;
  const total = deps.totalDurationUs ?? 0;
  if (total > 0 && (fadeInUs > 0 || fadeOutUs > 0)) {
    let a = 0;
    if (fadeInUs > 0) a = Math.max(a, 1 - clamp(tUs / fadeInUs, 0, 1));
    if (fadeOutUs > 0) a = Math.max(a, 1 - clamp((total - tUs) / fadeOutUs, 0, 1));
    if (a > 0.001) fadeOverlay = { alpha: a };
  }

  // Keystroke HUD events in the active window (last 1.2 s)
  const keystrokes: KeycapEvent[] = [];
  const rawKeys = deps.keystrokeEvents ?? [];
  for (const k of rawKeys) {
    if (tUs >= k.tUs && tUs - k.tUs <= 1_200_000) {
      keystrokes.push({
        key: k.key,
        ageMs: (tUs - k.tUs) / 1000,
      });
    }
  }

  return {
    outW,
    outH,
    background: style.frame.background,
    windowRect: chromeEnabled ? windowRect : undefined,
    windowChrome: chromeEnabled ? { ...chromeCfg, heightPx: chromeH } : undefined,
    screenRect,
    radiusPx,
    borderWidthPx: (style.frame.borderWidthPx / 1000) * outH,
    borderColor: style.frame.borderColor,
    shadow: style.frame.shadow,
    visibleSrc,
    pose,
    cursor,
    cursorStyle: style.cursor,
    annotations,
    redactions,
    captions: deps.getCaptionsAt(tUs),
    captionStyle: style.captions,
    intro,
    fadeOverlay,
    showSafeGuides: deps.showSafeGuides ?? false,
    facecam,
    keystrokes,
  };
}

function mapCursor(
  project: RecastProject,
  tUs: number,
  events: CursorSampleLike[],
  screenRect: Rect,
  visibleSrc: Rect,
  style: RecastProject['style']['cursor'],
): CursorDrawInfo | null {
  if (events.length === 0) return null;
  let lastMove: CursorSampleLike | null = null;
  let lastClick: CursorSampleLike | null = null;
  let lastUp: CursorSampleLike | null = null;
  let down = false;
  let lastMoveTUs = -1;

  // Exponential cursor smoothing (deterministic walk over the event list).
  const smoothing = style.cursorSmoothing ?? 0;
  const tau = 0.02 + smoothing * 0.18; // seconds of lag
  let sx: number | null = null;
  let sy: number | null = null;
  let sT: number | null = null;
  const trailRaw: Array<{ x: number; y: number; t: number }> = [];

  for (const e of events) {
    if (e.tUs > tUs) break;
    if (e.type === 'move' || e.type === 'up' || e.type === 'down') {
      if (e.x != null && e.y != null) {
        if (smoothing > 0) {
          const tSec = e.tUs / 1e6;
          if (sx == null || sy == null || sT == null) {
            sx = e.x;
            sy = e.y;
          } else {
            const dt = Math.max(0, tSec - sT);
            const k = 1 - Math.exp(-dt / tau);
            sx += (e.x - sx) * k;
            sy += (e.y - sy) * k;
          }
          sT = tSec;
          trailRaw.push({ x: sx, y: sy, t: e.tUs });
          if (trailRaw.length > 24) trailRaw.shift();
        }
        lastMove = e;
      }
    }
    if (e.type === 'down') {
      down = true;
      lastClick = e;
    }
    if (e.type === 'up') {
      down = false;
      lastUp = e;
    }
    lastMoveTUs = e.tUs;
  }
  if (!lastMove) return null;

  const px = smoothing > 0 && sx != null && sy != null ? sx : lastMove.x!;
  const py = smoothing > 0 && sx != null && sy != null ? sy : lastMove.y!;
  const kx = screenRect.w / visibleSrc.w;
  const ky = screenRect.h / visibleSrc.h;
  const x = screenRect.x + (px - visibleSrc.x) * kx;
  const y = screenRect.y + (py - visibleSrc.y) * ky;

  // Motion trail: recent smoothed positions with fading alpha.
  const trail: Array<{ x: number; y: number; alpha: number }> = [];
  if (style.trail) {
    for (const p of trailRaw) {
      const ageMs = (tUs - p.t) / 1_000;
      if (ageMs > 180 || ageMs < 8) continue;
      trail.push({
        x: screenRect.x + (p.x - visibleSrc.x) * kx,
        y: screenRect.y + (p.y - visibleSrc.y) * ky,
        alpha: (1 - ageMs / 180) * 0.3,
      });
    }
  }

  let alpha = 1;
  if (style.idleFadeMs > 0 && lastMoveTUs >= 0) {
    const idleMs = (tUs - lastMoveTUs) / 1_000;
    if (idleMs > style.idleFadeMs) alpha = clamp(1 - (idleMs - style.idleFadeMs) / 400, 0, 1);
  }
  const rippleMs = lastClick ? clamp((tUs - lastClick.tUs) / 1_000, 0, 500) : null;

  // Cursor scale: press shrinks; release bounces back with a slight overshoot.
  let scale = 1;
  if (down) {
    scale = style.pressScale;
  } else if (style.clickBounce && lastUp) {
    const sinceUpMs = (tUs - lastUp.tUs) / 1_000;
    if (sinceUpMs >= 0 && sinceUpMs < 260) {
      scale = style.pressScale + (1 - style.pressScale) * evalEase('pop', sinceUpMs / 260);
    }
  }

  return {
    x,
    y,
    visible: true,
    alpha,
    pressed: down,
    rippleMs: rippleMs != null && rippleMs < 450 ? rippleMs : null,
    scale,
    trail,
  };
}

function mapAnnotations(
  project: RecastProject,
  tUs: number,
  screenRect: Rect,
  visibleSrc: Rect,
  _outH: number,
): RenderAnnotation[] {
  const out: RenderAnnotation[] = [];
  for (const a of project.annotations) {
    if (tUs < a.tInUs || tUs > a.tOutUs) continue;
    const kx = screenRect.w / visibleSrc.w;
    const ky = screenRect.h / visibleSrc.h;
    const mapPt = (p: [number, number]): [number, number] => [
      screenRect.x + (p[0] - visibleSrc.x) * kx,
      screenRect.y + (p[1] - visibleSrc.y) * ky,
    ];
    out.push({
      annotation: a,
      points: a.points?.map(mapPt) ?? [],
      rect: a.rect
        ? {
            x: screenRect.x + (a.rect.x - visibleSrc.x) * kx,
            y: screenRect.y + (a.rect.y - visibleSrc.y) * ky,
            w: a.rect.w * kx,
            h: a.rect.h * ky,
          }
        : null,
      fontSizePx: (a.fontSizePx ?? 32) * kx,
      widthPx: (a.widthPx ?? 4) * kx,
    });
  }
  return out;
}

function mapRedactions(project: RecastProject, tUs: number, screenRect: Rect, visibleSrc: Rect): RenderRedaction[] {
  const out: RenderRedaction[] = [];
  for (const r of project.redactions) {
    if (tUs < r.tInUs || tUs > r.tOutUs) continue;
    const kx = screenRect.w / visibleSrc.w;
    const ky = screenRect.h / visibleSrc.h;
    out.push({
      redaction: r,
      rect: {
        x: screenRect.x + (r.rect.x - visibleSrc.x) * kx,
        y: screenRect.y + (r.rect.y - visibleSrc.y) * ky,
        w: r.rect.w * kx,
        h: r.rect.h * ky,
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface DrawDeps {
  /** Frame provider — must return the decoded frame for the segment at source time. */
  getFrame: (segmentId: string, sourceUs: number) => CanvasImageSourceLike | null;
  /** Scratch canvas reused across frames for pixelate (avoids per-frame allocs). */
  scratch?: HTMLCanvasElement | OffscreenCanvas | null;
  getBackgroundImage?: () => CanvasImageSourceLike | null;
  /** Camera frame for the face-cam PiP (video element already seeked by the caller). */
  getCameraFrame?: () => CanvasImageSourceLike | null;
}

const SHADOWS: Record<Composition['shadow'], { blur: number; y: number; alpha: number }> = {
  none: { blur: 0, y: 0, alpha: 0 },
  soft: { blur: 0.02, y: 0.006, alpha: 0.35 },
  medium: { blur: 0.035, y: 0.01, alpha: 0.45 },
  large: { blur: 0.06, y: 0.018, alpha: 0.55 },
};

function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
}

function roundBottomRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x, r.y);
  ctx.lineTo(r.x + r.w, r.y);
  ctx.lineTo(r.x + r.w, r.y + r.h - rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h, rad);
  ctx.lineTo(r.x + rad, r.y + r.h);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y + r.h - rad, rad);
  ctx.closePath();
}

function drawSquirclePath(ctx: CanvasRenderingContext2D, r: Rect, curvature = 0.6): void {
  const x = r.x;
  const y = r.y;
  const w = r.w;
  const h = r.h;
  const rRad = Math.min(w, h) * 0.28 * (curvature / 0.6);
  ctx.beginPath();
  ctx.moveTo(x + rRad, y);
  ctx.lineTo(x + w - rRad, y);
  ctx.bezierCurveTo(x + w, y, x + w, y + rRad, x + w, y + rRad);
  ctx.lineTo(x + w, y + h - rRad);
  ctx.bezierCurveTo(x + w, y + h, x + w - rRad, y + h, x + w - rRad, y + h);
  ctx.lineTo(x + rRad, y + h);
  ctx.bezierCurveTo(x, y + h, x, y + h - rRad, x, y + h - rRad);
  ctx.lineTo(x, y + rRad);
  ctx.bezierCurveTo(x, y, x + rRad, y, x + rRad, y);
  ctx.closePath();
}

let cachedDotGridTile: { pattern: CanvasPattern | null; key: string } | null = null;

function drawDotGrid(ctx: CanvasRenderingContext2D, outW: number, outH: number, dotGrid: import('@recast/shared').DotGrid): void {
  const spacing = Math.max(8, dotGrid.spacingPx);
  const size = Math.max(1, dotGrid.sizePx);
  const key = `${dotGrid.style}-${spacing}-${size}-${dotGrid.color}`;

  if (!cachedDotGridTile || cachedDotGridTile.key !== key) {
    if (typeof document !== 'undefined') {
      const tile = document.createElement('canvas');
      tile.width = spacing;
      tile.height = spacing;
      const tctx = tile.getContext('2d');
      if (tctx) {
        tctx.fillStyle = dotGrid.color;
        tctx.strokeStyle = dotGrid.color;
        tctx.lineWidth = size;
        if (dotGrid.style === 'grid') {
          tctx.strokeRect(0, 0, spacing, spacing);
        } else if (dotGrid.style === 'crosses') {
          const half = spacing / 2;
          const arm = size * 2;
          tctx.beginPath();
          tctx.moveTo(half - arm, half);
          tctx.lineTo(half + arm, half);
          tctx.moveTo(half, half - arm);
          tctx.lineTo(half, half + arm);
          tctx.stroke();
        } else {
          // 'dots'
          tctx.beginPath();
          tctx.arc(spacing / 2, spacing / 2, size / 2, 0, Math.PI * 2);
          tctx.fill();
        }
        const pattern = ctx.createPattern(tile, 'repeat');
        cachedDotGridTile = { pattern, key };
      }
    }
  }

  if (cachedDotGridTile?.pattern) {
    ctx.save();
    ctx.fillStyle = cachedDotGridTile.pattern;
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }
}

function drawProceduralBackground(ctx: CanvasRenderingContext2D, outW: number, outH: number, preset: string): void {
  const cx = outW / 2;
  const cy = outH / 2;

  switch (preset) {
    case 'sunset': {
      const g = ctx.createLinearGradient(0, 0, outW, outH);
      g.addColorStop(0, '#3B0764');
      g.addColorStop(0.5, '#BE185D');
      g.addColorStop(1, '#FB923C');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, outW, outH);
      const rg = ctx.createRadialGradient(outW * 0.7, outH * 0.3, 0, outW * 0.7, outH * 0.3, outW * 0.6);
      rg.addColorStop(0, 'rgba(251, 146, 60, 0.35)');
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, outW, outH);
      break;
    }
    case 'midnight': {
      const g = ctx.createLinearGradient(0, 0, 0, outH);
      g.addColorStop(0, '#030712');
      g.addColorStop(0.6, '#0B132B');
      g.addColorStop(1, '#0C1B33');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, outW, outH);
      const rg = ctx.createRadialGradient(cx, cy * 0.8, 0, cx, cy * 0.8, Math.max(outW, outH) * 0.65);
      rg.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
      rg.addColorStop(0.7, 'rgba(59, 130, 246, 0.08)');
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, outW, outH);
      break;
    }
    case 'cyber': {
      const g = ctx.createLinearGradient(0, 0, outW, outH);
      g.addColorStop(0, '#130026');
      g.addColorStop(0.5, '#2D006B');
      g.addColorStop(1, '#001A33');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, outW, outH);
      const rg1 = ctx.createRadialGradient(outW * 0.2, outH * 0.8, 0, outW * 0.2, outH * 0.8, outW * 0.5);
      rg1.addColorStop(0, 'rgba(236, 72, 153, 0.3)');
      rg1.addColorStop(1, 'transparent');
      ctx.fillStyle = rg1;
      ctx.fillRect(0, 0, outW, outH);
      const rg2 = ctx.createRadialGradient(outW * 0.8, outH * 0.2, 0, outW * 0.8, outH * 0.2, outW * 0.5);
      rg2.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
      rg2.addColorStop(1, 'transparent');
      ctx.fillStyle = rg2;
      ctx.fillRect(0, 0, outW, outH);
      break;
    }
    case 'obsidian': {
      const g = ctx.createLinearGradient(0, 0, outW, outH);
      g.addColorStop(0, '#090A0F');
      g.addColorStop(0.5, '#12131A');
      g.addColorStop(1, '#0D0E14');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, outW, outH);
      break;
    }
    case 'aurora':
    default: {
      const g = ctx.createLinearGradient(0, 0, outW, outH);
      g.addColorStop(0, '#0F172A');
      g.addColorStop(0.45, '#1E1B4B');
      g.addColorStop(1, '#064E3B');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, outW, outH);
      const rg1 = ctx.createRadialGradient(outW * 0.3, outH * 0.4, 0, outW * 0.3, outH * 0.4, outW * 0.5);
      rg1.addColorStop(0, 'rgba(45, 212, 191, 0.22)');
      rg1.addColorStop(1, 'transparent');
      ctx.fillStyle = rg1;
      ctx.fillRect(0, 0, outW, outH);
      const rg2 = ctx.createRadialGradient(outW * 0.7, outH * 0.6, 0, outW * 0.7, outH * 0.6, outW * 0.5);
      rg2.addColorStop(0, 'rgba(168, 85, 247, 0.2)');
      rg2.addColorStop(1, 'transparent');
      ctx.fillStyle = rg2;
      ctx.fillRect(0, 0, outW, outH);
      break;
    }
  }
}

function drawWindowChrome(ctx: CanvasRenderingContext2D, comp: Composition, alpha: number): void {
  const chrome = comp.windowChrome;
  const win = comp.windowRect;
  if (!chrome || !chrome.enabled || !win) return;

  const h = chrome.heightPx;
  const r = comp.radiusPx;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Clip to top rounded corners of window
  ctx.beginPath();
  ctx.moveTo(win.x, win.y + h);
  ctx.lineTo(win.x, win.y + r);
  ctx.arcTo(win.x, win.y, win.x + r, win.y, r);
  ctx.lineTo(win.x + win.w - r, win.y);
  ctx.arcTo(win.x + win.w, win.y, win.x + win.w, win.y + r, r);
  ctx.lineTo(win.x + win.w, win.y + h);
  ctx.closePath();
  ctx.clip();

  // Background header style
  if (chrome.style === 'macos-light') {
    ctx.fillStyle = '#E5E7EB';
  } else if (chrome.style === 'glass') {
    const grad = ctx.createLinearGradient(win.x, win.y, win.x, win.y + h);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
    ctx.fillStyle = grad;
  } else if (chrome.style === 'windows') {
    ctx.fillStyle = '#202020';
  } else {
    // macos-dark
    ctx.fillStyle = '#181A20';
  }
  ctx.fillRect(win.x, win.y, win.w, h);

  // Subtle bottom hairline separator under title bar
  ctx.fillStyle = chrome.style === 'macos-light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';
  ctx.fillRect(win.x, win.y + h - 1, win.w, 1);

  // Buttons / Controls
  if (chrome.showButtons) {
    if (chrome.style === 'windows') {
      const bx = win.x + win.w - 70;
      const by = win.y + h / 2;
      ctx.strokeStyle = '#FFFFFF99';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + 10, by);
      ctx.stroke();
      ctx.strokeRect(bx + 20, by - 5, 10, 10);
      ctx.beginPath();
      ctx.moveTo(bx + 40, by - 5);
      ctx.lineTo(bx + 50, by + 5);
      ctx.moveTo(bx + 50, by - 5);
      ctx.lineTo(bx + 40, by + 5);
      ctx.stroke();
    } else {
      // macOS traffic lights: red, yellow, green
      const btnRadius = Math.max(4, Math.min(6, h * 0.16));
      const btnY = win.y + h / 2;
      const startX = win.x + 16;
      const gap = btnRadius * 2 + 8;

      const lights = [
        { fill: '#FF5F56', stroke: '#E0443E' },
        { fill: '#FFBD2E', stroke: '#DEA123' },
        { fill: '#27C93F', stroke: '#1AAB29' },
      ];

      for (let i = 0; i < 3; i++) {
        const lx = startX + i * gap;
        ctx.beginPath();
        ctx.arc(lx, btnY, btnRadius, 0, Math.PI * 2);
        ctx.fillStyle = lights[i].fill;
        ctx.fill();
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = lights[i].stroke;
        ctx.stroke();
      }
    }
  }

  // Window title
  if (chrome.title) {
    ctx.font = `600 ${Math.max(10, Math.min(13, h * 0.36))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = chrome.style === 'macos-light' ? '#374151' : 'rgba(255, 255, 255, 0.75)';
    ctx.fillText(chrome.title, win.x + win.w / 2, win.y + h / 2);
  }

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, comp: Composition, deps: DrawDeps): void {
  const bg = comp.background;
  const { outW, outH } = comp;
  ctx.clearRect(0, 0, outW, outH);
  switch (bg.type) {
    case 'transparent':
      break;
    case 'solid':
      ctx.fillStyle = bg.color ?? '#101418';
      ctx.fillRect(0, 0, outW, outH);
      break;
    case 'gradient': {
      const g = bg.gradient ?? { from: '#1B2030', to: '#0E1015', angleDeg: 160 };
      const rad = (g.angleDeg * Math.PI) / 180;
      const x0 = outW / 2 - (Math.cos(rad) * outW) / 2;
      const y0 = outH / 2 - (Math.sin(rad) * outH) / 2;
      const grad = ctx.createLinearGradient(x0, y0, outW - x0, outH - y0);
      grad.addColorStop(0, g.from);
      grad.addColorStop(1, g.to);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, outW, outH);
      break;
    }
    case 'procedural': {
      drawProceduralBackground(ctx, outW, outH, bg.procedural?.preset ?? 'aurora');
      break;
    }
    case 'mesh': {
      ctx.fillStyle = '#0E1015';
      ctx.fillRect(0, 0, outW, outH);
      const blobs: Array<[string, number, number, number]> = [
        ['#7C8CF8', 0.24, 0.3, 0.5],
        ['#3ED6C3', 0.78, 0.24, 0.42],
        ['#C77DF3', 0.62, 0.78, 0.46],
      ];
      for (const [color, fx, fy, fr] of blobs) {
        const grad = ctx.createRadialGradient(fx * outW, fy * outH, 0, fx * outW, fy * outH, fr * Math.max(outW, outH));
        grad.addColorStop(0, `${color}55`);
        grad.addColorStop(1, '#0E101500');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, outW, outH);
      }
      break;
    }
    case 'echo': {
      // Blurred, dimmed, over-scaled copy of the current frame.
      const frame = deps.getFrame('__echo__', 0);
      if (frame) {
        ctx.save();
        ctx.filter = `blur(${bg.echo?.blurPx ?? 40}px)`;
        const scale = bg.echo?.scale ?? 1.1;
        const w = outW * scale;
        const h = outH * scale;
        ctx.globalAlpha = 1 - (bg.echo?.dim ?? 0.35);
        ctx.drawImage(frame as CanvasImageSource, (outW - w) / 2, (outH - h) / 2, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#0E1015';
        ctx.fillRect(0, 0, outW, outH);
      }
      break;
    }
    case 'image': {
      const img = deps.getBackgroundImage?.();
      if (img) {
        const iw = (img as { width?: number }).width ?? outW;
        const ih = (img as { height?: number }).height ?? outH;
        const ar = iw / ih;
        let w = outW;
        let h = w / ar;
        if (h < outH) {
          h = outH;
          w = h * ar;
        }
        ctx.drawImage(img as CanvasImageSource, (outW - w) / 2, (outH - h) / 2, w, h);
      } else {
        ctx.fillStyle = '#101418';
        ctx.fillRect(0, 0, outW, outH);
      }
      break;
    }
  }

  // Draw overlay dot grid if enabled
  if (bg.dotGrid?.enabled) {
    drawDotGrid(ctx, outW, outH, bg.dotGrid);
  }
}

/** Face-cam PiP: rounded/circular clip, optional mirror, border, shadow.
 *  Drawn over the background + screen card, under annotations and cursor. */
function drawFacecam(ctx: CanvasRenderingContext2D, comp: Composition, deps: DrawDeps): void {
  const fc = comp.facecam;
  if (!fc) return;
  const frame = deps.getCameraFrame?.();
  if (!frame) return;
  const { rect } = fc;
  ctx.save();
  ctx.globalAlpha = fc.opacity * (comp.intro ? comp.intro.alpha : 1);

  const applyShape = (): void => {
    if (fc.shape === 'squircle') {
      drawSquirclePath(ctx, rect, fc.squircleCurvature ?? 0.6);
    } else if (fc.round || fc.shape === 'circle') {
      roundRectPath(ctx, rect, rect.w / 2);
    } else {
      roundRectPath(ctx, rect, fc.radiusPx);
    }
  };

  if (fc.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = rect.h * 0.12;
    ctx.shadowOffsetY = rect.h * 0.04;
    ctx.fillStyle = '#000000';
    applyShape();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  applyShape();
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (fc.round || fc.shape === 'circle' || fc.shape === 'squircle') {
    // Centered square crop of the camera source, drawn into the square rect.
    const vw = (frame as { videoWidth?: number; width?: number }).videoWidth ?? (frame as { width?: number }).width ?? rect.w;
    const vh = (frame as { videoHeight?: number; height?: number }).videoHeight ?? (frame as { height?: number }).height ?? rect.w;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    if (fc.mirror) {
      ctx.translate(rect.x + rect.w, rect.y);
      ctx.scale(-1, 1);
      ctx.drawImage(frame as CanvasImageSource, sx, sy, side, side, 0, 0, rect.w, rect.w);
    } else {
      ctx.drawImage(frame as CanvasImageSource, sx, sy, side, side, rect.x, rect.y, rect.w, rect.w);
    }
  } else {
    // Full frame fit (aspect handled by the caller's rect sizing).
    if (fc.mirror) {
      ctx.translate(rect.x + rect.w, rect.y);
      ctx.scale(-1, 1);
      ctx.drawImage(frame as CanvasImageSource, 0, 0, rect.w, rect.h);
    } else {
      ctx.drawImage(frame as CanvasImageSource, rect.x, rect.y, rect.w, rect.h);
    }
  }
  ctx.restore();

  if (fc.borderWidthPx > 0) {
    ctx.save();
    ctx.lineWidth = fc.borderWidthPx;
    if (fc.borderGradient) {
      const rad = (fc.borderGradient.angleDeg * Math.PI) / 180;
      const x0 = rect.x + rect.w / 2 - (Math.cos(rad) * rect.w) / 2;
      const y0 = rect.y + rect.h / 2 - (Math.sin(rad) * rect.h) / 2;
      const grad = ctx.createLinearGradient(x0, y0, rect.x + rect.w - (x0 - rect.x), rect.y + rect.h - (y0 - rect.y));
      grad.addColorStop(0, fc.borderGradient.from);
      grad.addColorStop(1, fc.borderGradient.to);
      ctx.strokeStyle = grad;
    } else {
      ctx.strokeStyle = fc.borderColor;
    }
    applyShape();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawRedactions(ctx: CanvasRenderingContext2D, comp: Composition, deps: DrawDeps): void {
  for (const rr of comp.redactions) {
    const { rect } = rr;
    if (rr.redaction.mode === 'pixelate' && deps.scratch) {
      const block = 16;
      const sw = Math.max(1, Math.round(rect.w / block));
      const sh = Math.max(1, Math.round(rect.h / block));
      const sc = deps.scratch as HTMLCanvasElement;
      if (sc.width !== sw || sc.height !== sh) {
        sc.width = sw;
        sc.height = sh;
      }
      const sctx = sc.getContext('2d');
      if (!sctx) continue;
      sctx.clearRect(0, 0, sw, sh);
      sctx.drawImage(ctx.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sc, 0, 0, sw, sh, rect.x, rect.y, rect.w, rect.h);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      ctx.filter = 'blur(24px)';
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.restore();
    }
  }
}

function drawCursor(ctx: CanvasRenderingContext2D, comp: Composition): void {
  const c = comp.cursor;
  if (!c || !c.visible) return;
  const style = comp.cursorStyle;
  ctx.save();
  ctx.globalAlpha = c.alpha;
  const size = (style.sizePx / 1000) * comp.outH * c.scale;

  // Spotlight effect: darkens inner screen except circular aperture around cursor
  if (style.spotlight && c.visible) {
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${style.spotlightOpacity ?? 0.45})`;
    ctx.beginPath();
    ctx.rect(comp.screenRect.x, comp.screenRect.y, comp.screenRect.w, comp.screenRect.h);
    ctx.arc(c.x, c.y, style.spotlightRadiusPx ?? 120, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();
  }

  // Multi-ring radar wave animation on click
  if (style.radarRings && c.rippleMs != null) {
    const ringCount = Math.max(1, Math.min(4, style.radarRingCount ?? 3));
    const totalDuration = 550;
    const progress = clamp(c.rippleMs / totalDuration, 0, 1);
    for (let r = 0; r < ringCount; r++) {
      const ringOffset = r * 0.2;
      const ringProgress = progress - ringOffset;
      if (ringProgress > 0 && ringProgress < 1) {
        const ringAlpha = (1 - ringProgress) * 0.75;
        const ringRadius = size * (0.5 + ringProgress * 2.5);
        ctx.save();
        ctx.beginPath();
        ctx.arc(c.x, c.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = style.radarColor ?? '#7C8CF8';
        ctx.lineWidth = Math.max(1.5, size * 0.08 * (1 - ringProgress));
        ctx.globalAlpha = c.alpha * ringAlpha;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  if (style.trail) {
    for (const p of c.trail) {
      ctx.save();
      ctx.globalAlpha = c.alpha * p.alpha;
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  if (c.rippleMs != null && style.ripple) {
    const f = c.rippleMs / 450;
    const rad = size * (0.5 + f * 1.6);
    ctx.beginPath();
    ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
    ctx.strokeStyle = style.rippleColor;
    ctx.globalAlpha = c.alpha * (1 - f) * 0.7;
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.stroke();
    ctx.globalAlpha = c.alpha;
  }

  if (style.shadow) {
    ctx.shadowColor = '#000000B0';
    ctx.shadowBlur = size * 0.35;
    ctx.shadowOffsetY = size * 0.08;
  }

  const fill = () => {
    ctx.fillStyle = style.color;
    ctx.fill();
  };

  if (style.look === 'none') {
    ctx.restore();
    return;
  }

  if (style.look === 'dot' || style.look === 'circle') {
    ctx.beginPath();
    ctx.arc(c.x, c.y, size / 2, 0, Math.PI * 2);
    fill();
    if (style.outlineWidthPx > 0) {
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = (style.outlineWidthPx / 1000) * comp.outH;
      ctx.strokeStyle = style.outlineColor;
      ctx.stroke();
    }
  } else {
    // Pointer arrow path, scaled to `size` (iconic precision pointer).
    const s = size / 24;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x, c.y + 17 * s);
    ctx.lineTo(c.x + 4.5 * s, c.y + 13 * s);
    ctx.lineTo(c.x + 8.5 * s, c.y + 21 * s);
    ctx.lineTo(c.x + 11.5 * s, c.y + 19.5 * s);
    ctx.lineTo(c.x + 7.5 * s, c.y + 11.8 * s);
    ctx.lineTo(c.x + 13 * s, c.y + 11.8 * s);
    ctx.closePath();
    fill();
    if (style.outlineWidthPx > 0) {
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = (style.outlineWidthPx / 1000) * comp.outH;
      ctx.strokeStyle = style.outlineColor;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawAnnotations(ctx: CanvasRenderingContext2D, comp: Composition): void {
  for (const ra of comp.annotations) {
    const a = ra.annotation;
    ctx.save();
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = Math.max(1, ra.widthPx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (a.kind === 'highlighter') ctx.globalAlpha = 0.4;
    if (a.kind === 'pen' || a.kind === 'highlighter') {
      ctx.beginPath();
      ra.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    } else if (a.kind === 'arrow' && ra.points.length >= 2) {
      const [x1, y1] = ra.points[0]!;
      const [x2, y2] = ra.points[ra.points.length - 1]!;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = Math.max(8, ra.widthPx * 3.4);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    } else if ((a.kind === 'rect' || a.kind === 'spotlight') && ra.rect) {
      if (a.kind === 'spotlight') {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#000000';
        const full = new Path2D();
        full.rect(0, 0, comp.outW, comp.outH);
        const hole = new Path2D();
        hole.arc(ra.rect.x + ra.rect.w / 2, ra.rect.y + ra.rect.h / 2, Math.max(ra.rect.w, ra.rect.h) / 2, 0, Math.PI * 2);
        ctx.fill(full, 'evenodd');
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeRect(ra.rect.x, ra.rect.y, ra.rect.w, ra.rect.h);
      }
    } else if (a.kind === 'ellipse' && ra.rect) {
      ctx.beginPath();
      ctx.ellipse(ra.rect.x + ra.rect.w / 2, ra.rect.y + ra.rect.h / 2, ra.rect.w / 2, ra.rect.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (a.kind === 'text' && a.text) {
      ctx.font = `${ra.fontSizePx}px system-ui, sans-serif`;
      ctx.shadowColor = '#00000090';
      ctx.shadowBlur = ra.fontSizePx * 0.2;
      ctx.fillText(a.text, ra.points[0]?.[0] ?? ra.rect?.x ?? 0, ra.points[0]?.[1] ?? ra.rect?.y ?? 0);
    } else if (a.kind === 'click' && ra.points.length >= 1) {
      const [x, y] = ra.points[0]!;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(10, ra.widthPx * 6), 0, Math.PI * 2);
      ctx.globalAlpha = 0.5;
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawCaptions(ctx: CanvasRenderingContext2D, comp: Composition): void {
  if (comp.captions.length === 0) return;
  const st = comp.captionStyle;
  const line = comp.captions.map((c) => c.text).join(' ');
  if (!line.trim()) return;
  const size = (st.sizePx / 1000) * comp.outH;
  const x = comp.outW / 2;
  const y =
    st.position === 'bottom'
      ? comp.outH - size * 1.6
      : comp.outH - size * 1.6 - comp.outH * 0.12;
  ctx.save();
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(line);
  if (st.style === 'boxed' || st.style === 'pill') {
    const padX = size * 0.5;
    const padY = size * 0.3;
    ctx.fillStyle = `rgba(8,10,14,${st.backgroundOpacity})`;
    if (st.style === 'pill') {
      roundRectPath(
        ctx,
        { x: x - metrics.width / 2 - padX, y: y - size - padY, w: metrics.width + 2 * padX, h: size + 2 * padY },
        (size + 2 * padY) / 2,
      );
    } else {
      roundRectPath(ctx, { x: x - metrics.width / 2 - padX, y: y - size - padY, w: metrics.width + 2 * padX, h: size + 2 * padY }, size * 0.18);
    }
    ctx.fill();
  } else {
    ctx.shadowColor = '#000000C0';
    ctx.shadowBlur = size * 0.25;
  }
  if (st.style === 'karaoke') {
    // Draw word-by-word; the active line is fully highlighted (word timing
    // refinement is tracked in STATUS.md).
    ctx.fillStyle = st.highlightColor;
    ctx.fillText(line, x, y);
  } else {
    ctx.fillStyle = st.color;
    ctx.fillText(line, x, y);
  }
  ctx.restore();
}

function drawKeystrokes(ctx: CanvasRenderingContext2D, comp: Composition): void {
  if (comp.keystrokes.length === 0) return;
  // Deduplicate keys active at the moment
  const recent = comp.keystrokes.slice(-4);
  const size = Math.max(14, comp.outH * 0.024);
  const padX = size * 0.7;
  const padY = size * 0.4;
  const gap = size * 0.4;

  ctx.save();
  ctx.font = `600 ${size}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Measure total width
  const items = recent.map((k) => {
    const text = k.key.length === 1 ? k.key.toUpperCase() : k.key;
    const w = ctx.measureText(text).width + padX * 2;
    // Fade out as it ages (1200 ms max)
    const alpha = clamp(1 - k.ageMs / 1200, 0, 1);
    return { text, w, alpha };
  });

  const totalWidth = items.reduce((acc, it) => acc + it.w, 0) + (items.length - 1) * gap;
  let startX = (comp.outW - totalWidth) / 2;
  const y = comp.outH - comp.outH * 0.08;

  for (const it of items) {
    const h = size + padY * 2;
    const r: Rect = { x: startX, y: y - h / 2, w: it.w, h };
    ctx.globalAlpha = it.alpha;

    // Keycap background
    ctx.fillStyle = 'rgba(18, 22, 30, 0.88)';
    roundRectPath(ctx, r, size * 0.35);
    ctx.fill();

    // Keycap border & drop shadow
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    roundRectPath(ctx, r, size * 0.35);
    ctx.stroke();

    // Keycap text
    ctx.fillStyle = '#f1f3f9';
    ctx.fillText(it.text, startX + it.w / 2, y);

    startX += it.w + gap;
  }
  ctx.restore();
}

/** Draw a complete composition. Called identically by preview and export. */
export function drawComposition(ctx: CanvasRenderingContext2D, comp: Composition, project: RecastProject, deps: DrawDeps): void {
  drawBackground(ctx, comp, deps);

  // Clip intro transition: the whole screen card (shadow + video + border)
  // fades/slides in with the eased layer alpha.
  const layerAlpha = comp.intro ? comp.intro.alpha : 1;
  const outerCard = comp.windowRect ?? comp.screenRect;

  const sh = SHADOWS[comp.shadow];
  if (sh.blur > 0) {
    ctx.save();
    ctx.globalAlpha = layerAlpha;
    ctx.shadowColor = `rgba(0,0,0,${sh.alpha})`;
    ctx.shadowBlur = sh.blur * comp.outH;
    ctx.shadowOffsetY = sh.y * comp.outH;
    ctx.fillStyle = '#000000';
    roundRectPath(ctx, outerCard, comp.radiusPx);
    ctx.fill();
    ctx.restore();
  }

  // Draw Window Chrome header bar if enabled
  if (comp.windowChrome?.enabled && comp.windowRect) {
    drawWindowChrome(ctx, comp, layerAlpha);
  }

  // Screen video with zoom mapping.
  ctx.save();
  ctx.globalAlpha = layerAlpha;
  if (comp.windowChrome?.enabled) {
    roundBottomRectPath(ctx, comp.screenRect, comp.radiusPx);
  } else {
    roundRectPath(ctx, comp.screenRect, comp.radiusPx);
  }
  ctx.clip();
  const frame = deps.getFrame('__active__', 0);
  if (frame) {
    const vs = comp.visibleSrc;
    const media = project.media;
    const fw = (frame as { videoWidth?: number; width?: number }).videoWidth || (frame as { width?: number }).width || media.width || 1;
    const fh = (frame as { videoHeight?: number; height?: number }).videoHeight || (frame as { height?: number }).height || media.height || 1;
    const scaleX = fw / (media.width || fw);
    const scaleY = fh / (media.height || fh);
    const sx = clamp(vs.x * scaleX, 0, Math.max(0, fw - 1));
    const sy = clamp(vs.y * scaleY, 0, Math.max(0, fh - 1));
    const sw = clamp(vs.w * scaleX, 1, fw - sx);
    const shh = clamp(vs.h * scaleY, 1, fh - sy);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame as CanvasImageSource, sx, sy, sw, shh, comp.screenRect.x, comp.screenRect.y, comp.screenRect.w, comp.screenRect.h);
  } else {
    ctx.fillStyle = 'rgba(20, 24, 35, 0.95)';
    ctx.fillRect(comp.screenRect.x, comp.screenRect.y, comp.screenRect.w, comp.screenRect.h);
  }
  drawRedactions(ctx, comp, deps);
  ctx.restore();

  if (comp.borderWidthPx > 0) {
    ctx.save();
    ctx.globalAlpha = layerAlpha;
    ctx.lineWidth = comp.borderWidthPx;
    ctx.strokeStyle = comp.borderColor;
    roundRectPath(ctx, outerCard, comp.radiusPx);
    ctx.stroke();
    ctx.restore();
  }

  drawFacecam(ctx, comp, deps);

  drawAnnotations(ctx, comp);
  drawCursor(ctx, comp);
  drawCaptions(ctx, comp);
  drawKeystrokes(ctx, comp);

  if (comp.showSafeGuides) {
    ctx.save();
    ctx.strokeStyle = '#7C8CF860';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.strokeRect(comp.outW * 0.05, comp.outH * 0.05, comp.outW * 0.9, comp.outH * 0.9);
    ctx.restore();
  }

  // Whole-video fade in/out — always the topmost layer.
  if (comp.fadeOverlay) {
    ctx.save();
    ctx.globalAlpha = comp.fadeOverlay.alpha;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, comp.outW, comp.outH);
    ctx.restore();
  }
}
