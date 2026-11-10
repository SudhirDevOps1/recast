import { screen } from 'electron';
import { RECORDING } from '@recast/shared';
import type { InputEvent } from '@recast/shared';
import type { UiohookMouseEvent, UiohookWheelEvent, UiohookKeyboardEvent } from 'uiohook-napi';

type UiohookModule = {
  /** Subscribe to a global input event ('mousedown' | 'mouseup' | 'wheel' | 'keydown').
   * The handler parameter is `never` so concrete handlers stay assignable
   * (contravariance) without casts at the call sites. */
  on: (event: string, handler: (e: never) => void) => void;
  start: () => void;
  stop: () => void;
  keyMap: Record<number, string>;
};

/**
 * Lazy-load the global-input hook. Its native library (libXtst on X11) is
 * missing on minimal systems, and a static import would crash the whole app
 * at launch before any recording even starts. When the load fails, click and
 * wheel events are lost but cursor MOVE polling below still works.
 */
async function loadUiohook(): Promise<UiohookModule | null> {
  try {
    const mod = (await import('uiohook-napi')) as unknown as {
      uIOhook: {
        on: (event: string, handler: (e: never) => void) => void;
        start: () => void;
        stop: () => void;
      };
      UiohookKey: Record<string, number>;
    };
    const hook = mod.uIOhook;
    const keyMap: Record<number, string> = {};
    if (mod.UiohookKey) {
      for (const [name, code] of Object.entries(mod.UiohookKey)) {
        keyMap[code] = name;
      }
    }
    return {
      on: (event, handler) => hook.on(event, handler),
      start: () => hook.start(),
      stop: () => {
        try {
          hook.stop();
        } catch {
          /* already gone */
        }
      },
      keyMap,
    };
  } catch {
    return null;
  }
}

/**
 * 60 Hz cursor sampler + global input hooks, running in the main process.
 * uiohook-napi provides click/scroll/key events; the pointer position is
 * polled from `screen.getCursorScreenPoint()` because global mouse-move
 * events through uiohook are high-overhead. Batches flush every 100 ms.
 *
 * Timestamps are epoch-anchored: tUs = (Date.now() − sessionStartEpochMs) × 1000,
 * minus paused time. The renderer recorder uses the identical formula, so
 * cursor events line up with video frames even though they come from two
 * different processes.
 */
export class InputSampler {
  private hook: UiohookModule | null = null;
  private sampleTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private pending: InputEvent[] = [];
  private lastX = 0;
  private lastY = 0;
  private running = false;
  private originMs = 0;
  private pausedTotalMs = 0;
  private pausedAtMs: number | null = null;
  private onBatch: ((events: InputEvent[]) => void) | null = null;

  start(startEpochMs: number, onBatch: (events: InputEvent[]) => void): void {
    this.running = true;
    this.originMs = startEpochMs;
    this.onBatch = onBatch;

    const tUs = (): number =>
      Math.round((Date.now() - this.originMs - this.pausedTotalMs) * 1000);

    // Global click/wheel hooks load lazily and degrade gracefully — never
    // block sampler startup (or the whole app) on a native library.
    void loadUiohook().then((hook) => {
      if (!hook || !this.running) return;
      try {
        this.hook = hook;
        hook.on('mousedown', (_e: UiohookMouseEvent) => {
          if (!this.running || this.pausedAtMs != null) return;
          // Position ALWAYS comes from Electron's screen API (DIP space) —
          // uiohook reports a different coordinate space on Windows (physical
          // px), which would misalign clicks vs moves and the video frame.
          const p = this.point();
          this.pending.push({ tUs: tUs(), type: 'down', x: p.x, y: p.y, button: 'left' });
        });
        hook.on('mouseup', (_e: UiohookMouseEvent) => {
          if (!this.running || this.pausedAtMs != null) return;
          const p = this.point();
          this.pending.push({ tUs: tUs(), type: 'up', x: p.x, y: p.y, button: 'left' });
        });
        hook.on('wheel', (e: UiohookWheelEvent) => {
          if (!this.running || this.pausedAtMs != null) return;
          const p = this.point();
          this.pending.push({ tUs: tUs(), type: 'wheel', x: p.x, y: p.y, wheelDy: e.rotation });
        });
        hook.on('keydown', (e: UiohookKeyboardEvent) => {
          if (!this.running || this.pausedAtMs != null) return;
          const keyName = hook.keyMap[e.keycode] || `Key${e.keycode}`;
          // Record key event with timestamp
          this.pending.push({ tUs: tUs(), type: 'key', key: keyName });
        });
        hook.start();
      } catch {
        // Hook failed (e.g. Wayland) — polling still works; the UI explains
        // reduced capability. Never crash the recorder over this.
        this.hook = null;
      }
    });

    const sampleIntervalMs = 1000 / RECORDING.CURSOR_SAMPLE_HZ;
    this.sampleTimer = setInterval(() => {
      if (!this.running || this.pausedAtMs != null) return;
      const p = screen.getCursorScreenPoint();
      const moved = p.x !== this.lastX || p.y !== this.lastY;
      this.lastX = p.x;
      this.lastY = p.y;
      if (moved) {
        this.pending.push({ tUs: tUs(), type: 'move', x: p.x, y: p.y });
      }
    }, sampleIntervalMs);
    this.sampleTimer.unref();

    this.flushTimer = setInterval(() => {
      if (this.pending.length > 0 && this.onBatch) {
        const batch = this.pending;
        this.pending = [];
        this.onBatch(batch);
      }
    }, RECORDING.INPUT_FLUSH_MS);
    this.flushTimer.unref();
  }

  pause(): void {
    if (this.pausedAtMs == null) this.pausedAtMs = Date.now();
  }

  resume(): void {
    if (this.pausedAtMs != null) {
      this.pausedTotalMs += Date.now() - this.pausedAtMs;
      this.pausedAtMs = null;
    }
  }

  /** All positions come from Electron's screen API (DIP), scaled to physical
   *  video pixels at project build time via the manifest's displayScaleFactor. */
  private point(): { x: number; y: number } {
    return screen.getCursorScreenPoint();
  }

  stop(): InputEvent[] {
    this.running = false;
    if (this.sampleTimer) clearInterval(this.sampleTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.sampleTimer = null;
    this.flushTimer = null;
    try {
      this.hook?.stop();
    } catch {
      /* already gone */
    }
    this.hook = null;
    this.onBatch = null;
    return this.drain();
  }

  /** Events that never got flushed — write before closing the session file. */
  drain(): InputEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }
}
