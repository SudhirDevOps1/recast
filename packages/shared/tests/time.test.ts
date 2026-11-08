import { describe, expect, it } from 'vitest';
import { buildTimeMap, formatClock, rippleDeleteRange, splitClipsAt, timelineToSource, US_PER_S } from '@recast/shared';
import type { Clip } from '@recast/shared';

function clip(id: string, inUs: number, outUs: number, timelineIn = 0, speed = 1): Clip {
  return { id, segmentId: 'seg', track: 'screen', sourceInUs: inUs, sourceOutUs: outUs, timelineInUs: timelineIn, speed, transitionIn: 'none', transitionMs: 450 };
}

describe('formatClock', () => {
  it('formats m:ss.d', () => {
    expect(formatClock(0)).toBe('0:00.0');
    expect(formatClock(65_400_000)).toBe('1:05.4');
    expect(formatClock(US_PER_S, false)).toBe('0:01');
  });
});

describe('buildTimeMap + timelineToSource', () => {
  it('lays clips end to end', () => {
    const map = buildTimeMap([clip('a', 0, 2 * US_PER_S), clip('b', 0, 3 * US_PER_S)]);
    expect(map.durationUs).toBe(5 * US_PER_S);
    expect(map.clips[0]).toMatchObject({ tIn: 0, tOut: 2 * US_PER_S });
    expect(map.clips[1]).toMatchObject({ tIn: 2 * US_PER_S, tOut: 5 * US_PER_S });
  });

  it('maps timeline time to source time, respecting speed', () => {
    const half = clip('a', 0, 4 * US_PER_S, 0, 2); // 2x speed → 2s timeline
    const map = buildTimeMap([half]);
    const hit = timelineToSource(map, 1 * US_PER_S);
    expect(hit?.sourceUs).toBe(2 * US_PER_S);
  });

  it('returns null outside the edit', () => {
    const map = buildTimeMap([clip('a', 0, US_PER_S)]);
    expect(timelineToSource(map, 5 * US_PER_S)).toBeNull();
  });
});

describe('splitClipsAt', () => {
  it('splits one clip into two', () => {
    const c = clip('a', 0, 4 * US_PER_S);
    const out = splitClipsAt([c], 1 * US_PER_S, () => 'b');
    expect(out).not.toBeNull();
    expect(out!.length).toBe(2);
    expect(out![0].sourceOutUs).toBe(US_PER_S);
    expect(out![1].sourceInUs).toBe(US_PER_S);
    expect(out![1].sourceOutUs).toBe(4 * US_PER_S);
  });

  it('returns null when t is not inside a clip', () => {
    expect(splitClipsAt([clip('a', 0, US_PER_S)], 2 * US_PER_S, () => 'b')).toBeNull();
  });
});

describe('rippleDeleteRange', () => {
  it('removes a middle range and pulls the rest left', () => {
    const a = clip('a', 0, 2 * US_PER_S);
    const b = clip('b', 0, 2 * US_PER_S, 2 * US_PER_S);
    const out = rippleDeleteRange([a, b], 1 * US_PER_S, 3 * US_PER_S);
    // a loses its last second; b loses its first second and moves to t=1s
    expect(out.length).toBe(2);
    expect(out[0].sourceOutUs).toBe(1 * US_PER_S);
    expect(out[1].timelineInUs).toBe(1 * US_PER_S);
    expect(out[1].sourceInUs).toBe(1 * US_PER_S);
  });
});
