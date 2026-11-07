import { describe, expect, it } from 'vitest';
import { springStep, settlesWithoutOvershoot } from '@recast/editor';
import {
  autoKeyframes,
  buildZoomTrack,
  clusterInterests,
  computeAutoZoom,
  detectInterestPoints,
  followCursorTrack,
  poseAt,
  type CursorSample,
  type InterestPoint,
} from '@recast/editor';

function samplesWithClicks(): { samples: CursorSample[]; clicks: Array<{ tUs: number; x: number; y: number }> } {
  // A cursor that sits still for 1 s, moves fast to (900, 500), clicks, works
  // there for 2 s, then returns. 1920x1080 source.
  const samples: CursorSample[] = [];
  const push = (tUs: number, x: number, y: number) => samples.push({ tUs, x, y });
  for (let i = 0; i <= 60; i++) push(i * 16_667, 300 + i, 300); // ~1 s drift
  for (let i = 1; i <= 12; i++) push(1_000_000 + i * 16_667, 300 + i * 50, 300 + i * 16); // fast move
  for (let i = 0; i < 120; i++) push(1_200_000 + i * 16_667, 900 + Math.sin(i / 6) * 12, 500);
  for (let i = 1; i <= 12; i++) push(3_200_000 + i * 16_667, 900 - i * 50, 500);
  return { samples, clicks: [{ tUs: 1_400_000, x: 900, y: 500 }] };
}

describe('spring', () => {
  it('settles to the goal without overshoot (critically damped, from rest)', () => {
    const s = { x: 0, v: 0 };
    const out: number[] = [];
    for (let i = 0; i < 400; i++) {
      const n = springStep(s, 1, 2 * Math.PI * 1.2, 1 / 60);
      s.x = n.x;
      s.v = n.v;
      out.push(n.x);
    }
    expect(settlesWithoutOvershoot(0, 1, out)).toBe(true);
    expect(out[out.length - 1]!).toBeCloseTo(1, 3);
  });

  it('is deterministic', () => {
    const run = () => {
      let s = { x: 0, v: 0 };
      for (let i = 0; i < 100; i++) s = springStep(s, 2, 7.5, 1 / 60);
      return s.x;
    };
    expect(run()).toBe(run());
  });
});

describe('interest detection + clustering', () => {
  it('finds the fast move and the click as interests', () => {
    const { samples, clicks } = samplesWithClicks();
    const interests = detectInterestPoints(samples, clicks, 1920, 1080);
    expect(interests.length).toBeGreaterThan(8);
    expect(interests.some((p) => p.weight === 2)).toBe(true);
  });

  it('clusters nearby interests into regions', () => {
    const { samples, clicks } = samplesWithClicks();
    const interests = detectInterestPoints(samples, clicks, 1920, 1080);
    const clusters = clusterInterests(interests, 1920, 1080);
    // Sweep out, click+work, sweep back → three intent regions at most.
    expect(clusters.length).toBeLessThanOrEqual(3);
    const main = clusters.find((c) => c.weight === 2)!;
    expect(Math.abs(main.cx - 900)).toBeLessThan(220);
    expect(Math.abs(main.cy - 500)).toBeLessThan(220);
  });
});

describe('auto keyframes', () => {
  it('clamps zoom and keeps the viewport inside the source', () => {
    const { samples, clicks } = samplesWithClicks();
    const kfs = computeAutoZoom(samples, clicks, 1920, 1080, 'punchy');
    expect(kfs.length).toBeGreaterThan(0);
    for (const kf of kfs) {
      expect(kf.zoom).toBeGreaterThanOrEqual(1);
      expect(kf.zoom).toBeLessThanOrEqual(4);
      const viewW = 1920 / kf.zoom;
      const viewH = 1080 / kf.zoom;
      expect(kf.cx).toBeGreaterThanOrEqual(viewW / 2 - 1);
      expect(kf.cx).toBeLessThanOrEqual(1920 - viewW / 2 + 1);
      expect(kf.cy).toBeGreaterThanOrEqual(viewH / 2 - 1);
      expect(kf.cy).toBeLessThanOrEqual(1080 - viewH / 2 + 1);
    }
  });
});

describe('zoom track', () => {
  it('starts at identity, reaches the keyframe pose, never jumps', () => {
    const { samples, clicks } = samplesWithClicks();
    const kfs = computeAutoZoom(samples, clicks, 1920, 1080, 'balanced');
    const track = buildZoomTrack(kfs, 1920, 1080, 'balanced', 4_000_000);
    expect(track.length).toBeGreaterThan(100);

    const first = track[0]!.pose;
    expect(first.scale).toBeCloseTo(1, 2);

    // No discontinuities: consecutive samples differ by a bounded amount.
    for (let i = 1; i < track.length; i++) {
      const a = track[i - 1]!.pose;
      const b = track[i]!.pose;
      expect(Math.abs(b.scale - a.scale)).toBeLessThan(0.15);
      expect(Math.hypot(b.cx - a.cx, b.cy - a.cy)).toBeLessThan(400);
    }

    // The zoom actually engages somewhere near the click.
    const maxScale = Math.max(...track.map((s) => s.pose.scale));
    expect(maxScale).toBeGreaterThan(1.1);
  });

  it('poseAt interpolates within bounds', () => {
    const track = buildZoomTrack(
      [{ id: 'a', tUs: 500_000, zoom: 2, cx: 960, cy: 540, ease: 'out' }],
      1920,
      1080,
      'balanced',
      2_000_000,
    );
    const mid = poseAt(track, 1_000_000);
    expect(mid).not.toBeNull();
    expect(mid!.scale).toBeGreaterThan(0.99);
    expect(mid!.scale).toBeLessThanOrEqual(2.001);
  });
});

describe('follow cursor', () => {
  it('holds still inside the dead zone and follows outside', () => {
    const samples: CursorSample[] = [];
    // Cursor jitters ±8 px around center — inside an 18 % dead zone.
    for (let i = 0; i < 120; i++) samples.push({ tUs: i * 16_667, x: 960 + (i % 2 === 0 ? 8 : -8), y: 540 });
    const track = followCursorTrack(samples, 1920, 1080, 'balanced');
    const moved = Math.hypot(
      track[track.length - 1]!.pose.cx - track[0]!.pose.cx,
      track[track.length - 1]!.pose.cy - track[0]!.pose.cy,
    );
    expect(moved).toBeLessThan(5);

    // Then a big sweep to a corner — the camera must chase it.
    const samples2 = [...samples];
    for (let i = 0; i < 120; i++) samples2.push({ tUs: 2_000_000 + i * 16_667, x: 100 + i * 5, y: 100 });
    const track2 = followCursorTrack(samples2, 1920, 1080, 'balanced');
    const moved2 = Math.hypot(
      track2[track2.length - 1]!.pose.cx - track2[0]!.pose.cx,
      track2[track2.length - 1]!.pose.cy - track2[0]!.pose.cy,
    );
    expect(moved2).toBeGreaterThan(200);
  });
});

describe('cluster keyframe mapping', () => {
  it('autoKeyframes maps clusters to keyframes with pre-roll', () => {
    const points: InterestPoint[] = [
      { tUs: 1_000_000, x: 500, y: 400, weight: 2 },
      { tUs: 1_100_000, x: 540, y: 420, weight: 2 },
    ];
    const clusters = clusterInterests(points, 1920, 1080);
    expect(clusters.length).toBe(1);
    const kfs = autoKeyframes(clusters, 1920, 1080, 'subtle');
    expect(kfs.length).toBe(1);
    expect(kfs[0]!.tUs).toBeLessThan(1_000_000);
    expect(kfs[0]!.zoom).toBeGreaterThanOrEqual(1);
  });
});
