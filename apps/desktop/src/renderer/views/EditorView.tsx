import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useEditor } from '../state/stores';
import { bridge } from '../lib/bridge';
import { Button, IconButton, Field, Select, Badge, Switch, ColorPicker, Slider, IconPlay, IconPause, IconScissors, IconTrash, IconDownload, IconUndo, IconRedo } from '@recast/ui';
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
  FrameSync,
  type CursorSample,
  type CaptionLine,
  type FollowStep,
} from '@recast/editor';
import { segmentLocalTimeUs, type RecastProject } from '@recast/shared';
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
  const [keystrokes, setKeystrokes] = useState<Array<{ tUs: number; key: string }>>([]);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [panel, setPanel] = useState<'motion' | 'style' | 'facecam' | 'audio' | 'captions'>('motion');

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
            const d = data as {
              samples: CursorSample[];
              clicks: typeof cursorClicks;
              keys?: Array<{ tUs: number; key: string }>;
            };
            setCursorSamples(d.samples);
            setCursorClicks(d.clicks);
            if (d.keys) setKeystrokes(d.keys);
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

  // Media element URLs via the recast-media protocol. The face-cam segment
  // (when the take recorded one) joins the map under a reserved id.
  const mediaUrls = useMemo(() => {
    if (!project) return new Map<string, string>();
    const m = new Map<string, string>();
    for (const seg of project.media.segments) {
      const p = `${project.media.dir}/${seg.file}`;
      m.set(seg.id, `recast-media://local/${encodePath(p)}`);
    }
    if (project.media.camera) {
      const camPath = `${project.media.dir}/${project.media.camera.file}`;
      m.set(CAMERA_ELEMENT_ID, `recast-media://local/${encodePath(camPath)}`);
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
          playing={playing}
          zoomTrack={zoomTrack}
          captions={captions}
          cursorSamples={cursorSamples}
          keystrokes={keystrokes}
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
          <PanelTab label="Cam" active={panel === 'facecam'} onClick={() => setPanel('facecam')} />
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
          {panel === 'facecam' && <FacecamPanel project={project} commit={commit} />}
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

/** Reserved element id for the face-cam decode video. */
export const CAMERA_ELEMENT_ID = '__camera__';

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
  playing,
  zoomTrack,
  captions,
  cursorSamples,
  keystrokes,
  videoRefs,
  mediaUrls,
  mediaVersion,
}: {
  project: RecastProject;
  currentTimeUs: number;
  playing: boolean;
  zoomTrack: FollowStep[];
  captions: CaptionLine[];
  cursorSamples: Array<{ tUs: number; x: number; y: number; type?: string }>;
  keystrokes?: Array<{ tUs: number; key: string }>;
  videoRefs: React.MutableRefObject<Map<string, HTMLVideoElement>>;
  mediaUrls: Map<string, string>;
  mediaVersion: number;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoHostRef = useRef<HTMLDivElement | null>(null);
  const [, setFrameTick] = useState(0);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  // FrameSync owns the hidden videos: it seeks them when scrubbing, plays
  // them at clip speed when playing, and serves a last-good-frame snapshot
  // while a seek/decode is in flight — the fix for the intermittent black
  // preview (compositor used to black-fill whenever no frame was paintable).
  const frameSyncRef = useRef<FrameSync | null>(null);
  if (!frameSyncRef.current) {
    frameSyncRef.current = new FrameSync({
      onFrame: () => setFrameTick((v) => v + 1),
    });
  }
  useEffect(() => () => frameSyncRef.current?.destroy(), []);

  // Create hidden video elements once per segment set, attached to the DOM so
  // Chromium's render tree and requestVideoFrameCallback stay actively ticking.
  useEffect(() => {
    const host = videoHostRef.current;
    for (const [segId, url] of mediaUrls) {
      if (videoRefs.current.has(segId)) continue;
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; // untainted canvas draws for preview compositing
      v.src = url;
      v.muted = true;
      v.preload = 'auto';
      v.playbackRate = 1;
      if (host) host.appendChild(v);
      videoRefs.current.set(segId, v);
    }
    frameSyncRef.current?.setVideos(videoRefs.current);
    setFrameTick((v) => v + 1); // videos may already be buffered — redraw once bound
  }, [mediaUrls, videoRefs, mediaVersion]);

  // Background image (style.frame.background.type === 'image') — loaded once
  // through recast-media and served to the compositor on every draw pass.
  const bg = project.style.frame.background;
  useEffect(() => {
    if (bg.type !== 'image' || !bg.imageFile) {
      setBgImage(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setBgImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setBgImage(null);
    };
    img.src = `recast-media://local/${encodePath(bg.imageFile)}`;
    return () => {
      cancelled = true;
    };
  }, [bg.type, bg.imageFile]);

  // Render on every time/style change through the shared compositor.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const frameSync = frameSyncRef.current;
    if (!frameSync) return;
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
      keystrokeEvents: keystrokes,
    });

    // Drive the decode videos to the exact frame the playhead wants. Screen
    // segment files are written with `firstTimestampBehavior: 'offset'`, so
    // element time is SEGMENT-LOCAL — capture-clock times must map through
    // segmentLocalTimeUs() or every segment after the first seeks past its
    // end (the "black every ~2 s" report).
    let screenLocalUs = 0;
    if (hit) {
      const seg = project.media.segments.find((s) => s.id === hit.clip.segmentId);
      screenLocalUs = segmentLocalTimeUs(hit.sourceUs, seg?.startUs ?? 0);
      if (playing) {
        frameSync.play(hit.clip.segmentId, screenLocalUs, hit.clip.speed);
      } else {
        frameSync.pauseAll();
        frameSync.seekTo(hit.clip.segmentId, screenLocalUs);
      }
    } else {
      frameSync.pauseAll();
    }

    // Face-cam decode runs alongside the screen video (same capture clock;
    // the single cam file starts at 0, so this mapping is identity-safe).
    const camSeg = project.media.camera;
    if (hit && camSeg) {
      const camDur = Math.max(0, camSeg.endUs - camSeg.startUs);
      const camUs = Math.min(segmentLocalTimeUs(hit.sourceUs, camSeg.startUs), camDur);
      if (playing) {
        frameSync.play(CAMERA_ELEMENT_ID, camUs, 1, 'keep');
      } else {
        frameSync.seekTo(CAMERA_ELEMENT_ID, camUs);
      }
    }

    drawComposition(ctx, comp, project, {
      // The compositor passes ('__active__' | '__echo__', 0) — resolve both
      // to the active clip's segment at its real (segment-local) time.
      getFrame: (segmentId) => {
        if (!hit) return null;
        const segId = segmentId === '__echo__' || segmentId === '__active__' ? hit.clip.segmentId : segmentId;
        return frameSync.getFrame(segId, screenLocalUs);
      },
      scratch: document.createElement('canvas'),
      getBackgroundImage: () => bgImage,
      getCameraFrame: () => {
        if (!hit || !project.media.camera) return null;
        const camSeg = project.media.camera;
        const camDur = Math.max(0, camSeg.endUs - camSeg.startUs);
        const camUs = Math.min(segmentLocalTimeUs(hit.sourceUs, camSeg.startUs), camDur);
        return frameSync.getFrame(CAMERA_ELEMENT_ID, camUs);
      },
    });
  }, [project, currentTimeUs, playing, zoomTrack, captions, cursorSamples, videoRefs, mediaVersion, bgImage]);

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
      {/* Hidden DOM attachment host for video decoders to ensure Chromium's rVFC never suspends */}
      <div ref={videoHostRef} style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} aria-hidden="true" />
      {/* Loading shimmer: only while no frame has ever decoded — real content
          replaces it the moment the first frame presents. */}
      {!frameSyncRef.current?.hasAnyFrame ? (
        <div className="preview-loading" aria-hidden="true">
          <div className="preview-loading-dot" />
          <span>Rendering preview…</span>
        </div>
      ) : null}
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

function FacecamPanel({
  project,
  commit,
}: {
  project: RecastProject;
  commit: (p: RecastProject) => void;
}): React.ReactElement {
  const cam = project.media.camera;
  const fc = project.style.facecam;
  const setFacecam = (patch: Partial<RecastProject['style']['facecam']>): void =>
    commit({ ...project, style: { ...project.style, facecam: { ...fc, ...patch } } });

  if (!cam) {
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Picture-in-picture face cam.
        </p>
        <div className="rounded-lg border border-hairline p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          This recording was captured without a camera. Enable <strong>Face camera</strong> in the recorder and the
          take will include a camera track you can place and style here — the screen recording itself is never blocked
          by a camera problem.
        </div>
      </div>
    );
  }

  const positions: Array<{ id: 'tl' | 'tr' | 'bl' | 'br'; label: string }> = [
    { id: 'tl', label: 'Top left' },
    { id: 'tr', label: 'Top right' },
    { id: 'bl', label: 'Bottom left' },
    { id: 'br', label: 'Bottom right' },
  ];

  return (
    <div className="space-y-4">
      <Field label="Face cam">
        <Switch checked={fc.enabled} onCheckedChange={(v) => setFacecam({ enabled: v })} ariaLabel="Enable face cam" />
      </Field>
      {!fc.enabled ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Camera track available ({cam.width}×{cam.height}). Turn it on to place it on the canvas.
        </p>
      ) : null}
      {fc.enabled ? (
        <>
          <Field label="Position">
            <div className="grid grid-cols-2 gap-2">
              {positions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-label={p.label}
                  aria-pressed={fc.position === p.id}
                  onClick={() => setFacecam({ position: p.id })}
                  className="rounded-lg border px-3 py-2 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: fc.position === p.id ? 'var(--accent)' : 'var(--hairline-strong)',
                    background: fc.position === p.id ? 'var(--accent-subtle)' : 'transparent',
                    color: fc.position === p.id ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Size — ${Math.round(fc.widthFraction * 100)}%`}>
            <Slider
              value={fc.widthFraction}
              min={0.08}
              max={0.45}
              step={0.01}
              ariaLabel="Face cam width"
              onValueChange={(v) => setFacecam({ widthFraction: v })}
            />
          </Field>
          <Field label="Round face cam">
            <Switch checked={fc.round} onCheckedChange={(v) => setFacecam({ round: v })} ariaLabel="Round face cam" />
          </Field>
          <Field label="Mirror">
            <Switch checked={fc.mirror} onCheckedChange={(v) => setFacecam({ mirror: v })} ariaLabel="Mirror webcam" />
          </Field>
          <Field label="Drop shadow">
            <Switch checked={fc.shadow} onCheckedChange={(v) => setFacecam({ shadow: v })} ariaLabel="Face cam shadow" />
          </Field>
          <Field label={`Margin — ${Math.round(fc.marginFraction * 100)}%`}>
            <Slider
              value={fc.marginFraction}
              min={0.01}
              max={0.2}
              step={0.01}
              ariaLabel="Face cam margin"
              onValueChange={(v) => setFacecam({ marginFraction: v })}
            />
          </Field>
          <Field label={`Border — ${fc.borderWidthPx} px`}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Slider
                  value={fc.borderWidthPx}
                  min={0}
                  max={12}
                  step={1}
                  ariaLabel="Face cam border width"
                  onValueChange={(v) => setFacecam({ borderWidthPx: v })}
                />
              </div>
              <ColorPicker value={fc.borderColor} onChange={(borderColor) => setFacecam({ borderColor })} ariaLabel="Face cam border color" />
            </div>
          </Field>
          <Field label={`Opacity — ${Math.round(fc.opacity * 100)}%`}>
            <Slider
              value={fc.opacity}
              min={0.3}
              max={1}
              step={0.05}
              ariaLabel="Face cam opacity"
              onValueChange={(v) => setFacecam({ opacity: v })}
            />
          </Field>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Cam timing follows the capture clock. Takes that use pause may drift slightly in the cam overlay.
          </p>
        </>
      ) : null}
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
