/**
 * Encoder selection for export. Mirrors the recording chain but adds HEVC
 * and WebM candidates. The resolved path is surfaced in the UI so users see
 * exactly which encoder produced their file.
 */

export interface ExportEncoderChoice {
  config: VideoEncoderConfig;
  path: string;
  container: 'mp4' | 'webm';
}

export async function resolveExportEncoder(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
  format: 'mp4' | 'webm' | 'hevc',
  preferHardware: boolean,
): Promise<ExportEncoderChoice> {
  const candidates: ExportEncoderChoice[] = [];
  if (format === 'mp4' || format === 'hevc') {
    if (format === 'hevc') {
      candidates.push(
        {
          config: {
            codec: 'hvc1.1.6.L93.B0',
            width,
            height,
            bitrate,
            framerate: fps,
            hardwareAcceleration: 'prefer-hardware',
            latencyMode: 'quality',
          },
          path: 'Hardware HEVC (WebCodecs)',
          container: 'mp4',
        },
        {
          config: {
            codec: 'hvc1.1.6.L93.B0',
            width,
            height,
            bitrate,
            framerate: fps,
            hardwareAcceleration: 'no-preference',
            latencyMode: 'quality',
          },
          path: 'Software HEVC (WebCodecs)',
          container: 'mp4',
        },
      );
    }
    candidates.push(
      {
        config: {
          codec: 'avc1.640028',
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: preferHardware ? 'prefer-hardware' : 'no-preference',
          avc: { format: 'avc' },
          latencyMode: 'quality',
        },
        path: preferHardware ? 'Hardware H.264 (WebCodecs)' : 'Software H.264 (WebCodecs)',
        container: 'mp4',
      },
      {
        config: {
          codec: 'avc1.42E01F',
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: 'no-preference',
          avc: { format: 'avc' },
          latencyMode: 'quality',
        },
        path: 'Software H.264 baseline (WebCodecs)',
        container: 'mp4',
      },
      // Some machines (no GPU, openh264 stripped) have no H.264 encoder at
      // all while VP9 (libvpx) is always compiled in. MP4 can hold VP9, so
      // the export still produces a playable .mp4 instead of failing.
      {
        config: {
          codec: 'vp09.00.10.08',
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: 'no-preference',
          latencyMode: 'quality',
        },
        path: 'Software VP9 in MP4 (WebCodecs fallback)',
        container: 'mp4',
      },
    );
  }
  if (format === 'webm') {
    candidates.push(
      {
        config: {
          codec: 'vp09.00.10.08',
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: 'no-preference',
          latencyMode: 'quality',
        },
        path: 'VP9 (WebCodecs → WebM)',
        container: 'webm',
      },
      {
        config: {
          codec: 'vp8',
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: 'no-preference',
          latencyMode: 'quality',
        },
        path: 'VP8 (WebCodecs → WebM)',
        container: 'webm',
      },
    );
  }

  for (const c of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported(c.config);
      if (support.supported) return c;
    } catch {
      // try next
    }
  }
  throw new Error(
    format === 'hevc'
      ? 'HEVC encoding is not available on this machine. MP4 (H.264) is available.'
      : 'No supported video encoder configuration found on this machine.',
  );
}

export async function resolveAudioEncoder(sampleRate: number): Promise<{ codec: 'aac' | 'opus'; config: AudioEncoderConfig }> {
  const aac: AudioEncoderConfig = {
    codec: 'mp4a.40.2',
    sampleRate,
    numberOfChannels: 2,
    bitrate: 192_000,
  };
  try {
    const support = await AudioEncoder.isConfigSupported(aac);
    if (support.supported) return { codec: 'aac', config: aac };
  } catch {
    // fall through to opus
  }
  return {
    codec: 'opus',
    config: { codec: 'opus', sampleRate, numberOfChannels: 2, bitrate: 160_000 },
  };
}

/** Bitrate from resolution + fps, matching ESTIMATE_BITRATE_MBPS targets. */
export function exportBitrate(height: number, fps: number, format: string): number {
  const table: Record<number, number> = { 720: 10, 1080: 18, 1440: 28, 2160: 48 };
  const mbps = table[height] ?? 18;
  const formatFactor = format === 'gif' ? 0.4 : format === 'webm' ? 0.8 : 1;
  return Math.round(mbps * 1_000_000 * (fps / 30) * formatFactor);
}
