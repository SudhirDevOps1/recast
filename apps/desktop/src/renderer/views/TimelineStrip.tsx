import { useRef, useState } from 'react';
import { buildTimeMap, formatClock } from '@recast/editor';
import type { Clip, RecastProject } from '@recast/shared';
import { useEditor } from '../state/stores';

/**
 * Timeline 2.0: time ruler, selectable clips with ripple trim handles,
 * draggable manual zoom keyframes, transition/speed badges and a playhead.
 *
 * The time model is sequential (buildTimeMap lays clips end-to-end), so every
 * structural edit re-lays the timeline via relayout()/relayoutProject().
 */

const MIN_SRC_US = 200_000; // never trim a clip below 200 ms of source
const TICK_STEPS = [
  500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 15_000_000, 30_000_000, 60_000_000, 120_000_000,
  300_000_000, 600_000_000, 1_800_000_000,
];

/** Re-lay clips end-to-end (the ripple model) and recompute the duration. */
export function relayout(clips: Clip[]): { clips: Clip[]; durationUs: number } {
  let cursor = 0;
  const out = clips.map((c) => {
    const len = Math.max(0, Math.round((c.sourceOutUs - c.sourceInUs) / c.speed));
    const nc = { ...c, timelineInUs: cursor };
    cursor += len;
    return nc;
  });
  return { clips: out, durationUs: cursor };
}

export function relayoutProject(project: RecastProject, clips: Clip[]): RecastProject {
  const laid = relayout(clips);
  return { ...project, timeline: { clips: laid.clips, durationUs: laid.durationUs } };
}

function tickInterval(durationUs: number): number {
  for (const s of TICK_STEPS) if (durationUs / s <= 10) return s;
  return TICK_STEPS[TICK_STEPS.length - 1]!;
}

const TRANSITION_SHORT: Record<string, string> = {
  fade: 'fade',
  'slide-left': 'slide',
  'slide-up': 'rise',
  zoom: 'zoom',
};

type DragState =
  | { kind: 'trim-in' | 'trim-out'; clipId: string; startX: number; width: number; maxSrcUs: number }
  | { kind: 'kf'; kfId: string; width: number }
  | null;

export function TimelineStrip({
  project,
  durationUs,
  currentTimeUs,
  onSeek,
}: {
  project: RecastProject;
  durationUs: number;
  currentTimeUs: number;
  onSeek: (t: number) => void;
}): React.ReactElement {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const setSelectedClip = useEditor((s) => s.setSelectedClip);
  const beginDrag = useEditor((s) => s.beginDrag);
  const patch = useEditor((s) => s.patch);
  const commit = useEditor((s) => s.commit);

  const map = buildTimeMap(project.timeline.clips);
  const dur = Math.max(1, durationUs);
  const pct = (t: number) => `${(Math.max(0, t) / dur) * 100}%`;

  const timeAt = (clientX: number): number => {
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(f * dur);
  };

  const snapToleranceUs = (): number => {
    const rect = stripRef.current?.getBoundingClientRect();
    return rect ? Math.round((8 / rect.width) * dur) : 0;
  };

  const snap = (t: number, skipKfId?: string): number => {
    const tol = snapToleranceUs();
    if (tol <= 0) return t;
    const targets: number[] = [0, dur];
    for (const { tIn, tOut } of map.clips) targets.push(tIn, tOut);
    if (project.zoom.mode === 'manual') {
      for (const k of project.zoom.manualKeyframes) if (k.id !== skipKfId) targets.push(k.tUs);
    }
    let best = t;
    let bestD = tol;
    for (const g of targets) {
      const d = Math.abs(g - t);
      if (d <= bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  };

  const patchClip = (clipId: string, fields: Partial<Clip>): void => {
    const clips = project.timeline.clips.map((c) => (c.id === clipId ? { ...c, ...fields } : c));
    patch(relayoutProject(project, clips));
  };

  const startTrim = (e: React.PointerEvent, clip: Clip, kind: 'trim-in' | 'trim-out'): void => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = stripRef.current?.getBoundingClientRect();
    const seg = project.media.segments.find((s) => s.id === clip.segmentId);
    // Segment files are 0-based; fall back to the current range for legacy projects.
    const segSrcUs = seg ? Math.max(seg.endUs - seg.startUs, clip.sourceOutUs) : Number.POSITIVE_INFINITY;
    beginDrag();
    setSelectedClip(clip.id);
    setDrag({ kind, clipId: clip.id, startX: e.clientX, width: rect?.width ?? 1, maxSrcUs: segSrcUs });
  };

  const onTrimMove = (e: React.PointerEvent): void => {
    if (!drag || drag.kind === 'kf') return;
    const clip = project.timeline.clips.find((c) => c.id === drag.clipId);
    if (!clip) return;
    const dUs = ((e.clientX - drag.startX) / drag.width) * dur;
    const dSrc = dUs * clip.speed;
    if (drag.kind === 'trim-in') {
      const next = Math.max(0, Math.min(clip.sourceOutUs - MIN_SRC_US, clip.sourceInUs + dSrc));
      patchClip(clip.id, { sourceInUs: Math.round(next) });
    } else {
      const next = Math.max(clip.sourceInUs + MIN_SRC_US, Math.min(drag.maxSrcUs, clip.sourceOutUs + dSrc));
      patchClip(clip.id, { sourceOutUs: Math.round(next) });
    }
  };

  const startKfDrag = (e: React.PointerEvent, kfId: string): void => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = stripRef.current?.getBoundingClientRect();
    beginDrag();
    setDrag({ kind: 'kf', kfId, width: rect?.width ?? 1 });
  };

  const onKfMove = (e: React.PointerEvent): void => {
    if (!drag || drag.kind !== 'kf') return;
    const t = Math.max(0, Math.min(dur, snap(timeAt(e.clientX), drag.kfId)));
    patch({
      ...project,
      zoom: {
        ...project.zoom,
        manualKeyframes: project.zoom.manualKeyframes.map((k) => (k.id === drag.kfId ? { ...k, tUs: Math.round(t) } : k)),
      },
    });
  };

  const endDrag = (e: React.PointerEvent): void => {
    if (drag) e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
  };

  const interval = tickInterval(dur);
  const ticks: number[] = [];
  for (let t = 0; t <= dur; t += interval) ticks.push(t);
  const minorStep = interval / 5;
  const minors: number[] = [];
  for (let t = 0; t <= dur; t += minorStep) minors.push(t);

  return (
    <div className="border-t border-hairline px-4 py-3">
      <div
        ref={stripRef}
        className="relative cursor-pointer select-none rounded-lg border"
        style={{
          background: 'linear-gradient(180deg, var(--surface) 0%, var(--bg-sunken) 100%)',
          borderColor: 'var(--hairline)',
        }}
        onPointerDown={(e) => {
          setSelectedClip(null);
          onSeek(timeAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (drag) {
            if (drag.kind === 'kf') onKfMove(e);
            else onTrimMove(e);
          }
        }}
        onPointerUp={drag ? endDrag : undefined}
        role="slider"
        aria-label="Timeline"
        aria-valuenow={Math.round(currentTimeUs / 1000)}
        tabIndex={0}
      >
        {/* Ruler */}
        <div className="relative h-5 rounded-t-lg" style={{ borderBottom: '1px solid var(--hairline)' }}>
          {minors.map((t) => (
            <div
              key={`m${t}`}
              className="absolute bottom-0 w-px"
              style={{ left: pct(t), height: 4, background: 'var(--hairline-strong)' }}
            />
          ))}
          {ticks.map((t) => (
            <div key={t} className="absolute bottom-0" style={{ left: pct(t) }}>
              <div className="w-px" style={{ height: 8, background: 'var(--text-muted)' }} />
              <span
                className="absolute whitespace-nowrap text-[9px] tabular"
                style={{ left: 3, top: -1, color: 'var(--text-muted)' }}
              >
                {formatClock(t, false)}
              </span>
            </div>
          ))}
        </div>

        {/* Track */}
        <div className="relative h-24">
          {/* Manual zoom keyframes — draggable diamonds */}
          {project.zoom.enabled && project.zoom.mode === 'manual'
            ? project.zoom.manualKeyframes.map((kf) => (
                <div
                  key={kf.id}
                  role="button"
                  aria-label={`Zoom keyframe ${kf.zoom.toFixed(2)}× at ${formatClock(kf.tUs)}`}
                  className="absolute z-10 flex h-3 w-3 items-center justify-center"
                  style={{ left: `calc(${pct(kf.tUs)} - 6px)`, top: 8, cursor: 'grab' }}
                  title={`Zoom ${kf.zoom.toFixed(2)}× · ${formatClock(kf.tUs)} — drag to move, double-click to delete`}
                  onPointerDown={(e) => startKfDrag(e, kf.id)}
                  onPointerMove={(e) => drag?.kind === 'kf' && onKfMove(e)}
                  onPointerUp={endDrag}
                  onDoubleClick={() =>
                    commit({
                      ...project,
                      zoom: { ...project.zoom, manualKeyframes: project.zoom.manualKeyframes.filter((k) => k.id !== kf.id) },
                    })
                  }
                >
                  <div
                    className="h-2 w-2 rotate-45 rounded-[1px] transition-transform"
                    style={{
                      background: 'var(--accent)',
                      transform: 'rotate(45deg)',
                      boxShadow: '0 0 0 1px var(--bg-sunken)',
                    }}
                  />
                </div>
              ))
            : null}

          {/* Auto zoom keyframes — read-only ticks */}
          {project.zoom.enabled && project.zoom.mode !== 'manual'
            ? project.zoom.autoKeyframes.map((kf) => (
                <div
                  key={kf.id}
                  className="absolute h-2 w-1 rounded-sm"
                  style={{ left: pct(kf.tUs), top: 10, background: 'var(--accent)', opacity: 0.45 }}
                  title={`Auto zoom ${kf.zoom.toFixed(2)}× at ${formatClock(kf.tUs)}`}
                />
              ))
            : null}

          {/* Clips */}
          {map.clips.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>
              No clips yet — record or import media to start editing.
            </div>
          ) : null}
          {map.clips.map(({ clip, tIn, tOut }) => {
            const selected = clip.id === selectedClipId;
            return (
              <div
                key={clip.id}
                role="button"
                aria-label={`Clip ${clip.segmentId}`}
                className="absolute bottom-2 h-14 overflow-hidden rounded-md border transition-shadow"
                style={{
                  left: pct(tIn),
                  width: `${((tOut - tIn) / dur) * 100}%`,
                  background: selected
                    ? 'linear-gradient(180deg, #2b3242 0%, #222837 100%)'
                    : 'linear-gradient(180deg, var(--surface-raised) 0%, var(--surface) 100%)',
                  borderColor: selected ? 'var(--accent)' : 'var(--hairline-strong)',
                  boxShadow: selected ? '0 0 0 1px var(--accent), 0 4px 14px rgba(0,0,0,0.35)' : 'none',
                  cursor: 'grab',
                }}
                title={`${clip.segmentId} · ${formatClock(tOut - tIn)}${clip.speed !== 1 ? ` · ${clip.speed.toFixed(2)}×` : ''}${
                  clip.transitionIn !== 'none' ? ` · ${TRANSITION_SHORT[clip.transitionIn] ?? clip.transitionIn} intro` : ''
                }`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelectedClip(clip.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSeek(tIn);
                }}
              >
                {/* Trim handles */}
                <div
                  aria-label="Trim clip start"
                  className="absolute left-0 top-0 h-full w-2"
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={(e) => startTrim(e, clip, 'trim-in')}
                  onPointerMove={onTrimMove}
                  onPointerUp={endDrag}
                />
                <div
                  aria-label="Trim clip end"
                  className="absolute right-0 top-0 h-full w-2"
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={(e) => startTrim(e, clip, 'trim-out')}
                  onPointerMove={onTrimMove}
                  onPointerUp={endDrag}
                />
                {/* Trim grip visuals */}
                <div className="absolute left-0.5 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full" style={{ background: 'var(--hairline-strong)' }} />
                <div className="absolute right-0.5 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full" style={{ background: 'var(--hairline-strong)' }} />

                <div className="flex h-full flex-col justify-between px-3 py-1.5" style={{ pointerEvents: 'none' }}>
                  <span className="truncate text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {clip.segmentId}
                  </span>
                  <span className="flex items-center gap-1">
                    {clip.transitionIn !== 'none' ? (
                      <span
                        className="rounded px-1 text-[9px] font-semibold"
                        style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                      >
                        {TRANSITION_SHORT[clip.transitionIn] ?? clip.transitionIn}
                      </span>
                    ) : null}
                    {clip.speed !== 1 ? (
                      <span
                        className="rounded px-1 text-[9px] font-semibold"
                        style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}
                      >
                        {clip.speed.toFixed(2)}×
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Playhead */}
          <div className="pointer-events-none absolute top-0 h-full z-20" style={{ left: pct(currentTimeUs) }}>
            <div className="h-full w-0.5" style={{ background: 'var(--accent)' }} />
            <div
              className="absolute -top-0.5 -left-[5px] h-0 w-0"
              style={{
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '7px solid var(--accent)',
              }}
            />
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span>Click clip to select · drag edges to trim</span>
        {project.zoom.mode === 'manual' ? <span>Drag ◆ keyframes · double-click to delete</span> : null}
        <span className="ml-auto">S split · Del delete selection</span>
      </div>
    </div>
  );
}
