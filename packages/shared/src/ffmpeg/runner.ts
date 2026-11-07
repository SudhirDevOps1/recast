import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { TIME } from '../constants';

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function killTree(proc: ChildProcess, platform: NodeJS.Platform): void {
  if (proc.pid == null) return;
  if (platform === 'win32') {
    // /T kills the whole process tree, /F forces.
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
  } else {
    try {
      // Detached children share a process group; negative pid signals the group.
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }
}

export class FfmpegError extends Error {
  constructor(message: string, public readonly stderr = '') {
    super(message);
    this.name = 'FfmpegError';
  }
}

/**
 * Safe FFmpeg wrapper. Always `spawn(binary, args)` with `shell: false` and
 * argument arrays — filenames are never interpolated into a shell string.
 */
export class FfmpegRunner {
  private versionCache: string | null = null;

  constructor(
    private readonly ffmpegPath: string,
    private readonly ffprobePath: string | null,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  get path(): string {
    return this.ffmpegPath;
  }

  async run(
    args: string[],
    opts: { timeoutMs?: number; onStderr?: (line: string) => void; cwd?: string } = {},
  ): Promise<RunResult> {
    return new Promise<RunResult>((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(this.ffmpegPath, args, {
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: opts.cwd,
          ...(this.platform !== 'win32' ? { detached: true } : {}),
        });
      } catch (err) {
        reject(new FfmpegError(`Failed to spawn FFmpeg: ${(err as Error).message}`));
        return;
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(
        () => {
          timedOut = true;
          killTree(child, this.platform);
        },
        opts.timeoutMs ?? 10 * 60_000,
      );

      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        const text = d.toString();
        stderr += text;
        if (opts.onStderr && stderr.length < 4_000_000) opts.onStderr(text);
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new FfmpegError(`FFmpeg process error: ${err.message}`, stderr));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr, timedOut });
      });
    });
  }

  /** `ffmpeg -version` with a short timeout — used at launch to validate. */
  async version(): Promise<string | null> {
    if (this.versionCache) return this.versionCache;
    const res = await this.run(['-hide_banner', '-version'], { timeoutMs: TIME.VERSION_TIMEOUT_MS });
    if (res.code !== 0 || res.timedOut) return null;
    const m = res.stdout.match(/ffmpeg version (\S+)/);
    this.versionCache = m ? m[1]! : (res.stdout.split('\n')[0] ?? null);
    return this.versionCache;
  }

  async probe(
    file: string,
  ): Promise<{ durationUs: number; codec: string; width: number; height: number } | null> {
    const probePath = this.ffprobePath;
    if (!probePath) return null;
    const res = await new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(
          probePath,
          [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name,width,height:format=duration',
            '-of', 'json',
            file,
          ],
          { shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
        );
      } catch (err) {
        reject(new FfmpegError(`Failed to spawn ffprobe: ${(err as Error).message}`));
        return;
      }
      let stdout = '';
      child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
      child.on('error', (e) => reject(new FfmpegError(e.message)));
      child.on('close', (code) => resolve({ code, stdout }));
    });
    if (res.code !== 0) return null;
    try {
      const json = JSON.parse(res.stdout) as {
        streams?: Array<{ codec_name?: string; width?: number; height?: number }>;
        format?: { duration?: string };
      };
      const stream = json.streams?.[0];
      const durationS = json.format?.duration ? Number(json.format.duration) : NaN;
      if (!stream || !Number.isFinite(durationS)) return null;
      return {
        durationUs: Math.round(durationS * 1_000_000),
        codec: stream.codec_name ?? 'unknown',
        width: stream.width ?? 0,
        height: stream.height ?? 0,
      };
    } catch {
      return null;
    }
  }

  /** Crash-recovery remux: concatenate segments with `-c copy`, no re-encode. */
  async remuxConcat(segmentFiles: string[], outFile: string): Promise<void> {
    const listFile = `${outFile}.concat.txt`;
    const body = segmentFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    await fs.writeFile(listFile, body, 'utf8');
    try {
      const res = await this.run(
        [
          '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
          '-c', 'copy', '-movflags', '+faststart', outFile,
        ],
        { timeoutMs: 5 * 60_000 },
      );
      if (res.code !== 0) {
        throw new FfmpegError(`Remux failed (${res.code}): ${res.stderr.slice(-800)}`, res.stderr);
      }
    } finally {
      await fs.rm(listFile, { force: true }).catch(() => undefined);
    }
  }

  async thumbnail(videoFile: string, atSec: number, outFile: string, width = 640): Promise<void> {
    const res = await this.run(
      [
        '-y', '-ss', atSec.toFixed(2), '-i', videoFile,
        '-frames:v', '1', '-vf', `scale=${width}:-2`, outFile,
      ],
      { timeoutMs: 30_000 },
    );
    if (res.code !== 0) throw new FfmpegError(`Thumbnail failed: ${res.stderr.slice(-400)}`, res.stderr);
  }

  async extractWav(videoFile: string, outFile: string, sampleRate = 16_000): Promise<void> {
    const res = await this.run(
      [
        '-y', '-i', videoFile, '-vn', '-ac', '1',
        '-ar', String(sampleRate), '-c:a', 'pcm_s16le', outFile,
      ],
      { timeoutMs: 10 * 60_000 },
    );
    if (res.code !== 0) throw new FfmpegError(`Audio extraction failed: ${res.stderr.slice(-400)}`, res.stderr);
  }

  /** Audio waveform peaks: decode to PCM and downsample. */
  async peaks(audioFile: string, buckets = 2_000): Promise<number[]> {
    const tmp = `${audioFile}.peaks.wav`;
    await this.extractWav(audioFile, tmp, 16_000);
    try {
      const buf = await fs.readFile(tmp);
      const samples = buf.subarray(44); // skip WAV header (16-bit mono pcm)
      const per = Math.max(1, Math.floor(samples.length / 2 / buckets));
      const out: number[] = [];
      for (let b = 0; b < buckets; b++) {
        let peak = 0;
        const start = b * per * 2;
        for (let i = 0; i < per * 2 && start + i + 1 < samples.length; i += 2) {
          const v = samples.readInt16LE(start + i) / 32_768;
          const a = Math.abs(v);
          if (a > peak) peak = a;
        }
        out.push(peak);
      }
      return out;
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
  }

  /** Two-pass loudnorm analysis → apply, targeting −14 LUFS. */
  async normalizeLufs(inFile: string, outFile: string, targetLufs = -14): Promise<void> {
    const pass1 = await this.run(
      [
        '-hide_banner', '-i', inFile,
        '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`,
        '-f', 'null', '-',
      ],
      { timeoutMs: 20 * 60_000 },
    );
    const m = pass1.stderr.match(
      /Input Integrated:\s*(-?[\d.]+)[\s\S]*?Input LRA:\s*(-?[\d.]+)[\s\S]*?Input TP:\s*(-?[\d.]+)/,
    );
    let filter = `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`;
    if (m) {
      const [, ii, lra, tp] = m;
      filter = `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:measured_I=${ii}:measured_LRA=${lra}:measured_TP=${tp}`;
    }
    const res = await this.run(['-y', '-i', inFile, '-af', filter, '-c:v', 'copy', outFile], {
      timeoutMs: 20 * 60_000,
    });
    if (res.code !== 0) throw new FfmpegError(`Loudnorm failed: ${res.stderr.slice(-400)}`, res.stderr);
  }

  /** GIF: two-pass palette generation for clean colors. */
  async gifFromFrames(frameDir: string, fps: number, width: number, outFile: string): Promise<void> {
    const palette = `${outFile}.palette.png`;
    const inPattern = `${frameDir}/f-%06d.png`;
    const p1 = await this.run(
      [
        '-y', '-framerate', String(fps), '-i', inPattern,
        '-vf', `fps=${fps},scale=${width}:-2:flags=lanczos,palettegen=stat_mode=diff`,
        palette,
      ],
      { timeoutMs: 20 * 60_000 },
    );
    if (p1.code !== 0) throw new FfmpegError(`Palette failed: ${p1.stderr.slice(-400)}`, p1.stderr);
    const p2 = await this.run(
      [
        '-y', '-framerate', String(fps), '-i', inPattern, '-i', palette,
        '-lavfi', `fps=${fps},scale=${width}:-2:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3`,
        outFile,
      ],
      { timeoutMs: 20 * 60_000 },
    );
    if (p2.code !== 0) throw new FfmpegError(`GIF encode failed: ${p2.stderr.slice(-400)}`, p2.stderr);
  }

  /** Software ProRes encode from a PNG frame sequence (used when no HW path exists). */
  async proresFromFrames(frameDir: string, fps: number, outFile: string): Promise<void> {
    const res = await this.run(
      [
        '-y', '-framerate', String(fps), '-i', `${frameDir}/f-%06d.png`,
        '-c:v', 'prores_ks', '-profile:v', '2', '-vendor', 'apl0',
        '-pix_fmt', 'yuva422p10le', outFile,
      ],
      { timeoutMs: 60 * 60_000 },
    );
    if (res.code !== 0) throw new FfmpegError(`ProRes encode failed: ${res.stderr.slice(-400)}`, res.stderr);
  }
}
