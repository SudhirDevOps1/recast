import { describe, it, expect } from 'vitest';
import { PRODUCT_VERSION } from '../src/constants';
// @ts-expect-error scripts/sync-version.mjs is an untyped ESM script
import { syncVersion } from '../../../scripts/sync-version.mjs';

describe('Version Synchronization & Single Source of Truth', () => {
  it('has consistent PRODUCT_VERSION in @recast/shared', () => {
    expect(PRODUCT_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('passes repository-wide version integrity check with 0 drift', () => {
    const result = syncVersion({ check: true });
    expect(result.isCheckOnly).toBe(true);
    expect(result.diffs).toHaveLength(0);
    expect(result.targetVersion).toBe(PRODUCT_VERSION);
  });
});
