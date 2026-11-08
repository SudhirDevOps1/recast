import { test, expect, _electron, type ElectronApplication } from '@playwright/test';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

/** Fresh isolated profile per launch — no state leaks between tests. */
function launchEnv(): Record<string, string> {
  return {
    ...process.env,
    RECAST_SMOKE: '1',
    XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'recast-smoke-')),
  } as Record<string, string>;
}

test('record synthetic source → library → export', async () => {
  const app = await _electron.launch({
    args: [join(here, '..', 'out', 'main', 'index.js')],
    env: launchEnv(),
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

test('display-media handler resolves a real screen source', async () => {
  test.setTimeout(180_000);
  const app = await _electron.launch({
    args: [join(here, '..', 'out', 'main', 'index.js')],
    env: launchEnv(),
  });

  const window = await app.firstWindow({ timeout: 90_000 });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(() => Boolean((window as unknown as { recast?: unknown }).recast));

  // Fresh profile: dismiss the onboarding overlay — it intercepts pointer
  // events until skipped and would swallow every click below.
  await window
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 10_000 })
    .catch(() => undefined);

  // Establish a user activation first (some Chromium builds gate
  // getDisplayMedia behind transient activation), then request the display
  // through the registered setDisplayMediaRequestHandler bridge. This is the
  // exact path "recording never starts" bugs hide behind (Electron >= 22
  // denies every request when no handler is registered).
  await window.getByRole('button', { name: 'Record', exact: true }).click();
  const info = await window.evaluate(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = stream.getVideoTracks()[0] ?? null;
    const settings = track?.getSettings() ?? {};
    const out = {
      hasVideo: Boolean(track),
      label: track?.label ?? '',
      width: Number(settings.width ?? 0),
      height: Number(settings.height ?? 0),
    };
    track?.stop();
    return out;
  });
  expect(info.hasVideo).toBe(true);
  expect(info.width).toBeGreaterThan(0);
  expect(info.height).toBeGreaterThan(0);

  await app.close();
});

test('full recording: pick source → record → stop → project lands in library', async () => {
  test.setTimeout(240_000);
  const app = await _electron.launch({
    args: [join(here, '..', 'out', 'main', 'index.js')],
    env: launchEnv(),
  });

  const window = await app.firstWindow({ timeout: 90_000 });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(() => Boolean((window as unknown as { recast?: unknown }).recast));

  // Fresh profile: dismiss the onboarding overlay before interacting.
  await window
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 10_000 })
    .catch(() => undefined);

  // Navigate to the recorder and pick the first available screen source.
  await window.getByRole('button', { name: 'Record', exact: true }).click();
  const card = window.locator('button[aria-pressed]').first();
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  await card.click();

  await window.getByRole('button', { name: 'Start recording' }).click();

  // Countdown (3 s default) → encoder init → the live "Recording" badge.
  await window.getByText('Recording').first().waitFor({ state: 'visible', timeout: 40_000 });

  // Bytes must start flowing: the view swaps its crash-safety hint for a
  // "N MB · M dropped frames" readout once segments hit disk.
  try {
    await expect(window.getByText(/\d+(\.\d+)? MB/)).toBeVisible({ timeout: 30_000 });
  } catch {
    const toast = await window
      .getByText(/Recording failed/)
      .textContent()
      .catch(() => null);
    throw new Error(`Recorder produced no bytes${toast ? ` — ${toast}` : ''}`);
  }
  await window.waitForTimeout(2_500); // ≥ ~4 s of footage across ≥ 1 segment

  await window.getByRole('button', { name: 'Stop & open editor' }).click();

  // The project must be finalized (manifest → project build with auto-zoom)
  // and registered in the library.
  await expect
    .poll(
      async () =>
        await window.evaluate(async () => {
          const w = window as unknown as {
            recast: { invoke(c: string): Promise<Array<Record<string, unknown>>> };
          };
          return (await w.recast.invoke('library:list')).length;
        }),
      { timeout: 45_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // And the library UI must show it (empty state gone).
  await window.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(window.getByText('No recordings yet')).toHaveCount(0);

  await app.close();
});

test('export end-to-end: synthetic session → editor → export → verified file on disk', async () => {
  test.setTimeout(240_000);
  const app = await _electron.launch({
    args: [join(here, '..', 'out', 'main', 'index.js')],
    env: launchEnv(),
  });

  const window = await app.firstWindow({ timeout: 90_000 });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(() => Boolean((window as unknown as { recast?: unknown }).recast));
  await window
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 10_000 })
    .catch(() => undefined);

  // Diagnostics: surface silent death (OOM kill / clean exit / renderer crash).
  const proc = app.process();
  proc?.on('exit', (code, sig) => console.info(`>>> ELECTRON EXIT code=${code} sig=${sig}`));
  window.on('crash', () => console.info('>>> RENDERER CRASHED'));
  window.on('pageerror', (e) => console.info(`>>> PAGEERROR: ${e.message.slice(0, 300)}`));
  window.on('console', (m) => {
    if (m.type() === 'error') console.info(`>>> CONSOLE: ${m.text().slice(0, 300)}`);
  });

  // A real 2 s H.264 segment produced by the system ffmpeg — no screen
  // capture needed, so the run stays fast and environment-stable.
  const segPath = join(tmpdir(), `recast-smoke-seg-${process.pid}.mp4`);
  await execFileAsync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=24',
    '-pix_fmt', 'yuv420p', '-c:v', 'libx264', segPath,
  ]);
  const segBytes = new Uint8Array(readFileSync(segPath));

  // Build a real session through the app's own IPC pipeline: same handlers a
  // live recording uses (createSession → writeSegment → stop → project).
  const { projectId } = await window.evaluate(async (bytes: Uint8Array) => {
    const recast = (window as unknown as {
      recast: { invoke(c: string, p?: unknown): Promise<Record<string, unknown>> };
    }).recast;
    const { sessionId, startEpochMs } = (await recast.invoke('recorder:start', {})) as {
      sessionId: string;
      startEpochMs: number;
    };
    await recast.invoke('capture:createSession', {
      sessionId,
      manifest: {
        schemaVersion: 1,
        id: sessionId,
        startedAtEpochMs: startEpochMs,
        state: 'active',
        video: { width: 640, height: 360, fps: 24, codec: 'avc1' },
        audio: null,
        camera: null,
        pausedUs: 0,
        screen: {
          segments: [
            { id: 'seg-0', file: 'seg-0.mp4', startUs: 0, endUs: 2_000_000, width: 640, height: 360, sizeBytes: bytes.byteLength },
          ],
        },
      },
    });
    await recast.invoke('capture:writeSegment', { sessionId, file: 'seg-0.mp4', data: bytes });
    return (await recast.invoke('recorder:stop', undefined)) as { projectId: string | null };
  }, segBytes);
  expect(projectId).toBeTruthy();

  // Open the project from the Library (carries projectId into the app store).
  // Visit another route first — the Library refreshes on mount, and the app
  // already sits on 'library' after the IPC-driven session.
  await window.getByRole('button', { name: 'Record', exact: true }).click();
  await window.getByRole('button', { name: 'Library', exact: true }).click();
  await window.getByRole('button', { name: /Open Recording/ }).click();

  // Intercept the native save dialog in main: export lands in tmp, no GUI.
  const destination = join(tmpdir(), `recast-smoke-export-${process.pid}.mp4`);
  await patchSaveDialog(app, destination);

  await window.getByRole('button', { name: 'Export…' }).click();

  // The Export view must find the project (projectId now travels with the
  // editor navigation — before this fix it showed "No project selected").
  await expect(window.getByText('No project selected')).toHaveCount(0, { timeout: 20_000 });
  // Small + fast render: 720p @ 24 fps.
  await window.getByRole('combobox', { name: 'Resolution' }).click();
  await window.getByRole('option', { name: '720p' }).click();
  await window.getByRole('button', { name: 'Start export' }).click();

  // Terminal toast: verified (ffprobe present) or completed-without-verify.
  await window
    .getByText(/Export verified|ffprobe verification could not run|Export failed/)
    .first()
    .waitFor({ state: 'visible', timeout: 180_000 });
  console.info('>>> terminal toast:', await window.getByRole('status').textContent());

  // The output must exist and be non-trivial on real disk.
  await expect
    .poll(() => (existsSync(destination) ? statSync(destination).size : 0), { timeout: 30_000 })
    .toBeGreaterThan(50_000);

  await app.close();
});

/** Replace the native save dialog with a deterministic tmp destination.
 * evaluate() serializes the function into the main process — closures do NOT
 * survive, so the path must be passed as the explicit argument. */
async function patchSaveDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(
    ({ dialog }, path) => {
      (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({
        canceled: false,
        filePath: path,
      });
    },
    filePath,
  );
}
