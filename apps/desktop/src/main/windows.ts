import { BrowserWindow, app, nativeTheme } from 'electron';
import { join } from 'node:path';
import { context } from './context';

/**
 * Window management. No default Electron chrome: frameless on Windows/Linux,
 * hiddenInset traffic lights on macOS. All windows load from the built
 * renderer with a hash route (`index.html#/editor` etc.).
 */

const PRELOAD = join(__dirname, '../preload/index.js');

export function createMainWindow(): BrowserWindow {
  const mac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e1015' : '#f7f8fa',
    titleBarStyle: mac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: mac ? false : { color: '#0e1015', symbolColor: '#e8ebf2', height: 44 },
    trafficLightPosition: mac ? { x: 16, y: 15 } : undefined,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // electron-vite exposes ELECTRON_RENDERER_URL in dev; RECAST_DEV_URL is our
  // manual override. Without the fallback `pnpm dev` silently loaded a stale
  // out/renderer/index.html and HMR appeared dead.
  const devUrl = process.env.RECAST_DEV_URL ?? process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  win.on('closed', () => {
    const c = context();
    if (c.mainWindow === win) c.mainWindow = null;
  });

  win.on('close', (e) => {
    // Never silently kill a recording: stop it first, then close.
    const c = context();
    if (c.recorderHandle) {
      e.preventDefault();
      void stopRecorderAndClose(win);
    }
  });

  return win;
}

async function stopRecorderAndClose(win: BrowserWindow): Promise<void> {
  const c = context();
  try {
    await c.recorderHandle?.stop();
  } catch {
    /* best effort */
  }
  c.recorderHandle = null;
  win.destroy();
}

export function createToolbarWindow(): BrowserWindow {
  const c = context();
  if (c.toolbarWindow) return c.toolbarWindow;
  const win = new BrowserWindow({
    width: 620,
    height: 56,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  // Exclude floating toolbar from screen recording so it is never baked into footage
  win.setContentProtection(true);
  const devUrl = process.env.RECAST_DEV_URL ?? process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(`${devUrl.replace(/\/$/, '')}/toolbar.html`);
  else void win.loadFile(join(__dirname, '../renderer/toolbar.html'));
  win.on('closed', () => {
    const ctx = context();
    if (ctx.toolbarWindow === win) ctx.toolbarWindow = null;
  });
  c.toolbarWindow = win;
  return win;
}

export function createAreaWindow(display: { id: number; bounds: { x: number; y: number; width: number; height: number } }): BrowserWindow {
  const c = context();
  c.areaWindow?.close();
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    fullscreen: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const devUrl = process.env.RECAST_DEV_URL ?? process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(`${devUrl.replace(/\/$/, '')}/area.html`);
  else void win.loadFile(join(__dirname, '../renderer/area.html'));
  c.areaWindow = win;
  return win;
}

export function appVersion(): string {
  return app.getVersion();
}
