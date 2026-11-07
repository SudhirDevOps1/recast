import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow } from 'electron';
import { context } from './context';

/**
 * Auto-update with rollback semantics. Opt-in: nothing is checked before the
 * user enables update checks in Settings. Never restarts mid-recording.
 */

type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

function broadcast(phase: Phase, version: string | null, message: string | null): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('updater:state', { phase, version, message });
  }
}

export function setupUpdater(): void {
  // electron-updater reads app.getVersion() in its constructor and requires a
  // valid semver. Dev launches (electron out/main/index.js) report "0.0",
  // which would throw; update wiring is only meaningful for packaged builds.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => broadcast('checking', null, null));
  autoUpdater.on('update-available', (info) => broadcast('available', info.version ?? null, 'A new version is available.'));
  autoUpdater.on('update-not-available', (info) => broadcast('idle', info.version ?? null, 'You are up to date.'));
  autoUpdater.on('download-progress', (p) => {
    broadcast('downloading', null, `Downloading ${Math.floor(p.percent)}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    broadcast('ready', info.version ?? null, 'Update ready — installs on quit.');
  });
  autoUpdater.on('error', (e) => broadcast('error', null, e.message));
}

export async function checkForUpdates(): Promise<{ available: boolean; version: string | null }> {
  const result = await autoUpdater.checkForUpdates();
  const version = result?.updateInfo.version ?? null;
  return { available: Boolean(version), version };
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate();
}

/** Install now — blocked while recording, per the non-negotiables. */
export function installUpdate(): { started: boolean; blockedReason: string | null } {
  if (context().activeSessionId) {
    return { started: false, blockedReason: 'A recording is active. Install after it finishes — Recast never restarts mid-recording.' };
  }
  autoUpdater.quitAndInstall(false, true);
  return { started: true, blockedReason: null };
}
