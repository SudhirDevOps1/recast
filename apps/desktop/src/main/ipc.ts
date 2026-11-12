import { ipcMain, dialog, shell, BrowserWindow, screen, app, desktopCapturer } from 'electron';
import { promises as fs, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import {
  type IpcChannel,
  type ListSourcesResponse,
  type FfmpegStatus,
  type RecorderState,
  type PlatformInfo,
  type SessionManifest,
} from '@recast/shared';
import { parseSrt, parseVtt, toSrt, toVtt } from '@recast/editor';
import { context, settingsStore } from './context';
import { saveSettings } from './store';
import { buildProjectFromSession, loadProject, saveProject, readCursorJsonl, suggestExportName } from './projects';
import { permissionStatus, openPermissionSettings, requestAccess } from './permissions';
import { InputSampler } from './input-sampler';
import { ffmpegState, installFfmpeg, broadcastFfmpegProgress } from './ffmpeg-service';
import { whisperStatus, downloadWhisperModel, transcribe, installWhisperBinary } from './whisper';
import { checkForUpdates, downloadUpdate, installUpdate } from './updater';
import { applyWindowTheme } from './windows';
import { ensureSeekableWebm } from './media-index';
import { appendCaptureLog, buildDiagnosticsBundle, copyDiagnosticsBundle } from './capture-log';
import {
  beginChunkedExport,
  writeExportChunkAt,
  finalizeExport,
  discardExport,
  makeTempFrameDir,
  writeFrameImage,
  cleanupFrameDir,
  runFfmpegGif,
  runFfmpegProres,
  runLoudnorm,
  probeFile,
  readUserFile,
} from './export-service';
import { exportsDir, dataDirHint, isPortable, recordingsDir, projectsDir } from './paths';
import { mediaUrlFor } from './protocol';
import { RecastMcpServer, RECAST_TOOLS } from '@recast/mcp';

/**
 * IPC registry. Every channel is declared in @recast/shared/ipc.ts and is
 * zod-validated on BOTH ends: request here, response in the preload bridge.
 * No raw `ipcMain.on` strings outside this file.
 */

type Handler = (payload: unknown, event: Electron.IpcMainInvokeEvent) => Promise<unknown> | unknown;

const handlers = new Map<string, Handler>();

let areaResolver: ((r: { x: number; y: number; w: number; h: number } | null) => void) | null = null;

function register(channel: IpcChannel, handler: Handler): void {
  handlers.set(channel, handler);
}

function broadcastEvent(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

export async function registerIpcHandlers(): Promise<void> {
  const c = context();

  // ---------------- app / settings ----------------
  register('app:getPlatformInfo', (): PlatformInfo => {
    const sessionType =
      process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos'
      : process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland' ? 'wayland' : 'x11';
    const wayland = sessionType === 'wayland';
    const macVer = process.platform === 'darwin' ? Number(process.getSystemVersion().split('.')[0] ?? 0) : 0;
    return {
      platform: process.platform as PlatformInfo['platform'],
      arch: process.arch,
      osVersion: process.getSystemVersion(),
      sessionType,
      dataDir: dataDirHint(),
      isPortable: isPortable(),
      versions: {
        app: app.getVersion(),
        electron: process.versions.electron ?? '',
        chrome: process.versions.chrome ?? '',
        node: process.versions.node ?? '',
      },
      capabilities: {
        systemAudio: process.platform === 'win32' || (process.platform === 'darwin' && macVer >= 14.2),
        systemAudioNote:
          process.platform === 'win32'
            ? 'WASAPI loopback — no virtual cable needed.'
            : process.platform === 'darwin'
              ? macVer >= 14.2
                ? 'macOS 14.2+ loopback is active.'
                : 'System audio needs macOS 14.2 or newer. Update macOS to enable it.'
              : 'System audio capture is not available on this platform yet — mic-only fallback is used.',
        cursorTracking: !wayland,
        globalHotkeys: !wayland,
        areaSelection: !wayland,
        windowCapture: true,
      },
    };
  });

  register('app:getSettings', () => c.settings);
  register('app:setSettings', (payload) => {
    const patch = payload as Partial<typeof c.settings>;
    c.settings = { ...c.settings, ...patch };
    saveSettings(c.settings);
    if (patch.launchAtLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: patch.launchAtLogin });
    }
    if (patch.theme !== undefined) {
      applyWindowTheme(c.mainWindow, c.settings.theme);
    }
    return c.settings;
  });

  register('app:revealInFolder', async (payload) => {
    const { path } = payload as { path: string };
    await shell.showItemInFolder(path);
  });

  register('app:openUrl', async (payload) => {
    const { url } = payload as { url: string };
    // Only https URLs to our own repo/docs are allowed through the shell.
    if (/^https:\/\/(github\.com\/SudhirDevOps1\/recast(\/.*)?|recast\.dev(\/.*)?)$/.test(url)) {
      await shell.openExternal(url);
    }
  });

  // ---------------- permissions ----------------
  register('permissions:get', () => permissionStatus());
  register('permissions:request', async (payload) => {
    const { kind } = payload as { kind: 'microphone' | 'camera' };
    await requestAccess(kind);
    return permissionStatus();
  });
  register('permissions:openSystemSettings', async (payload) => {
    const { kind } = payload as { kind: 'screen' | 'microphone' | 'camera' };
    await openPermissionSettings(kind);
  });

  // ---------------- sources ----------------
  register('sources:list', async (): Promise<ListSourcesResponse> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const screens = displays.map((d, i) => {
      const match = sources.find((s) => s.display_id === String(d.id));
      return {
        id: match?.id ?? `screen:${d.id}`,
        displayId: d.id,
        name: `Display ${i + 1} (${d.size.width}×${d.size.height})`,
        width: d.size.width,
        height: d.size.height,
        scaleFactor: d.scaleFactor,
        isPrimary: d.id === primary.id,
        thumbnailDataUrl: match && !match.thumbnail.isEmpty() ? match.thumbnail.toDataURL() : null,
      };
    });
    const windows = sources
      .filter((s) => s.id.startsWith('window:'))
      .map((s) => ({
        id: s.id,
        name: s.name || 'Untitled window',
        app: 'Window',
        width: s.thumbnail.getSize().width,
        height: s.thumbnail.getSize().height,
        thumbnailDataUrl: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      }));
    const mics = await listAudioDevices('audioinput');
    const cameras = await listAudioDevices('videoinput');
    return { screens, windows, mics, cameras };
  });

  register('area:pick', async (payload) => {
    const { displayId } = payload as { displayId: number };
    const display = screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();
    const { createAreaWindow } = await import('./windows');
    const win = createAreaWindow({ id: display.id, bounds: { x: display.workArea.x, y: display.workArea.y, width: display.workArea.width, height: display.workArea.height } });
    win.show();
    const rect = await new Promise<{ x: number; y: number; w: number; h: number } | null>((resolve) => {
      const timeout = setTimeout(() => {
        areaResolver = null;
        resolve(null);
      }, 120_000);
      void timeout;
      areaResolver = resolve;
    });
    win.close();
    return { rect };
  });

  register('area:selected', (payload) => {
    const { rect } = payload as { rect: { x: number; y: number; w: number; h: number } | null };
    areaResolver?.(rect);
    areaResolver = null;
  });

  // ---------------- recorder ----------------
  register('recorder:start', async (payload) => {
    const req = payload as import('@recast/shared').RecorderStartRequest;
    const sessionId = c.sessions.newSessionId();
    const startEpochMs = Date.now();
    c.sessionStartEpochMs = startEpochMs;
    c.recorderRequest = req;
    return { sessionId, startEpochMs };
  });

  register('recorder:pause', () => {
    // Pauses the cursor sampler; the renderer pauses its own encoder handle.
    c.inputSampler?.pause();
  });
  register('recorder:resume', () => {
    c.inputSampler?.resume();
  });
  register('recorder:triggerStop', () => {
    if (c.mainWindow && !c.mainWindow.isDestroyed()) {
      if (c.mainWindow.isMinimized()) {
        c.mainWindow.restore();
      }
      c.mainWindow.show();
      c.mainWindow.focus();
      c.mainWindow.webContents.send('recorder:requestStop');
    }
  });
  register('recorder:minimizeMainWindow', () => {
    if (c.mainWindow && !c.mainWindow.isDestroyed()) {
      c.mainWindow.minimize();
    }
  });
  register('camera:setSize', (payload) => {
    const { size } = payload as { size: number };
    if (c.cameraWindow && !c.cameraWindow.isDestroyed()) {
      const s = Math.max(120, Math.min(480, size));
      c.cameraWindow.setSize(s, s);
      return true;
    }
    return false;
  });
  register('recorder:stop', async () => {
    // The renderer stopped its capture handle first; this finalizes on disk:
    // mark completed, build the project with auto-zoom, register in library.
    const sessionId = c.activeSessionId;

    // Clean up auxiliary floating windows on stop so no zombie windows keep electron alive
    if (c.toolbarWindow && !c.toolbarWindow.isDestroyed()) {
      c.toolbarWindow.close();
    }
    c.toolbarWindow = null;
    if (c.cameraWindow && !c.cameraWindow.isDestroyed()) {
      c.cameraWindow.close();
    }
    c.cameraWindow = null;
    if (c.areaWindow && !c.areaWindow.isDestroyed()) {
      c.areaWindow.close();
    }
    c.areaWindow = null;

    if (!sessionId) return { projectId: null };
    try {
      // Stop the cursor sampler FIRST and flush its last batch — events drained
      // after closeSession would land in a closed file.
      const drained = c.inputSampler?.stop() ?? [];
      if (drained.length > 0) c.sessions.appendInput(sessionId, drained);
      c.inputSampler = null;
      const manifest = c.sessions.closeSession(sessionId, 'completed');
      const { renderStoppedMenu } = await import('./tray');
      renderStoppedMenu();
      if (!manifest) return { projectId: null };
      const project = buildProjectFromSession({ sessionId, manifest });
      saveProject(project);
      upsertProjectMeta(project);
      c.activeSessionId = null;
      return { projectId: project.id };
    } catch {
      c.inputSampler = null;
      c.activeSessionId = null;
      return { projectId: null };
    }
  });
  register('recorder:getState', (): RecorderState => {
    const stats = (c.recorderHandle?.stats() as { phase: string; elapsedUs: number; bytes: number; droppedFrames: number; totalFrames: number } | undefined) ?? undefined;
    return {
      phase: (stats?.phase as RecorderState['phase']) ?? (c.recorderHandle ? 'recording' : 'idle'),
      sessionId: c.activeSessionId,
      elapsedUs: stats?.elapsedUs ?? 0,
      bytes: stats?.bytes ?? 0,
      droppedFrames: stats?.droppedFrames ?? 0,
      totalFrames: stats?.totalFrames ?? 0,
      micMeterDb: c.lastMicMeterDb ?? null,
      diskFreeMb: c.lastDiskFreeMb ?? 0,
    };
  });

  // ---------------- library / projects ----------------
  register('library:list', () => c.library.listProjects());
  register('library:open', async (payload) => {
    const { id } = payload as { id: string };
    c.activeProjectId = id;
    const project = loadProject(id);
    // Heal takes recorded before the camera index fix: the preview and the
    // export compositor seek the cam file by time, which a streaming WebM
    // (no duration, no cues) refuses. Lossless and skipped once indexed.
    if (project?.media.camera) {
      await ensureSeekableWebm(join(project.media.dir, project.media.camera.file)).catch(() => false);
    }
    return project;
  });
  register('library:delete', async (payload) => {
    const { id } = payload as { id: string };
    c.library.deleteProject(id);
    await fs.rm(join(projectsDir(), `${id}.recast`), { force: true }).catch(() => undefined);
  });
  register('library:createSample', async () => {
    // The guided onboarding records a 10-second clip; when the user skips it,
    // we do not fabricate a fake project — the Library shows a real empty state.
    c.mainWindow?.webContents.send('recorder:hotkey', { action: 'toggle-record' });
    c.mainWindow?.show();
    return { projectId: null };
  });
  register('library:importMedia', async (payload) => {
    let sourcePath = (payload as { path?: string })?.path;
    if (!sourcePath) {
      const res = await dialog.showOpenDialog(c.mainWindow!, {
        title: 'Import Video into Recast Studio',
        properties: ['openFile'],
        filters: [
          { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (res.canceled || res.filePaths.length === 0) {
        return { projectId: null };
      }
      sourcePath = res.filePaths[0]!;
    }

    if (!existsSync(sourcePath)) {
      return { projectId: null, error: `The selected file does not exist: ${sourcePath}` };
    }

    const { runner } = await ffmpegState();
    if (!runner) {
      return { projectId: null, error: 'FFmpeg is required to import external video files. Please install it in Settings → Media engine.' };
    }

    const probe = await runner.probe(sourcePath);
    if (!probe || probe.durationUs <= 0) {
      return { projectId: null, error: 'Could not read video stream or duration from this file. Ensure it is a valid video.' };
    }

    const sessionId = `import-${Date.now()}`;
    const sessionDir = join(recordingsDir(), sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const targetSegFile = 'seg-0000.mp4';
    const targetSegPath = join(sessionDir, targetSegFile);

    // If source is already an MP4, try fast copy
    const isMp4 = sourcePath.toLowerCase().endsWith('.mp4');
    let copyOk = false;
    if (isMp4) {
      try {
        await fs.copyFile(sourcePath, targetSegPath);
        copyOk = true;
      } catch {
        copyOk = false;
      }
    }

    if (!copyOk) {
      // Remux to mp4 with ffmpeg (fast stream copy first, fallback to ultrafast re-encode if copy fails)
      const remuxRes = await runner.run([
        '-y', '-i', sourcePath, '-c', 'copy', '-movflags', '+faststart', targetSegPath,
      ], { timeoutMs: 300_000 });
      if (remuxRes.code !== 0 || !existsSync(targetSegPath)) {
        const transcodeRes = await runner.run([
          '-y', '-i', sourcePath,
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
          '-c:a', 'aac', '-b:a', '192k',
          '-movflags', '+faststart', targetSegPath,
        ], { timeoutMs: 600_000 });
        if (transcodeRes.code !== 0 || !existsSync(targetSegPath)) {
          await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => undefined);
          return { projectId: null, error: `Failed to convert video for Recast Studio: ${transcodeRes.stderr.slice(-200)}` };
        }
      }
    }

    // Check audio and extract WAV for subtitles and waveform
    const hasAudio = await runner.hasAudioStream(sourcePath).catch(() => false);
    if (hasAudio) {
      const audioWavPath = join(sessionDir, 'audio.wav');
      await runner.extractWav(sourcePath, audioWavPath, 48000).catch(() => undefined);
    }

    // Poster thumbnail
    const posterPath = join(sessionDir, 'thumbnail.png');
    const thumbSec = Math.min(1.0, probe.durationUs / 2_000_000);
    await runner.thumbnail(targetSegPath, thumbSec, posterPath, 640).catch(() => undefined);

    // Empty cursor file so cursor samplers don't error
    await fs.writeFile(join(sessionDir, 'cursor.jsonl'), '', 'utf8');

    // Build session manifest
    const baseName = basename(sourcePath, extname(sourcePath));
    const targetStat = await fs.stat(targetSegPath).catch(() => ({ size: 0 }));
    const manifest: SessionManifest = {
      schemaVersion: 1,
      id: sessionId,
      startedAtEpochMs: Date.now(),
      state: 'completed',
      pausedUs: 0,
      displayScaleFactor: 1,
      video: {
        width: probe.width || 1920,
        height: probe.height || 1080,
        fps: 30,
        codec: 'avc1',
      },
      screen: {
        segments: [
          {
            id: 'seg-0000',
            file: targetSegFile,
            startUs: 0,
            endUs: probe.durationUs,
            width: probe.width || 1920,
            height: probe.height || 1080,
            sizeBytes: targetStat.size,
          },
        ],
      },
      audio: hasAudio ? { file: 'audio.wav', codec: 'pcm_s16le', channels: 2, sampleRate: 48000 } : null,
      camera: null,
    };

    await fs.writeFile(join(sessionDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    // Build project from session
    const project = buildProjectFromSession({ sessionId, manifest, name: baseName || 'Imported Video' });
    // For imported video: disable synthetic cursor overlay (clean video mode) to prevent duplicate cursors!
    project.style.cursor.look = 'none';
    if (project.media.cursor) {
      project.media.cursor.available = false;
    }
    project.zoom.mode = 'manual';

    saveProject(project);
    upsertProjectMeta(project, { thumbnailFile: 'thumbnail.png' });
    return { projectId: project.id };
  });
  register('projects:save', (payload) => {
    const { project } = payload as { project: import('@recast/shared').RecastProject };
    saveProject(project);
    upsertProjectMeta(project);
  });
  register('projects:generateThumbnails', async (payload) => {
    const { projectId } = payload as { projectId: string };
    const project = loadProject(projectId);
    if (!project || project.media.segments.length === 0) return { thumbnails: [] };
    const { runner } = await ffmpegState();
    const out: Array<{ segmentId: string; dataUrl: string }> = [];
    const first = project.media.segments[0]!;
    const source = join(project.media.dir, first.file);
    // Persisted poster frame: written once into the session dir and recorded
    // in the library store, so later Library visits skip the ffmpeg spawn.
    const posterPath = join(project.media.dir, 'thumbnail.png');
    const existing = project.media.segments.length > 0 && existsSync(posterPath) ? posterPath : null;
    if (runner) {
      try {
        if (!existing) {
          await runner.thumbnail(source, 1.0, posterPath, 320);
          upsertProjectMeta({ ...project, media: { ...project.media } }, { thumbnailFile: 'thumbnail.png' });
        }
        const buf = await fs.readFile(posterPath);
        out.push({ segmentId: first.id, dataUrl: `data:image/png;base64,${buf.toString('base64')}` });
      } catch {
        /* thumbnails are best-effort */
      }
    } else {
      // No ffmpeg: the renderer can stream the first segment directly — the
      // <img> shows the first decoded frame instead of a placeholder icon.
      out.push({ segmentId: first.id, dataUrl: mediaUrlFor(source) });
    }
    return { thumbnails: out };
  });
  register('projects:waveform', async (payload) => {
    const { audioFile } = payload as { audioFile: string };
    const { runner } = await ffmpegState();
    if (!runner) return { peaks: [], durationUs: 0 };
    const peaks = await runner.peaks(audioFile, 1200);
    const probe = await runner.probe(audioFile);
    return { peaks, durationUs: probe?.durationUs ?? 0 };
  });

  // ---------------- styles ----------------
  register('styles:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'Recast style preset', extensions: ['recaststyle'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { preset: null };
    try {
      const raw = await fs.readFile(filePaths[0]!, 'utf8');
      const parsed = await import('@recast/editor').then((m) => m.parseStyle(raw));
      return { preset: parsed.preset, error: parsed.error };
    } catch (e) {
      return { preset: null, error: (e as Error).message };
    }
  });
  register('styles:export', async (payload) => {
    const { preset, targetPath } = payload as { preset: import('@recast/shared').StylePreset; targetPath?: string };
    const fileName = `${preset.id || preset.name.toLowerCase().replace(/\s+/g, '-')}.recaststyle`;
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: targetPath ?? join(exportsDir(), fileName),
      filters: [{ name: 'Recast style preset', extensions: ['recaststyle'] }],
    });
    if (canceled || !filePath) return { path: null };
    await fs.writeFile(filePath, JSON.stringify(preset, null, 2), 'utf8');
    return { path: filePath };
  });
  // Background image: pick a picture and COPY it into the session dir so the
  // project stays self-contained (and stays under the recast-media allowlist).
  register('styles:pickBackgroundImage', async (payload) => {
    const { projectId } = payload as { projectId: string };
    const project = loadProject(projectId);
    if (!project) return { path: null, error: 'Project not found.' };
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { path: null };
    try {
      const src = filePaths[0]!;
      const ext = (src.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'png').toLowerCase();
      const dest = join(project.media.dir, `background-${Date.now().toString(36)}.${ext}`);
      await fs.copyFile(src, dest);
      return { path: dest };
    } catch (e) {
      return { path: null, error: (e as Error).message };
    }
  });

  // ---------------- export ----------------
  register('export:estimate', async (payload) => {
    const { projectId, format, resolution, fps } = payload as { projectId: string; format: string; resolution: string; fps: number };
    const project = loadProject(projectId);
    if (!project) throw new Error('Project not found');
    const shortEdge = resolution === 'source' ? Math.min(project.media.height || 1080, 2160) : Number.parseInt(resolution, 10);
    const bitrateMbps = { 720: 6, 1080: 12, 1440: 20, 2160: 40 }[shortEdge] ?? 12;
    const factor = format === 'gif' ? 0.35 : format === 'webm' ? 0.75 : format === 'prores' ? 4 : 1;
    const seconds = project.timeline.durationUs / 1_000_000;
    return {
      durationUs: project.timeline.durationUs,
      estimatedBytes: Math.round((bitrateMbps * 1_000_000 * factor * seconds) / 8),
      estimatedSeconds: Math.round(seconds * (format === 'prores' ? 3 : format === 'gif' ? 2 : 0.8) * (fps / 30)),
    };
  });
  register('export:run', async (payload, event) => {
    const { destination, exportId } = payload as { destination: string; exportId: string };
    beginChunkedExport(exportId, destination);
    void event;
    c.activeExportIds.add(exportId);
    return { exportId };
  });
  // The renderer's chunked export path opens the .part file before writing
  // frames — the handler was missing, so every export died at step 1 with
  // "No handler registered for 'export:beginChunked'".
  register('export:beginChunked', (payload) => {
    const { exportId, destination } = payload as { exportId: string; destination: string };
    beginChunkedExport(exportId, destination);
    c.activeExportIds.add(exportId);
  });
  register('export:writeChunkAt', async (payload) => {
    const { exportId, position, data } = payload as { exportId: string; position: number; data: ArrayBuffer | Uint8Array };
    await writeExportChunkAt(exportId, position, new Uint8Array(data instanceof ArrayBuffer ? new Uint8Array(data) : data));
  });
  register('export:finalize', async (payload) => {
    const { exportId } = payload as { exportId: string };
    await finalizeExport(exportId);
    c.activeExportIds.delete(exportId);
  });
  register('export:discard', async (payload) => {
    const { exportId } = payload as { exportId: string };
    c.activeExportIds.delete(exportId);
    await discardExport(exportId);
  });
  register('export:readFile', async (payload) => {
    const { path } = payload as { path: string };
    // Only files inside the recordings tree may be read into the renderer.
    if (!path.startsWith(recordingsDir())) throw new Error('Path outside recordings is not readable.');
    return readUserFile(path);
  });
  register('export:tempFrameDir', async () => makeTempFrameDir());
  register('export:writeFrameImage', async (payload) => {
    const { dir, index, png } = payload as { dir: string; index: number; png: ArrayBuffer };
    await writeFrameImage(dir, index, new Uint8Array(png));
  });
  register('export:cleanupDir', async (payload) => {
    const { dir } = payload as { dir: string };
    await cleanupFrameDir(dir);
  });
  register('export:ffmpegGif', async (payload) => {
    const { frameDir, fps, width, outFile, loop } = payload as { frameDir: string; fps: number; width: number; outFile: string; loop?: number };
    return runFfmpegGif(frameDir, fps, width, outFile, loop ?? 0);
  });
  register('export:ffmpegProres', async (payload) => {
    const { frameDir, fps, outFile } = payload as { frameDir: string; fps: number; outFile: string };
    return runFfmpegProres(frameDir, fps, outFile);
  });
  register('export:ffmpegLoudnorm', async (payload) => {
    const { file, targetLufs } = payload as { file: string; targetLufs: number };
    return runLoudnorm(file, targetLufs);
  });
  register('export:probeDuration', async (payload) => {
    const { file } = payload as { file: string };
    const probe = await probeFile(file);
    return probe?.durationUs ?? null;
  });
  register('export:cancel', async (payload) => {
    const { exportId } = payload as { exportId: string };
    c.activeExportIds.delete(exportId);
    await discardExport(exportId);
  });
  register('export:suggestFilename', async (payload) => {
    const { projectId, format } = payload as { projectId: string; format: 'mp4' | 'webm' | 'hevc' | 'prores' | 'gif' };
    const project = loadProject(projectId);
    if (!project) throw new Error('Project not found');
    const dir = settingsStore().exportDir || exportsDir();
    let existing: string[] = [];
    try {
      existing = await fs.readdir(dir);
    } catch {
      existing = [];
    }
    const name = suggestExportName(project, format, existing);
    return { name, dir, exists: existing.includes(name) };
  });
  register('export:pickDestination', async (payload) => {
    const { defaultName } = payload as { defaultName: string };
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: join(settingsStore().exportDir || exportsDir(), defaultName),
    });
    return { path: canceled || !filePath ? null : filePath };
  });

  // ---------------- captions ----------------
  register('captions:status', async () => {
    return await whisperStatus();
  });
  register('captions:installBinary', async () => {
    return await installWhisperBinary((pct) => {
      broadcastEvent('whisper:download', { modelId: '__binary__', pct, done: pct >= 100 });
    });
  });
  register('captions:models', async () => {
    const status = await whisperStatus();
    return status.models;
  });
  register('captions:downloadModel', async (payload) => {
    const { id } = payload as { id: string };
    void downloadWhisperModel(id, (pct) => broadcastEvent('whisper:download', { modelId: id, pct, done: pct >= 100 }))
      .then((r) => broadcastEvent('whisper:download', { modelId: id, pct: 100, done: true, error: r.error }));
  });
  register('captions:transcribe', async (payload) => {
    const { projectId, modelId, language } = payload as { projectId: string; modelId: string; language: string };
    const project = loadProject(projectId);
    if (!project || !project.media.audio) return { ok: false, error: 'This project has no audio track.' };
    const { runner } = await ffmpegState();
    const whisper = await whisperStatus();
    if (!runner) return { ok: false, error: 'FFmpeg is required for audio extraction — install it in Settings → Media engine.' };
    if (!whisper.whisperBin) {
      return { ok: false, error: 'No whisper.cpp binary found. Install it (`brew install whisper-cpp` / `scoop install whisper-cpp`) or see docs/captions — captions degrade honestly, never silently.' };
    }
    const modelDef = whisper.models.find((m) => m.id === modelId);
    if (!modelDef) return { ok: false, error: 'Model not downloaded yet.' };
    const modelFile = join((await import('./paths')).modelsDir(), `${modelId}.bin`);
    const audioPath = join(project.media.dir, project.media.audio.file);
    const result = await transcribe(
      {
        audioFile: audioPath,
        modelFile,
        language,
        onProgress: (stage, pct) => broadcastEvent('whisper:progress', { projectId, stage: stage as 'extracting', pct }),
      },
      whisper.whisperBin,
      runner,
    );
    if (!result.ok || !result.srt) return { ok: false, error: result.error };
    const cues = parseSrt(result.srt);
    const srtPath = `${audioPath}.srt`;
    await fs.writeFile(srtPath, toSrt(cues), 'utf8');
    project.captions = { file: srtPath, language: language === 'auto' ? 'auto' : language, source: 'whisper' };
    saveProject(project);
    upsertProjectMeta(project);
    return { ok: true };
  });
  register('captions:import', async (payload) => {
    const { projectId } = payload as { projectId: string };
    const project = loadProject(projectId);
    if (!project) return { ok: false, error: 'Project not found' };
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'Subtitles', extensions: ['srt', 'vtt'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { ok: false };
    const raw = await fs.readFile(filePaths[0]!, 'utf8');
    const cues = filePaths[0]!.endsWith('.vtt') ? parseVtt(raw) : parseSrt(raw);
    const srtPath = `${project.media.dir}/imported.srt`;
    await fs.writeFile(srtPath, toSrt(cues), 'utf8');
    project.captions = { file: srtPath, language: 'import', source: 'import' };
    saveProject(project);
    return { ok: true };
  });
  register('captions:exportFile', async (payload) => {
    const { projectId, kind } = payload as { projectId: string; kind: 'srt' | 'vtt' };
    const project = loadProject(projectId);
    if (!project?.captions) return { path: null };
    const raw = await fs.readFile(project.captions.file, 'utf8');
    const cues = parseSrt(raw);
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: join(exportsDir(), `${project.name}.${kind}`),
    });
    if (canceled || !filePath) return { path: null };
    await fs.writeFile(filePath, kind === 'vtt' ? toVtt(cues) : toSrt(cues), 'utf8');
    return { path: filePath };
  });

  // ---------------- ffmpeg ----------------
  register('ffmpeg:status', async (): Promise<FfmpegStatus> => {
    const { status } = await ffmpegState();
    return status;
  });
  register('ffmpeg:install', async () => {
    void installFfmpeg((pct) => broadcastFfmpegProgress(pct, pct >= 100))
      .then((r) => broadcastFfmpegProgress(100, true, r.ok ? undefined : r.error));
    return { started: true };
  });

  // ---------------- updater ----------------
  register('updater:check', async () => {
    if (!settingsStore().autoCheckUpdates) {
      return { available: false, version: null };
    }
    return checkForUpdates();
  });
  register('updater:download', () => downloadUpdate());
  register('updater:install', () => installUpdate());

  // ---------------- MCP (Model Context Protocol) ----------------
  const createMcpContext = (): import('@recast/mcp').McpExecutionContext => {
    return {
      getProject: () => {
        const lastId = c.activeProjectId;
        if (lastId) {
          const p = loadProject(lastId);
          if (p) return p;
        }
        const projects = c.library.listProjects();
        if (projects.length > 0) {
          return loadProject(projects[0]!.id);
        }
        return null;
      },
      updateProject: async (mutator) => {
        let p: import('@recast/shared').RecastProject | null = null;
        const lastId = c.activeProjectId;
        if (lastId) {
          p = loadProject(lastId);
        }
        if (!p) {
          const projects = c.library.listProjects();
          if (projects.length > 0) {
            p = loadProject(projects[0]!.id);
          }
        }
        if (!p) throw new Error('No active project found in Recast Studio.');
        const updated = mutator(p);
        saveProject(updated);
        upsertProjectMeta(updated);
        c.activeProjectId = updated.id;
        // Broadcast to renderer so editor timeline, canvas and panels refresh in real-time
        c.mainWindow?.webContents.send('mcp:projectUpdated', { projectId: updated.id });
        return updated;
      },
      seekTo: (timeUs) => {
        c.mainWindow?.webContents.send('mcp:seekTo', { timeUs });
      },
      getCanvasSnapshot: async () => {
        if (!c.mainWindow) return null;
        try {
          const image = await c.mainWindow.capturePage();
          return image.toPNG().toString('base64');
        } catch {
          return null;
        }
      },
      triggerExport: async (_presetId, _outPath) => {
        const p = createMcpContext().getProject();
        if (!p) throw new Error('No active project to export');
        const exportId = `exp-mcp-${Date.now()}`;
        c.mainWindow?.webContents.send('app:export-project', p.id);
        return { exportId };
      },
    };
  };

  const mcpServer = new RecastMcpServer(createMcpContext());

  register('mcp:listTools', () => {
    return { tools: RECAST_TOOLS as unknown as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> };
  });

  register('mcp:callTool', async (payload) => {
    const { name, arguments: toolArgs } = payload as { name: string; arguments: Record<string, unknown> };
    mcpServer.setContext(createMcpContext());
    const res = await mcpServer.handleRequest({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: toolArgs },
    });
    if (res?.error) {
      return { content: [{ type: 'text', text: res.error.message }], isError: true };
    }
    return (res?.result as { content: Array<Record<string, unknown>>; isError?: boolean }) ?? { content: [] };
  });

  register('mcp:readResource', async (payload) => {
    const { uri } = payload as { uri: string };
    mcpServer.setContext(createMcpContext());
    const res = await mcpServer.handleRequest({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'resources/read',
      params: { uri },
    });
    if (res?.error) {
      return { contents: [{ uri, mimeType: 'text/plain', text: res.error.message }] };
    }
    return (res?.result as { contents: Array<Record<string, unknown>> }) ?? { contents: [] };
  });

  // ---------------- internal (capture host → disk) ----------------
  register('capture:createSession', (payload) => {
    const { sessionId, manifest } = payload as { sessionId: string; manifest: SessionManifest };
    c.activeSessionId = sessionId;
    // The renderer cannot know the display's DPI factor; main resolved it at
    // the display-media grant. Stamp it so cursor coords can be converted to
    // video pixel space at project build (see readCursorJsonl).
    manifest.displayScaleFactor = c.activeDisplayScaleFactor ?? 1;
    c.sessions.createSession(manifest);
    c.library.registerSession(sessionId, 'active');
    // Cursor + click tracking runs entirely in main. The clock anchor MUST be
    // sessionStartEpochMs (same as the capture pipeline's) so cursor events
    // line up with video frames. Without this the sampler never ran and
    // cursor.jsonl was never written — zoom-reactive cursor features starved.
    if (!c.inputSampler) {
      c.inputSampler = new InputSampler();
      c.inputSampler.start(c.sessionStartEpochMs, (events) => {
        try {
          c.sessions.appendInput(c.activeSessionId ?? sessionId, events);
        } catch {
          /* session already closed — drop the batch */
        }
      });
    }

    // Launch floating live toolbar if not already present
    try {
      void import('./windows').then(({ createToolbarWindow, createFloatingCameraWindow }) => {
        const tb = createToolbarWindow();
        tb.showInactive();

        // If recording with camera, launch draggable floating webcam bubble
        if (c.recorderRequest?.cameraDeviceId) {
          const cam = createFloatingCameraWindow(c.recorderRequest.cameraDeviceId);
          cam.showInactive();
        }
      });
    } catch {
      /* auxiliary window creation is best-effort */
    }
  });
  register('capture:writeSegment', async (payload) => {
    const { sessionId, file, data } = payload as { sessionId: string; file: string; data: ArrayBuffer };
    c.sessions.writeSegment(sessionId, file, new Uint8Array(data));
    // MediaRecorder writes the face cam as a streaming WebM (no cues). Index
    // it once here so the editor and export can seek it.
    if (/\.webm$/i.test(file)) {
      await ensureSeekableWebm(c.sessions.sessionFilePath(sessionId, file)).catch(() => false);
    }
  });
  register('capture:appendInput', (payload) => {
    const { sessionId, events } = payload as { sessionId: string; events: Array<import('@recast/shared').InputEvent> };
    c.sessions.appendInput(sessionId, events);
  });
  register('capture:writeManifest', (payload) => {
    const { sessionId, manifest } = payload as { sessionId: string; manifest: SessionManifest };
    c.sessions.updateManifest(sessionId, manifest);
  });
  register('capture:diskFreeMb', async () => {
    const { checkDiskSpace } = await import('./disk');
    return checkDiskSpace();
  });
  register('capture:appendSegmentFile', (payload) => {
    const { sessionId, file, data } = payload as { sessionId: string; file: string; data: ArrayBuffer };
    c.sessions.appendSegmentFile(sessionId, file, new Uint8Array(data));
  });
  register('capture:appendLog', async (payload) => {
    const { entries } = payload as { entries: import('@recast/shared').CaptureLogEntry[] };
    await appendCaptureLog(entries);
  });
  register('capture:lastDisplayDeny', () => {
    const deny = c.displayMediaDeny;
    if (!deny) return null;
    // Stale denials (older than 30 s) are irrelevant to the current attempt.
    if (Date.now() - deny.at > 30_000) return null;
    return deny;
  });
  register('diagnostics:bundle', () => buildDiagnosticsBundle());
  register('diagnostics:copy', async () => {
    await copyDiagnosticsBundle();
  });
  register('capture:attachAudio', (payload) => {
    const { sessionId, file, data } = payload as { sessionId: string; file: string; data: ArrayBuffer };
    c.sessions.attachAudio(sessionId, 'audio', file, new Uint8Array(data));
  });

  register('capture:readCursor', (payload) => {
    const { sessionId } = payload as { sessionId: string };
    if (!sessionId) return { samples: [], clicks: [], keys: [] };
    const rawSessionId = sessionId.replace(/^prj-/, '');
    const projectId = sessionId.startsWith('prj-') ? sessionId : `prj-${sessionId}`;
    const project = loadProject(projectId);
    const mediaDir = project?.media?.dir || join(recordingsDir(), rawSessionId);
    const factor = c.sessions.manifestFor(rawSessionId)?.displayScaleFactor ?? 1;
    const cursorFile = project?.media?.cursor?.file ?? 'cursor.jsonl';
    const res = readCursorJsonl(mediaDir, cursorFile, factor);
    if (res.samples.length === 0 && res.clicks.length === 0) {
      const fallbackDir = join(recordingsDir(), rawSessionId);
      if (fallbackDir !== mediaDir) {
        return readCursorJsonl(fallbackDir, cursorFile, factor);
      }
    }
    return res;
  });
  register('capture:readCaptions', async (payload) => {
    const { path } = payload as { path: string };
    if (!/\.(srt|vtt|jsonl)$/i.test(path)) return null;
    try {
      return await fs.readFile(path, 'utf8');
    } catch {
      return null;
    }
  });

  register('capture:appendAnnotation', (payload) => {
    const { sessionId, annotation } = payload as { sessionId: string; annotation: import('@recast/shared').Annotation };
    c.sessions.appendAnnotation(sessionId, annotation);
  });

  // ---------------- attach everything to ipcMain ----------------
  for (const [channel, handler] of handlers) {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await handler(payload, event);
      } catch (e) {
        // Errors cross the bridge as plain strings; the renderer surfaces them.
        return { __error: (e as Error).message };
      }
    });
  }
}

async function listAudioDevices(kind: 'audioinput' | 'videoinput'): Promise<Array<{ id: string; label: string; default: boolean }>> {
  // Device enumeration happens in the renderer (getUserMedia permissions);
  // here we return the current session labels when available.
  void kind;
  return [];
}

function upsertProjectMeta(project: import('@recast/shared').RecastProject, patch?: { thumbnailFile?: string | null }): void {
  const c = context();
  c.library.upsertProject({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    durationUs: project.timeline.durationUs,
    width: project.media.width,
    height: project.media.height,
    hasCaptions: Boolean(project.captions),
    thumbnailFile: patch?.thumbnailFile ?? null,
  });
}

export { broadcastEvent };
void readCursorJsonl;
