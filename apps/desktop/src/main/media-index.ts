import { existsSync, promises as fs } from 'node:fs';
import { app } from 'electron';
import { FfmpegRunner, resolveFfmpeg } from '@recast/shared/node';

/**
 * MediaRecorder WebM "streaming" files carry no Duration and no Cues.
 * Chromium then reports `duration = Infinity`, `seekable = []` and silently
 * refuses to move `currentTime`; the editor preview and the export compositor
 * both seek by time, so a face-cam recorded that way paints as an empty
 * bubble in the preview and exports transparent.
 *
 * `-c copy` remuxing rewrites the container with a real index and duration
 * without re-encoding — lossless, ~a second for a normal take. The alpha plane
 * is dropped on purpose (the PiP is drawn opaque), which also avoids Chromium
 * compositing a fully transparent VP9 alpha frame.
 *
 * A `.seekable` marker next to the file records that the pass already ran so
 * re-opening old projects does not repeat the work. Every failure path keeps
 * the original recording untouched.
 */

const inFlight = new Map<string, Promise<boolean>>();

export function ensureSeekableWebm(filePath: string): Promise<boolean> {
  if (!/\.webm$/i.test(filePath)) return Promise.resolve(false);
  const pending = inFlight.get(filePath);
  if (pending) return pending;
  const run = remuxInPlace(filePath).finally(() => inFlight.delete(filePath));
  inFlight.set(filePath, run);
  return run;
}

async function remuxInPlace(filePath: string): Promise<boolean> {
  const marker = `${filePath}.seekable`;
  if (!existsSync(filePath) || existsSync(marker)) return false;

  const resolved = resolveFfmpeg({ userDataDir: app.getPath('userData') });
  if (!resolved.ffmpeg) return false;

  const tmp = `${filePath}.seekable.part`;
  const backup = `${filePath}.seekable.orig`;
  let movedOriginal = false;
  try {
    const runner = new FfmpegRunner(resolved.ffmpeg, resolved.ffprobe);
    const res = await runner.run(
      [
        '-y', '-v', 'error',
        '-i', filePath,
        '-map', '0:v:0',
        '-c', 'copy',
        '-fflags', '+genpts',
        '-f', 'webm',
        tmp,
      ],
      { timeoutMs: 120_000 },
    );
    if (res.code !== 0 || !existsSync(tmp)) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      return false;
    }

    const [original, remuxed] = await Promise.all([fs.stat(filePath), fs.stat(tmp)]);
    // A truncated remux must never replace a good take.
    if (remuxed.size < original.size * 0.5) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      return false;
    }

    await fs.rename(filePath, backup);
    movedOriginal = true;
    await fs.rename(tmp, filePath);
    movedOriginal = false;
    await fs.rm(backup, { force: true }).catch(() => undefined);
    await fs.writeFile(marker, JSON.stringify({ indexedAt: new Date().toISOString() }), 'utf8').catch(() => undefined);
    return true;
  } catch {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    if (movedOriginal) {
      // The new file may be half-renamed: restore the take, never the remux.
      await fs.rm(filePath, { force: true }).catch(() => undefined);
      await fs.rename(backup, filePath).catch(() => undefined);
    }
    return false;
  }
}
