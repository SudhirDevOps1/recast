import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { PRODUCT_NAME } from '@recast/shared';
import { context } from './context';

/**
 * Tray + macOS menu-bar extra. Shows live recording state, elapsed time and
 * session size; doubles as the global control surface.
 */

let tray: Tray | null = null;
let timerTimer: NodeJS.Timeout | null = null;

function iconPath(): string {
  const name =
    process.platform === 'win32'
      ? 'icon.png'
      : process.platform === 'darwin'
        ? 'iconTemplate.png'
        : 'icon.png';
  try {
    return join(process.resourcesPath ?? app.getAppPath(), 'build', name);
  } catch {
    return join(__dirname, '../../build', name);
  }
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function setupTray(): Tray {
  const icon = nativeImage.createFromPath(iconPath());
  const resized = icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 });
  tray = new Tray(resized.isEmpty() ? icon : resized);
  tray.setToolTip(PRODUCT_NAME);
  renderIdleMenu();
  return tray;
}

function renderIdleMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Recast', click: () => void showMain() },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ]),
  );
}

async function showMain(): Promise<void> {
  const c = context();
  if (c.mainWindow) {
    c.mainWindow.show();
    return;
  }
  const { createMainWindow } = await import('./windows');
  c.mainWindow = createMainWindow();
}

export function renderRecordingMenu(startedAtMs: number, bytes: number, paused: boolean): void {
  if (!tray) return;
  const tick = (): void => {
    if (!tray) return;
    const elapsed = paused ? trayElapsed : Date.now() - startedAtMs;
    if (!paused) trayElapsed = elapsed;
    tray.setToolTip(`${PRODUCT_NAME} — ${paused ? 'paused' : 'recording'} ${formatMs(elapsed)}`);
  };
  let trayElapsed = Date.now() - startedAtMs;
  tick();
  if (!timerTimer) {
    timerTimer = setInterval(tick, 1_000);
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: paused ? 'Resume recording' : 'Pause recording', click: () => void togglePause() },
      { label: 'Stop recording', click: () => void stopRecording() },
      { type: 'separator' },
      { label: `Session size: ${(bytes / 1_000_000).toFixed(1)} MB`, enabled: false },
      { label: 'Open Recast', click: () => void showMain() },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ]),
  );
}

export function renderStoppedMenu(): void {
  if (timerTimer) {
    clearInterval(timerTimer);
    timerTimer = null;
  }
  renderIdleMenu();
}

async function togglePause(): Promise<void> {
  const c = context();
  if (c.mainWindow && !c.mainWindow.isDestroyed()) {
    c.mainWindow.webContents.send('recorder:hotkey', { action: 'toggle-pause' });
  }
}

async function stopRecording(): Promise<void> {
  const c = context();
  if (c.mainWindow && !c.mainWindow.isDestroyed()) {
    if (c.mainWindow.isMinimized()) c.mainWindow.restore();
    c.mainWindow.show();
    c.mainWindow.focus();
    c.mainWindow.webContents.send('recorder:requestStop');
  }
}

export function disposeTray(): void {
  if (timerTimer) clearInterval(timerTimer);
  timerTimer = null;
  tray?.destroy();
  tray = null;
}
