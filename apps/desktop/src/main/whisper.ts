import { promises as fs, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { modelsDir, whisperDir } from './paths';
import type { CaptionModel } from '@recast/shared';
import type { FfmpegRunner } from '@recast/shared/node';

const WHISPER_BINARY_RELEASES = {
  'win32-x64': 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
  'win32-arm64': 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-win-cpu-arm64.zip',
  'linux-x64': 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-ubuntu-x64.tar.gz',
  'linux-arm64': 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-ubuntu-arm64.tar.gz',
} as const;

export function canInstallWhisperBinary(): boolean {
  const plat = process.platform === 'win32' ? 'win32' : process.platform === 'linux' ? 'linux' : 'darwin';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${plat}-${arch}` in WHISPER_BINARY_RELEASES;
}

export async function installWhisperBinary(onProgress: (pct: number) => void): Promise<{ ok: boolean; path?: string; error?: string }> {
  const plat = process.platform === 'win32' ? 'win32' : process.platform === 'linux' ? 'linux' : 'darwin';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const key = `${plat}-${arch}` as keyof typeof WHISPER_BINARY_RELEASES;
  const url = WHISPER_BINARY_RELEASES[key];
  if (!url) {
    return { ok: false, error: `Automated download is not available for ${process.platform}-${process.arch}. Please install via package manager.` };
  }

  const destDir = whisperDir();
  await fs.mkdir(destDir, { recursive: true });
  const archivePath = join(destDir, url.endsWith('.tar.gz') ? 'whisper-download.tar.gz' : 'whisper-download.zip');
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Recast/0.0.4',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching whisper binary package`);
    const total = Number(res.headers.get('content-length') ?? 9_000_000);
    const writer = createWriteStream(archivePath);
    let received = 0;
    let lastPct = -1;
    const reader = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
    reader.on('data', (chunk: Buffer) => {
      received += chunk.length;
      const pct = Math.min(90, Math.floor((received / total) * 90));
      if (pct !== lastPct) {
        lastPct = pct;
        onProgress(pct);
      }
    });
    await pipeline(reader, writer);
    onProgress(92);

    // Extract archive into destDir via platform bsdtar / tar
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('tar', ['-xf', archivePath, '-C', destDir], { shell: false });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Extraction exited with code ${code}`));
      });
      proc.on('error', reject);
    });
    onProgress(98);

    await fs.rm(archivePath, { force: true }).catch(() => undefined);
    const bin = await findWhisperBinary();
    if (!bin) throw new Error('Binary not found in archive after extraction');
    if (process.platform !== 'win32') {
      await fs.chmod(bin, 0o755).catch(() => undefined);
    }
    onProgress(100);
    return { ok: true, path: bin };
  } catch (e) {
    await fs.rm(archivePath, { force: true }).catch(() => undefined);
    return { ok: false, error: (e as Error).message };
  }
}

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
  canInstall: boolean;
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

// Pinned sources (official public ggml models repo on huggingface).
const _MODEL_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

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
  return { whisperBin: bin, canInstall: canInstallWhisperBinary(), models };
}

async function findWhisperBinary(): Promise<string | null> {
  const candidates =
    process.platform === 'win32'
      ? ['whisper-cli.exe', 'whisper.exe', 'main.exe']
      : ['whisper-cli', 'whisper', 'whisper-cpp'];

  const plat = process.platform === 'win32' ? 'win32' : process.platform === 'linux' ? 'linux' : 'darwin';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const platArch = `${plat}-${arch}`;

  // 1) Packaged app resources (resources/whisper/<platform>-<arch>/...)
  if (process.resourcesPath) {
    for (const c of candidates) {
      for (const sub of [
        join('whisper', platArch, c),
        join('whisper', platArch, 'Release', c),
        join('whisper', c),
      ]) {
        try {
          const p = join(process.resourcesPath, sub);
          await fs.access(p);
          return p;
        } catch {
          /* keep looking */
        }
      }
    }
  }

  // 2) Dev workspace resources (resources/whisper/<platform>-<arch>/...)
  for (const c of candidates) {
    for (const root of [
      join(process.cwd(), 'resources', 'whisper', platArch),
      join(process.cwd(), '..', '..', 'resources', 'whisper', platArch),
      join(process.cwd(), '..', 'resources', 'whisper', platArch),
      join(__dirname, '../../resources/whisper', platArch),
      join(__dirname, '../../../resources/whisper', platArch),
      join(process.cwd(), 'resources', 'whisper'),
    ]) {
      try {
        const p = join(root, c);
        await fs.access(p);
        return p;
      } catch {
        /* keep looking */
      }
    }
  }

  // 3) User data downloaded binary
  const dir = whisperDir();
  const searchRoots = [dir, join(dir, 'Release'), join(dir, 'bin')];
  for (const root of searchRoots) {
    for (const c of candidates) {
      try {
        const p = join(root, c);
        await fs.access(p);
        return p;
      } catch {
        /* keep looking */
      }
    }
  }

  // 4) PATH
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
  const dir = modelsDir();
  await fs.mkdir(dir, { recursive: true });
  const dest = join(dir, def.file);
  const urls = [
    `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${def.file}?download=true`,
    `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${def.file}`,
    `https://huggingface.co/datasets/ggerganov/whisper.cpp/resolve/main/${def.file}?download=true`,
    `https://huggingface.co/datasets/ggerganov/whisper.cpp/resolve/main/${def.file}`,
  ];

  let lastStatus = '';
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Recast/0.0.4',
        },
      });
      if (!res.ok) {
        lastStatus = `HTTP ${res.status}`;
        continue;
      }
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
    } catch (err) {
      lastStatus = (err as Error).message;
      await fs.rm(`${dest}.part`, { force: true }).catch(() => undefined);
    }
  }
  return { ok: false, error: `Failed to download ${def.label} (${lastStatus || 'connection error'}). Please check internet connection.` };
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
  const wavFile = `${req.audioFile}.16k.wav`;
  try {
    let sourceFile = req.audioFile;

    // 1. Verify primary audio file validity
    let validAudio = false;
    try {
      const st = await fs.stat(sourceFile);
      if (st.size > 10_000) {
        validAudio = true;
      }
    } catch {
      validAudio = false;
    }

    // Fallback: If primary audio (e.g. mic.webm) is empty/corrupt, look for fallback candidates
    if (!validAudio) {
      const parentDir = dirname(sourceFile);
      try {
        const files = await fs.readdir(parentDir);
        // Look for system audio or video segments with audio
        const sysAudio = files.find((f) => f.startsWith('system') && f.endsWith('.webm'));
        if (sysAudio) {
          const sysPath = join(parentDir, sysAudio);
          const st = await fs.stat(sysPath);
          if (st.size > 10_000) {
            sourceFile = sysPath;
            validAudio = true;
          }
        }
        if (!validAudio) {
          const firstSeg = files.find((f) => f.startsWith('seg-') && f.endsWith('.mp4'));
          if (firstSeg) {
            const segPath = join(parentDir, firstSeg);
            const hasAudio = await ffmpeg.hasAudioStream(segPath).catch(() => false);
            if (hasAudio) {
              sourceFile = segPath;
              validAudio = true;
            }
          }
        }
      } catch {
        /* ignore directory probe error */
      }
    }

    if (!validAudio) {
      return {
        ok: false,
        srt: null,
        error: 'No audio was recorded in this video. Please ensure your microphone is enabled and allowed before recording.',
      };
    }

    const hasAudio = await ffmpeg.hasAudioStream(sourceFile).catch(() => false);
    if (!hasAudio) {
      return {
        ok: false,
        srt: null,
        error: 'No audio was recorded in this video. Please ensure your microphone is enabled and allowed before recording.',
      };
    }

    req.onProgress('extracting', 5);
    try {
      await ffmpeg.extractWav(sourceFile, wavFile, 16_000);
    } catch (extractErr) {
      const msg = (extractErr as Error).message || '';
      if (
        msg.includes('NO_AUDIO_STREAM') ||
        msg.includes('no audio track') ||
        msg.includes('does not contain any stream') ||
        msg.includes('matches no streams')
      ) {
        return {
          ok: false,
          srt: null,
          error: 'No voice audio track found in this recording. Please enable your microphone before recording.',
        };
      }
      if (msg.includes('invalid as first byte of an EBML number') || msg.includes('End of file') || msg.includes('Duplicate element')) {
        return {
          ok: false,
          srt: null,
          error: 'Microphone audio recording is empty or corrupt. Please ensure microphone access is granted in Windows Settings.',
        };
      }
      const cleanMsg = msg.replace(/^Audio extraction failed:\s*/i, '');
      return { ok: false, srt: null, error: `Audio extraction failed: ${cleanMsg.slice(0, 160)}` };
    }

    // Verify extracted WAV has content
    try {
      const wavStat = await fs.stat(wavFile);
      if (wavStat.size < 1_000) {
        await fs.rm(wavFile, { force: true }).catch(() => undefined);
        return {
          ok: false,
          srt: null,
          error: 'Extracted audio track is silent or contains no audible speech.',
        };
      }
    } catch {
      /* ignore stat check */
    }

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
      void child;
    });

    const srt = await fs.readFile(`${outBase}.srt`, 'utf8');
    req.onProgress('done', 100);
    await fs.rm(wavFile, { force: true }).catch(() => undefined);
    return { ok: true, srt };
  } catch (e) {
    await fs.rm(wavFile, { force: true }).catch(() => undefined);
    return { ok: false, srt: null, error: (e as Error).message };
  }
}
