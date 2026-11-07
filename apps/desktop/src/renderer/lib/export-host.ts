import { bridge } from './bridge';
import type { ExportHost } from '@recast/export';

/** ExportHost implemented over the IPC bridge. All disk IO happens in main. */
export const captureMediaHost: ExportHost = {
  writeChunkAt: async (destination, position, data) => {
    // The export id IS the destination; main keeps the mapping.
    await bridge().invoke('export:writeChunkAt', { exportId: destination, position, data } as never);
  },
  finalizeFile: async (destination) => {
    await bridge().invoke('export:finalize', { exportId: destination } as never);
  },
  discardPartial: async (destination) => {
    await bridge().invoke('export:discard', { exportId: destination } as never);
  },
  readFile: async (path) => {
    return (await bridge().invoke('export:readFile', { path })) as ArrayBuffer;
  },
  writeFrameImage: async (dir, index, png) => {
    await bridge().invoke('export:writeFrameImage', { dir, index, png } as never);
  },
  ffmpegGif: async (frameDir, fps, width, outFile) =>
    bridge().invoke('export:ffmpegGif', { frameDir, fps, width, outFile }),
  ffmpegProres: async (frameDir, fps, outFile) => bridge().invoke('export:ffmpegProres', { frameDir, fps, outFile }),
  ffmpegLoudnorm: async (file, targetLufs) => bridge().invoke('export:ffmpegLoudnorm', { file, targetLufs }),
  ffprobeDurationUs: async (file) => bridge().invoke('export:probeDuration', { file }),
  makeTempFrameDir: async () => bridge().invoke('export:tempFrameDir', undefined),
  cleanupDir: async (dir) => {
    await bridge().invoke('export:cleanupDir', { dir } as never);
  },
};

export function beginChunkedExport(destination: string): Promise<void> {
  return bridge().invoke('export:beginChunked', { exportId: destination, destination } as never) as unknown as Promise<void>;
}
