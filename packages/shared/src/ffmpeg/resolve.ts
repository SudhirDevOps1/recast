import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PRODUCT_NAME } from '../constants';

export type FfmpegSource = 'env' | 'bundled' | 'user' | 'system' | 'none';

export interface FfmpegResolution {
  ffmpeg: string | null;
  ffprobe: string | null;
  source: FfmpegSource;
}

function platformDir(): string {
  const plat = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${plat}-${arch}`;
}

function exeName(base: string): string {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) if (existsSync(p)) return p;
  return null;
}

/** Where the bundler put resources — process.resourcesPath differs between dev and packaged. */
function resourcesRoot(): string {
  const maybeResources = (process as unknown as { resourcesPath?: string }).resourcesPath;
  if (maybeResources) return join(maybeResources, 'ffmpeg', platformDir());
  // Dev: repo layout — binaries live next to the app when fetched locally.
  return join(process.cwd(), 'resources', 'ffmpeg', platformDir());
}

function lookupOnPath(base: string): string | null {
  const dirs = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':');
  for (const d of dirs) {
    const p = join(d, exeName(base));
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Resolution order (see docs/ffmpeg.md):
 * 1. `RECAST_FFMPEG` / `RECAST_FFPROBE` env override
 * 2. bundled `resources/ffmpeg/<platform>-<arch>/`
 * 3. `<userData>/bin/ffmpeg/` (in-app download)
 * 4. system PATH
 *
 * This module is main-process only; `app` is imported lazily to keep it
 * loadable in unit tests.
 */
export function resolveFfmpeg(opts?: { userDataDir?: string }): FfmpegResolution {
  const envFfmpeg = process.env.RECAST_FFMPEG;
  if (envFfmpeg && existsSync(envFfmpeg)) {
    const envProbe = process.env.RECAST_FFPROBE ?? null;
    return { ffmpeg: envFfmpeg, ffprobe: envProbe, source: 'env' };
  }

  const bundled = firstExisting([join(resourcesRoot(), exeName('ffmpeg'))]);
  const bundledProbe = firstExisting([join(resourcesRoot(), exeName('ffprobe'))]);
  if (bundled) return { ffmpeg: bundled, ffprobe: bundledProbe, source: 'bundled' };

  const userRoot = opts?.userDataDir ?? process.env.RECAST_USER_DATA ?? '';
  const user = userRoot ? firstExisting([join(userRoot, 'bin', 'ffmpeg', exeName('ffmpeg'))]) : null;
  const userProbe = userRoot ? firstExisting([join(userRoot, 'bin', 'ffmpeg', exeName('ffprobe'))]) : null;
  if (user) return { ffmpeg: user, ffprobe: userProbe, source: 'user' };

  const sysF = lookupOnPath('ffmpeg');
  if (sysF) return { ffmpeg: sysF, ffprobe: lookupOnPath('ffprobe'), source: 'system' };

  return { ffmpeg: null, ffprobe: null, source: 'none' };
}

export function expectedBundledDir(): string {
  return resourcesRoot();
}

export function dataDirLabel(): string {
  return PRODUCT_NAME;
}
