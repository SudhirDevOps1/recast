import { describe, it, expect } from 'vitest';
import { suggestZooms, detectInterestPoints, type CursorSample } from '../src/zoom-math';

describe('suggestZooms & Dwell Heuristic', () => {
  it('detects dwell points when cursor remains in a small radius for >= 500ms', () => {
    const samples: CursorSample[] = [];
    // 60 samples at 60 Hz = 1 second of dwell at (100, 100)
    for (let i = 0; i < 60; i++) {
      samples.push({
        tUs: i * 16_666,
        x: 100 + (i % 2), // jitter < 2px
        y: 100 + (i % 2),
      });
    }

    const interests = detectInterestPoints(samples, [], 1920, 1080, {
      includeDwell: true,
      dwellRadiusPx: 8,
      minDwellUs: 500_000,
    });

    expect(interests.length).toBeGreaterThanOrEqual(1);
    expect(interests[0]!.x).toBeCloseTo(100, 0);
    expect(interests[0]!.y).toBeCloseTo(100, 0);
    expect(interests[0]!.weight).toBe(1.5);
  });

  it('suggests keyframes from dwell and clicks in combined mode', () => {
    const samples: CursorSample[] = [];
    // 0s to 1s: dwell at (200, 200)
    for (let i = 0; i < 60; i++) {
      samples.push({ tUs: i * 16_666, x: 200, y: 200 });
    }
    // 1s to 2s: dwell at (800, 500)
    for (let i = 60; i < 120; i++) {
      samples.push({ tUs: i * 16_666, x: 800, y: 500 });
    }

    const clicks = [{ tUs: 1_500_000, x: 800, y: 500 }];

    const suggestions = suggestZooms(samples, clicks, 1920, 1080, {
      heuristic: 'combined',
      intensity: 'balanced',
    });

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0]!.zoom).toBeGreaterThan(1);
  });

  it('dwell mode ignores raw clicks if click heuristic is not active', () => {
    const samples: CursorSample[] = [];
    // Moving fast continuously, no dwell
    for (let i = 0; i < 60; i++) {
      samples.push({ tUs: i * 16_666, x: i * 20, y: i * 20 });
    }

    const clicks = [{ tUs: 500_000, x: 500, y: 500 }];

    const dwellOnly = suggestZooms(samples, clicks, 1920, 1080, {
      heuristic: 'dwell',
      intensity: 'balanced',
    });

    expect(dwellOnly.length).toBe(0);
  });
});
