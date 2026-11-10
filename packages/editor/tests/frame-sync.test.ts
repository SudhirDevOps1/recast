import { describe, expect, it, vi } from 'vitest';
import { FrameSync } from '../src/frame-sync';

/**
 * FrameSync drives real HTMLVideoElements in the app; here it runs against
 * minimal fakes — the controller only touches the DOM API surface
 * (addEventListener, currentTime, readyState, paused, play, pause).
 */

interface FakeVideo {
  currentTime: number;
  readyState: number;
  paused: boolean;
  ended: boolean;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  playbackRate: number;
  error: null;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  listeners: Map<string, Array<() => void>>;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
}

const snapshotCanvasFactory = (): unknown => ({
  width: 0,
  height: 0,
  getContext: () => ({ drawImage: vi.fn() }),
});

function makeSync(opts: ConstructorParameters<typeof FrameSync>[0] = {}): FrameSync {
  return new FrameSync({
    ...opts,
    createSnapshotCanvas: ((w: number, h: number) => {
      const c = snapshotCanvasFactory() as { width: number; height: number };
      c.width = w;
      c.height = h;
      return c as unknown as HTMLCanvasElement;
    }) as never,
  });
}

function fakeVideo(opts: Partial<FakeVideo> = {}): FakeVideo {
  const listeners = new Map<string, Array<() => void>>();
  const v: FakeVideo = {
    currentTime: opts.currentTime ?? 0,
    readyState: opts.readyState ?? 2,
    paused: opts.paused ?? true,
    ended: false,
    duration: opts.duration ?? 60,
    videoWidth: opts.videoWidth ?? 1920,
    videoHeight: opts.videoHeight ?? 1080,
    playbackRate: 1,
    error: null,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    listeners,
    addEventListener: (type, cb) => {
      const arr = listeners.get(type) ?? [];
      arr.push(cb);
      listeners.set(type, arr);
    },
    removeEventListener: (type, cb) => {
      const arr = listeners.get(type) ?? [];
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    },
  };
  return v;
}

function fire(v: FakeVideo, type: string): void {
  for (const cb of v.listeners.get(type) ?? []) cb();
}

function asElement(v: FakeVideo): unknown {
  return v;
}

describe('FrameSync', () => {
  it('returns null for unknown segments (no crash)', () => {
    const fs = makeSync();
    expect(fs.getFrame('nope', 0)).toBeNull();
  });

  it('returns the element when it is decode-ready and within tolerance', () => {
    const fs = makeSync();
    const v = fakeVideo({ currentTime: 1.0, readyState: 2 });
    fs.setVideos(new Map([['seg-1', asElement(v) as never]]));
    // 1.0 s vs requested 1.02 s — inside the default 40 ms seek tolerance.
    const frame = fs.getFrame('seg-1', 1_020_000);
    expect(frame).toBe(asElement(v));
  });

  it('issues a seek when drift exceeds the tolerance and falls back to the snapshot', () => {
    const onFrame = vi.fn();
    const fs = makeSync({ onFrame });
    const v = fakeVideo({ currentTime: 0, readyState: 2 });
    fs.setVideos(new Map([['seg-1', asElement(v) as never]]));

    // Present one frame so a snapshot exists.
    fs.getFrame('seg-1', 0);
    fire(v, 'canplay');

    // Now jump far away with the element NOT decode-ready (mid-seek stall).
    v.readyState = 0;
    const fallback = fs.getFrame('seg-1', 5_000_000);
    expect(v.currentTime).toBeCloseTo(5.0, 5);
    // The snapshot (canvas) is returned instead of null → no black fill.
    expect(fallback).not.toBeNull();
    expect(fallback).not.toBe(asElement(v));

    // Seek completes → onFrame fires and the element becomes paintable again.
    v.readyState = 2;
    v.currentTime = 5.0;
    fire(v, 'seeked');
    expect(onFrame).toHaveBeenCalledWith('seg-1');
    expect(fs.getFrame('seg-1', 5_000_000)).toBe(asElement(v));
  });

  it('play() pauses other segments but keep-mode leaves them running (face cam)', () => {
    const fs = makeSync();
    const screen = fakeVideo({ paused: true });
    const camera = fakeVideo({ paused: false });
    fs.setVideos(new Map([
      ['screen', asElement(screen) as never],
      ['__camera__', asElement(camera) as never],
    ]));

    fs.play('screen', 500_000, 1); // default: pause others
    expect(screen.pause).not.toHaveBeenCalled(); // it was already paused
    expect(camera.pause).toHaveBeenCalled();
    expect(screen.play).toHaveBeenCalled();

    const camera2 = fakeVideo({ paused: true });
    fs.setVideos(new Map());
    fs.setVideos(new Map([
      ['screen', asElement(screen) as never],
      ['__camera__', asElement(camera2) as never],
    ]));
    camera2.paused = false;
    fs.play('__camera__', 0, 1, 'keep');
    expect(screen.pause).not.toHaveBeenCalledTimes(2); // not paused again
  });

  it('play() hard-resyncs when the video drifted beyond the resync tolerance', () => {
    const fs = makeSync();
    const v = fakeVideo({ currentTime: 12, readyState: 2, paused: false });
    fs.setVideos(new Map([['seg-1', asElement(v) as never]]));
    fs.play('seg-1', 100_000, 1);
    expect(v.currentTime).toBeCloseTo(0.1, 5);
    expect(v.playbackRate).toBe(1);
  });

  it('playbackRate follows clip speed', () => {
    const fs = makeSync();
    const v = fakeVideo({ currentTime: 0, readyState: 2, paused: true });
    fs.setVideos(new Map([['seg-1', asElement(v) as never]]));
    fs.play('seg-1', 0, 1.5);
    expect(v.playbackRate).toBe(1.5);
  });

  it('pauseAll() stops every element and getFrame still serves the snapshot', () => {
    const fs = makeSync();
    const v = fakeVideo({ currentTime: 2, readyState: 2, paused: false });
    fs.setVideos(new Map([['seg-1', asElement(v) as never]]));
    fs.getFrame('seg-1', 2_000_000);
    fs.pauseAll();
    expect(v.pause).toHaveBeenCalled();
  });

  it('destroy() unbinds listeners and stops serving frames', () => {
    const fs = makeSync();
    const v = fakeVideo({ currentTime: 0, readyState: 2 });
    fs.setVideos(new Map([['seg-1', asElement(v) as never]]));
    fs.destroy();
    expect(fs.getFrame('seg-1', 0)).toBeNull();
  });
});
