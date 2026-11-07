import { describe, expect, it } from 'vitest';
import { buildExportName, dedupeName, sanitizeFilename, timestampStamp } from '@recast/shared';

describe('sanitizeFilename', () => {
  it('strips filesystem-illegal characters', () => {
    expect(sanitizeFilename('my: demo/file?.mp4')).toBe('my demo file.mp4');
    expect(sanitizeFilename('a<b>c|d"e')).toBe('a b c d e');
  });

  it('trims trailing dots and spaces (Windows-safe)', () => {
    expect(sanitizeFilename('report...')).toBe('report');
    expect(sanitizeFilename('  spaced  name ')).toBe('spaced name');
  });

  it('never returns an empty name', () => {
    expect(sanitizeFilename('///')).toBe('untitled');
    expect(sanitizeFilename('???')).toBe('untitled');
  });

  it('caps length at 120 chars', () => {
    const long = 'x'.repeat(500);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(120);
  });
});

describe('timestampStamp', () => {
  it('formats yyyyMMdd-HHmm', () => {
    const d = new Date(2025, 10, 7, 14, 5); // local time, month 11
    expect(timestampStamp(d)).toBe('20251107-1405');
  });
});

describe('buildExportName', () => {
  it('follows recast-{project}-{stamp}.{ext}', () => {
    const d = new Date(2025, 0, 2, 9, 30);
    expect(buildExportName('My Demo', 'mp4', d)).toBe('recast-my-demo-20250102-0930.mp4');
  });

  it('uses correct extensions per format', () => {
    const d = new Date(2025, 0, 2, 9, 30);
    expect(buildExportName('x', 'prores', d).endsWith('.mov')).toBe(true);
    expect(buildExportName('x', 'gif', d).endsWith('.gif')).toBe(true);
    expect(buildExportName('x', 'hevc', d).endsWith('.mp4')).toBe(true);
  });

  it('de-duplicates against existing files', () => {
    const d = new Date(2025, 0, 2, 9, 30);
    const existing = ['recast-my-demo-20250102-0930.mp4', 'recast-my-demo-20250102-0930-2.mp4'];
    expect(buildExportName('My Demo', 'mp4', d, existing)).toBe(
      'recast-my-demo-20250102-0930-3.mp4',
    );
  });
});

describe('dedupeName', () => {
  it('appends (n) for collisions', () => {
    const existing = ['a.mp4', 'a (2).mp4'];
    expect(dedupeName('a', 'mp4', existing)).toBe('a (3).mp4');
  });
});
