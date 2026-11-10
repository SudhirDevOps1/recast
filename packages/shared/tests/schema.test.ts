import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PRESETS,
  IPC,
  makeEmptyProject,
  RecastProjectSchema,
  SessionManifestSchema,
  StylePresetSchema,
} from '@recast/shared';

describe('style presets', () => {
  it('ships seven valid builtins', () => {
    expect(BUILTIN_PRESETS.length).toBe(7);
    for (const p of BUILTIN_PRESETS) {
      expect(StylePresetSchema.safeParse(p).success).toBe(true);
    }
  });

  it('preset ids are unique', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('project schema', () => {
  it('accepts an empty project', () => {
    const p = makeEmptyProject('id-1', 'Demo', new Date().toISOString(), BUILTIN_PRESETS[0]!);
    expect(RecastProjectSchema.safeParse(p).success).toBe(true);
  });

  it('rejects unknown schema versions', () => {
    const p = makeEmptyProject('id-1', 'Demo', new Date().toISOString(), BUILTIN_PRESETS[0]!);
    const bad = { ...p, schemaVersion: 99 };
    expect(RecastProjectSchema.safeParse(bad).success).toBe(false);
  });

  it('fills motion defaults for pre-Motion-2.0 projects (backward compatible)', () => {
    const p = makeEmptyProject('id-1', 'Demo', new Date().toISOString(), BUILTIN_PRESETS[0]!);
    // Strip everything the Motion 2.0 update introduced — as an old .recast
    // file on disk would look — and re-parse.
    const legacy = JSON.parse(
      JSON.stringify({
        ...p,
        timeline: { clips: [], durationUs: 0 },
        style: { ...p.style, cursor: { look: 'pointer', sizePx: 24, color: '#FFFFFF', outlineColor: '#101418', outlineWidthPx: 1, shadow: true, ripple: false, pressScale: 0.85, idleFadeMs: 0 } },
      }),
    );
    delete legacy.animation;
    const parsed = RecastProjectSchema.parse(legacy);
    expect(parsed.animation).toEqual({ fadeInMs: 0, fadeOutMs: 0 });
    expect(parsed.style.cursor.clickBounce).toBe(false);
    expect(parsed.style.cursor.cursorSmoothing).toBe(0);
    expect(parsed.style.cursor.trail).toBe(false);
    expect(parsed.style.cursor.rippleColor).toBe('#FFFFFF');
  });

  it('accepts clip transitions and eased keyframes', () => {
    const p = makeEmptyProject('id-1', 'Demo', new Date().toISOString(), BUILTIN_PRESETS[0]!);
    p.timeline = {
      clips: [
        {
          id: 'c1',
          segmentId: 's1',
          track: 'screen',
          sourceInUs: 0,
          sourceOutUs: 2_000_000,
          timelineInUs: 0,
          speed: 1,
          transitionIn: 'slide-left',
          transitionMs: 600,
        },
      ],
      durationUs: 2_000_000,
    };
    p.zoom.manualKeyframes = [{ id: 'kf1', tUs: 1_000_000, zoom: 2, cx: 960, cy: 540, ease: 'inout' }];
    const parsed = RecastProjectSchema.parse(p);
    expect(parsed.timeline.clips[0]!.transitionIn).toBe('slide-left');
    expect(parsed.zoom.manualKeyframes[0]!.ease).toBe('inout');
  });
});

describe('session manifest schema', () => {
  it('validates a real manifest', () => {
    const manifest = {
      schemaVersion: 1,
      id: 's-1',
      startedAtEpochMs: Date.now(),
      state: 'active',
      video: { width: 1920, height: 1080, fps: 30, codec: 'avc1' },
      audio: { codec: 'opus', sampleRate: 48000, channels: 2, file: 'audio.opus' },
      camera: null,
      screen: {
        segments: [{ id: 'g1', file: 'seg-0001.mp4', startUs: 0, endUs: 2_000_000, width: 1920, height: 1080, sizeBytes: 10 }],
      },
      pausedUs: 0,
    };
    expect(SessionManifestSchema.safeParse(manifest).success).toBe(true);
  });
});

describe('ipc contract', () => {
  it('validates recorder:start requests', () => {
    const ok = IPC['recorder:start']!.req.safeParse({ systemAudio: true });
    expect(ok.success).toBe(true);
    const bad = IPC['recorder:start']!.req.safeParse({ fps: 90 });
    expect(bad.success).toBe(false);
  });

  it('validates settings defaults', () => {
    const s = IPC['app:getSettings']!.res.parse({});
    expect(s.theme).toBe('dark');
    expect(s.autoCheckUpdates).toBe(false);
  });

  it('rejects bad export formats', () => {
    const bad = IPC['export:run']!.req.safeParse({ projectId: 'x', format: 'avi', resolution: '1080p', fps: 30, destination: '/tmp' });
    expect(bad.success).toBe(false);
  });
});
