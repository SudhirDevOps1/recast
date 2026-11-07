import { uIOhook, type UiohookMouseEvent, type UiohookWheelEvent } from 'uiohook-napi';
import { screen } from 'electron';
import { RECORDING } from '@recast/shared';
import type { InputEvent } from '@recast/shared';

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
  private hook: typeof uIOhook | null = null;
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

    try {
      this.hook = uIOhook;
      this.hook.on('mousedown', (e: UiohookMouseEvent) => {
        if (!this.running || this.pausedAtMs != null) return;
        const p = this.point(e.x, e.y);
        this.pending.push({ tUs: tUs(), type: 'down', x: p.x, y: p.y, button: 'left' });
      });
      this.hook.on('mouseup', (e: UiohookMouseEvent) => {
        if (!this.running || this.pausedAtMs != null) return;
        const p = this.point(e.x, e.y);
        this.pending.push({ tUs: tUs(), type: 'up', x: p.x, y: p.y, button: 'left' });
      });
      this.hook.on('wheel', (e: UiohookWheelEvent) => {
        if (!this.running || this.pausedAtMs != null) return;
        const p = this.point(e.x, e.y);
        this.pending.push({ tUs: tUs(), type: 'wheel', x: p.x, y: p.y, wheelDy: e.rotation });
      });
      this.hook.start();
    } catch {
      // Hook failed (e.g. Wayland) — polling still works; the UI explains
      // reduced capability. Never crash the recorder over this.
      this.hook = null;
    }

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

  private point(x?: number, y?: number): { x: number; y: number } {
    if (x != null && y != null) return { x, y };
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
