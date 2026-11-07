import { promises as fs, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { modelsDir } from './paths';
import type { CaptionModel } from '@recast/shared';
import type { FfmpegRunner } from '@recast/shared/node';

/**
 * Local Whisper (whisper.cpp sidecar) — fully offline.
 * Models: ggml tiny/base/small, English and multilingual, pinned by URL in
 * `resources/whisper/models.json` (pinned commit on ggml-org/whisper.cpp).
 * The binary is detected in this order: bundled resource, `whisper-cli` /
 * `whisper` on PATH, or brew/scoop installs. When no binary is found the
 * captions UI reports exactly that with the fix.
 */

export interface WhisperModels {
  whisperBin: string | null;
  models: CaptionModel[];
}

const MODEL_DEFS: Array<{ id: string; label: string; file: string; sizeMb: number; language: 'en' | 'multi' }> = [
  { id: 'ggml-tiny.en', label: 'Tiny (English)', file: 'ggml-tiny.en.bin', sizeMb: 78, language: 'en' },
  { id: 'ggml-base.en', label: 'Base (English)', file: 'ggml-base.en.bin', sizeMb: 148, language: 'en' },
  { id: 'ggml-small.en', label: 'Small (English)', file: 'ggml-small.en.bin', sizeMb: 488, language: 'en' },
  { id: 'ggml-tiny', label: 'Tiny (multilingual)', file: 'ggml-tiny.bin', sizeMb: 80, language: 'multi' },
  { id: 'ggml-base', label: 'Base (multilingual)', file: 'ggml-base.bin', sizeMb: 150, language: 'multi' },
  { id: 'ggml-small', label: 'Small (multilingual)', file: 'ggml-small.bin', sizeMb: 492, language: 'multi' },
];

// Pinned sources (commit 0f1e9bc of ggml-org/whisper.cpp models directory).
const MODEL_BASE = 'https://huggingface.co/ggml-org/whisper.cpp/resolve/0f1e9bc/';

export async function whisperStatus(): Promise<WhisperModels> {
  const bin = await findWhisperBinary();
  const dir = modelsDir();
  const models: CaptionModel[] = [];
  for (const def of MODEL_DEFS) {
    let downloaded = false;
    try {
      const stat = await fs.stat(join(dir, def.file));
      downloaded = stat.size > def.sizeMb * 1_000_000 * 0.5;
    } catch {
      downloaded = false;
    }
    models.push({ id: def.id, label: def.label, sizeMb: def.sizeMb, downloaded, language: def.language });
  }
  return { whisperBin: bin, models };
}

async function findWhisperBinary(): Promise<string | null> {
  const candidates =
    process.platform === 'win32'
      ? ['whisper-cli.exe', 'whisper.exe', 'main.exe']
      : ['whisper-cli', 'whisper', 'whisper-cpp'];
  try {
    const bundled = join(process.resourcesPath ?? '', 'whisper', candidates[0]!);
    await fs.access(bundled);
    return bundled;
  } catch {
    /* not bundled */
  }
  const pathDirs = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':');
  for (const d of pathDirs) {
    for (const c of candidates) {
      try {
        const p = join(d, c);
        await fs.access(p);
        return p;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

export async function downloadWhisperModel(modelId: string, onProgress: (pct: number) => void): Promise<{ ok: boolean; error?: string }> {
  const def = MODEL_DEFS.find((m) => m.id === modelId);
  if (!def) return { ok: false, error: `Unknown model ${modelId}` };
  const dest = join(modelsDir(), def.file);
  try {
    const url = `${MODEL_BASE}${def.file}?download=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length') ?? def.sizeMb * 1_000_000);
    const writer = createWriteStream(`${dest}.part`);
    const { Readable } = await import('node:stream');
    const { pipeline } = await import('node:stream/promises');
    let received = 0;
    let lastPct = -1;
    const reader = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
    reader.on('data', (chunk: Buffer) => {
      received += chunk.length;
      const pct = Math.min(100, Math.floor((received / total) * 100));
      if (pct !== lastPct) {
        lastPct = pct;
        onProgress(pct);
      }
    });
    await pipeline(reader, writer);
    await fs.rename(`${dest}.part`, dest);
    return { ok: true };
  } catch (e) {
    await fs.rm(`${dest}.part`, { force: true }).catch(() => undefined);
    return { ok: false, error: (e as Error).message };
  }
}

export interface TranscribeRequest {
  audioFile: string;
  modelFile: string;
  language: string; // 'auto' | 'en' | 'hi' | ...
  onProgress: (stage: string, pct: number) => void;
}

export interface TranscribeResult {
  ok: boolean;
  srt: string | null;
  error?: string;
}

/** Run whisper.cpp → SRT string. Never shells out with interpolated strings. */
export async function transcribe(req: TranscribeRequest, whisperBin: string, ffmpeg: FfmpegRunner): Promise<TranscribeResult> {
  try {
    const wavFile = `${req.audioFile}.16k.wav`;
    req.onProgress('extracting', 5);
    await ffmpeg.extractWav(req.audioFile, wavFile, 16_000);

    const outBase = `${req.audioFile}.transcript`;
    req.onProgress('transcribing', 10);
    const args = [
      '-m', req.modelFile,
      '-f', wavFile,
      '-osrt', '-of', outBase,
      '-l', req.language === 'auto' ? 'auto' : req.language,
    ];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(whisperBin, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
        const m = /progress = (\d+)/.exec(stderr);
        if (m) req.onProgress('transcribing', 10 + Number(m[1]) * 0.85);
      });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`whisper.cpp exited ${code}: ${stderr.slice(-400)}`))));
      // Whisper on long files can take a while; no artificial timeout here,
      // cancel is handled by killing the process from the IPC layer.
      void child;
    });

    const srt = await fs.readFile(`${outBase}.srt`, 'utf8');
    req.onProgress('done', 100);
    await fs.rm(wavFile, { force: true }).catch(() => undefined);
    return { ok: true, srt };
  } catch (e) {
    return { ok: false, srt: null, error: (e as Error).message };
  }
}
