import type { Clip } from './project';

export const US_PER_MS = 1_000;
export const US_PER_S = 1_000_000;

/** Human clock `m:ss.d` from microseconds. */
export function formatClock(us: number, showTenths = true): string {
  const total = Math.max(0, us);
  const s = Math.floor(total / US_PER_S);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  const base = `${m}:${pad2(rem)}`;
  if (!showTenths) return base;
  const tenths = Math.floor((total % US_PER_S) / 100_000);
  return `${base}.${tenths}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export interface TimeMap {
  /** Timeline ranges as [timelineIn, timelineOut] per clip, in order. */
  clips: Array<{ clip: Clip; tIn: number; tOut: number }>;
  durationUs: number;
}

/**
 * Build the timeline layout for a clip list: source ranges played at `speed`,
 * laid end-to-end (ripple model). Pure — used by the compositor and exporter.
 */
export function buildTimeMap(clips: Clip[]): TimeMap {
  const out: TimeMap['clips'] = [];
  let cursor = 0;
  for (const clip of clips) {
    const srcLen = Math.max(0, clip.sourceOutUs - clip.sourceInUs);
    const len = Math.round(srcLen / clip.speed);
    if (len <= 0) continue;
    out.push({ clip, tIn: cursor, tOut: cursor + len });
    cursor += len;
  }
  return { clips: out, durationUs: cursor };
}

/** Timeline time → { clip, source time } or null when outside the edit. */
export function timelineToSource(
  map: TimeMap,
  tUs: number,
): { clip: Clip; sourceUs: number } | null {
  if (map.clips.length === 0) return null;
  for (const { clip, tIn, tOut } of map.clips) {
    if (tUs >= tIn && tUs < tOut) {
      const local = (tUs - tIn) * clip.speed;
      return { clip, sourceUs: clip.sourceInUs + local };
    }
  }
  const last = map.clips[map.clips.length - 1]!;
  const end = last.tOut;
  if (tUs === end) {
    const local = (end - last.tIn) * last.clip.speed;
    return { clip: last.clip, sourceUs: Math.min(last.clip.sourceOutUs, last.clip.sourceInUs + local) };
  }
  return null;
}

/** Split `clips` at timeline time `tUs` (must be inside a clip). Returns the new list. */
export function splitClipsAt(clips: Clip[], tUs: number, newId: (i: number) => string): Clip[] | null {
  const map = buildTimeMap(clips);
  const hit = map.clips.find(({ tIn, tOut }) => tUs > tIn && tUs < tOut);
  if (!hit) return null;
  const idx = clips.indexOf(hit.clip);
  if (idx < 0) return null;
  const srcSplit = hit.clip.sourceInUs + (tUs - hit.tIn) * hit.clip.speed;
  const left: Clip = { ...hit.clip, sourceOutUs: Math.round(srcSplit) };
  const right: Clip = {
    ...hit.clip,
    id: newId(idx),
    sourceInUs: Math.round(srcSplit),
  };
  return [...clips.slice(0, idx), left, right, ...clips.slice(idx + 1)];
}

/** Remove [tIn, tOut) from the timeline and pull the rest left (ripple delete). */
export function rippleDeleteRange(clips: Clip[], tIn: number, tOut: number): Clip[] {
  const map = buildTimeMap(clips);
  const out: Clip[] = [];
  for (const { clip, tIn: tA, tOut: tB } of map.clips) {
    if (tB <= tIn || tA >= tOut) {
      // Untouched: shift by the removed length if it starts after the range.
      const shift = tA >= tOut ? tOut - tIn : 0;
      out.push({ ...clip, timelineInUs: clip.timelineInUs - shift });
      continue;
    }
    const overlapStart = Math.max(tIn, tA);
    const overlapEnd = Math.min(tOut, tB);
    const overlapSrc = (overlapEnd - overlapStart) * clip.speed;
    if (overlapStart > tA) {
      out.push({ ...clip, sourceOutUs: clip.sourceOutUs - overlapSrc });
    }
    if (overlapEnd < tB) {
      out.push({
        ...clip,
        sourceInUs: clip.sourceInUs + overlapSrc,
        timelineInUs: tIn,
      });
    }
  }
  // Re-lay the timeline sequentially to keep the model consistent.
  let cursor = 0;
  for (const c of out) {
    c.timelineInUs = cursor;
    cursor += Math.round((c.sourceOutUs - c.sourceInUs) / c.speed);
  }
  return out;
}

/**
 * Capture-clock time → per-segment FILE time.
 *
 * Segment MP4s are written with `firstTimestampBehavior: 'offset'`, so every
 * file's internal timeline starts at 0 even though `seg.startUs` is a
 * monotonic capture-clock value. Seeking a segment `<video>` with the raw
 * capture-clock time therefore lands PAST the end of every segment after the
 * first (~2 s each) — the "intermittent black preview / frozen export"
 * reports. Every consumer that drives a segment video element (FrameSync
 * preview, exporter seeks) MUST pass through this mapping.
 */
export function segmentLocalTimeUs(sourceUs: number, segStartUs: number): number {
  return Math.max(0, sourceUs - segStartUs);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
