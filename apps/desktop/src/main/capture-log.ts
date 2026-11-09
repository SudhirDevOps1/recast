import { app, clipboard } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { context, settingsStore } from './context';
import { ffmpegState } from './ffmpeg-service';
import { dataDirHint } from './paths';

/**
 * Structured capture diagnostics.
 *
 * The renderer batches structured log entries (stage, level, message, detail)
 * over `capture:appendLog`; they are appended as NDJSON to
 * `%APPDATA%/Recast/logs/capture.log` (userData/logs on macOS/Linux) with a
 * single rotation slot. Every future bug report can therefore carry a precise
 * per-stage trace via Settings → Diagnostics → Copy diagnostics bundle.
 */

const MAX_BYTES = 512 * 1024;

export function captureLogPath(): string {
  return join(app.getPath('userData'), 'logs', 'capture.log');
}

export interface CaptureLogEntry {
  ts: number;
  stage: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  detail?: string;
}

async function appendLine(line: string): Promise<void> {
  const file = captureLogPath();
  await fs.mkdir(join(file, '..'), { recursive: true });
  try {
    const stat = await fs.stat(file);
    if (stat.size > MAX_BYTES) {
      await fs.rm(`${file}.1`, { force: true });
      await fs.rename(file, `${file}.1`);
    }
  } catch {
    /* file does not exist yet */
  }
  await fs.appendFile(file, line + '\n', 'utf8');
}

export async function appendCaptureLog(entries: CaptureLogEntry[]): Promise<void> {
  for (const e of entries.slice(-200)) {
    const detail = e.detail ? ` · ${e.detail.replace(/\s+/g, ' ').slice(0, 500)}` : '';
    const line = `${new Date(e.ts).toISOString()} [${e.level}] ${e.stage}: ${e.message}${detail}`;
    await appendLine(line);
  }
}

export async function readCaptureLogTail(lines = 200): Promise<string> {
  try {
    const text = await fs.readFile(captureLogPath(), 'utf8');
    return text.split('\n').filter(Boolean).slice(-lines).join('\n');
  } catch {
    return '(capture log is empty — no recording has been attempted on this profile yet)';
  }
}

/** One copy-pasteable bundle for bug reports. Contains no secrets. */
export async function buildDiagnosticsBundle(): Promise<string> {
  const c = context();
  const platform = process.platform;
  const ffmpeg = (await ffmpegState()).status;
  const bundle = [
    'Recast diagnostics bundle',
    '========================',
    `Generated: ${new Date().toISOString()}`,
    `App: ${app.getVersion()} · Electron ${process.versions.electron ?? '?'} · Chromium ${process.versions.chrome ?? '?'} · Node ${process.versions.node ?? '?'}`,
    `OS: ${process.getSystemVersion()} (${platform}/${process.arch})`,
    `Data dir: ${dataDirHint()}`,
    '',
    'Settings:',
    JSON.stringify({ ...settingsStore(), exportDir: settingsStore().exportDir ? '(set)' : '' }, null, 2),
    '',
    'FFmpeg:',
    JSON.stringify({ available: ffmpeg.available, version: ffmpeg.version, source: ffmpeg.source }, null, 2),
    '',
    `Display-media deny (last): ${c.displayMediaDeny ? JSON.stringify(c.displayMediaDeny) : 'none'}`,
    '',
    'Capture log (last 200 lines):',
    await readCaptureLogTail(200),
  ];
  return bundle.join('\n');
}

export async function copyDiagnosticsBundle(): Promise<void> {
  clipboard.writeText(await buildDiagnosticsBundle());
}
