import React, { useRef, useState, useMemo, useEffect } from 'react';
import { buildTimeMap, formatClock } from '@recast/editor';
import type { Clip, RecastProject, ZoomKeyframe } from '@recast/shared';
import { useEditor } from '../state/stores';
import {
  IconPlay,
  IconPause,
  IconScissors,
  IconTrash,
  IconFilm,
  IconZoom,
  IconPlus,
} from '@recast/ui';

/**
 * Multi-Track Studio Timeline (Recordly Parity):
 * - Unified single-row Studio Transport & Timeline controls bar
 * - Track 1: Video Track (Clips with trim handles and transitions)
 * - Track 2: Dedicated Clustered Zoom Track (Draggable, resizable purple zoom region cards)
 * - Track headers with mute/solo and "+ Add Zoom" shortcut
 * - Full-height playhead needle with smooth scrubbing
 */

const MIN_SRC_US = 200_000; // never trim a clip below 200 ms of source
const TICK_STEPS = [
  500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 15_000_000, 30_000_000, 60_000_000, 120_000_000,
  300_000_000, 600_000_000, 1_800_000_000,
];

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

interface ZoomRegion {
  id: string;
  inKfId: string;
  outKfId?: string;
  tInUs: number;
  tOutUs: number;
  zoom: number;
  isAuto: boolean;
}

type DragState =
  | { kind: 'trim-in' | 'trim-out'; clipId: string; startX: number; width: number; maxSrcUs: number }
  | { kind: 'zoom-move'; regionId: string; startX: number; initialInUs: number; initialOutUs: number; width: number }
  | { kind: 'zoom-trim-in'; regionId: string; startX: number; initialInUs: number; tOutUs: number; width: number }
  | { kind: 'zoom-trim-out'; regionId: string; startX: number; initialOutUs: number; tInUs: number; width: number }
  | null;

export function TimelineStrip({
  project,
  durationUs,
  currentTimeUs,
  onSeek,
  onSplit,
  onDeleteRange,
}: {
  project: RecastProject;
  durationUs: number;
  currentTimeUs: number;
  onSeek: (t: number) => void;
  onSplit?: () => void;
  onDeleteRange?: () => void;
}): React.ReactElement {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const setSelectedClip = useEditor((s) => s.setSelectedClip);
  const beginDrag = useEditor((s) => s.beginDrag);
  const patch = useEditor((s) => s.patch);
  const commit = useEditor((s) => s.commit);
  const playing = useEditor((s) => s.playing);
  const setPlaying = useEditor((s) => s.setPlaying);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);

  const map = buildTimeMap(project.timeline.clips);
  const dur = Math.max(1, durationUs);
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / dur) * 100))}%`;

  const timeAt = (clientX: number): number => {
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(f * dur);
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setPlaying(!useEditor.getState().playing);
          break;
        case 'KeyS':
          e.preventDefault();
          onSplit?.();
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          onDeleteRange?.();
          break;
        case 'KeyZ':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSplit, onDeleteRange, setPlaying, undo, redo]);

  // Convert keyframes into contiguous Zoom Regions with smart clustering
  const zoomRegions = useMemo<ZoomRegion[]>(() => {
    const isManual = project.zoom.mode === 'manual';
    const kfs: ZoomKeyframe[] = isManual ? project.zoom.manualKeyframes : project.zoom.autoKeyframes;
    if (!project.zoom.enabled || !kfs || kfs.length === 0) return [];

    const sorted = [...kfs].sort((a, b) => a.tUs - b.tUs);
    const rawRegions: ZoomRegion[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const kf = sorted[i]!;
      if (kf.zoom > 1.05) {
        const nextKf = sorted[i + 1];
        let outKfId: string | undefined;
        let tOutUs: number;

        if (nextKf && nextKf.zoom <= 1.05) {
          outKfId = nextKf.id;
          tOutUs = nextKf.tUs;
          i++; // skip return keyframe
        } else if (nextKf) {
          tOutUs = nextKf.tUs;
        } else {
          tOutUs = Math.min(dur, kf.tUs + 2_500_000);
        }

        rawRegions.push({
          id: `zr-${kf.id}`,
          inKfId: kf.id,
          outKfId,
          tInUs: kf.tUs,
          tOutUs: Math.max(kf.tUs + 2_000_000, tOutUs),
          zoom: kf.zoom,
          isAuto: !isManual,
        });
      }
    }

    // Smart Clustering: Merge nearby clicks within 2.5 seconds to eliminate cluttered micro-blobs
    const clustered: ZoomRegion[] = [];
    for (const r of rawRegions) {
      const last = clustered[clustered.length - 1];
      if (last && r.tInUs - last.tOutUs < 2_500_000) {
        last.tOutUs = Math.max(last.tOutUs, r.tOutUs);
        last.zoom = Math.max(last.zoom, r.zoom);
      } else {
        clustered.push({ ...r });
      }
    }
    return clustered;
  }, [project.zoom, dur]);

  const patchClip = (clipId: string, fields: Partial<Clip>): void => {
    const clips = project.timeline.clips.map((c) => (c.id === clipId ? { ...c, ...fields } : c));
    patch(relayoutProject(project, clips));
  };

  const startTrim = (e: React.PointerEvent, clip: Clip, kind: 'trim-in' | 'trim-out'): void => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = stripRef.current?.getBoundingClientRect();
    const seg = project.media.segments.find((s) => s.id === clip.segmentId);
    const segSrcUs = seg ? Math.max(seg.endUs - seg.startUs, clip.sourceOutUs) : Number.POSITIVE_INFINITY;
    beginDrag();
    setSelectedClip(clip.id);
    setDrag({ kind, clipId: clip.id, startX: e.clientX, width: rect?.width ?? 1, maxSrcUs: segSrcUs });
  };

  const onTrimMove = (e: React.PointerEvent): void => {
    if (!drag || (drag.kind !== 'trim-in' && drag.kind !== 'trim-out')) return;
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

  // Zoom block drag handlers
  const startZoomDrag = (e: React.PointerEvent, region: ZoomRegion, kind: 'zoom-move' | 'zoom-trim-in' | 'zoom-trim-out') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = stripRef.current?.getBoundingClientRect();
    beginDrag();
    if (kind === 'zoom-move') {
      setDrag({
        kind,
        regionId: region.id,
        startX: e.clientX,
        initialInUs: region.tInUs,
        initialOutUs: region.tOutUs,
        width: rect?.width ?? 1,
      });
    } else if (kind === 'zoom-trim-in') {
      setDrag({
        kind,
        regionId: region.id,
        startX: e.clientX,
        initialInUs: region.tInUs,
        tOutUs: region.tOutUs,
        width: rect?.width ?? 1,
      });
    } else {
      setDrag({
        kind,
        regionId: region.id,
        startX: e.clientX,
        initialOutUs: region.tOutUs,
        tInUs: region.tInUs,
        width: rect?.width ?? 1,
      });
    }
  };

  const onZoomMove = (e: React.PointerEvent) => {
    if (!drag || !drag.kind.startsWith('zoom-')) return;
    const region = zoomRegions.find((r) => r.id === (drag as { regionId: string }).regionId);
    if (!region) return;

    const dUs = ((e.clientX - (drag as { startX: number }).startX) / (drag as { width: number }).width) * dur;
    let nextIn = region.tInUs;
    let nextOut = region.tOutUs;

    if (drag.kind === 'zoom-move') {
      const length = drag.initialOutUs - drag.initialInUs;
      nextIn = Math.max(0, Math.min(dur - length, drag.initialInUs + dUs));
      nextOut = nextIn + length;
    } else if (drag.kind === 'zoom-trim-in') {
      nextIn = Math.max(0, Math.min(drag.tOutUs - 400_000, drag.initialInUs + dUs));
      nextOut = drag.tOutUs;
    } else if (drag.kind === 'zoom-trim-out') {
      nextIn = drag.tInUs;
      nextOut = Math.max(drag.tInUs + 400_000, Math.min(dur, drag.initialOutUs + dUs));
    }

    const currentManual = project.zoom.mode === 'manual' ? [...project.zoom.manualKeyframes] : [...project.zoom.autoKeyframes];
    const updated = currentManual.map((kf) => {
      if (kf.id === region.inKfId) return { ...kf, tUs: Math.round(nextIn) };
      if (region.outKfId && kf.id === region.outKfId) return { ...kf, tUs: Math.round(nextOut) };
      return kf;
    });

    if (!region.outKfId && (drag.kind === 'zoom-move' || drag.kind === 'zoom-trim-out')) {
      const existingOut = updated.find((k) => k.id === `${region.inKfId}-out`);
      if (existingOut) {
        existingOut.tUs = Math.round(nextOut);
      } else {
        updated.push({
          id: `${region.inKfId}-out`,
          tUs: Math.round(nextOut),
          zoom: 1.0,
          cx: project.media.width / 2,
          cy: project.media.height / 2,
          ease: 'out',
        });
      }
    }

    patch({
      ...project,
      zoom: {
        ...project.zoom,
        enabled: true,
        mode: 'manual',
        manualKeyframes: updated,
      },
    });
  };

  const endDrag = (e: React.PointerEvent): void => {
    if (drag) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    setDrag(null);
  };

  const handleAddZoomAtPlayhead = () => {
    const tIn = currentTimeUs;
    const tOut = Math.min(dur, tIn + 2_500_000);
    const inKf: ZoomKeyframe = {
      id: `kf-in-${Date.now()}`,
      tUs: tIn,
      zoom: 1.6,
      cx: project.media.width / 2,
      cy: project.media.height / 2,
      ease: 'out',
    };
    const outKf: ZoomKeyframe = {
      id: `kf-out-${Date.now()}`,
      tUs: tOut,
      zoom: 1.0,
      cx: project.media.width / 2,
      cy: project.media.height / 2,
      ease: 'out',
    };
    const manual = project.zoom.mode === 'manual' ? [...project.zoom.manualKeyframes] : [...project.zoom.autoKeyframes];
    manual.push(inKf, outKf);
    commit({
      ...project,
      zoom: {
        ...project.zoom,
        enabled: true,
        mode: 'manual',
        manualKeyframes: manual,
      },
    });
  };

  const handleDeleteZoomRegion = (region: ZoomRegion) => {
    const manual = project.zoom.mode === 'manual' ? [...project.zoom.manualKeyframes] : [...project.zoom.autoKeyframes];
    const filtered = manual.filter((k) => k.id !== region.inKfId && k.id !== region.outKfId && k.id !== `${region.inKfId}-out`);
    commit({
      ...project,
      zoom: {
        ...project.zoom,
        enabled: true,
        mode: 'manual',
        manualKeyframes: filtered,
      },
    });
  };

  const interval = tickInterval(dur);
  const ticks: number[] = [];
  for (let t = 0; t <= dur; t += interval) ticks.push(t);
  const minorStep = interval / 5;
  const minors: number[] = [];
  for (let t = 0; t <= dur; t += minorStep) minors.push(t);

  return (
    <div className="border-t border-hairline bg-[#0d0f14] select-none">
      {/* UNIFIED SINGLE-ROW STUDIO TRANSPORT BAR (Recordly Parity) */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-[#10131b]">
        {/* Left: Playback & Editing tools */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="w-8 h-8 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 flex items-center justify-center transition-colors border border-blue-500/30"
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
          </button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          {onSplit ? (
            <button
              type="button"
              onClick={onSplit}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Split clip at playhead (S)"
            >
              <IconScissors size={13} />
              <span>Split</span>
            </button>
          ) : null}

          {onDeleteRange ? (
            <button
              type="button"
              onClick={onDeleteRange}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/80 hover:text-red-300 border border-white/10 hover:border-red-500/40 text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Delete selected clip or 1s range (Del)"
            >
              <IconTrash size={13} />
              <span>Delete</span>
            </button>
          ) : null}

          <div className="h-4 w-px bg-white/10 mx-1" />

          {/* Quick Zoom Insert Button */}
          <button
            type="button"
            onClick={handleAddZoomAtPlayhead}
            className="px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Insert a new zoom block at the current playhead"
          >
            <IconPlus size={12} />
            <span>Add Zoom Block</span>
          </button>
        </div>

        {/* Center: High-legibility Timecode */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-black/40 border border-white/10 font-mono text-xs font-semibold">
          <span className="text-white/90">{formatClock(currentTimeUs)}</span>
          <span className="text-white/30">/</span>
          <span className="text-white/50">{formatClock(dur)}</span>
        </div>

        {/* Right: Timeline Zoom Scaling & Keyboard hints */}
        <div className="flex items-center gap-3 text-xs text-white/50">
          <div className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded-lg border border-white/10">
            <span className="text-[11px] text-white/60">Zoom</span>
            <button
              type="button"
              onClick={() => setZoomScale((s) => Math.max(0.5, s - 0.25))}
              className="px-1.5 py-0.5 rounded hover:bg-white/10 text-white/80"
              title="Zoom out"
            >
              -
            </button>
            <span className="w-8 text-center tabular text-[11px] font-mono text-white/70">{Math.round(zoomScale * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoomScale((s) => Math.min(3, s + 0.25))}
              className="px-1.5 py-0.5 rounded hover:bg-white/10 text-white/80"
              title="Zoom in"
            >
              +
            </button>
          </div>

          <span className="text-[10px] text-white/40 hidden md:inline">
            <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[9px] text-white/70">Space</kbd> play ·{' '}
            <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[9px] text-white/70">S</kbd> split ·{' '}
            <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[9px] text-white/70">Del</kbd> delete
          </span>
        </div>
      </div>

      {/* Main Two-Tier Track Layout */}
      <div className="flex">
        {/* Track Labels Column (Left Dock) */}
        <div className="w-28 shrink-0 border-r border-white/10 bg-[#0f121a] flex flex-col z-20">
          {/* Ruler Corner */}
          <div className="h-6 border-b border-white/10 flex items-center px-2 text-[10px] text-white/40 font-mono">
            TRACKS
          </div>

          {/* Track 1 Header: Video */}
          <div className="h-14 border-b border-white/10 px-2 flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-sky-400 flex items-center gap-1.5">
                <IconFilm size={12} />
                <span>Video 1</span>
              </span>
              <span className="text-[9px] bg-sky-950/80 text-sky-300 px-1 rounded border border-sky-800">
                {map.clips.length}
              </span>
            </div>
            <span className="text-[9px] text-white/30 truncate">Primary Screen</span>
          </div>

          {/* Track 2 Header: Zoom */}
          <div className="h-12 border-b border-white/10 px-2 flex flex-col justify-center bg-purple-950/20">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
                <IconZoom size={12} />
                <span>Zoom</span>
              </span>
              <button
                type="button"
                onClick={handleAddZoomAtPlayhead}
                title="Add zoom block at current playhead"
                className="w-4 h-4 rounded-full bg-purple-600/40 hover:bg-purple-600 text-purple-200 text-[10px] flex items-center justify-center font-bold"
              >
                <IconPlus size={10} />
              </button>
            </div>
            <span className="text-[9px] text-purple-400/60 truncate">
              {project.zoom.mode === 'auto' ? 'Auto Clicks' : 'Manual Track'}
            </span>
          </div>
        </div>

        {/* Tracks Canvas & Playhead Area */}
        <div
          ref={stripRef}
          className="relative flex-1 cursor-pointer select-none overflow-x-hidden bg-[#090b10]"
          onPointerDown={(e) => {
            setSelectedClip(null);
            onSeek(timeAt(e.clientX));
          }}
          onPointerMove={(e) => {
            if (drag) {
              if (drag.kind.startsWith('zoom-')) onZoomMove(e);
              else onTrimMove(e);
            }
          }}
          onPointerUp={drag ? endDrag : undefined}
          role="slider"
          aria-label="Multi-track Timeline"
          aria-valuenow={Math.round(currentTimeUs / 1000)}
          tabIndex={0}
        >
          {/* Time Ruler (Top) */}
          <div className="relative h-6 border-b border-white/10 bg-[#11141c]">
            {minors.map((t) => (
              <div
                key={`m${t}`}
                className="absolute bottom-0 w-px bg-white/10"
                style={{ left: pct(t), height: 4 }}
              />
            ))}
            {ticks.map((t) => (
              <div key={t} className="absolute bottom-0" style={{ left: pct(t) }}>
                <div className="w-px h-2.5 bg-white/30" />
                <span className="absolute whitespace-nowrap text-[9px] tabular text-white/50 left-1 top-0">
                  {formatClock(t, false)}
                </span>
              </div>
            ))}
          </div>

          {/* TRACK 1: VIDEO CLIPS */}
          <div className="relative h-14 border-b border-white/10 bg-[#0c0e15] flex items-center">
            {map.clips.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-white/30">
                No clips yet — media empty.
              </div>
            ) : null}

            {map.clips.map(({ clip, tIn, tOut }) => {
              const selected = clip.id === selectedClipId;
              const span = (tOut - tIn) / dur;
              const narrow = span < 0.05;

              return (
                <div
                  key={clip.id}
                  role="button"
                  aria-label={`Clip ${clip.segmentId}`}
                  className="absolute h-11 overflow-hidden rounded-md border transition-all cursor-grab active:cursor-grabbing"
                  style={{
                    left: pct(tIn),
                    width: `${Math.max(0.5, span * 100)}%`,
                    background: selected
                      ? 'linear-gradient(180deg, #1e3a5f 0%, #152844 100%)'
                      : 'linear-gradient(180deg, #172338 0%, #0f1827 100%)',
                    borderColor: selected ? '#38bdf8' : '#2563eb55',
                    boxShadow: selected ? '0 0 10px rgba(56, 189, 248, 0.4)' : 'none',
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedClip(clip.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onSeek(tIn);
                  }}
                >
                  {/* Trim Handles */}
                  <div
                    aria-label="Trim clip start"
                    className="absolute left-0 top-0 h-full w-2 hover:bg-sky-400/40 cursor-ew-resize z-10"
                    onPointerDown={(e) => startTrim(e, clip, 'trim-in')}
                    onPointerMove={onTrimMove}
                    onPointerUp={endDrag}
                  />
                  <div
                    aria-label="Trim clip end"
                    className="absolute right-0 top-0 h-full w-2 hover:bg-sky-400/40 cursor-ew-resize z-10"
                    onPointerDown={(e) => startTrim(e, clip, 'trim-out')}
                    onPointerMove={onTrimMove}
                    onPointerUp={endDrag}
                  />

                  {/* Grip indicators */}
                  {!narrow ? (
                    <>
                      <div className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-sky-400/40 rounded-full" />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-sky-400/40 rounded-full" />
                    </>
                  ) : null}

                  {/* Clip Label */}
                  <div className="flex h-full flex-col justify-between px-2.5 py-1 pointer-events-none">
                    <span className="truncate text-[10px] font-semibold text-sky-200">
                      {clip.segmentId}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-sky-400/70 tabular">
                        {formatClock(tOut - tIn)}
                      </span>
                      {clip.speed !== 1 ? (
                        <span className="rounded bg-black/40 px-1 text-[8px] text-white/70">
                          {clip.speed.toFixed(2)}×
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* TRACK 2: DEDICATED CLUSTERED ZOOM REGIONS */}
          <div className="relative h-12 border-b border-white/10 bg-[#0d0f17] flex items-center">
            {zoomRegions.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-purple-400/30">
                No zoom regions active. Click &quot;+ Add Zoom Block&quot; to insert one.
              </div>
            ) : null}

            {zoomRegions.map((region) => {
              const span = (region.tOutUs - region.tInUs) / dur;
              const narrow = span < 0.05;

              return (
                <div
                  key={region.id}
                  role="button"
                  aria-label={`Zoom ${region.zoom.toFixed(2)}x`}
                  className="absolute h-9 rounded-lg border overflow-hidden cursor-grab active:cursor-grabbing transition-all hover:brightness-110"
                  style={{
                    left: pct(region.tInUs),
                    width: `${Math.max(1.2, span * 100)}%`,
                    background: region.isAuto
                      ? 'linear-gradient(180deg, #581c87 0%, #3b0764 100%)'
                      : 'linear-gradient(180deg, #7e22ce 0%, #581c87 100%)',
                    borderColor: region.isAuto ? '#c084fc' : '#e9d5ff',
                    boxShadow: '0 3px 12px rgba(147, 51, 234, 0.4)',
                  }}
                  onPointerDown={(e) => startZoomDrag(e, region, 'zoom-move')}
                  onPointerMove={onZoomMove}
                  onPointerUp={endDrag}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleDeleteZoomRegion(region);
                  }}
                  title={`Zoom ${region.zoom.toFixed(2)}× (${formatClock(region.tOutUs - region.tInUs)}) — Drag to move, handles to resize, double-click to delete`}
                >
                  {/* Trim Handles for Zoom Duration */}
                  <div
                    aria-label="Trim zoom start"
                    className="absolute left-0 top-0 h-full w-3 hover:bg-purple-300/60 cursor-ew-resize z-10"
                    onPointerDown={(e) => startZoomDrag(e, region, 'zoom-trim-in')}
                    onPointerMove={onZoomMove}
                    onPointerUp={endDrag}
                  />
                  <div
                    aria-label="Trim zoom end"
                    className="absolute right-0 top-0 h-full w-3 hover:bg-purple-300/60 cursor-ew-resize z-10"
                    onPointerDown={(e) => startZoomDrag(e, region, 'zoom-trim-out')}
                    onPointerMove={onZoomMove}
                    onPointerUp={endDrag}
                  />

                  {/* Visual content: Clean, Handsome Rectangular Card */}
                  <div className="flex h-full items-center justify-between px-2.5 pointer-events-none">
                    <span className="text-[11px] font-bold text-white flex items-center gap-1.5 drop-shadow-sm">
                      <IconZoom size={11} /> {!narrow ? `${region.zoom.toFixed(1)}× Zoom` : `${region.zoom.toFixed(1)}×`}
                    </span>
                    {!narrow ? (
                      <span className="text-[9px] text-purple-200/90 font-mono tabular">
                        {formatClock(region.tOutUs - region.tInUs)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* SHARED PLAYHEAD NEEDLE (Across all tracks) */}
          <div
            className="pointer-events-none absolute top-0 h-full z-30 flex flex-col items-center"
            style={{ left: pct(currentTimeUs) }}
          >
            {/* Playhead Top Handle */}
            <div
              className="w-3 h-3 bg-red-500 rotate-45 -translate-y-1.5 shadow-md shadow-red-500/50"
              style={{ borderRadius: '2px' }}
            />
            {/* Vertical Line */}
            <div className="w-[1.5px] h-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
