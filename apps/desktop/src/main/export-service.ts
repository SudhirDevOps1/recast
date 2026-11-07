import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { exportsDir } from './paths';
import { ffmpegState } from './ffmpeg-service';

/**
 * Main-process half of the export pipeline. The renderer renders + encodes
 * frames; every byte that lands on disk goes through here:
 * positional `.part` writes (MP4 muxers write out of order) → atomic rename
 * → ffprobe verification. Cancel simply never renames — no partial files.
 */

interface OpenExport {
  destination: string;
  partialPath: string;
  handle: fs.FileHandle | null;
}

const openExports = new Map<string, OpenExport>();

export function beginChunkedExport(exportId: string, destination: string): void {
  openExports.set(exportId, { destination, partialPath: `${destination}.part`, handle: null });
}

export async function writeExportChunkAt(exportId: string, position: number, data: Uint8Array): Promise<void> {
  const e = openExports.get(exportId);
  if (!e) throw new Error(`Unknown export ${exportId}`);
  if (!e.handle) {
    e.handle = await fs.open(e.partialPath, 'w');
  }
  await e.handle.write(Buffer.from(data), 0, data.byteLength, position);
}

export async function finalizeExport(exportId: string): Promise<void> {
  const e = openExports.get(exportId);
  if (!e) throw new Error(`Unknown export ${exportId}`);
  openExports.delete(exportId);
  if (e.handle) {
    await e.handle.sync();
    await e.handle.close();
  }
  await fs.rename(e.partialPath, e.destination);
}

export async function discardExport(exportId: string): Promise<void> {
  const e = openExports.get(exportId);
  openExports.delete(exportId);
  if (e?.handle) {
    await e.handle.close().catch(() => undefined);
  }
  if (e) await fs.rm(e.partialPath, { force: true }).catch(() => undefined);
}

export async function makeTempFrameDir(): Promise<string> {
  const dir = join(exportsDir(), `frames-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeFrameImage(dir: string, index: number, png: Uint8Array): Promise<void> {
  await fs.writeFile(join(dir, `f-${String(index).padStart(6, '0')}.png`), Buffer.from(png));
}

export async function cleanupFrameDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

export async function runFfmpegGif(frameDir: string, fps: number, width: number, outFile: string): Promise<boolean> {
  const { runner } = await ffmpegState();
  if (!runner) return false;
  try {
    await runner.gifFromFrames(frameDir, fps, width, outFile);
    return true;
  } catch {
    return false;
  }
}

export async function runFfmpegProres(frameDir: string, fps: number, outFile: string): Promise<boolean> {
  const { runner } = await ffmpegState();
  if (!runner) return false;
  try {
    await runner.proresFromFrames(frameDir, fps, outFile);
    return true;
  } catch {
    return false;
  }
}

export async function runLoudnorm(file: string, targetLufs: number): Promise<boolean> {
  const { runner } = await ffmpegState();
  if (!runner) return false;
  try {
    const tmp = `${file}.norm.mp4`;
    await runner.normalizeLufs(file, tmp, targetLufs);
    await fs.rename(tmp, file);
    return true;
  } catch {
    return false;
  }
}

export async function probeFile(file: string): Promise<{ durationUs: number; codec: string; width: number; height: number } | null> {
  const { runner } = await ffmpegState();
  if (!runner) return null;
  return runner.probe(file);
}

/** Read a user-visible media file into the renderer (captions, audio decode). */
export async function readUserFile(path: string): Promise<ArrayBuffer> {
  const buf = await fs.readFile(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
