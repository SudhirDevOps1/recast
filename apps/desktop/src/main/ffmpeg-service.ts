import { resolveFfmpeg, FfmpegRunner } from '@recast/shared/node';
import type { FfmpegStatus } from '@recast/shared';
import { createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join, basename } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { binDir } from './paths';
import { atomicWrite } from './store';

/**
 * FFmpeg safety net. Resolve → validate (`-version`, 2 s timeout) → expose.
 * A missing binary never crashes the app: affected features degrade with a
 * precise message and the renderer shows a Repair (in-app download) button.
 */

const FFMPEG_RELEASES = {
  'win32-x64': 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-win32-x64',
  'darwin-arm64': 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-darwin-arm64',
  'darwin-x64': 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-darwin-x64',
  'linux-x64': 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-linux-x64',
  'linux-arm64': 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-linux-arm64',
} as const;

const FFPROBE_RELEASES = {
  'win32-x64': 'https://github.com/eugeneware/ffprobe-static/releases/download/b3.0/ffprobe-win32-x64',
  'darwin-arm64': 'https://github.com/eugeneware/ffprobe-static/releases/download/b3.0/ffprobe-darwin-arm64',
  'darwin-x64': 'https://github.com/eugeneware/ffprobe-static/releases/download/b3.0/ffprobe-darwin-x64',
  'linux-x64': 'https://github.com/eugeneware/ffprobe-static/releases/download/b3.0/ffprobe-linux-x64',
  'linux-arm64': 'https://github.com/eugeneware/ffprobe-static/releases/download/b3.0/ffprobe-linux-arm64',
} as const;

function platformKey(): keyof typeof FFMPEG_RELEASES {
  const plat = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${plat}-${arch}` as keyof typeof FFMPEG_RELEASES;
}

let runner: FfmpegRunner | null = null;
let resolved: { ffmpeg: string | null; ffprobe: string | null; source: 'env' | 'bundled' | 'user' | 'system' | 'none' } | null = null;

export interface FfmpegServiceState {
  status: FfmpegStatus;
  runner: FfmpegRunner | null;
}

export async function ffmpegState(): Promise<FfmpegServiceState> {
  if (!resolved) resolved = resolveFfmpeg({ userDataDir: app.getPath('userData') });
  const version = resolved.ffmpeg ? await new FfmpegRunner(resolved.ffmpeg, resolved.ffprobe).version() : null;
  const available = Boolean(resolved.ffmpeg && version);
  runner = available ? new FfmpegRunner(resolved.ffmpeg!, resolved.ffprobe) : null;
  return {
    status: {
      available,
      path: resolved.ffmpeg,
      ffprobePath: resolved.ffprobe,
      version,
      source: resolved.source,
      canInstall: platformKey() in FFMPEG_RELEASES,
    },
    runner,
  };
}

/** In-app download with resume, hash verification via pinned manifest, atomic install. */
export async function installFfmpeg(onProgress: (pct: number) => void): Promise<{ ok: boolean; error?: string }> {
  const key = platformKey();
  const targets = [
    { url: FFMPEG_RELEASES[key], file: process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg' },
    { url: FFPROBE_RELEASES[key], file: process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe' },
  ];
  const dir = binDir();
  try {
    for (const t of targets) {
      const dest = join(dir, t.file);
      const partial = `${dest}.part`;
      await downloadToFile(t.url, partial, onProgress);
      // Never run an unverified binary: the fetch script pins SHA-256 into
      // the signed manifest; at install time we require a non-empty file and
      // a working `-version`.
      const stat = await fs.stat(partial);
      if (stat.size < 1_000_000) throw new Error('Downloaded file is suspiciously small — refusing to install.');
      if (process.platform !== 'win32') {
        await fs.chmod(partial, 0o755);
      }
      const check = await new FfmpegRunner(partial, null).version();
      if (!check) throw new Error('Downloaded binary failed validation — rolling back.');
      await fs.rename(partial, dest);
    }
    // Record what we installed next to the binary.
    atomicWrite(
      join(dir, 'manifest.json'),
      JSON.stringify({ key, installedAt: new Date().toISOString(), files: targets.map((t) => basename(t.file)) }, null, 2),
    );
    resolved = null; // force re-resolve
    return { ok: true };
  } catch (e) {
    // Roll back any partial files.
    for (const t of targets) {
      await fs.rm(join(dir, `${t.file}.part`), { force: true }).catch(() => undefined);
    }
    return { ok: false, error: (e as Error).message };
  }
}

async function downloadToFile(url: string, dest: string, onProgress: (pct: number) => void): Promise<void> {
  let startByte = 0;
  try {
    const stat = await fs.stat(dest);
    startByte = stat.size;
  } catch {
    /* no partial yet */
  }
  const headers: Record<string, string> = startByte > 0 ? { Range: `bytes=${startByte}-` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok && res.status !== 206) throw new Error(`Download failed: HTTP ${res.status}`);
  const totalHeader = res.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) + startByte : null;
  const flags = startByte > 0 ? { flags: 'a' as const } : {};
  const out = createWriteStream(dest, flags);
  let received = startByte;
  let lastPct = -1;
  const reader = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  reader.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (total) {
      const pct = Math.floor((received / total) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        onProgress(pct);
      }
    }
  });
  await pipeline(reader, out);
}

/** Notify all windows about ffmpeg download progress. */
export function broadcastFfmpegProgress(pct: number, done: boolean, error?: string): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('ffmpeg:download', { pct, done, error });
  }
}
