import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeEncoderChain, EncoderUnsupportedError } from '../src/encoder-probe';

/**
 * The fallback chain must NEVER let a raw DOMException escape: every
 * candidate failure is captured and the terminal failure is an
 * EncoderUnsupportedError carrying per-candidate detail. These tests stub
 * the WebCodecs globals to reproduce the exact Windows failure mode:
 * isConfigSupported() claims "supported", configure() throws NotSupportedError.
 */

type Behavior = 'ok' | 'configure-throw' | 'claim-unsupported';

const behaviors = new Map<string, Behavior>();

function behaviorFor(codec: string): Behavior {
  return behaviors.get(codec) ?? 'ok';
}

class FakeVideoFrame {
  constructor(_source: unknown, _init: { timestamp: number; duration: number }) {}
  close(): void {}
}

class FakeVideoEncoder {
  static instances: FakeVideoEncoder[] = [];

  constructor(_init: { output: (chunk: unknown, meta: unknown) => void; error: (e: Error) => void }) {
    FakeVideoEncoder.instances.push(this);
  }

  static async isConfigSupported(cfg: VideoEncoderConfig): Promise<{ supported: boolean; config: VideoEncoderConfig }> {
    const behavior = behaviorFor(cfg.codec);
    return { supported: behavior !== 'claim-unsupported', config: cfg };
  }

  configure(cfg: VideoEncoderConfig): void {
    if (behaviorFor(cfg.codec) === 'configure-throw') {
      // Chromium's real failure mode: raw NotSupportedError at configure time
      // even though isConfigSupported said yes.
      throw new DOMException('Hardware encoder refused the profile', 'NotSupportedError');
    }
  }

  encode(_frame: FakeVideoFrame, _opts: { keyFrame: boolean }): void {}

  async flush(): Promise<void> {}

  close(): void {}
}

describe('encoder fallback chain', () => {
  beforeEach(() => {
    behaviors.clear();
    FakeVideoEncoder.instances = [];
    vi.stubGlobal('VideoEncoder', FakeVideoEncoder);
    vi.stubGlobal('VideoFrame', FakeVideoFrame);
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ fillRect: () => undefined }),
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips a candidate that throws at configure() despite a supported claim, and lands on the next', async () => {
    behaviors.set('avc1.640028', 'configure-throw'); // HW High lies in the probe
    behaviors.set('avc1.42E01F', 'ok');

    const result = await probeEncoderChain(1280, 720, 30, 4_000_000, () => undefined);

    expect(result.path).toBe('Hardware H.264 · Baseline');
    expect(result.config.codec).toBe('avc1.42E01F');
    expect(result.config.hardwareAcceleration).toBe('prefer-hardware');
    // 1 refused candidate + the winner.
    expect(result.attempts).toHaveLength(2);
  });

  it('falls through to the software candidate when both hardware paths refuse', async () => {
    behaviors.set('avc1.640028', 'configure-throw');
    behaviors.set('avc1.42E01F', 'configure-throw'); // kills HW Baseline AND SW H.264 (same codec)

    const result = await probeEncoderChain(1280, 720, 30, 4_000_000, () => undefined);

    expect(result.path).toBe('Software VP9 (WebCodecs)');
    expect(result.config.codec.startsWith('vp09')).toBe(true);
    // 3 refused candidates + the winner.
    expect(result.attempts).toHaveLength(4);
  });

  it('trusts configure(), not isConfigSupported(): a false "supported" claim does not win', async () => {
    behaviors.set('avc1.640028', 'claim-unsupported'); // probe says no
    behaviors.set('avc1.42E01F', 'ok');

    const result = await probeEncoderChain(1280, 720, 30, 4_000_000, () => undefined);

    expect(result.path).toBe('Hardware H.264 · Baseline');
    // The refused candidate is recorded with its probe result.
    expect(result.attempts[0]?.supportedClaim).toBe(false);
  });

  it('throws EncoderUnsupportedError (never a raw DOMException) when every candidate fails', async () => {
    for (const codec of ['avc1.640028', 'avc1.42E01F', 'vp09.00.10.08']) {
      behaviors.set(codec, 'configure-throw');
    }

    let caught: unknown;
    try {
      await probeEncoderChain(1280, 720, 30, 4_000_000, () => undefined);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(EncoderUnsupportedError);
    const err = caught as EncoderUnsupportedError;
    expect(err.name).toBe('EncoderUnsupportedError');
    expect(err).not.toBeInstanceOf(DOMException);
    // Four candidates tried: HW High, HW Baseline, SW H.264, SW VP9.
    expect(err.attempts).toHaveLength(4);
    expect(err.attempts[0]?.error?.name).toBe('NotSupportedError');
    expect(err.message).toContain('Copy diagnostics bundle');
  });

  it('closes every rejected encoder so none are left configured', async () => {
    behaviors.set('avc1.640028', 'configure-throw');
    behaviors.set('avc1.42E01F', 'ok');
    const closed: FakeVideoEncoder[] = [];
    const realClose = FakeVideoEncoder.prototype.close;
    vi.spyOn(FakeVideoEncoder.prototype, 'close').mockImplementation(function (this: FakeVideoEncoder) {
      closed.push(this);
      realClose.call(this);
    });

    await probeEncoderChain(1280, 720, 30, 4_000_000, () => undefined);

    // The winning encoder instance stays open; rejected ones are closed.
    expect(FakeVideoEncoder.instances.length).toBeGreaterThan(0);
    expect(closed.length).toBe(FakeVideoEncoder.instances.length);
  });

  it('reports every candidate failure through the log callback', async () => {
    behaviors.set('avc1.640028', 'configure-throw');
    behaviors.set('avc1.42E01F', 'ok');
    const logged: Array<{ message: string; detail?: string }> = [];

    await probeEncoderChain(1280, 720, 30, 4_000_000, (message, detail) => logged.push({ message, detail }));

    expect(logged.some((l) => l.message.includes('candidate failed: Hardware H.264 · High'))).toBe(true);
    expect(logged.some((l) => l.message.includes('encoder path chosen: Hardware H.264 · Baseline'))).toBe(true);
  });
});
