import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useEditor } from '../state/stores';
import { bridge } from '../lib/bridge';
import { Button, IconButton, Field, Select, Badge, IconPlay, IconPause, IconScissors, IconTrash, IconDownload, IconUndo, IconRedo } from '@recast/ui';
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
  cuesAt,
  parseSrt,
  type CursorSample,
  type CaptionLine,
  type FollowStep,
} from '@recast/editor';
import type { RecastProject } from '@recast/shared';
import { TimelineStrip, relayoutProject } from './TimelineStrip';
import { MotionPanel } from './MotionPanel';
import { AudioPanel } from './AudioPanel';
import { StylePanel } from './StylePanel';

/**
 * The editor: compositor-driven preview (identical render path to export),
 * keyboard-first transport, the Motion panel (camera, transitions, fades,
 * cursor FX), the style panel, captions, and the export dialog.
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
  const [panel, setPanel] = useState<'motion' | 'style' | 'audio' | 'captions'>('motion');

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
            const selId = useEditor.getState().selectedClipId;
            if (selId) {
              // Delete the selected clip and ripple the rest left.
              commit(relayoutProject(project, project.timeline.clips.filter((c) => c.id !== selId)));
              useEditor.getState().setSelectedClip(null);
            } else {
              const next = rippleDeleteRange(project.timeline.clips, currentTimeUs - 1_000_000, currentTimeUs);
              commit(relayoutProject(project, next));
            }
          }}
        />
        <TimelineStrip
          project={project}
          durationUs={timeMap.durationUs}
          currentTimeUs={currentTimeUs}
          onSeek={setTime}
        />
        <ShortcutBar onUndo={undo} onRedo={redo} />
      </div>

      {/* Right panel */}
      <aside className="w-80 shrink-0 overflow-auto border-l border-hairline p-4">
        <div className="mb-3 flex gap-1">
          <PanelTab label="Motion" active={panel === 'motion'} onClick={() => setPanel('motion')} />
          <PanelTab label="Style" active={panel === 'style'} onClick={() => setPanel('style')} />
          <PanelTab label="Audio" active={panel === 'audio'} onClick={() => setPanel('audio')} />
          <PanelTab label="CC" active={panel === 'captions'} onClick={() => setPanel('captions')} />
        </div>

        <div key={panel} className="panel-in">
          {panel === 'motion' && (
            <MotionPanel
              project={project}
              zoomTrack={zoomTrack}
              currentTimeUs={currentTimeUs}
              cursorSamples={cursorSamples}
              cursorClicks={cursorClicks}
              commit={commit}
            />
          )}
          {panel === 'style' && <StylePanel project={project} commit={commit} />}
          {panel === 'audio' && <AudioPanel project={project} commit={commit} />}
          {panel === 'captions' && <CaptionsPanel project={project} captions={captions} commit={commit} onLoaded={setCaptions} />}
        </div>

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
      className="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
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
      v.crossOrigin = 'anonymous'; // untainted canvas draws for preview compositing
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
    const map = buildTimeMap(project.timeline.clips);
    const hit = timelineToSource(map, currentTimeUs);
    const pose =
      zoomTrack.length > 0 ? interpZoom(zoomTrack, currentTimeUs) : { scale: 1, cx: project.media.width / 2, cy: project.media.height / 2 };
    // Intro transition of the active clip (preview must match export exactly).
    let clipIn: { type: RecastProject['timeline']['clips'][number]['transitionIn']; progress: number } | null = null;
    if (hit && hit.clip.transitionIn !== 'none') {
      const entry = map.clips.find((e) => e.clip.id === hit.clip.id);
      const localUs = Math.max(0, currentTimeUs - (entry?.tIn ?? 0));
      clipIn = { type: hit.clip.transitionIn, progress: Math.min(1, localUs / Math.max(1, hit.clip.transitionMs * 1_000)) };
    }
    const comp = computeComposition(project, currentTimeUs, canvas.width, canvas.height, {
      pose,
      cursorEvents: cursorSamples.map((s) => ({ tUs: s.tUs, x: s.x, y: s.y, type: s.type ?? 'move' })),
      getCaptionsAt: (t) => cuesAt(captions, t),
      showSafeGuides: false,
      clipIn,
      totalDurationUs: map.durationUs,
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


function ShortcutBar({ onUndo, onRedo }: { onUndo: () => void; onRedo: () => void }): React.ReactElement {
  return (
    <div className="flex gap-1 border-t border-hairline px-4 py-1.5">
      <IconButton label="Undo (⌘Z)" onClick={onUndo}>
        <IconUndo />
      </IconButton>
      <IconButton label="Redo (⇧⌘Z)" onClick={onRedo}>
        <IconRedo />
      </IconButton>
    </div>
  );
}

// ---------------------------------------------------------------------------

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
