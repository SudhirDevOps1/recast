/* global window */
/**
 * Capture a REAL end-to-end demo GIF for the README by driving the built
 * Electron app under xvfb with Playwright: Library → Editor playback →
 * live style-preset switches → Export (progress + verified toast).
 * Nothing is mocked — the export at the end writes a real MP4 to disk.
 *
 * Usage: xvfb-run -s "-screen 0 1600x1000x24" node scripts/capture-demo.mjs
 * Output: docs/screenshots/demo.gif (+ frame PNGs in a temp dir)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const outGif = join(repo, 'docs', 'screenshots', 'demo.gif');
const frameDir = mkdtempSync('/tmp/recast-demo-');

const require = createRequire(join(repo, 'apps', 'desktop', 'package.json'));
const { _electron } = require('@playwright/test');
const ffmpegPath = process.env.RECAST_FFMPEG || 'ffmpeg';
execFileSync(ffmpegPath, ['-version'], { stdio: 'pipe' });

const FPS = 10;

// ---------- 1. demo media: gradient + fake moving cursor dot + title ----------
const demoDir = mkdtempSync('/tmp/recast-shot-');
const demoMp4 = join(demoDir, 'demo.mp4');
const DUR = 8;
execFileSync(ffmpegPath, [
  '-y',
  '-f', 'lavfi', '-i', `gradients=s=1280x800:d=${DUR}:speed=0.08:c0=#6C5CE7:c1=#00CEC9:c2=#090B10:c3=#2D3436`,
  '-f', 'lavfi', '-i', `sine=frequency=220:duration=${DUR}`,
  '-vf', [
    `drawtext=text='Acme Dashboard':fontcolor=white@0.92:fontsize=54:x=(w-text_w)/2:y=120:shadowx=2:shadowy=2:shadowcolor=black@0.5`,
    `drawtext=text='●':fontcolor=#FFD54A:fontsize=34:x='460+260*sin(2*PI*t/4)':y='400+150*cos(2*PI*t/5)':shadowx=1:shadowy=1:shadowcolor=black@0.6`,
    `drawtext=text='●':fontcolor=#FF7979:fontsize=34:x='640+220*sin(2*PI*t/3.5+2)':y='420+130*sin(2*PI*t/4.5+1)'`,
  ].join(','),
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '96k', '-shortest', demoMp4,
], { stdio: 'pipe' });
console.log('demo video:', demoMp4);

// ---------- 2. launch app ----------
const electronApp = await _electron.launch({
  args: [join(repo, 'apps', 'desktop', 'out', 'main', 'index.js'), '--window-size=1440,900', '--disable-dev-shm-usage'],
  env: { ...process.env, RECAST_SMOKE: '1' },
});
const win = await electronApp.firstWindow({ timeout: 90_000 });
await win.waitForLoadState('domcontentloaded');
await win.waitForFunction(() => Boolean(window.recast), null, { timeout: 30_000 });
const proc = electronApp.process();
proc?.on('exit', (code, sig) => console.info(`>>> ELECTRON EXIT code=${code} sig=${sig}`));
win.on('pageerror', (e) => console.info(`>>> PAGEERROR: ${e.message.slice(0, 200)}`));

// ---------- 3. demo project (same schema-valid shape as capture-screenshots) ----------
const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
const sessionDir = join(userData, 'recordings', 'demo-acme');
mkdirSync(sessionDir, { recursive: true });
execFileSync('cp', [demoMp4, join(sessionDir, 'seg-0001.mp4')]);

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
const saved = await win.evaluate(async (p) => {
  try { await window.recast.invoke('projects:save', { project: p }); return 'ok'; }
  catch (e) { return `error: ${e && e.message ? e.message : String(e)}`; }
}, project);
console.log('projects:save →', saved);
if (saved !== 'ok') {
  writeFileSync(join(demoDir, 'project.json'), JSON.stringify(project, null, 2));
  throw new Error('project save failed; payload kept at ' + join(demoDir, 'project.json'));
}

// ---------- 4. frame capture helpers ----------
let frame = 0;
async function snap() {
  // A screenshot can stall if the renderer hiccups; skip the frame rather
  // than dying — the GIF tolerates dropped frames.
  await win.screenshot({ path: join(frameDir, `f${String(frame++).padStart(4, '0')}.png`), timeout: 12_000 })
    .catch(() => { frame--; });
}
async function dwell(ms, fps = FPS) {
  const n = Math.max(1, Math.round((ms / 1000) * fps));
  for (let i = 0; i < n; i) {
    const t0 = Date.now();
    await snap();
    i++;
    const budget = 1000 / fps - (Date.now() - t0);
    if (budget > 15) await win.waitForTimeout(budget);
  }
}

// ---------- 5. the walkthrough ----------
await win.waitForTimeout(1500);
const skip = win.getByRole('button', { name: 'Skip', exact: true });
if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
await win.waitForTimeout(900);

console.log('scene 1: library');
// The Library lists projects on mount only — visit another route and come
// back so the freshly saved demo project appears (same trick the smoke
// suite uses).
await win.getByRole('button', { name: 'Record', exact: true }).click();
await win.waitForTimeout(700);
await win.getByRole('button', { name: 'Library', exact: true }).click();
await win.waitForTimeout(1200);
await dwell(4500);

console.log('scene 2: editor + playback');
await win.click('[aria-label="Open Product Demo — Acme Dashboard"]');
await win.waitForTimeout(2200);
await win.getByRole('button', { name: 'Play', exact: true }).click().catch(() => {});
await dwell(9500); // full 8 s preview plays through: auto-zoom, cursor, frame

console.log('scene 3: style presets live');
await win.getByRole('button', { name: 'Style', exact: true }).click();
await win.waitForTimeout(800);
const presetBox = win.getByRole('combobox', { name: 'Style preset' });
await presetBox.click();
await win.getByRole('option', { name: 'Bold Punch' }).click();
await dwell(4000);
await presetBox.click();
await win.getByRole('option', { name: 'Social Vertical' }).click();
await dwell(4000);
await presetBox.click();
await win.getByRole('option', { name: 'Soft Studio' }).click();
await win.waitForTimeout(700);

console.log('scene 4: motion panel');
await win.getByRole('button', { name: 'Motion', exact: true }).click()
  .catch(() => win.getByText('Motion', { exact: true }).first().click());
await dwell(3500);

console.log('scene 5: export');
const destination = join(demoDir, 'demo-export.mp4');
await electronApp.evaluate(({ dialog }, path) => {
  dialog.showSaveDialog = async () => ({
    canceled: false, filePath: path,
  });
}, destination);
await win.getByRole('button', { name: 'Export…' }).click();
await win.waitForTimeout(1800);
await dwell(2500); // export settings view
await win.getByRole('combobox', { name: 'Resolution' }).click();
await win.getByRole('option', { name: '720p' }).click();
await win.getByRole('button', { name: 'Start export' }).click();
// Capture progress until the export actually finishes: the Exporting… button
// flips back to "Start export" (deterministic), then the terminal toast shows.
// Software render of 8 s @720p takes 60-120 s under xvfb (screenshots steal
// CPU), so snap only every 12th iteration here.
const exportingBtn = win.getByRole('button', { name: 'Exporting…' });
let exportDone = false;
for (let s = 0; s < 700 && !exportDone; s++) {
  if (s % 12 === 0) await snap();
  await win.waitForTimeout(100);
  exportDone = !(await exportingBtn.isVisible().catch(() => false));
}
console.log('export busy finished:', exportDone);
let toastSeen = await win.getByText(/Export verified|ffprobe verification could not run|Export failed/).first()
  .isVisible().catch(() => false);
console.log('export toast seen:', toastSeen);
await dwell(3000); // let the success toast breathe

console.log('scene 6: back to library (closing shot)');
await win.getByRole('button', { name: 'Library', exact: true }).click();
await win.waitForTimeout(1000);
await dwell(3000);

await electronApp.close();

// ---------- 6. assemble GIF (palette for crisp colors) ----------
console.log(`frames captured: ${frame} → ${outGif}`);
execFileSync(ffmpegPath, [
  '-y', '-framerate', String(FPS), '-i', join(frameDir, 'f%04d.png'),
  '-vf', 'fps=10,scale=880:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  '-loop', '0', outGif,
], { stdio: 'pipe' });
const sizeMb = (await import('node:fs')).statSync(outGif).size / 1048576;
console.log(`demo.gif written: ${sizeMb.toFixed(1)} MB`);
if (sizeMb > 14) {
  console.log('too large — re-encoding at 12 colors/720px');
  execFileSync(ffmpegPath, [
    '-y', '-framerate', String(FPS), '-i', join(frameDir, 'f%04d.png'),
    '-vf', 'fps=8,scale=720:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-loop', '0', outGif,
  ], { stdio: 'pipe' });
  console.log(`re-encoded: ${((await import('node:fs')).statSync(outGif).size / 1048576).toFixed(1)} MB`);
}
rmSync(frameDir, { recursive: true, force: true });
console.log('done →', outGif);
