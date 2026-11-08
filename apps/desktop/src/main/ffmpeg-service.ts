import { resolveFfmpeg, FfmpegRunner } from '@recast/shared/node';
import type { FfmpegStatus } from '@recast/shared';
import { createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
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

/**
 * ffprobe source: the eugeneware/ffprobe-static repo publishes NO GitHub
 * releases (the previous pinned URL 404'd, which made the whole installer
 * roll back and left clean machines without ffmpeg at all — export was
 * broken). The npm tarball ships every platform binary under
 * package/bin/<platform>/<arch>/ and the registry URL is stable.
 */
const FFPROBE_NPM_TARBALL = 'https://registry.npmjs.org/ffprobe-static/-/ffprobe-static-3.1.0.tgz';

/** npm tarball layout: package/bin/<platform>/<arch>/ffprobe[.exe]. Returns
 *  null on platforms the package does not ship (e.g. linux-arm64). */
function ffprobeTarballEntry(): string | null {
  const plat = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64';
  const exe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  // The package has no linux/arm64 or darwin/arm64-except-11+ entries; guard.
  const known = new Set(['darwin-arm64', 'darwin-x64', 'linux-ia32', 'linux-x64', 'win32-ia32', 'win32-x64']);
  if (!known.has(`${plat}-${arch}`)) return null;
  return `package/bin/${plat}/${arch}/${exe}`;
}

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

/** In-app download. ffmpeg is REQUIRED (export depends on it); ffprobe is
 *  BEST-EFFORT — a failure never rolls the ffmpeg install back. */
export async function installFfmpeg(onProgress: (pct: number) => void): Promise<{ ok: boolean; error?: string }> {
  const key = platformKey();
  const ffmpegFile = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const ffprobeFile = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const dir = binDir();
  const installed: string[] = [];
  try {
    // 1) ffmpeg (required)
    const ffmpegDest = join(dir, ffmpegFile);
    const ffmpegPartial = `${ffmpegDest}.part`;
    await downloadToFile(FFMPEG_RELEASES[key], ffmpegPartial, onProgress);
    // Never run an unverified binary: require a plausible size and a working
    // `-version` before it lands at the final path.
    const stat = await fs.stat(ffmpegPartial);
    if (stat.size < 1_000_000) throw new Error('Downloaded file is suspiciously small — refusing to install.');
    if (process.platform !== 'win32') {
      await fs.chmod(ffmpegPartial, 0o755);
    }
    const check = await new FfmpegRunner(ffmpegPartial, null).version();
    if (!check) throw new Error('Downloaded binary failed validation — rolling back.');
    await fs.rename(ffmpegPartial, ffmpegDest);
    installed.push(ffmpegFile);

    // 2) ffprobe (best-effort — used for media probing, not the export path)
    try {
      const entry = ffprobeTarballEntry();
      if (!entry) throw new Error(`ffprobe is not published for ${key} — media probing needs a system ffprobe.`);
      const tgz = join(dir, 'ffprobe-static.tgz.part');
      await downloadToFile(FFPROBE_NPM_TARBALL, tgz, () => undefined);
      const probeDest = join(dir, ffprobeFile);
      await extractTarEntry(tgz, entry, probeDest);
      await fs.rm(tgz, { force: true });
      if (process.platform !== 'win32') {
        await fs.chmod(probeDest, 0o755);
      }
      // Validate: ffprobe must run and print a version line.
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      await promisify(execFile)(probeDest, ['-version'], { timeout: 10_000 });
      installed.push(ffprobeFile);
    } catch {
      // ffprobe is optional — keep the ffmpeg install.
      await fs.rm(join(dir, `${ffprobeFile}.part`), { force: true }).catch(() => undefined);
    }

    // Record what we installed next to the binary.
    atomicWrite(
      join(dir, 'manifest.json'),
      JSON.stringify({ key, installedAt: new Date().toISOString(), files: installed }, null, 2),
    );
    resolved = null; // force re-resolve
    return { ok: true };
  } catch (e) {
    // Roll back partial files; keep any fully installed binaries.
    await fs.rm(join(dir, `${ffmpegFile}.part`), { force: true }).catch(() => undefined);
    await fs.rm(join(dir, `${ffprobeFile}.part`), { force: true }).catch(() => undefined);
    await fs.rm(join(dir, 'ffprobe-static.tgz.part'), { force: true }).catch(() => undefined);
    return { ok: false, error: (e as Error).message };
  }
}

/** Extract one file from a .tgz using the system tar (bsdtar ships with
 *  Windows 10+, macOS and every Linux distro). */
async function extractTarEntry(tgzPath: string, entry: string, dest: string): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const tmp = `${dest}.extract`;
  await fs.mkdir(tmp, { recursive: true });
  await run('tar', ['-xzf', tgzPath, '-C', tmp, entry], { timeout: 60_000 });
  await fs.rename(join(tmp, entry), dest);
  await fs.rm(tmp, { recursive: true, force: true });
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
