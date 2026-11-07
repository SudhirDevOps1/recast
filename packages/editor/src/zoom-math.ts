import { clamp, ZOOM } from '@recast/shared';
import type { ZoomKeyframe, ZoomIntensity } from '@recast/shared';
import { springStep, type SpringState } from './spring';

export interface CursorSample {
  tUs: number;
  x: number;
  y: number;
}

export interface InterestPoint {
  tUs: number;
  x: number;
  y: number;
  /** Clicks are stronger interests than movement. */
  weight: number;
}

export interface Cluster {
  tInUs: number;
  tOutUs: number;
  cx: number;
  cy: number;
  /** Max weight inside the cluster. */
  weight: number;
  radiusPx: number;
}

export interface ZoomPose {
  scale: number;
  cx: number;
  cy: number;
}

export interface FollowStep {
  tUs: number;
  pose: ZoomPose;
}

// ---------------------------------------------------------------------------
// 1. Interest detection
// ---------------------------------------------------------------------------

/**
 * Sampled at 60 Hz. A point is "interesting" when the cursor is moving fast
 * or the user clicked. Pure function of the input track.
 */
export function detectInterestPoints(
  samples: CursorSample[],
  clickTimesUs: Array<{ tUs: number; x: number; y: number }>,
  sourceW: number,
  sourceH: number,
): InterestPoint[] {
  const out: InterestPoint[] = [];
  // Speed threshold: ~15% of the frame diagonal per second.
  const diag = Math.hypot(sourceW, sourceH);
  const speedThreshold = diag * 0.15;

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const dt = (b.tUs - a.tUs) / 1e6;
    if (dt <= 0) continue;
    const speed = Math.hypot(b.x - a.x, b.y - a.y) / dt;
    if (speed >= speedThreshold) {
      out.push({ tUs: b.tUs, x: b.x, y: b.y, weight: 1 });
    }
  }
  for (const c of clickTimesUs) {
    out.push({ tUs: c.tUs, x: c.x, y: c.y, weight: 2 });
  }
  out.sort((p, q) => p.tUs - q.tUs);
  return out;
}

// ---------------------------------------------------------------------------
// 2. Clustering (1.2 s window, 80 px radius at 1080p reference)
// ---------------------------------------------------------------------------

export function clusterInterests(
  points: InterestPoint[],
  sourceW: number,
  sourceH: number,
): Cluster[] {
  const windowUs = ZOOM.CLUSTER_WINDOW_MS * 1_000;
  const radiusPx = (ZOOM.CLUSTER_RADIUS_PX * sourceH) / 1080;

  const clusters: Cluster[] = [];
  let cur: InterestPoint[] = [];

  const flush = () => {
    if (cur.length === 0) return;
    const cx = cur.reduce((s, p) => s + p.x, 0) / cur.length;
    const cy = cur.reduce((s, p) => s + p.y, 0) / cur.length;
    let maxDist = 0;
    for (const p of cur) maxDist = Math.max(maxDist, Math.hypot(p.x - cx, p.y - cy));
    clusters.push({
      tInUs: cur[0]!.tUs,
      tOutUs: cur[cur.length - 1]!.tUs,
      cx,
      cy,
      weight: Math.max(...cur.map((p) => p.weight)),
      radiusPx: Math.max(radiusPx * 0.4, maxDist),
    });
    cur = [];
  };

  for (const p of points) {
    if (cur.length === 0) {
      cur = [p];
      continue;
    }
    const last = cur[cur.length - 1]!;
    const centroidX = cur.reduce((s, q) => s + q.x, 0) / cur.length;
    const centroidY = cur.reduce((s, q) => s + q.y, 0) / cur.length;
    const withinWindow = p.tUs - cur[0]!.tUs <= windowUs;
    const withinRadius = Math.hypot(p.x - centroidX, p.y - centroidY) <= radiusPx * 1.5;
    // Contiguous motion (≤ 50 ms between samples) belongs to one cluster even
    // when it travels far — a fast sweep is one "region of interest", not ten.
    const contiguous = p.tUs - last.tUs <= 50_000;
    if (withinWindow && (withinRadius || contiguous)) {
      cur.push(p);
    } else {
      flush();
      cur = [p];
    }
  }
  flush();

  // Merge clusters that land too close in time and space (click re-entry).
  const merged: Cluster[] = [];
  for (const c of clusters) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      c.tInUs - prev.tOutUs < ZOOM.PRE_ROLL_MS * 1_000 &&
      Math.hypot(c.cx - prev.cx, c.cy - prev.cy) <= radiusPx * 2
    ) {
      prev.tOutUs = Math.max(prev.tOutUs, c.tOutUs);
      prev.weight = Math.max(prev.weight, c.weight);
      prev.cx = (prev.cx + c.cx) / 2;
      prev.cy = (prev.cy + c.cy) / 2;
    } else {
      merged.push({ ...c });
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// 3. Keyframe generation
// ---------------------------------------------------------------------------

function intensityFor(i: ZoomIntensity) {
  return ZOOM.INTENSITIES[i];
}

/** Zoom is capped so the cluster region (plus margin) always fits in frame. */
export function fitZoom(
  cx: number,
  cy: number,
  radiusPx: number,
  w: number,
  h: number,
  wanted: number,
): number {
  void cx;
  void cy;
  const margin = 1.45;
  const need = 2 * radiusPx * margin;
  const maxByFit = Math.min(w / need, h / need);
  return clamp(Math.min(wanted, maxByFit), 1, 4);
}

function clampCenter(cx: number, cy: number, zoom: number, w: number, h: number): { cx: number; cy: number } {
  const viewW = w / zoom;
  const viewH = h / zoom;
  return {
    cx: clamp(cx, viewW / 2, w - viewW / 2),
    cy: clamp(cy, viewH / 2, h - viewH / 2),
  };
}

/** Cluster → zoom keyframes with pre-roll. */
export function autoKeyframes(
  clusters: Cluster[],
  sourceW: number,
  sourceH: number,
  intensity: ZoomIntensity,
): ZoomKeyframe[] {
  const cfg = intensityFor(intensity);
  const kfs: ZoomKeyframe[] = [];
  for (const c of clusters) {
    const zoom = fitZoom(c.cx, c.cy, c.radiusPx, sourceW, sourceH, cfg.zoom);
    const { cx, cy } = clampCenter(c.cx, c.cy, zoom, sourceW, sourceH);
    kfs.push({
      id: `kf-${Math.round(c.tInUs)}-${Math.round(cx)}-${Math.round(cy)}`,
      tUs: Math.max(0, c.tInUs - ZOOM.PRE_ROLL_MS * 1_000),
      zoom,
      cx,
      cy,
      ease: 'out',
    });
  }
  // Drop keyframes that duplicate the previous position within 400 ms.
  return kfs.filter((kf, i) => {
    if (i === 0) return true;
    const prev = kfs[i - 1]!;
    return !(
      Math.abs(kf.tUs - prev.tUs) < 400_000 &&
      Math.abs(kf.cx - prev.cx) < 24 &&
      Math.abs(kf.cy - prev.cy) < 24 &&
      Math.abs(kf.zoom - prev.zoom) < 0.05
    );
  });
}

// ---------------------------------------------------------------------------
// 4. Zoom track — sequential spring integration over a fixed grid
// ---------------------------------------------------------------------------

interface Spring2 {
  scale: SpringState;
  cx: SpringState;
  cy: SpringState;
}

function identityPose(w: number, h: number): ZoomPose {
  return { scale: 1, cx: w / 2, cy: h / 2 };
}

function integrate(st: Spring2, goal: ZoomPose, omega: number, dt: number): void {
  st.scale = springStep(st.scale, goal.scale, omega, dt);
  st.cx = springStep(st.cx, goal.cx, omega, dt);
  st.cy = springStep(st.cy, goal.cy, omega, dt);
}

function readPose(st: Spring2): ZoomPose {
  return { scale: st.scale.x, cx: st.cx.x, cy: st.cy.x };
}

/**
 * Build the smoothed zoom track for keyframes over [tStart, tEnd].
 *
 * The goal pose switches at `kf.tUs − preRoll` (anticipation) and the spring
 * carries its state continuously across switches, so there are no jumps.
 * Output is a fixed-step (default 60 Hz) deterministic track; evaluation is
 * a binary search + linear interpolation, identical in preview and export.
 */
export function buildZoomTrack(
  keyframes: ZoomKeyframe[],
  sourceW: number,
  sourceH: number,
  intensity: ZoomIntensity,
  tEndUs: number,
  stepUs = 16_667,
): FollowStep[] {
  const omega = intensityFor(intensity).omegaHz * 2 * Math.PI;
  const preUs = ZOOM.PRE_ROLL_MS * 1_000;
  const postUs = ZOOM.POST_ROLL_MS * 1_000;
  const endUs = Math.max(tEndUs, postUs);

  const sorted = [...keyframes].sort((a, b) => a.tUs - b.tUs);
  const st: Spring2 = { scale: { x: 1, v: 0 }, cx: { x: sourceW / 2, v: 0 }, cy: { x: sourceH / 2, v: 0 } };
  const out: FollowStep[] = [];

  let kfi = 0;
  let goal = identityPose(sourceW, sourceH);
  for (let t = 0; t <= endUs; t += stepUs) {
    // Advance the keyframe pointer: a keyframe arms at its pre-roll time.
    while (kfi < sorted.length && t >= sorted[kfi]!.tUs - preUs) {
      const kf = sorted[kfi]!;
      const kfPose = clampCenterPose(kf, sourceW, sourceH);
      goal = kfPose;
      kfi++;
    }
    // After the last keyframe's post-roll, relax back to identity only if the
    // project config says so — the compositor keeps the last pose here, and
    // "hold last" is the expected demo-video behavior.
    integrate(st, goal, omega, stepUs / 1e6);
    out.push({ tUs: t, pose: readPose(st) });
  }
  return out;
}

function clampCenterPose(kf: ZoomKeyframe, w: number, h: number): ZoomPose {
  const { cx, cy } = clampCenter(kf.cx, kf.cy, kf.zoom, w, h);
  return { scale: kf.zoom, cx, cy };
}

// ---------------------------------------------------------------------------
// 5. Follow-cursor mode (18 % dead zone, clamped pan speed)
// ---------------------------------------------------------------------------

/**
 * Precompute a follow-cursor camera track. The center stays put while the
 * cursor is inside the dead zone; outside, it follows with pan speed clamped.
 */
export function followCursorTrack(
  samples: CursorSample[],
  sourceW: number,
  sourceH: number,
  intensity: ZoomIntensity,
  stepUs = 16_667,
): FollowStep[] {
  if (samples.length === 0) return [];
  const cfg = intensityFor(intensity);
  const zoom = clamp(cfg.zoom, 1, 4);
  const viewW = sourceW / zoom;
  const viewH = sourceH / zoom;
  const deadW = viewW * ZOOM.FOLLOW_DEAD_ZONE;
  const deadH = viewH * ZOOM.FOLLOW_DEAD_ZONE;
  const maxPanPerStep = (ZOOM.FOLLOW_MAX_PAN_PXPS * stepUs) / 1e6;

  const out: FollowStep[] = [];
  let cx = sourceW / 2;
  let cy = sourceH / 2;
  let si = 0;
  const tEnd = samples[samples.length - 1]!.tUs;
  const tStart = samples[0]!.tUs;

  for (let t = tStart; t <= tEnd; t += stepUs) {
    while (si + 1 < samples.length && samples[si + 1]!.tUs <= t) si++;
    const s = samples[si]!;
    const dx = s.x - cx;
    const dy = s.y - cy;
    const ex = Math.max(0, Math.abs(dx) - deadW / 2) * Math.sign(dx);
    const ey = Math.max(0, Math.abs(dy) - deadH / 2) * Math.sign(dy);
    let nx = cx + ex;
    let ny = cy + ey;
    const pan = Math.hypot(nx - cx, ny - cy);
    if (pan > maxPanPerStep && pan > 0) {
      const k = maxPanPerStep / pan;
      nx = cx + (nx - cx) * k;
      ny = cy + (ny - cy) * k;
    }
    cx = clamp(nx, viewW / 2, sourceW - viewW / 2);
    cy = clamp(ny, viewH / 2, sourceH - viewH / 2);
    out.push({ tUs: t, pose: { scale: zoom, cx, cy } });
  }
  return out;
}

/** Evaluate a fixed-step track at arbitrary time (binary search + lerp). */
export function poseAt(track: FollowStep[], tUs: number): ZoomPose | null {
  if (track.length === 0) return null;
  if (tUs <= track[0]!.tUs) return track[0]!.pose;
  const last = track[track.length - 1]!;
  if (tUs >= last.tUs) return last.pose;
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid]!.tUs <= tUs) lo = mid;
    else hi = mid;
  }
  const a = track[lo]!;
  const b = track[hi]!;
  const f = (tUs - a.tUs) / Math.max(1, b.tUs - a.tUs);
  return {
    scale: a.pose.scale + (b.pose.scale - a.pose.scale) * f,
    cx: a.pose.cx + (b.pose.cx - a.pose.cx) * f,
    cy: a.pose.cy + (b.pose.cy - a.pose.cy) * f,
  };
}

/**
 * Full auto-zoom pipeline: cursor samples + clicks → keyframes.
 * Used by the editor ("Auto zoom") and at import time.
 */
export function computeAutoZoom(
  samples: CursorSample[],
  clicks: Array<{ tUs: number; x: number; y: number }>,
  sourceW: number,
  sourceH: number,
  intensity: ZoomIntensity,
): ZoomKeyframe[] {
  const interests = detectInterestPoints(samples, clicks, sourceW, sourceH);
  const clusters = clusterInterests(interests, sourceW, sourceH);
  return autoKeyframes(clusters, sourceW, sourceH, intensity);
}
