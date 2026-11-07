import { app } from 'electron';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { APP_ID, PRODUCT_NAME } from '@recast/shared';

/**
 * Data directories. Portable mode: when `portable.marker` sits next to the
 * executable and the directory is writable, all data lives beside the exe —
 * settings never touch %APPDATA%.
 */

export function isPortable(): boolean {
  const exeDir = dirname(app.getPath('exe'));
  const marker = join(exeDir, 'portable.marker');
  if (!existsSync(marker)) return false;
  try {
    writeFileSync(join(exeDir, '.write-test'), 'x');
    return true;
  } catch {
    return false;
  }
}

export function dataRoot(): string {
  if (isPortable()) {
    try {
      return dirname(app.getPath('exe'));
    } catch {
      /* fall through to standard dirs */
    }
  }
  return app.getPath('userData');
}

export function recordingsDir(): string {
  const d = join(dataRoot(), 'recordings');
  mkdirSync(d, { recursive: true });
  return d;
}

export function projectsDir(): string {
  const d = join(dataRoot(), 'projects');
  mkdirSync(d, { recursive: true });
  return d;
}

export function exportsDir(): string {
  const d = join(dataRoot(), 'exports');
  mkdirSync(d, { recursive: true });
  return d;
}

export function modelsDir(): string {
  const d = join(dataRoot(), 'models');
  mkdirSync(d, { recursive: true });
  return d;
}

export function binDir(): string {
  const d = join(dataRoot(), 'bin', 'ffmpeg');
  mkdirSync(d, { recursive: true });
  return d;
}

export function settingsFile(): string {
  return join(dataRoot(), 'settings.json');
}

export function libraryDbFile(): string {
  return join(dataRoot(), 'library.db');
}

export function sessionDir(id: string): string {
  const d = join(recordingsDir(), id);
  mkdirSync(d, { recursive: true });
  return d;
}

export const PLATFORM_PATH_HINTS = {
  win32: '%APPDATA%\\Recast',
  darwin: '~/Library/Application Support/Recast',
  linux: '~/.config/recast',
} as const;

export function dataDirHint(): string {
  const key = process.platform as keyof typeof PLATFORM_PATH_HINTS;
  return PLATFORM_PATH_HINTS[key] ?? dataRoot();
}

export function appIdentifier(): string {
  return APP_ID;
}

export const productName = PRODUCT_NAME;
