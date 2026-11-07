import { execSync } from 'node:child_process';
import { recordingsDir } from './paths';

/**
 * Free-disk-space check for the recordings directory (used by the disk-space
 * guard before and during recording). Cross-platform, best effort — a
 * failure returns a conservative null rather than blocking recording.
 */
export function checkDiskSpace(): number {
  try {
    const dir = recordingsDir();
    if (process.platform === 'win32') {
      const out = execSync('powershell -NoProfile -Command "(Get-PSDrive C).Free"', { timeout: 3_000 }).toString();
      return Math.round(Number(out.trim()) / 1_000_000);
    }
    const out = execSync(`df -k "${dir}" | tail -1 | awk '{print $4}'`, { timeout: 3_000, shell: '/bin/bash' }).toString();
    return Math.round(Number(out.trim()) / 1024);
  } catch {
    return -1; // unknown — UI shows "unknown" rather than a fake number
  }
}
