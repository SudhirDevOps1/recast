import { describe, expect, it } from 'vitest';
import { EASE_NAMES, evalEase, lerp } from '@recast/editor';

describe('easing curves', () => {
  it('maps endpoints exactly for every curve', () => {
    for (const name of EASE_NAMES) {
      expect(evalEase(name, 0)).toBeCloseTo(name === 'hold' ? 0 : 0, 6);
      expect(evalEase(name, 1)).toBeCloseTo(1, 6);
    }
  });

  it('stays within [0, 1.15] across the domain (pop overshoots slightly)', () => {
    for (const name of EASE_NAMES) {
      for (let i = 0; i <= 100; i++) {
        const v = evalEase(name, i / 100);
        expect(v).toBeGreaterThanOrEqual(-0.001);
        expect(v).toBeLessThanOrEqual(1.15);
      }
    }
  });

  it('hold stays at 0 until the very end, then snaps', () => {
    expect(evalEase('hold', 0.99)).toBe(0);
    expect(evalEase('hold', 1)).toBe(1);
  });

  it('pop overshoots past 1 mid-curve and settles at 1', () => {
    let max = 0;
    for (let i = 0; i <= 100; i++) max = Math.max(max, evalEase('pop', i / 100));
    expect(max).toBeGreaterThan(1.02);
    expect(max).toBeLessThan(1.15);
    expect(evalEase('pop', 1)).toBeCloseTo(1, 6);
  });

  it('is deterministic', () => {
    const run = () => EASE_NAMES.map((n) => evalEase(n, 0.37));
    expect(run()).toEqual(run());
  });

  it('lerp interpolates linearly', () => {
    expect(lerp(2, 6, 0.25)).toBeCloseTo(3, 10);
    expect(lerp(2, 6, 0)).toBe(2);
    expect(lerp(2, 6, 1)).toBe(6);
  });
});
