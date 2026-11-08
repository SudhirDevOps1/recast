/**
 * Capture REAL app screenshots for the README by driving the built Electron
 * app under xvfb with Playwright. Injects one schema-valid demo project
 * (a real MP4 generated with ffmpeg), then screenshots Library / Editor /
 * Record / Settings.
 *
 * Usage: xvfb-run -s "-screen 0 1600x1000x24" node scripts/capture-screenshots.mjs
 * Output: docs/screenshots/*.png
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const outDir = join(repo, 'docs', 'screenshots');
mkdirSync(outDir, { recursive: true });

// pnpm workspace: playwright lives under apps/desktop; ffmpeg comes from PATH
const require = createRequire(join(repo, 'apps', 'desktop', 'package.json'));
const { _electron } = require('@playwright/test');
const ffmpegPath = process.env.RECAST_FFMPEG || 'ffmpeg';
execFileSync(ffmpegPath, ['-version'], { stdio: 'pipe' });

// ---------- 1. demo media ----------
const demoDir = mkdtempSync('/tmp/recast-shot-');
const demoMp4 = join(demoDir, 'demo.mp4');
const DUR = 8;
execFileSync(ffmpegPath, [
  '-y', '-f', 'lavfi',
  '-i', `gradients=s=1280x800:d=${DUR}:speed=0.08:c0=#6C5CE7:c1=#00CEC9:c2=#090B10:c3=#2D3436`,
  '-f', 'lavfi', '-i', `sine=frequency=220:duration=${DUR}`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '96k', '-shortest', demoMp4,
], { stdio: 'pipe' });
console.log('demo video:', demoMp4);

// ---------- 2. launch app ----------
const electronApp = await _electron.launch({
  args: [join(repo, 'apps', 'desktop', 'out', 'main', 'index.js'), '--window-size=1440,900'],
  env: { ...process.env, RECAST_SMOKE: '1' },
});
const win = await electronApp.firstWindow({ timeout: 90_000 });
await win.waitForLoadState('domcontentloaded');
await win.waitForFunction(() => Boolean(window.recast), null, { timeout: 30_000 });
console.log('app up; userData =', await electronApp.evaluate(({ app }) => app.getPath('userData')));

// ---------- 3. place demo media inside the recordings root ----------
const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
const sessionDir = join(userData, 'recordings', 'demo-acme');
mkdirSync(sessionDir, { recursive: true });
copyFileSync(demoMp4, join(sessionDir, 'seg-0001.mp4'));

// ---------- 4. schema-valid project (mirrors packages/shared project.ts) ----------
const stylePreset = {
  format: 'recaststyle', version: 1, id: 'soft-studio', name: 'Soft Studio', builtin: true,
  aspect: 'source',
  frame: {
    paddingPx: 24, radiusPx: 16, borderWidthPx: 1, borderColor: '#FFFFFF14', shadow: 'soft',
    background: { type: 'gradient', gradient: { from: '#1B2030', to: '#0E1015', angleDeg: 160 } },
  },
  cursor: {
    look: 'pointer', sizePx: 24, color: '#FFFFFF', outlineColor: '#101418', outlineWidthPx: 1,
    shadow: true, ripple: true, pressScale: 0.85, idleFadeMs: 0,
  },
  captions: { style: 'clean', sizePx: 36, color: '#FFFFFF', highlightColor: '#7C8CF8', backgroundOpacity: 0.55, position: 'bottom' },
};
const SEG_US = DUR * 1_000_000;
const project = {
  schemaVersion: 1,
  id: 'prj-demo-acme',
  name: 'Product Demo — Acme Dashboard',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  media: {
    dir: sessionDir, width: 1280, height: 800, fps: 30,
    segments: [{ id: 'seg-0001', file: 'seg-0001.mp4', startUs: 0, endUs: SEG_US, width: 1280, height: 800, sizeBytes: 1 }],
    audio: { file: 'seg-0001.mp4', startUs: 0, endUs: SEG_US },
    cursor: { file: 'cursor.jsonl', available: false },
  },
  timeline: {
    clips: [{ id: 'clip-seg-0001', segmentId: 'seg-0001', track: 'screen', sourceInUs: 0, sourceOutUs: SEG_US, timelineInUs: 0, speed: 1 }],
    durationUs: SEG_US,
  },
  zoom: { enabled: true, mode: 'auto', intensity: 'balanced', autoKeyframes: [], manualKeyframes: [] },
  style: stylePreset,
  annotations: [], redactions: [],
  audioEdits: { mutedRanges: [], volume: 1 },
  captions: null,
};
// audioEdits shape guard: if the schema expects different keys, saveProject
// validation will tell us loudly.
const saved = await win.evaluate(async (p) => {
  try { await window.recast.invoke('projects:save', { project: p }); return 'ok'; }
  catch (e) { return `error: ${e && e.message ? e.message : String(e)}`; }
}, project);
console.log('projects:save →', saved);
if (saved !== 'ok') {
  writeFileSync(join(demoDir, 'project.json'), JSON.stringify(project, null, 2));
  throw new Error('project save failed; payload kept at ' + join(demoDir, 'project.json'));
}

// ---------- 5. dismiss first-run onboarding via its own Skip button ----------
await win.waitForTimeout(1500); // onboarding opens ~600 ms after mount
const skip = win.getByRole('button', { name: 'Skip', exact: true });
if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
  await skip.click();
  console.log('onboarding skipped');
}
await win.waitForTimeout(800); // library refresh

const shot = async (name) => {
  await win.waitForTimeout(600);
  await win.screenshot({ path: join(outDir, name) });
  console.log('📸', name);
};

// Library (populated)
await shot('library.png');

// Editor: click the project card
await win.click('[aria-label="Open Product Demo — Acme Dashboard"]');
await win.waitForTimeout(2500);
// play the preview so the player area shows a real video frame
await win.getByRole('button', { name: 'Play', exact: true }).click().catch(() => {});
await win.waitForTimeout(1500);
await shot('editor.png');

// Record view
await win.getByRole('button', { name: 'Record', exact: true }).click();
await win.waitForTimeout(1200);
await shot('record.png');

// Settings view
await win.getByRole('button', { name: 'Settings', exact: true }).click();
await win.waitForTimeout(1500);
await shot('settings.png');

await electronApp.close();
console.log('done →', outDir);
