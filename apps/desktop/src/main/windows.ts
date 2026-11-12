import { BrowserWindow, app, screen } from 'electron';
import { join } from 'node:path';
import { context } from './context';

/**
 * Window management. No default Electron chrome: frameless on Windows/Linux,
 * hiddenInset traffic lights on macOS. All windows load from the built
 * renderer with a hash route (`index.html#/editor` etc.).
 */

const PRELOAD = join(__dirname, '../preload/index.js');

const TITLEBAR_DARK = { color: '#0e1015', symbolColor: '#e8ebf2' };
const TITLEBAR_LIGHT = { color: '#f7f8fa', symbolColor: '#171a20' };

/**
 * The window chrome (native title-bar overlay + backgroundColor) is drawn by
 * the OS, so it cannot read CSS tokens. Apply the app theme to it explicitly,
 * otherwise switching to light leaves dark native window controls on a light
 * header (or invisible light-on-light buttons).
 */
export function applyWindowTheme(win: BrowserWindow | null, theme: string): void {
  if (!win || win.isDestroyed() || process.platform === 'darwin') return;
  const light = theme === 'light';
  win.setBackgroundColor(light ? '#f7f8fa' : '#0e1015');
  try {
    win.setTitleBarOverlay({ ...(light ? TITLEBAR_LIGHT : TITLEBAR_DARK), height: 44 });
  } catch {
    /* Older Linux WMs do not support the overlay; the app frame still works. */
  }
}

export function createMainWindow(): BrowserWindow {
  const mac = process.platform === 'darwin';
  const light = context().settings.theme === 'light';
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: light ? '#f7f8fa' : '#0e1015',
    titleBarStyle: mac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: mac ? false : { ...(light ? TITLEBAR_LIGHT : TITLEBAR_DARK), height: 44 },
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
  const primary = screen.getPrimaryDisplay();
  const width = 480;
  const height = 54;
  const x = Math.round(primary.workArea.x + (primary.workArea.width - width) / 2);
  const y = Math.round(primary.workArea.y + primary.workArea.height - height - 24);

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
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
  win.setAlwaysOnTop(true, 'screen-saver');
  try {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    /* platform specific */
  }
  // Exclude floating toolbar from screen recording so it is never baked into footage
  win.setContentProtection(true);
  win.on('show', () => {
    try {
      win.setContentProtection(true);
      win.setAlwaysOnTop(true, 'screen-saver');
    } catch {
      /* ignore */
    }
  });
  win.once('ready-to-show', () => {
    win.show();
    win.setAlwaysOnTop(true, 'screen-saver');
  });

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

export function createFloatingCameraWindow(targetDeviceId?: string): BrowserWindow {
  const c = context();
  if (c.cameraWindow) return c.cameraWindow;
  const primary = screen.getPrimaryDisplay();
  const size = 220;
  const x = Math.round(primary.workArea.x + primary.workArea.width - size - 32);
  const y = Math.round(primary.workArea.y + primary.workArea.height - size - 96);

  const win = new BrowserWindow({
    x,
    y,
    width: size,
    height: size,
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
  win.setAlwaysOnTop(true, 'screen-saver');
  try {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    /* platform specific */
  }
  // Exclude floating webcam window from screen capture so footage is clean!
  win.setContentProtection(true);
  win.on('show', () => {
    try {
      win.setContentProtection(true);
      win.setAlwaysOnTop(true, 'screen-saver');
    } catch {
      /* ignore */
    }
  });
  win.once('ready-to-show', () => {
    win.show();
    win.setAlwaysOnTop(true, 'screen-saver');
  });

  const devUrl = process.env.RECAST_DEV_URL ?? process.env.ELECTRON_RENDERER_URL;
  const query = targetDeviceId ? `?deviceId=${encodeURIComponent(targetDeviceId)}` : '';
  if (devUrl) void win.loadURL(`${devUrl.replace(/\/$/, '')}/camera.html${query}`);
  else void win.loadFile(join(__dirname, '../renderer/camera.html'), { search: query ? query.slice(1) : undefined });

  win.on('closed', () => {
    const ctx = context();
    if (ctx.cameraWindow === win) ctx.cameraWindow = null;
  });
  c.cameraWindow = win;
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
