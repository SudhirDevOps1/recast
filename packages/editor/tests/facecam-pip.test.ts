import { describe, expect, it } from 'vitest';
import { computeComposition, type ComposeDeps } from '../src/compositor';
import { BUILTIN_PRESETS, DEFAULT_FACECAM, makeEmptyProject, type RecastProject } from '@recast/shared';

/** Face-cam PiP placement math — output coordinates, corner + round crop. */

function projectWithFacecam(overrides: Partial<RecastProject['style']['facecam']> = {}): RecastProject {
  const base = makeEmptyProject('prj-x', 'Test', new Date().toISOString(), JSON.parse(JSON.stringify(BUILTIN_PRESETS[0])));
  return {
    ...base,
    media: {
      ...base.media,
      width: 1920,
      height: 1080,
      camera: { id: 'cam-0', file: 'cam-0.webm', startUs: 0, endUs: 60_000_000, width: 640, height: 480, sizeBytes: 1 },
    },
    style: { ...base.style, facecam: { ...DEFAULT_FACECAM, enabled: true, ...overrides } },
    timeline: {
      clips: [{ id: 'c1', segmentId: 'seg-1', track: 'screen' as const, sourceInUs: 0, sourceOutUs: 60_000_000, timelineInUs: 0, speed: 1, transitionIn: 'none' as const, transitionMs: 450 }],
      durationUs: 60_000_000,
    },
    zoom: { ...base.zoom, enabled: false },
  };
}

const DEPS: ComposeDeps = {
  pose: { scale: 1, cx: 960, cy: 540 },
  cursorEvents: [],
  getCaptionsAt: () => [],
  showSafeGuides: false,
  clipIn: null,
  totalDurationUs: 60_000_000,
};

describe('facecam PiP composition', () => {
  it('places a round cam in the top-left corner with a margin', () => {
    const project = projectWithFacecam({ position: 'tl', widthFraction: 0.2, marginFraction: 0.04 });
    const comp = computeComposition(project, 1_000_000, 1920, 1080, DEPS);
    expect(comp.facecam).not.toBeNull();
    expect(comp.facecam!.rect.x).toBeCloseTo(0.04 * 1080, 0);
    expect(comp.facecam!.rect.y).toBeCloseTo(0.04 * 1080, 0);
    expect(comp.facecam!.rect.w).toBeCloseTo(0.2 * 1920, 0);
    expect(comp.facecam!.radiusPx).toBeCloseTo(comp.facecam!.rect.w / 2, 0);
  });

  it('places a rectangular cam bottom-right without square height', () => {
    const project = projectWithFacecam({ position: 'br', round: false, widthFraction: 0.25 });
    const comp = computeComposition(project, 1_000_000, 1920, 1080, DEPS);
    expect(comp.facecam).not.toBeNull();
    const fc = comp.facecam!;
    // 4:3 camera → h = w * 0.75
    expect(fc.rect.h).toBeLessThan(fc.rect.w);
    expect(fc.rect.x + fc.rect.w).toBeCloseTo(1920 - 0.04 * 1080, 0);
    expect(fc.radiusPx).toBeLessThan(fc.rect.w / 2);
  });

  it('renders nothing when disabled or when the session has no camera track', () => {
    const disabled = computeComposition(projectWithFacecam({ enabled: false }), 0, 1920, 1080, DEPS);
    expect(disabled.facecam).toBeNull();
    const noCam = computeComposition({ ...projectWithFacecam(), media: { ...projectWithFacecam().media, camera: null } }, 0, 1920, 1080, DEPS);
    expect(noCam.facecam).toBeNull();
  });
});
