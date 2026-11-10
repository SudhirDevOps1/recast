import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { mediaPathFromUrl } from '../src/media-url';

/**
 * Regression tests for the recast-media protocol handler path extraction.
 * The v0.1.1 Windows bug: re-adding a URL-artifact leading slash before
 * path.resolve() turned `C:/Users/…` into `\C:\Users\…`, which 404'd every
 * media request — black editor preview, dead export decode. Node's win32
 * path module is platform-independent, so these cases run on any host OS.
 */
describe('mediaPathFromUrl', () => {
  it('restores the POSIX root stripped by URL syntax', () => {
    expect(mediaPathFromUrl('/home/u/.recast/recordings/s/seg-0000.mp4', path.posix)).toBe(
      '/home/u/.recast/recordings/s/seg-0000.mp4',
    );
  });

  it('collapses the double leading slash of absolute POSIX pathnames', () => {
    expect(mediaPathFromUrl('//home/u/rec/seg-0000.mp4', path.posix)).toBe('/home/u/rec/seg-0000.mp4');
  });

  it('resolves Windows drive paths without re-rooting (v0.1.1 black-preview bug)', () => {
    expect(mediaPathFromUrl('/C%3A/Users/x/AppData/Roaming/Recast/recordings/s/seg-0000.mp4', path.win32)).toBe(
      'C:\\Users\\x\\AppData\\Roaming\\Recast\\recordings\\s\\seg-0000.mp4',
    );
  });

  it('resolves Windows percent-encoded backslash paths identically', () => {
    expect(mediaPathFromUrl('/C%3A%5CUsers%5Cx%5Crecordings%5Cseg-0000.mp4', path.win32)).toBe(
      'C:\\Users\\x\\recordings\\seg-0000.mp4',
    );
  });

  it('never produces a stray-rooted path that 404s the media request', () => {
    for (const pathname of ['/C%3A/Users/x/rec/seg-0000.mp4', '/C%3A%5CUsers%5Cx%5Crec%5Cseg-0000.mp4']) {
      const p = mediaPathFromUrl(pathname, path.win32);
      expect(p.startsWith('\\')).toBe(false);
      expect(p.toLowerCase().startsWith('c:\\c:')).toBe(false);
      expect(p.toLowerCase().endsWith('seg-0000.mp4')).toBe(true);
    }
  });

  it('decodes unicode and space segments exactly once', () => {
    expect(mediaPathFromUrl('/home/u/My%20Videos/r%C3%A9sum%C3%A9/seg.mp4', path.posix)).toBe(
      '/home/u/My Videos/résumé/seg.mp4',
    );
  });
});
