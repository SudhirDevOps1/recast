import { describe, expect, it } from 'vitest';
import { computeComposition, type CursorSampleLike } from '@recast/editor';
import { BUILTIN_PRESETS, makeEmptyProject, type RecastProject } from '@recast/shared';

function testProject(): RecastProject {
  const p = makeEmptyProject('p1', 'Test', '2026-01-01T00:00:00Z', BUILTIN_PRESETS[1]!);
  p.media = { ...p.media, width: 1920, height: 1080, fps: 30 };
  return p;
}

const POSE = { scale: 1, cx: 960, cy: 540 };

function baseDeps(events: CursorSampleLike[] = []) {
  return {
    pose: POSE,
    cursorEvents: events,
    getCaptionsAt: () => [],
    showSafeGuides: false,
  };
}

describe('clip intro transitions', () => {
  it('fade intro: alpha ramps 0 → 1 with eased progress', () => {
    const project = testProject();
    const start = computeComposition(project, 0, 1280, 720, { ...baseDeps(), clipIn: { type: 'fade', progress: 0 } });
    expect(start.intro).not.toBeNull();
    expect(start.intro!.alpha).toBeCloseTo(0, 3);

    const mid = computeComposition(project, 0, 1280, 720, { ...baseDeps(), clipIn: { type: 'fade', progress: 0.5 } });
    expect(mid.intro!.alpha).toBeGreaterThan(0.7); // ease-out front-loads the ramp
    expect(mid.intro!.alpha).toBeLessThan(1);

    const done = computeComposition(project, 0, 1280, 720, { ...baseDeps(), clipIn: { type: 'fade', progress: 1 } });
    expect(done.intro!.alpha).toBeCloseTo(1, 3);
  });

  it('slide-left intro offsets the screen card to the right early on', () => {
    const project = testProject();
    const base = computeComposition(project, 0, 1280, 720, baseDeps()).screenRect;
    const sliding = computeComposition(project, 0, 1280, 720, { ...baseDeps(), clipIn: { type: 'slide-left', progress: 0.2 } });
    expect(sliding.screenRect.x).toBeGreaterThan(base.x);
    // The size is untouched by slides.
    expect(sliding.screenRect.w).toBeCloseTo(base.w, 3);
  });

  it('zoom intro inflates the screen card around its center', () => {
    const project = testProject();
    const base = computeComposition(project, 0, 1280, 720, baseDeps()).screenRect;
    const zoomed = computeComposition(project, 0, 1280, 720, { ...baseDeps(), clipIn: { type: 'zoom', progress: 0 } });
    expect(zoomed.screenRect.w).toBeGreaterThan(base.w);
    const baseCx = base.x + base.w / 2;
    const zoomCx = zoomed.screenRect.x + zoomed.screenRect.w / 2;
    expect(Math.abs(zoomCx - baseCx)).toBeLessThan(1);
  });

  it('no clipIn → no intro and no fade overlay', () => {
    const comp = computeComposition(testProject(), 500_000, 1280, 720, baseDeps());
    expect(comp.intro).toBeNull();
    expect(comp.fadeOverlay).toBeNull();
  });
});

describe('project fades', () => {
  it('fade in: opaque black at t=0, clear after the window', () => {
    const project = testProject();
    project.animation = { fadeInMs: 500, fadeOutMs: 0 };
    const atZero = computeComposition(project, 0, 1280, 720, { ...baseDeps(), totalDurationUs: 5_000_000 });
    expect(atZero.fadeOverlay!.alpha).toBeCloseTo(1, 3);
    const halfway = computeComposition(project, 250_000, 1280, 720, { ...baseDeps(), totalDurationUs: 5_000_000 });
    expect(halfway.fadeOverlay!.alpha).toBeCloseTo(0.5, 2);
    const after = computeComposition(project, 900_000, 1280, 720, { ...baseDeps(), totalDurationUs: 5_000_000 });
    expect(after.fadeOverlay).toBeNull();
  });

  it('fade out engages near the end of the timeline', () => {
    const project = testProject();
    project.animation = { fadeInMs: 0, fadeOutMs: 800 };
    const total = 5_000_000;
    const mid = computeComposition(project, 2_500_000, 1280, 720, { ...baseDeps(), totalDurationUs: total });
    expect(mid.fadeOverlay).toBeNull();
    const nearEnd = computeComposition(project, total - 400_000, 1280, 720, { ...baseDeps(), totalDurationUs: total });
    expect(nearEnd.fadeOverlay!.alpha).toBeCloseTo(0.5, 2);
    const last = computeComposition(project, total, 1280, 720, { ...baseDeps(), totalDurationUs: total });
    expect(last.fadeOverlay!.alpha).toBeCloseTo(1, 3);
  });
});

describe('cursor effects', () => {
  const events = (): CursorSampleLike[] => [
    { tUs: 0, x: 100, y: 100, type: 'move' },
    { tUs: 500_000, x: 100, y: 100, type: 'down' },
    { tUs: 560_000, x: 100, y: 100, type: 'up' },
    { tUs: 600_000, x: 800, y: 400, type: 'move' },
  ];

  it('raw cursor (smoothing 0, no bounce) reports the exact last position and neutral scale', () => {
    const project = testProject();
    project.style = {
      ...project.style,
      cursor: { ...project.style.cursor, cursorSmoothing: 0, clickBounce: false },
    };
    const comp = computeComposition(project, 600_000, 1280, 720, baseDeps(events()));
    expect(comp.cursor).not.toBeNull();
    // Position maps source (800, 400) through the full-frame visible rect.
    expect(comp.cursor!.x).toBeCloseTo((800 / 1920) * comp.screenRect.w + comp.screenRect.x, 1);
    expect(comp.cursor!.scale).toBeCloseTo(1, 5);
  });

  it('smoothing keeps the cursor between the old and new positions right after a jump', () => {
    const project = testProject();
    project.style = { ...project.style, cursor: { ...project.style.cursor, cursorSmoothing: 0.8 } };
    const comp = computeComposition(project, 600_000, 1280, 720, baseDeps(events()));
    const fx = (comp.cursor!.x - comp.screenRect.x) / comp.screenRect.w;
    const expectedRaw = 800 / 1920;
    // Smoothed cursor lags behind the jump: still left of the raw target.
    expect(fx).toBeLessThan(expectedRaw);
    expect(fx).toBeGreaterThan(100 / 1920);
  });

  it('click bounce overshoots scale above 1 shortly after mouse-up', () => {
    const project = testProject();
    project.style = { ...project.style, cursor: { ...project.style.cursor, clickBounce: true, pressScale: 0.8 } };
    const evs = [
      { tUs: 0, x: 500, y: 500, type: 'move' },
      { tUs: 400_000, x: 500, y: 500, type: 'down' },
      { tUs: 500_000, x: 500, y: 500, type: 'up' },
    ];
    const during = computeComposition(project, 450_000, 1280, 720, baseDeps(evs));
    expect(during.cursor!.scale).toBeCloseTo(0.8, 3); // pressed shrinks
    const overshoot = computeComposition(project, 710_000, 1280, 720, baseDeps(evs)); // 210 ms after up
    expect(overshoot.cursor!.scale).toBeGreaterThan(1.0);
    const settled = computeComposition(project, 1_200_000, 1280, 720, baseDeps(evs));
    expect(settled.cursor!.scale).toBeCloseTo(1, 5);
  });

  it('trail points are produced while enabled and empty when disabled', () => {
    const project = testProject();
    const evs: CursorSampleLike[] = [];
    for (let i = 0; i < 10; i++) evs.push({ tUs: i * 16_667, x: 100 + i * 40, y: 200, type: 'move' });
    const t = 9 * 16_667;
    const off = computeComposition(project, t, 1280, 720, baseDeps(evs));
    expect(off.cursor!.trail.length).toBe(0);
    project.style = { ...project.style, cursor: { ...project.style.cursor, trail: true, cursorSmoothing: 0.5 } };
    const on = computeComposition(project, t, 1280, 720, baseDeps(evs));
    expect(on.cursor!.trail.length).toBeGreaterThan(0);
  });
});
