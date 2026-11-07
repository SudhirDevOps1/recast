import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useEditor } from '../state/stores';
import { bridge } from '../lib/bridge';
import { Button, IconButton, Field, Select, Slider, Switch, Badge, IconPlay, IconPause, IconScissors, IconZoom, IconSparkle, IconTrash, IconDownload, IconUpload, IconStop, IconX } from '@recast/ui';
import {
  buildTimeMap,
  timelineToSource,
  splitClipsAt,
  rippleDeleteRange,
  formatClock,
  computeComposition,
  drawComposition,
  buildZoomTrack,
  buildProjectZoomTrack,
  computeAutoZoom,
  cuesAt,
  parseSrt,
  type CursorSample,
  type CaptionLine,
  type FollowStep,
} from '@recast/editor';
import type { RecastProject } from '@recast/shared';
import { BUILTIN_PRESETS } from '@recast/shared';

/**
 * The editor: compositor-driven preview (identical render path to export),
 * keyboard-first transport, zoom panel (auto/manual/follow), style panel,
 * captions, and the export dialog.
 */

export function EditorView() {
  const project = useEditor((s) => s.project);
  const commit = useEditor((s) => s.commit);
  const currentTimeUs = useEditor((s) => s.currentTimeUs);
  const setTime = useEditor((s) => s.setTime);
  const playing = useEditor((s) => s.playing);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const navigate = useApp((s) => s.navigate);
  const showToast = useApp((s) => s.showToast);

  const [cursorSamples, setCursorSamples] = useState<CursorSample[]>([]);
  const [cursorClicks, setCursorClicks] = useState<Array<{ tUs: number; x: number; y: number }>>([]);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [panel, setPanel] = useState<'zoom' | 'style' | 'captions'>('zoom');

  const timeMap = useMemo(() => (project ? buildTimeMap(project.timeline.clips) : { clips: [], durationUs: 0 }), [project]);

  // Zoom track (deterministic; shared with export).
  const zoomTrack = useMemo<FollowStep[]>(() => {
    if (!project) return [];
    if (!project.zoom.enabled) return [];
    if (project.zoom.mode === 'follow' && cursorSamples.length > 0) {
      return buildProjectZoomTrack(project, cursorSamples, cursorClicks).track;
    }
    const kfs = project.zoom.mode === 'manual' ? project.zoom.manualKeyframes : project.zoom.autoKeyframes;
    return buildZoomTrack(kfs, project.media.width || 1920, project.media.height || 1080, project.zoom.intensity, timeMap.durationUs);
  }, [project, cursorSamples, cursorClicks, timeMap.durationUs]);

  // Hidden video elements per segment — the decode source for preview + export.
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [mediaVersion, setMediaVersion] = useState(0);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    void (async () => {
      if (project.media.cursor?.available) {
        // Cursor data comes through the main process with the project; the
        // editor re-reads it from the session dir via a lightweight IPC.
        try {
          const data = await bridge().invoke('capture:readCursor', { sessionId: project.id } as never);
          if (!cancelled && data) {
            setCursorSamples((data as { samples: CursorSample[]; clicks: typeof cursorClicks }).samples);
            setCursorClicks((data as { samples: CursorSample[]; clicks: Array<{ tUs: number; x: number; y: number }> }).clicks);
          }
        } catch {
          setCursorSamples([]);
        }
      }
      if (project.captions) {
        try {
          const raw = await bridge().invoke('capture:readCaptions', { path: project.captions.file } as never);
          if (!cancelled && raw) setCaptions(parseSrt(raw as string).map((c) => ({ text: c.text.replace(/\n/g, ' '), startUs: c.startUs, endUs: c.endUs })));
        } catch {
          setCaptions([]);
        }
      }
      setMediaVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.id, project?.captions?.file]);

  // Media element URLs via the recast-media protocol.
  const mediaUrls = useMemo(() => {
    if (!project) return new Map<string, string>();
    const m = new Map<string, string>();
    for (const seg of project.media.segments) {
      const p = `${project.media.dir}/${seg.file}`;
      m.set(seg.id, `recast-media://local/${encodePath(p)}`);
    }
    return m;
  }, [project?.media]);

  const playhead = useRef<number | null>(null);

  // Playback loop — driven by rAF for smoothness in preview only; export
  // uses the deterministic frame clock (see @recast/export).
  useEffect(() => {
    if (!playing) {
      if (playhead.current) cancelAnimationFrame(playhead.current);
      playhead.current = null;
      return;
    }
    let last = performance.now();
    const step = (): void => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const dur = useEditor.getState().project?.timeline.durationUs ?? 0;
      const t = useEditor.getState().currentTimeUs + dt * 1000;
      if (t >= dur) {
        useEditor.getState().setTime(dur);
        useEditor.getState().setPlaying(false);
        return;
      }
      useEditor.getState().setTime(t);
      playhead.current = requestAnimationFrame(step);
    };
    playhead.current = requestAnimationFrame(step);
    return () => {
      if (playhead.current) cancelAnimationFrame(playhead.current);
    };
  }, [playing]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-secondary">
          <p className="text-lg font-semibold">No project open</p>
          <Button className="mt-3" onClick={() => navigate('library')}>
            Go to Library
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <PreviewCanvas
          project={project}
          currentTimeUs={currentTimeUs}
          zoomTrack={zoomTrack}
          captions={captions}
          cursorSamples={cursorSamples}
          videoRefs={videoRefs}
          mediaUrls={mediaUrls}
          mediaVersion={mediaVersion}
        />
        <Transport
          timeMapDuration={timeMap.durationUs}
          onSplit={() => {
            const next = splitClipsAt(project.timeline.clips, currentTimeUs, (i) => `clip-split-${Date.now()}-${i}`);
            if (!next) {
              showToast('Move the playhead inside a clip to split.', 'error');
              return;
            }
            commit({ ...project, timeline: { ...project.timeline, clips: next } });
          }}
          onDeleteRange={() => {
            const t = currentTimeUs;
            const next = rippleDeleteRange(project.timeline.clips, t - 1_000_000, t);
            commit({ ...project, timeline: { ...project.timeline, clips: next } });
          }}
        />
        <TimelineStrip
          project={project}
          durationUs={timeMap.durationUs}
          zoomTrack={zoomTrack}
          currentTimeUs={currentTimeUs}
          onSeek={setTime}
        />
        <ShortcutBar onUndo={undo} onRedo={redo} />
      </div>

      {/* Right panel */}
      <aside className="w-80 shrink-0 overflow-auto border-l border-hairline p-4">
        <div className="mb-3 flex gap-1">
          <PanelTab label="Zoom" active={panel === 'zoom'} onClick={() => setPanel('zoom')} />
          <PanelTab label="Style" active={panel === 'style'} onClick={() => setPanel('style')} />
          <PanelTab label="Captions" active={panel === 'captions'} onClick={() => setPanel('captions')} />
        </div>

        {panel === 'zoom' && (
          <ZoomPanel
            project={project}
            cursorSamples={cursorSamples}
            cursorClicks={cursorClicks}
            commit={commit}
          />
        )}
        {panel === 'style' && <StylePanel project={project} commit={commit} />}
        {panel === 'captions' && <CaptionsPanel project={project} captions={captions} commit={commit} onLoaded={setCaptions} />}

        <div className="mt-6 border-t border-hairline pt-4">
          <Button variant="primary" className="w-full" onClick={() => navigate('export')}>
            <span className="inline-flex items-center gap-2">
              <IconDownload size={14} /> Export…
            </span>
          </Button>
        </div>
      </aside>
    </div>
  );
}

function encodePath(p: string): string {
  return p.split(/[\\/]/).map(encodeURIComponent).join('/');
}

// ---------------------------------------------------------------------------

function PanelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-sm font-semibold"
      style={{
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  );
}

function PreviewCanvas({
  project,
  currentTimeUs,
  zoomTrack,
  captions,
  cursorSamples,
  videoRefs,
  mediaUrls,
  mediaVersion,
}: {
  project: RecastProject;
  currentTimeUs: number;
  zoomTrack: FollowStep[];
  captions: CaptionLine[];
  cursorSamples: Array<{ tUs: number; x: number; y: number; type?: string }>;
  videoRefs: React.MutableRefObject<Map<string, HTMLVideoElement>>;
  mediaUrls: Map<string, string>;
  mediaVersion: number;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Create hidden video elements once per segment set.
  useEffect(() => {
    for (const [segId, url] of mediaUrls) {
      if (videoRefs.current.has(segId)) continue;
      const v = document.createElement('video');
      v.src = url;
      v.muted = true;
      v.preload = 'auto';
      videoRefs.current.set(segId, v);
    }
  }, [mediaUrls, videoRefs, mediaVersion]);

  // Render on every time/style change through the shared compositor.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const hit = timelineToSource(buildTimeMap(project.timeline.clips), currentTimeUs);
    const pose =
      zoomTrack.length > 0 ? interpZoom(zoomTrack, currentTimeUs) : { scale: 1, cx: project.media.width / 2, cy: project.media.height / 2 };
    const comp = computeComposition(project, currentTimeUs, canvas.width, canvas.height, {
      pose,
      cursorEvents: cursorSamples.map((s) => ({ tUs: s.tUs, x: s.x, y: s.y, type: s.type ?? 'move' })),
      getCaptionsAt: (t) => cuesAt(captions, t),
      showSafeGuides: false,
    });
    const activeVideo = hit ? videoRefs.current.get(hit.clip.segmentId) ?? null : null;
    drawComposition(ctx, comp, project, {
      getFrame: () => activeVideo,
      scratch: document.createElement('canvas'),
    });
  }, [project, currentTimeUs, zoomTrack, captions, cursorSamples, videoRefs, mediaVersion]);

  // Keep the canvas sized to its container (device pixel ratio aware).
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.max(2, Math.round(rect.width));
      canvas.height = Math.max(2, Math.round(rect.height));
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1" style={{ background: 'var(--bg-sunken)' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Preview" />
      {project.zoom.enabled && zoomTrack.length > 0 ? (
        <div className="absolute right-3 top-3">
          <Badge tone="accent">zoom {interpZoom(zoomTrack, currentTimeUs).scale.toFixed(2)}×</Badge>
        </div>
      ) : null}
    </div>
  );
}

function interpZoom(track: FollowStep[], tUs: number): { scale: number; cx: number; cy: number } {
  if (track.length === 0) return { scale: 1, cx: 0, cy: 0 };
  let lo = 0;
  let hi = track.length - 1;
  if (tUs <= track[0]!.tUs) return track[0]!.pose;
  if (tUs >= track[hi]!.tUs) return track[hi]!.pose;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid]!.tUs <= tUs) lo = mid;
    else hi = mid;
  }
  const a = track[lo]!;
  const b = track[hi]!;
  const f = (tUs - a.tUs) / Math.max(1, b.tUs - a.tUs);
  return {
    scale: a.pose.scale + (b.pose.scale - a.pose.scale) * f,
    cx: a.pose.cx + (b.pose.cx - a.pose.cx) * f,
    cy: a.pose.cy + (b.pose.cy - a.pose.cy) * f,
  };
}

function Transport({
  timeMapDuration,
  onSplit,
  onDeleteRange,
}: {
  timeMapDuration: number;
  onSplit: () => void;
  onDeleteRange: () => void;
}): React.ReactElement {
  const playing = useEditor((s) => s.playing);
  const setPlaying = useEditor((s) => s.setPlaying);
  const currentTimeUs = useEditor((s) => s.currentTimeUs);
  const jklState = useRef<'f' | 'r' | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const dur = useEditor.getState().project?.timeline.durationUs ?? 0;
      const t = useEditor.getState().currentTimeUs;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          useEditor.getState().setPlaying(!useEditor.getState().playing);
          break;
        case 'KeyJ':
          jklState.current = 'r';
          break;
        case 'KeyK':
          jklState.current = null;
          useEditor.getState().setPlaying(false);
          break;
        case 'KeyL':
          jklState.current = 'f';
          break;
        case 'ArrowLeft':
          useEditor.getState().setTime(Math.max(0, t - (e.shiftKey ? 1_000_000 : 66_667)));
          break;
        case 'ArrowRight':
          useEditor.getState().setTime(Math.min(dur, t + (e.shiftKey ? 1_000_000 : 66_667)));
          break;
        case 'Home':
          useEditor.getState().setTime(0);
          break;
        case 'End':
          useEditor.getState().setTime(dur);
          break;
        case 'KeyS':
          onSplit();
          break;
        case 'Delete':
        case 'Backspace':
          onDeleteRange();
          break;
        case 'KeyZ':
          if ((e.metaKey || e.ctrlKey) && !e.shiftKey) useEditor.getState().undo();
          if ((e.metaKey || e.ctrlKey) && e.shiftKey) useEditor.getState().redo();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSplit, onDeleteRange]);

  // JKL shuttling.
  useEffect(() => {
    let raf: number | null = null;
    const tick = (): void => {
      const dir = jklState.current;
      if (dir) {
        const dt = (dir === 'f' ? 1 : -1) * 333_334;
        const dur = useEditor.getState().project?.timeline.durationUs ?? 0;
        const t = Math.min(dur, Math.max(0, useEditor.getState().currentTimeUs + dt));
        useEditor.getState().setTime(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="flex items-center gap-3 border-t border-hairline px-4 py-2">
      <IconButton label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
        {playing ? <IconPause /> : <IconPlay />}
      </IconButton>
      <IconButton label="Split at playhead (S)" onClick={onSplit}>
        <IconScissors />
      </IconButton>
      <IconButton label="Delete 1s around playhead (Del)" onClick={onDeleteRange} danger>
        <IconTrash />
      </IconButton>
      <span className="tabular text-sm" style={{ color: 'var(--text-secondary)' }}>
        {formatClock(currentTimeUs)} / {formatClock(timeMapDuration)}
      </span>
      <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
        <kbd>Space</kbd> play · <kbd>J</kbd>/<kbd>K</kbd>/<kbd>L</kbd> shuttle · <kbd>S</kbd> split · <kbd>⌘Z</kbd> undo
      </span>
    </div>
  );
}

function TimelineStrip({
  project,
  durationUs,
  zoomTrack,
  currentTimeUs,
  onSeek,
}: {
  project: RecastProject;
  durationUs: number;
  zoomTrack: FollowStep[];
  currentTimeUs: number;
  onSeek: (t: number) => void;
}): React.ReactElement {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const posToTime = (clientX: number): number => {
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(f * durationUs);
  };

  return (
    <div className="border-t border-hairline px-4 py-3">
      <div
        ref={stripRef}
        className="relative h-24 cursor-pointer rounded-lg border border-hairline"
        style={{ background: 'var(--surface)' }}
        onPointerDown={(e) => {
          setDragging(true);
          onSeek(posToTime(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging) onSeek(posToTime(e.clientX));
        }}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
        role="slider"
        aria-label="Timeline"
        aria-valuenow={Math.round(currentTimeUs / 1000)}
        tabIndex={0}
      >
        {/* Zoom keyframe markers */}
        {zoomTrack.length > 0 && project.zoom.enabled
          ? project.zoom.autoKeyframes.map((kf) => (
              <div
                key={kf.id}
                className="absolute top-1 h-3 w-1 rounded-sm"
                style={{ left: `${(kf.tUs / Math.max(1, durationUs)) * 100}%`, background: 'var(--accent)' }}
                title={`Zoom ${kf.zoom.toFixed(2)}× at ${formatClock(kf.tUs)}`}
              />
            ))
          : null}
        {/* Clips */}
        {project.timeline.clips.map((clip) => (
          <div
            key={clip.id}
            className="absolute bottom-0 h-16 rounded-md border"
            style={{
              left: `${(clip.timelineInUs / Math.max(1, durationUs)) * 100}%`,
              width: `${((clip.sourceOutUs - clip.sourceInUs) / clip.speed / Math.max(1, durationUs)) * 100}%`,
              background: 'var(--surface-raised)',
              borderColor: 'var(--hairline-strong)',
            }}
          >
            <span className="px-1 text-[10px] leading-4" style={{ color: 'var(--text-muted)' }}>
              {clip.segmentId}
            </span>
          </div>
        ))}
        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5"
          style={{ left: `${(currentTimeUs / Math.max(1, durationUs)) * 100}%`, background: 'var(--accent)' }}
        />
      </div>
    </div>
  );
}

function ShortcutBar({ onUndo, onRedo }: { onUndo: () => void; onRedo: () => void }): React.ReactElement {
  return (
    <div className="flex gap-1 border-t border-hairline px-4 py-1.5">
      <IconButton label="Undo (⌘Z)" onClick={onUndo}>
        <IconStop />
      </IconButton>
      <IconButton label="Redo (⇧⌘Z)" onClick={onRedo}>
        <IconPlay />
      </IconButton>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ZoomPanel({
  project,
  cursorSamples,
  cursorClicks,
  commit,
}: {
  project: RecastProject;
  cursorSamples: CursorSample[];
  cursorClicks: Array<{ tUs: number; x: number; y: number }>;
  commit: (p: RecastProject) => void;
}): React.ReactElement {
  const recalcAuto = (): void => {
    if (cursorSamples.length < 20) return;
    const kfs = computeAutoZoom(cursorSamples, cursorClicks, project.media.width || 1920, project.media.height || 1080, project.zoom.intensity);
    commit({ ...project, zoom: { ...project.zoom, mode: 'auto', autoKeyframes: kfs } });
  };

  return (
    <div className="space-y-4">
      <Field label="Mode">
        <Select
          value={project.zoom.mode}
          onValueChange={(v) => commit({ ...project, zoom: { ...project.zoom, mode: v as 'auto' | 'manual' | 'follow' } })}
          options={[
            { value: 'auto', label: 'Auto zoom (from cursor)' },
            { value: 'manual', label: 'Manual keyframes' },
            { value: 'follow', label: 'Follow cursor' },
          ]}
          ariaLabel="Zoom mode"
        />
      </Field>
      <Field label="Intensity">
        <Select
          value={project.zoom.intensity}
          onValueChange={(v) => commit({ ...project, zoom: { ...project.zoom, intensity: v as 'subtle' | 'balanced' | 'punchy' } })}
          options={[
            { value: 'subtle', label: 'Subtle — 1.25×' },
            { value: 'balanced', label: 'Balanced — 1.6×' },
            { value: 'punchy', label: 'Punchy — 2.0×' },
          ]}
          ariaLabel="Zoom intensity"
        />
      </Field>
      <Field label="Enabled">
        <Switch checked={project.zoom.enabled} onCheckedChange={(v) => commit({ ...project, zoom: { ...project.zoom, enabled: v } })} ariaLabel="Zoom enabled" />
      </Field>
      <Button onClick={recalcAuto} disabled={cursorSamples.length < 20}>
        <span className="inline-flex items-center gap-2">
          <IconSparkle size={14} /> Recompute auto zoom
        </span>
      </Button>
      <Button
        onClick={() =>
          commit({
            ...project,
            zoom: {
              ...project.zoom,
              mode: 'manual',
              manualKeyframes: [
                ...project.zoom.manualKeyframes,
                {
                  id: `kf-${Date.now()}`,
                  tUs: 0,
                  zoom: 1.6,
                  cx: (project.media.width || 1920) / 2,
                  cy: (project.media.height || 1080) / 2,
                  ease: 'out',
                },
              ],
            },
          })
        }
      >
        <span className="inline-flex items-center gap-2">
          <IconZoom size={14} /> Add manual keyframe
        </span>
      </Button>
      {project.zoom.mode === 'manual'
        ? project.zoom.manualKeyframes.map((kf) => (
            <div key={kf.id} className="rounded-lg border border-hairline p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="tabular">{formatClock(kf.tUs)} · {kf.zoom.toFixed(2)}×</span>
                <IconButton
                  label="Remove keyframe"
                  danger
                  onClick={() =>
                    commit({ ...project, zoom: { ...project.zoom, manualKeyframes: project.zoom.manualKeyframes.filter((k) => k.id !== kf.id) } })
                  }
                >
                  <IconX size={12} />
                </IconButton>
              </div>
              <div className="mt-2">
                <span style={{ color: 'var(--text-muted)' }}>Zoom</span>
                <Slider value={kf.zoom} min={1} max={4} step={0.05} ariaLabel="Keyframe zoom" onValueChange={(v) =>
                  commit({
                    ...project,
                    zoom: {
                      ...project.zoom,
                      manualKeyframes: project.zoom.manualKeyframes.map((k) => (k.id === kf.id ? { ...k, zoom: v } : k)),
                    },
                  })
                } />
              </div>
            </div>
          ))
        : null}
    </div>
  );
}

function StylePanel({ project, commit }: { project: RecastProject; commit: (p: RecastProject) => void }): React.ReactElement {
  const showToast = useApp((s) => s.showToast);
  const style = project.style;
  return (
    <div className="space-y-4">
      <Field label="Preset">
        <Select
          value={BUILTIN_PRESETS.some((p) => p.id === style.id) ? style.id : 'custom'}
          onValueChange={(v) => {
            const preset = BUILTIN_PRESETS.find((p) => p.id === v);
            if (preset) commit({ ...project, style: { ...preset } });
          }}
          options={[
            ...BUILTIN_PRESETS.map((p) => ({ value: p.id, label: p.name })),
            { value: 'custom', label: 'Custom', disabled: true },
          ]}
          ariaLabel="Style preset"
        />
      </Field>
      <Field label="Aspect ratio">
        <Select
          value={style.aspect}
          onValueChange={(v) => commit({ ...project, style: { ...style, aspect: v } })}
          options={[
            { value: 'source', label: 'Source' },
            { value: '16:9', label: '16:9' },
            { value: '9:16', label: '9:16 vertical' },
            { value: '1:1', label: '1:1 square' },
            { value: '4:5', label: '4:5 portrait' },
            { value: '21:9', label: '21:9 wide' },
          ]}
          ariaLabel="Aspect ratio"
        />
      </Field>
      <Field label={`Padding — ${style.frame.paddingPx}`}>
        <Slider value={style.frame.paddingPx} min={0} max={120} ariaLabel="Padding" onValueChange={(v) => commit({ ...project, style: { ...style, frame: { ...style.frame, paddingPx: v } } })} />
      </Field>
      <Field label={`Corner radius — ${style.frame.radiusPx}`}>
        <Slider value={style.frame.radiusPx} min={0} max={64} ariaLabel="Radius" onValueChange={(v) => commit({ ...project, style: { ...style, frame: { ...style.frame, radiusPx: v } } })} />
      </Field>
      <Field label="Shadow">
        <Select
          value={style.frame.shadow}
          onValueChange={(v) => commit({ ...project, style: { ...style, frame: { ...style.frame, shadow: v as 'none' | 'soft' | 'medium' | 'large' } } })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'soft', label: 'Soft' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
          ariaLabel="Shadow"
        />
      </Field>
      <Field label="Background">
        <Select
          value={style.frame.background.type}
          onValueChange={(v) =>
            commit({
              ...project,
              style: {
                ...style,
                frame: {
                  ...style.frame,
                  background:
                    v === 'gradient'
                      ? { type: 'gradient', gradient: { from: '#1B2030', to: '#0E1015', angleDeg: 160 } }
                      : v === 'solid'
                        ? { type: 'solid', color: '#101418' }
                        : v === 'echo'
                          ? { type: 'echo', echo: { blurPx: 48, dim: 0.35, scale: 1.1 } }
                          : v === 'mesh'
                            ? { type: 'mesh' }
                            : { type: 'transparent' },
                },
              },
            })
          }
          options={[
            { value: 'transparent', label: 'Transparent' },
            { value: 'solid', label: 'Solid color' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'mesh', label: 'Mesh gradient' },
            { value: 'echo', label: 'Blurred echo' },
          ]}
          ariaLabel="Background"
        />
      </Field>
      <Field label="Cursor look">
        <Select
          value={style.cursor.look}
          onValueChange={(v) => commit({ ...project, style: { ...style, cursor: { ...style.cursor, look: v as 'native' | 'dot' | 'pointer' | 'circle' } } })}
          options={[
            { value: 'native', label: 'Native (as captured)' },
            { value: 'pointer', label: 'Rendered pointer' },
            { value: 'dot', label: 'Dot' },
            { value: 'circle', label: 'Circle' },
          ]}
          ariaLabel="Cursor look"
        />
      </Field>
      <Field label="Click ripple">
        <Switch checked={style.cursor.ripple} onCheckedChange={(v) => commit({ ...project, style: { ...style, cursor: { ...style.cursor, ripple: v } } })} ariaLabel="Click ripple" />
      </Field>
      <div className="flex gap-2 pt-2">
        <Button
          onClick={async () => {
            const { preset, error } = await bridge().invoke('styles:import', undefined);
            if (preset) {
              commit({ ...project, style: preset }); // one undo step
              showToast(`Imported preset “${preset.name}”.`, 'success');
            } else if (error) {
              showToast(error, 'error');
            }
          }}
        >
          <span className="inline-flex items-center gap-2">
            <IconUpload size={14} /> Import .recaststyle
          </span>
        </Button>
        <Button
          onClick={async () => {
            const { path } = await bridge().invoke('styles:export', { preset: style });
            if (path) showToast(`Saved to ${path}`, 'success');
          }}
        >
          <span className="inline-flex items-center gap-2">
            <IconDownload size={14} /> Export
          </span>
        </Button>
      </div>
    </div>
  );
}

function CaptionsPanel({
  project,
  captions,
  commit,
  onLoaded,
}: {
  project: RecastProject;
  captions: CaptionLine[];
  commit: (p: RecastProject) => void;
  onLoaded: (c: CaptionLine[]) => void;
}): React.ReactElement {
  const showToast = useApp((s) => s.showToast);
  const ffmpeg = useApp((s) => s.ffmpeg);
  const [models, setModels] = useState<Array<{ id: string; label: string; downloaded: boolean; language: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void bridge().invoke('captions:models', undefined).then(setModels).catch(() => setModels([]));
  }, []);

  return (
    <div className="space-y-4">
      {!ffmpeg?.available ? (
        <div className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
          Captions need FFmpeg (audio extraction) and a whisper.cpp binary. Install FFmpeg below in Settings → Media engine.
        </div>
      ) : null}
      <Field label="Whisper model">
        <Select
          value=""
          onValueChange={async (id) => {
            if (!id) return;
            const m = models.find((x) => x.id === id);
            if (m && !m.downloaded) {
              setBusy(true);
              showToast('Downloading model…', 'info');
              const off = bridge().on('whisper:download', ({ pct, done, error }) => {
                if (error) showToast(`Model download failed: ${error}`, 'error');
                if (done) {
                  showToast('Model ready.', 'success');
                  off();
                  void bridge().invoke('captions:models', undefined).then(setModels);
                } else {
                  showToast(`Downloading model… ${pct}%`, 'info');
                }
              });
              await bridge().invoke('captions:downloadModel', { id });
              setBusy(false);
              return;
            }
            setBusy(true);
            const r = await bridge().invoke('captions:transcribe', { projectId: project.id, modelId: id, language: 'auto' });
            setBusy(false);
            if (r.ok) {
              showToast('Captions generated.', 'success');
              const updated = await bridge().invoke('library:open', { id: project.id });
              if (updated) {
                commit(updated);
                if (updated.captions) {
                  const raw = await bridge().invoke('capture:readCaptions', { path: updated.captions.file } as never);
                  onLoaded(parseSrt(raw as string).map((c) => ({ text: c.text.replace(/\n/g, ' '), startUs: c.startUs, endUs: c.endUs })));
                }
              }
            } else {
              showToast(r.error ?? 'Transcription failed.', 'error');
            }
          }}
          options={[
            { value: '', label: models.length ? 'Choose model…' : 'No models available', disabled: true },
            ...models.map((m) => ({ value: m.id, label: `${m.label}${m.downloaded ? '' : ' (download)'}` })),
          ]}
          ariaLabel="Whisper model"
        />
      </Field>
      <Button
        disabled={!project.captions}
        onClick={async () => {
          const r = await bridge().invoke('captions:import', { projectId: project.id });
          showToast(r.ok ? 'Subtitles imported.' : (r.error ?? 'Import cancelled.'), r.ok ? 'success' : 'info');
        }}
      >
        Import .srt / .vtt
      </Button>
      <Button
        disabled={!project.captions}
        onClick={async () => {
          const r = await bridge().invoke('captions:exportFile', { projectId: project.id, kind: 'srt' });
          if (r.path) showToast(`Saved ${r.path}`, 'success');
        }}
      >
        Export .srt
      </Button>
      <div>
        <div className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {captions.length} cue{captions.length === 1 ? '' : 's'} loaded
        </div>
        <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-hairline p-2 text-xs">
          {captions.slice(0, 12).map((c, i) => (
            <div key={i} className="tabular" style={{ color: 'var(--text-muted)' }}>
              {formatClock(c.startUs)} — {c.text.slice(0, 48)}
            </div>
          ))}
          {captions.length === 0 ? <span style={{ color: 'var(--text-muted)' }}>No captions yet.</span> : null}
        </div>
      </div>
      {busy ? <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Working…</div> : null}
    </div>
  );
}
