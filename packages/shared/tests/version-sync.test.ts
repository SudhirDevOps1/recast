import { describe, it, expect } from 'vitest';
import { PRODUCT_VERSION } from '../src/constants';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('Version Synchronization & Single Source of Truth', () => {
  it('has consistent PRODUCT_VERSION in @recast/shared', () => {
    expect(PRODUCT_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('passes repository-wide version integrity check with 0 drift', () => {
    const scriptPath = resolve(__dirname, '../../../scripts/sync-version.mjs');
    const stdout = execFileSync(process.execPath, [scriptPath, '--check'], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    expect(stdout).toContain('[OK] All repo targets are in 100% sync');
  });
});
