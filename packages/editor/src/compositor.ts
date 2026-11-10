import { clamp } from '@recast/shared';
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
  mirror: boolean;
  shadow: boolean;
  borderWidthPx: number;
  borderColor: string;
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

  // Screen rect: fit the source video into the content rect with padding.
  const pad = (style.frame.paddingPx / 1000) * outH; // style padding is per-mille of output height
  const srcAr = project.media.width && project.media.height ? project.media.width / project.media.height : 16 / 9;
  let sw = contentRect.w - 2 * pad;
  let sh = sw / srcAr;
  if (sh > contentRect.h - 2 * pad) {
    sh = contentRect.h - 2 * pad;
    sw = sh * srcAr;
  }
  let screenRect: Rect = {
    x: contentRect.x + (contentRect.w - sw) / 2,
    y: contentRect.y + (contentRect.h - sh) / 2,
    w: Math.max(1, sw),
    h: Math.max(1, sh),
  };

  const pose = deps.pose;
  const visW = (project.media.width || screenRect.w) / pose.scale;
  const visH = (project.media.height || screenRect.h) / pose.scale;
  const visibleSrc: Rect = {
    x: pose.cx - visW / 2,
    y: pose.cy - visH / 2,
    w: visW,
    h: visH,
  };

  // Cursor mapping: source coords → output coords through the visible region.
  const cursor = mapCursor(project, tUs, deps.cursorEvents, screenRect, visibleSrc, style.cursor);

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
    // Round cams crop the source to a centered square first.
    const h = fcStyle.round ? w : w / camAspect;
    const margin = fcStyle.marginFraction * outH;
    const x = fcStyle.position === 'tl' || fcStyle.position === 'bl' ? margin : outW - w - margin;
    const y = fcStyle.position === 'tl' || fcStyle.position === 'tr' ? margin : outH - h - margin;
    facecam = {
      rect: { x, y, w, h },
      radiusPx: fcStyle.round ? w / 2 : Math.min(14, w / 8),
      round: fcStyle.round,
      mirror: fcStyle.mirror,
      shadow: fcStyle.shadow,
      borderWidthPx: (fcStyle.borderWidthPx / 1000) * outH,
      borderColor: fcStyle.borderColor,
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

function drawBackground(ctx: CanvasRenderingContext2D, comp: Composition, deps: DrawDeps): void {
  const bg = comp.background;
  const { outW, outH } = comp;
  ctx.clearRect(0, 0, outW, outH);
  switch (bg.type) {
    case 'transparent':
      return;
    case 'solid':
      ctx.fillStyle = bg.color ?? '#101418';
      ctx.fillRect(0, 0, outW, outH);
      return;
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
      return;
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
      return;
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
      return;
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
      return;
    }
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

  if (fc.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = rect.h * 0.12;
    ctx.shadowOffsetY = rect.h * 0.04;
    ctx.fillStyle = '#000000';
    roundRectPath(ctx, rect, fc.radiusPx);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  roundRectPath(ctx, rect, fc.radiusPx);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (fc.round) {
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
    ctx.strokeStyle = fc.borderColor;
    roundRectPath(ctx, rect, fc.radiusPx);
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
  if (!c || !c.visible || comp.cursorStyle.look === 'native') return;
  const style = comp.cursorStyle;
  ctx.save();
  ctx.globalAlpha = c.alpha;
  const size = (style.sizePx / 1000) * comp.outH * c.scale;

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
    // Pointer arrow path, scaled to `size`.
    const s = size / 24;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + 4.2 * s, c.y + 14.6 * s);
    ctx.lineTo(c.x + 8.0 * s, c.y + 10.4 * s);
    ctx.lineTo(c.x + 13.6 * s, c.y + 12.4 * s);
    ctx.lineTo(c.x + 14.6 * s, c.y + 9.4 * s);
    ctx.lineTo(c.x + 9.0 * s, c.y + 7.4 * s);
    ctx.lineTo(c.x + 13.2 * s, c.y + 4.4 * s);
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

  const sh = SHADOWS[comp.shadow];
  if (sh.blur > 0) {
    ctx.save();
    ctx.globalAlpha = layerAlpha;
    ctx.shadowColor = `rgba(0,0,0,${sh.alpha})`;
    ctx.shadowBlur = sh.blur * comp.outH;
    ctx.shadowOffsetY = sh.y * comp.outH;
    ctx.fillStyle = '#000000';
    roundRectPath(ctx, comp.screenRect, comp.radiusPx);
    ctx.fill();
    ctx.restore();
  }

  // Screen video with zoom mapping.
  ctx.save();
  ctx.globalAlpha = layerAlpha;
  roundRectPath(ctx, comp.screenRect, comp.radiusPx);
  ctx.clip();
  const frame = deps.getFrame('__active__', 0);
  if (frame) {
    const vs = comp.visibleSrc;
    const media = project.media;
    const sx = clamp(vs.x, 0, Math.max(0, media.width - 1));
    const sy = clamp(vs.y, 0, Math.max(0, media.height - 1));
    const sw = clamp(vs.w, 1, media.width - sx);
    const shh = clamp(vs.h, 1, media.height - sy);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame as CanvasImageSource, sx, sy, sw, shh, comp.screenRect.x, comp.screenRect.y, comp.screenRect.w, comp.screenRect.h);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(comp.screenRect.x, comp.screenRect.y, comp.screenRect.w, comp.screenRect.h);
  }
  drawRedactions(ctx, comp, deps);
  ctx.restore();

  if (comp.borderWidthPx > 0) {
    ctx.save();
    ctx.globalAlpha = layerAlpha;
    ctx.lineWidth = comp.borderWidthPx;
    ctx.strokeStyle = comp.borderColor;
    roundRectPath(ctx, comp.screenRect, comp.radiusPx);
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
