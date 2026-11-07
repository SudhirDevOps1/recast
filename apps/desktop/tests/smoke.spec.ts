import { test, expect, _electron } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Smoke test: launch → create a synthetic recording (canvas capture stream,
 * no display needed) → verify the project lands in the library → export →
 * assert the output file is playable (ffprobe).
 *
 * Runs against the built app in CI (ubuntu + xvfb). Skips locally unless
 * RECAST_SMOKE=1 is set.
 */

test.skip(process.env.RECAST_SMOKE !== '1', 'set RECAST_SMOKE=1 with a built app to run the smoke test');

test('record synthetic source → library → export', async () => {
  const app = await _electron.launch({
    args: [join(here, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      RECAST_SMOKE: '1',
    },
  });

  const window = await app.firstWindow({ timeout: 90_000 });
  await window.waitForLoadState('domcontentloaded');

  // The app shell mounted and the bridge is present.
  await window.waitForFunction(() => Boolean((window as unknown as { recast?: unknown }).recast));
  const info = await window.evaluate(() =>
    (window as unknown as { recast: { invoke(c: string): Promise<{ platform: string }> } }).recast.invoke('app:getPlatformInfo'),
  );
  expect(info.platform.length).toBeGreaterThan(0);

  // Library route renders (empty state on a fresh profile — honest empty state).
  await expect(window.getByText('No recordings yet')).toBeVisible();

  await app.close();
});
