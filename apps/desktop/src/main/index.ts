import { app, globalShortcut, powerMonitor, ipcMain } from 'electron';
import { DEFAULT_HOTKEYS, URL_SCHEME } from '@recast/shared';
import { setContext, context } from './context';
import { LibraryStore } from './store';
import { SessionService } from './sessions';
import { loadSettings, saveSettings } from './store';
import { registerIpcHandlers } from './ipc';

import { createMainWindow } from './windows';
import { setupTray, renderRecordingMenu, renderStoppedMenu } from './tray';
import { setupMenu } from './menu';
import { registerProtocol, handleDeepLink } from './deep-link';
import { registerMediaProtocol, handleMediaProtocol } from './protocol';
import { registerDisplayMediaHandler } from './display-media';
import { setupUpdater } from './updater';

/**
 * Recast main process. Owns the OS: windows, tray, global shortcuts, deep
 * links, permissions, disk. The renderer never touches any of it directly —
 * everything crosses the typed, validated IPC bridge.
 */

// Chromium buffers streaming media (the recast-media protocol, <video>
// playback, WebCodecs decode) in /dev/shm, which is tiny on some Linux
// setups, containers and VMs — exhausting it freezes the renderer mid-
// playback. Redirect that shared memory to /tmp; no downside on desktops.
app.commandLine.appendSwitch('disable-dev-shm-usage');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  if (!app.isPackaged) {
    app.setName('Recast');
  }
  registerMediaProtocol();
  registerProtocol();

  await app.whenReady();
  handleMediaProtocol();

  // Must exist before any renderer calls getDisplayMedia() — without it the
  // request is denied and recording can never start.
  registerDisplayMediaHandler();

  const library = new LibraryStore();
  const sessions = new SessionService();
  const settings = loadSettings();
  setContext({
    library,
    sessions,
    settings,
    mainWindow: null,
    toolbarWindow: null,
    areaWindow: null,
    recorderHandle: null,
    inputSampler: null,
    activeSessionId: null,
    sessionStartEpochMs: 0,
    recorderRequest: null,
    activeDisplayScaleFactor: null,
    lastMicMeterDb: null,
    lastDiskFreeMb: -1,
    activeExportIds: new Set(),
  });

  await registerIpcHandlers();
  setupMenu(() => {
    const win = context().mainWindow;
    win?.webContents.send('app:about');
  });
  setupTray();
  setupUpdater();

  context().mainWindow = createMainWindow();

  app.on('second-instance', (_e, argv) => {
    const win = context().mainWindow;
    win?.show();
    // Deep link from a fresh launch on Windows/Linux arrives in argv.
    const url = argv.find((a) => a.startsWith(`${URL_SCHEME}://`));
    if (url) handleDeepLink(url);
  });
  app.on('open-url', (e, url) => {
    e.preventDefault();
    handleDeepLink(url);
  });

  registerGlobalHotkeys();
  registerRecordingAppEvents();

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    const c = context();
    if (!c.mainWindow) c.mainWindow = createMainWindow();
    else c.mainWindow.show();
  });
  app.on('before-quit', (e) => {
    const c = context();
    if (c.recorderHandle) {
      e.preventDefault();
      void c.recorderHandle
        .stop()
        .then(() => {
          c.recorderHandle = null;
          app.quit();
        })
        .catch(() => app.exit(1));
      return;
    }
    saveSettings(c.settings);
    library.close();
  });

  // Crash recovery scan: crashed sessions surface in the Library on next launch.
  const crashed = sessions.scanForRecovery();
  if (crashed.length > 0) {
    context().mainWindow?.webContents.once('did-finish-load', () => {
      context().mainWindow?.webContents.send('session:crashed', { sessionId: crashed[0]!.sessionId });
    });
  }
}

function registerGlobalHotkeys(): void {
  const register = (): void => {
    const c = context();
    try {
      globalShortcut.register(c.settings.hotkeyRecordStop || DEFAULT_HOTKEYS.recordStop, () => {
        app.emit('recast:toggle-record');
      });
      globalShortcut.register(c.settings.hotkeyPauseResume || DEFAULT_HOTKEYS.pauseResume, () => {
        app.emit('recast:toggle-pause');
      });
    } catch {
      // Global shortcuts can be unavailable (Wayland); the UI explains it.
    }
  };
  app.whenReady().then(register);
}

function registerRecordingAppEvents(): void {
  const c = context();

  powerMonitor.on('suspend', () => {
    // System sleep pauses the recording instead of corrupting it.
    if (c.inputSampler) c.inputSampler.pause();
    c.mainWindow?.webContents.send('recorder:hotkey', { action: 'toggle-pause' });
  });
  powerMonitor.on('resume', () => {
    if (c.inputSampler) c.inputSampler.resume();
    c.mainWindow?.webContents.send('recorder:hotkey', { action: 'toggle-pause' });
  });

  (app as unknown as NodeJS.EventEmitter).on('recast:toggle-record', () => {
    const win = c.mainWindow;
    if (!win) return;
    win.webContents.send('recorder:hotkey', { action: 'toggle-record' });
    win.show();
  });
  (app as unknown as NodeJS.EventEmitter).on('recast:toggle-pause', () => {
    if (!c.activeSessionId) return;
    c.mainWindow?.webContents.send('recorder:hotkey', { action: 'toggle-pause' });
  });
  (app as unknown as NodeJS.EventEmitter).on('recast:open-project', (projectId: unknown) => {
    c.mainWindow?.webContents.send('app:open-project', String(projectId));
    c.mainWindow?.show();
  });
  (app as unknown as NodeJS.EventEmitter).on('recast:export-project', (projectId: unknown) => {
    c.mainWindow?.webContents.send('app:export-project', String(projectId));
    c.mainWindow?.show();
  });
}

// Recording state → tray, from the renderer's stats stream.
ipcMain.on('recorder:stats', (_e, stats: { phase: string; elapsedUs: number; bytes: number }) => {
  if (stats.phase === 'recording' || stats.phase === 'paused') {
    renderRecordingMenu(Date.now() - stats.elapsedUs / 1000, stats.bytes, stats.phase === 'paused');
  } else {
    renderStoppedMenu();
  }
});
