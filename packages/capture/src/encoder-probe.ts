import { RECORDING } from '@recast/shared';

/**
 * Configure-probing encoder fallback chain.
 *
 * `VideoEncoder.isConfigSupported()` can report `supported: true` while the
 * actual `configure()` call throws NotSupportedError (hardware preference,
 * High profile, avc format, latency mode — any of these can be rejected at
 * configure time on real drivers, notably on Windows laptops with
 * half-working GPU encoders). Trusting the probe alone is what produced the
 * raw "Recording failed: Not supported" DOMException toast.
 *
 * The chain therefore CONFIGURES a throwaway encoder per candidate and runs a
 * one-frame canary encode+flush. The first candidate that configures AND
 * drains wins; its config is returned so the caller can configure the real
 * encoder. Every failure is reported through the structured log — a raw
 * DOMException never escapes this module.
 */

export interface EncoderCandidateResult {
  path: string;
  codec: string;
  ok: boolean;
  error?: { name: string; message: string };
  supportedClaim?: boolean;
}

export class EncoderUnsupportedError extends Error {
  readonly attempts: EncoderCandidateResult[];

  constructor(attempts: EncoderCandidateResult[]) {
    const failed = attempts.map((a) => `${a.path}: ${a.error?.name ?? 'unknown'} — ${a.error?.message ?? 'no detail'}`).join('; ');
    super(
      `No video encoder could be configured on this machine. Tried: ${failed}. ` +
        'Send Settings → Diagnostics → Copy diagnostics bundle so this can be fixed.',
    );
    this.name = 'EncoderUnsupportedError';
    this.attempts = attempts;
  }
}

export interface ProbedEncoder {
  config: VideoEncoderConfig;
  /** Human-readable chosen path, e.g. "Hardware H.264 · High". */
  path: string;
  attempts: EncoderCandidateResult[];
}

export type EncoderProbeLog = (message: string, detail?: string) => void;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function candidatesFor(width: number, height: number, fps: number, bitrate: number): Array<{ cfg: VideoEncoderConfig; path: string }> {
  return [
    {
      cfg: {
        codec: 'avc1.640028',
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware',
        avc: { format: 'avc' },
        latencyMode: 'quality',
      },
      path: 'Hardware H.264 · High',
    },
    {
      cfg: {
        codec: 'avc1.42E01F',
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware',
        avc: { format: 'avc' },
        latencyMode: 'quality',
      },
      path: 'Hardware H.264 · Baseline',
    },
    {
      cfg: {
        codec: 'avc1.42E01F',
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'prefer-software',
        avc: { format: 'avc' },
        latencyMode: 'quality',
      },
      path: 'Software H.264 · Baseline (OpenH264)',
    },
    {
      cfg: {
        codec: 'vp09.00.10.08',
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'prefer-software',
        latencyMode: 'quality',
      },
      path: 'Software VP9 (WebCodecs)',
    },
  ];
}

/** One full-size black frame — the canary proves configure+encode+flush E2E. */
async function canaryFrame(width: number, height: number, fps: number): Promise<VideoFrame> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
  }
  return new VideoFrame(canvas, { timestamp: 0, duration: Math.round(1_000_000 / fps) });
}

async function tryCandidate(
  cfg: VideoEncoderConfig,
  path: string,
  fps: number,
  log: EncoderProbeLog,
): Promise<EncoderCandidateResult> {
  const base: EncoderCandidateResult = { path, codec: cfg.codec, ok: false };
  let encoder: VideoEncoder | null = null;
  try {
    // Fast filter first — cheap, but NOT trusted (Chromium can lie).
    let claim = true;
    try {
      const support = await VideoEncoder.isConfigSupported(cfg);
      claim = Boolean(support.supported);
    } catch (e) {
      log(`isConfigSupported threw for ${path}`, `${(e as Error).name}: ${(e as Error).message}`);
      claim = true; // still try to configure — the probe is not authoritative
    }
    if (!claim) {
      return { ...base, supportedClaim: false, error: { name: 'NotSupportedError', message: 'isConfigSupported reported unsupported' } };
    }

    encoder = new VideoEncoder({ output: () => undefined, error: () => undefined });
    await withTimeout(Promise.resolve(encoder.configure(cfg)), 4_000, `configure(${path})`);
    const frame = await canaryFrame(cfg.width, cfg.height, fps);
    try {
      encoder.encode(frame, { keyFrame: true });
      await withTimeout(encoder.flush(), 8_000, `canary flush(${path})`);
    } finally {
      frame.close();
    }
    return { ...base, ok: true, supportedClaim: true };
  } catch (e) {
    const err = e as Error;
    return { ...base, error: { name: err.name ?? 'Error', message: err.message ?? String(e) } };
  } finally {
    try {
      encoder?.close();
    } catch {
      /* already closed by a failed configure */
    }
  }
}

/**
 * Probe the fallback chain and return the winning config. Never throws a raw
 * DOMException — everything funnels into EncoderUnsupportedError with the
 * per-candidate details attached.
 */
export async function probeEncoderChain(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
  log: EncoderProbeLog,
): Promise<ProbedEncoder> {
  const attempts: EncoderCandidateResult[] = [];
  for (const { cfg, path } of candidatesFor(width, height, fps, bitrate)) {
    const started = performance.now();
    const result = await tryCandidate(cfg, path, fps, log);
    const ms = Math.round(performance.now() - started);
    if (result.ok) {
      log(`encoder path chosen: ${path}`, `probe took ${ms} ms · ${cfg.codec} ${width}x${height}@${fps}`);
      return { config: cfg, path, attempts: [...attempts, result] };
    }
    attempts.push(result);
    log(`encoder candidate failed: ${path}`, `${result.error?.name}: ${result.error?.message} (${ms} ms)`);
  }
  throw new EncoderUnsupportedError(attempts);
}

/** Fixed keyframe cadence shared with the segmented writer. */
export const KEYFRAME_INTERVAL_S = RECORDING.KEYFRAME_INTERVAL_S;
