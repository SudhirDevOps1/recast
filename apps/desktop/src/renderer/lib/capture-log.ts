import type { CaptureLogEntry } from '@recast/shared';
import { bridge } from './bridge';

/**
 * Renderer-side capture diagnostics ring buffer.
 *
 * Every recording attempt logs its stage boundaries (display-media,
 * audio-init, encoder-probe, encoder-configure, muxer, segment-write, …)
 * here; a debounced batch ships to the main process, which appends NDJSON to
 * `%APPDATA%/Recast/logs/capture.log`. Bug reports carry the file via
 * Settings → Diagnostics → Copy diagnostics bundle — no more guessing which
 * stage threw a bare DOMException.
 */

const MAX_BUFFER = 1_000;
const FLUSH_DEBOUNCE_MS = 1_000;

let buffer: CaptureLogEntry[] = [];
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DEBOUNCE_MS);
}

export async function flush(): Promise<void> {
  if (!dirty || buffer.length === 0) return;
  const batch = buffer.slice(-200);
  dirty = false;
  try {
    await bridge().invoke('capture:appendLog', { entries: batch });
  } catch {
    /* diagnostics must never break the recording flow */
  }
}

export function logCapture(
  stage: string,
  level: CaptureLogEntry['level'],
  message: string,
  detail?: string,
): void {
  const entry: CaptureLogEntry = {
    ts: Date.now(),
    stage,
    level,
    message: String(message).slice(0, 500),
    detail: detail ? String(detail).slice(0, 800) : undefined,
  };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
  dirty = true;
  // Mirror to the devtools console for live debugging.
  const line = `recast:${stage} — ${message}${detail ? ` · ${detail}` : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.debug(line);
  scheduleFlush();
}

export function captureLogEntries(): CaptureLogEntry[] {
  return [...buffer];
}
