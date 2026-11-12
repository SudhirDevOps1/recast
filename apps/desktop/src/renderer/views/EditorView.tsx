import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useEditor } from '../state/stores';
import { bridge } from '../lib/bridge';
import {
  Button,
  IconButton,
  Field,
  Select,
  Badge,
  Switch,
  ColorPicker,
  Slider,
  IconDownload,
  IconUndo,
  IconRedo,
  IconSettings,
  IconSparkle,
  IconCursor,
  IconCamera,
  IconCrop,
  IconSpeaker,
  IconCaptions,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
} from '@recast/ui';
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
  FrameSync,
  type CursorSample,
  type CaptionLine,
  type FollowStep,
} from '@recast/editor';
import { segmentLocalTimeUs, BUILTIN_PRESETS, type RecastProject, type CaptionModel } from '@recast/shared';
import { TimelineStrip, relayoutProject } from './TimelineStrip';
import { MotionPanel } from './MotionPanel';
import { AudioPanel } from './AudioPanel';
import { CropPanel } from './CropPanel';
import { StylePanel } from './StylePanel';
import { AiCopilotPanel } from './AiCopilotPanel';

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
  const [panel, setPanel] = useState<'ai' | 'motion' | 'style' | 'facecam' | 'crop' | 'audio' | 'captions'>('ai');
  const [drawerOpen, setDrawerOpen] = useState(true);

  // Synchronize live changes from MCP / AI Copilot
  useEffect(() => {
    const offUpdate = bridge().on('mcp:projectUpdated', async ({ projectId }) => {
      const updated = await bridge().invoke('library:open', { id: projectId });
      if (updated) {
        useEditor.getState().setProject(updated);
      }
    });
    const offSeek = bridge().on('mcp:seekTo', ({ timeUs }) => {
      useEditor.getState().setTime(timeUs);
    });
    return () => {
      offUpdate();
      offSeek();
    };
  }, []);

  const handleTabClick = (t: typeof panel) => {
    if (panel === t) {
      setDrawerOpen((prev) => !prev);
    } else {
      setPanel(t);
      setDrawerOpen(true);
    }
  };

  const timeMap = useMemo(() => (project ? buildTimeMap(project.timeline.clips) : { clips: [], durationUs: 0 }), [project]);

  // Zoom track (deterministic; shared with export).
  // In auto mode: strictly zoom into clicks, hold ~1.8s, then smoothly return to Full Screen (1.0x).
  const zoomTrack = useMemo<FollowStep[]>(() => {
    if (!project) return [];
    if (!project.zoom.enabled) return [];
    if (project.zoom.mode === 'follow' && cursorSamples.length > 0) {
      return buildProjectZoomTrack(project, cursorSamples, cursorClicks).track;
    }
    const w = project.media.width || 1920;
    const h = project.media.height || 1080;
    let kfs: import('@recast/shared').ZoomKeyframe[];
    if (project.zoom.mode === 'manual') {
      kfs = project.zoom.manualKeyframes;
    } else {
      if (cursorClicks.length > 0) {
        kfs = computeAutoZoom(cursorSamples, cursorClicks, w, h, project.zoom.intensity, {
          ignoreSpeed: true,
          includeDwell: false,
          returnToFullScreen: true,
          holdUs: 1_800_000,
        });
      } else {
        kfs = computeAutoZoom(cursorSamples, [], w, h, project.zoom.intensity, {
          ignoreSpeed: true,
          includeDwell: true,
          dwellRadiusPx: 12,
          minDwellUs: 600_000,
          returnToFullScreen: true,
          holdUs: 1_800_000,
        });
      }
    }
    return buildZoomTrack(kfs, w, h, project.zoom.intensity, timeMap.durationUs);
  }, [project, cursorSamples, cursorClicks, timeMap.durationUs]);

  // Hidden video elements per segment — the decode source for preview + export.
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [mediaVersion, setMediaVersion] = useState(0);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    void (async () => {
      if (project.media.cursor?.available || project.id) {
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
            if (d.samples && d.samples.length > 0) {
              setCursorSamples(d.samples);
            }
            if (d.clicks && d.clicks.length > 0) {
              setCursorClicks(d.clicks);
            }
            if (d.keys && d.keys.length > 0) {
              setKeystrokes(d.keys);
            }
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
    <div className="flex h-full min-h-0 flex-col bg-[#08090d]">
      {/* RECORDLY-STYLE STUDIO TOP NAVIGATION BAR */}
      <header className="h-12 shrink-0 border-b border-white/10 bg-[#0e1118] px-3 flex items-center justify-between z-20">
        {/* Left: Library button, Undo, Redo */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigate('library')}
            className="px-2.5 py-1 text-xs font-medium rounded-lg hover:bg-white/10 text-white/80 flex items-center gap-1.5 transition-colors border border-transparent hover:border-white/10"
          >
            <IconChevronLeft size={13} />
            <span>Library</span>
          </button>
          <div className="h-4 w-px bg-white/10 mx-1" />
          <IconButton label="Undo (⌘Z)" onClick={undo}>
            <IconUndo size={14} />
          </IconButton>
          <IconButton label="Redo (⇧⌘Z)" onClick={redo}>
            <IconRedo size={14} />
          </IconButton>
        </div>

        {/* Center: Project Pill */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/90 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{project.name}</span>
          <span className="text-[10px] text-white/40 font-mono">.recast</span>
        </div>

        {/* Right: Aspect ratio, Crop button, Presets dropdown, Blue Export button */}
        <div className="flex items-center gap-2">
          {/* Custom Styled Aspect Ratio Pill */}
          <div className="flex items-center">
            <select
              value={project.style.aspect}
              onChange={(e) => commit({ ...project, style: { ...project.style, aspect: e.target.value as '16:9' | '9:16' | '1:1' | '4:5' } })}
              className="bg-[#161a24] hover:bg-[#1e2330] border border-white/15 text-white/90 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-blue-500 cursor-pointer transition-colors shadow-sm"
              title="Aspect ratio"
            >
              <option value="16:9" className="bg-[#12151d]">16:9 Landscape</option>
              <option value="9:16" className="bg-[#12151d]">9:16 Portrait / Reels</option>
              <option value="1:1" className="bg-[#12151d]">1:1 Square</option>
              <option value="4:5" className="bg-[#12151d]">4:5 Social</option>
              <option value="21:9" className="bg-[#12151d]">21:9 Ultrawide</option>
              <option value="source" className="bg-[#12151d]">Source</option>
            </select>
          </div>

          {/* Quick Crop Toggle */}
          <button
            type="button"
            onClick={() => handleTabClick('crop')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
              panel === 'crop' && drawerOpen
                ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                : 'bg-[#161a24] hover:bg-[#1e2330] border-white/15 text-white/80'
            }`}
          >
            <IconCrop size={13} />
            <span>Crop</span>
          </button>

          {/* Quick Cursor Overlay Toggle (Instant Double-Cursor Fix) */}
          <button
            type="button"
            onClick={() =>
              commit({
                ...project,
                style: {
                  ...project.style,
                  cursor: {
                    ...project.style.cursor,
                    look: project.style.cursor.look === 'none' ? 'pointer' : 'none',
                  },
                },
              })
            }
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
              project.style.cursor.look !== 'none'
                ? 'bg-[#161a24] hover:bg-[#1e2330] border-white/15 text-white/80'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
            }`}
            title={
              project.style.cursor.look === 'none'
                ? 'Cursor overlay hidden (Clean mode — no double cursor). Click to enable synthetic overlay.'
                : 'Cursor overlay active. If your recorded video already has an OS pointer, click here to hide the overlay and eliminate double cursor!'
            }
          >
            <IconCursor size={13} />
            <span>{project.style.cursor.look === 'none' ? 'Cursor: Hidden' : 'Cursor: Overlay'}</span>
          </button>

          {/* Custom Styled Presets Pill */}
          <div className="flex items-center">
            <select
              value={BUILTIN_PRESETS.some((p) => p.id === project.style.id) ? project.style.id : 'custom'}
              onChange={(e) => {
                const p = BUILTIN_PRESETS.find((x) => x.id === e.target.value);
                if (p) {
                  commit({
                    ...project,
                    style: {
                      ...p,
                      aspect: project.style.aspect,
                      aspectCustom: project.style.aspectCustom,
                    },
                  });
                }
              }}
              className="bg-[#161a24] hover:bg-[#1e2330] border border-white/15 text-white/90 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-blue-500 cursor-pointer transition-colors shadow-sm"
              title="Style presets"
            >
              {BUILTIN_PRESETS.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#12151d]">
                  Preset: {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Solid Blue Recordly Export Button */}
          <button
            type="button"
            onClick={() => navigate('export')}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <IconDownload size={14} />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* STUDIO BODY: Left Rail Dock + Collapsible Inspector Drawer + Center Canvas & Timeline */}
      <div className="flex flex-1 min-h-0">
        {/* Left Slim Vertical Icon Rail Dock (Single primary rail in editor) */}
        <aside className="w-14 shrink-0 bg-[#0c0e14] border-r border-white/10 flex flex-col items-center py-3 gap-2.5 z-10 select-none">
          <RailTab
            label="AI Copilot"
            icon={<IconSparkle size={17} />}
            active={panel === 'ai' && drawerOpen}
            onClick={() => handleTabClick('ai')}
          />
          <RailTab
            label="Style"
            icon={<IconSparkle size={17} />}
            active={panel === 'style' && drawerOpen}
            onClick={() => handleTabClick('style')}
          />
          <RailTab
            label="Motion"
            icon={<IconCursor size={17} />}
            active={panel === 'motion' && drawerOpen}
            onClick={() => handleTabClick('motion')}
          />
          <RailTab
            label="Webcam"
            icon={<IconCamera size={17} />}
            active={panel === 'facecam' && drawerOpen}
            onClick={() => handleTabClick('facecam')}
          />
          <RailTab
            label="Crop"
            icon={<IconCrop size={17} />}
            active={panel === 'crop' && drawerOpen}
            onClick={() => handleTabClick('crop')}
          />
          <RailTab
            label="Audio"
            icon={<IconSpeaker size={17} />}
            active={panel === 'audio' && drawerOpen}
            onClick={() => handleTabClick('audio')}
          />
          <RailTab
            label="Captions"
            icon={<IconCaptions size={17} />}
            active={panel === 'captions' && drawerOpen}
            onClick={() => handleTabClick('captions')}
          />

          {/* Bottom rail actions: Collapse Toggle & Settings */}
          <div className="mt-auto flex flex-col items-center gap-2 pt-2 border-t border-white/10 w-full">
            <button
              type="button"
              onClick={() => setDrawerOpen((o) => !o)}
              className="w-10 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              title={drawerOpen ? 'Collapse sidebar (Maximize canvas)' : 'Expand sidebar'}
            >
              {drawerOpen ? <IconChevronLeft size={13} /> : <IconChevronRight size={13} />}
            </button>
            <button
              type="button"
              onClick={() => navigate('settings')}
              className="w-10 h-10 rounded-xl flex flex-col items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/5 transition-colors"
              title="Settings"
            >
              <IconSettings size={15} />
              <span className="text-[9px] font-medium leading-none mt-0.5">Settings</span>
            </button>
          </div>
        </aside>

        {/* Collapsible Left Inspector Drawer */}
        {drawerOpen ? (
          <aside className="w-80 shrink-0 bg-[#10131c] border-r border-white/10 overflow-y-auto p-4 flex flex-col animate-in slide-in-from-left-2 duration-150">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <span className="text-xs font-bold uppercase tracking-wider text-white/80">
                {panel === 'ai' && 'AI Copilot & MCP Engine'}
                {panel === 'style' && 'Canvas & Background'}
                {panel === 'motion' && 'Zoom & Cursor FX'}
                {panel === 'facecam' && 'Face Camera PiP'}
                {panel === 'crop' && 'Crop & Frame'}
                {panel === 'audio' && 'Audio & Voice EQ'}
                {panel === 'captions' && 'AI Speech Subtitles'}
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="px-2 py-0.5 rounded text-[10px] text-white/40 hover:text-white/80 hover:bg-white/10 border border-white/5 flex items-center gap-1 transition-colors"
                title="Collapse sidebar (Expand canvas to full width)"
              >
                <IconChevronLeft size={11} />
                <span>Collapse</span>
              </button>
            </div>

            <div key={panel} className="panel-in flex-1">
              {panel === 'ai' && <AiCopilotPanel project={project} commit={commit} setTime={setTime} />}
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
              {panel === 'crop' && <CropPanel project={project} commit={commit} />}
              {panel === 'audio' && <AudioPanel project={project} commit={commit} />}
              {panel === 'captions' && <CaptionsPanel project={project} captions={captions} commit={commit} onLoaded={setCaptions} />}
            </div>
          </aside>
        ) : null}

        {/* Center Workspace: Canvas + Unified Studio Timeline */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#07080c]">
          {project.media.cursor?.available === false ? (
            <div className="flex items-center justify-between px-4 py-1.5 bg-blue-950/40 border-b border-blue-500/20 text-xs text-blue-200">
              <span className="inline-flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span><strong>Imported Video Mode:</strong> Clean native cursor preserved. You can add custom zoom blocks on the timeline, re-frame to 9:16 Shorts, and customize styling.</span>
              </span>
            </div>
          ) : null}
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
          <TimelineStrip
            project={project}
            durationUs={timeMap.durationUs}
            currentTimeUs={currentTimeUs}
            onSeek={setTime}
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
                commit(relayoutProject(project, project.timeline.clips.filter((c) => c.id !== selId)));
                useEditor.getState().setSelectedClip(null);
              } else {
                const next = rippleDeleteRange(project.timeline.clips, currentTimeUs - 1_000_000, currentTimeUs);
                commit(relayoutProject(project, next));
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

function RailTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string | React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all ${
        active
          ? 'bg-blue-600/20 text-blue-400 font-bold'
          : 'text-white/50 hover:text-white/80 hover:bg-white/5'
      }`}
      title={label}
    >
      {active ? (
        <span className="absolute -left-2 w-1 h-5 rounded-r bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
      ) : null}
      <span className="text-sm">{icon}</span>
      <span className="text-[9px] font-medium leading-none mt-0.5">{label}</span>
    </button>
  );
}

function encodePath(p: string): string {
  return p.split(/[\\/]/).map(encodeURIComponent).join('/');
}

/** Reserved element id for the face-cam decode video. */
export const CAMERA_ELEMENT_ID = '__camera__';

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
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frameTick, setFrameTick] = useState(0);
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
        frameSync.play(hit.clip.segmentId, screenLocalUs, hit.clip.speed, 'keep');
        for (const s of project.media.segments) {
          if (s.id !== hit.clip.segmentId) {
            const v = videoRefs.current.get(s.id);
            if (v && !v.paused) v.pause();
          }
        }
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
      scratch: (scratchCanvasRef.current ||= document.createElement('canvas')),
      getBackgroundImage: () => bgImage,
      getCameraFrame: () => {
        if (!hit || !project.media.camera) return null;
        const camSeg = project.media.camera;
        const camDur = Math.max(0, camSeg.endUs - camSeg.startUs);
        const camUs = Math.min(segmentLocalTimeUs(hit.sourceUs, camSeg.startUs), camDur);
        return frameSync.getFrame(CAMERA_ELEMENT_ID, camUs);
      },
    });
    // `frameTick` is the redraw signal from FrameSync: a decoder finishing its
    // load / seek / presented frame must repaint, otherwise the canvas keeps
    // the placeholder it drew before the first frame was paintable (black
    // preview until something else moved the playhead).
  }, [project, currentTimeUs, playing, zoomTrack, captions, cursorSamples, videoRefs, mediaVersion, bgImage, frameTick]);

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

  const positions: Array<{ id: 'tl' | 'tc' | 'tr' | 'ml' | 'center' | 'mr' | 'bl' | 'bc' | 'br'; label: string; icon: React.ReactNode }> = [
    {
      id: 'tl',
      label: 'Top Left',
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17V7h10M7 7l10 10" />
        </svg>
      ),
    },
    {
      id: 'tc',
      label: 'Top Center',
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      ),
    },
    {
      id: 'tr',
      label: 'Top Right',
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 17V7H7M17 7 7 17" />
        </svg>
      ),
    },
    {
      id: 'ml',
      label: 'Middle Left',
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      ),
    },
    {
      id: 'center',
      label: 'Center',
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="4.5" />
        </svg>
      ),
    },
    {
      id: 'mr',
      label: 'Middle Right',
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      ),
    },
    {
      id: 'bl',
      label: 'Bottom Left',
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 7v10h10M7 17 17 7" />
        </svg>
      ),
    },
    {
      id: 'bc',
      label: 'Bottom Center',
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      ),
    },
    {
      id: 'br',
      label: 'Bottom Right',
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 7v10H7M17 17 7 7" />
        </svg>
      ),
    },
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
          <Field label="Position (9-Point Grid)">
            <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl border border-white/10 bg-white/5">
              {positions.map((p) => {
                const isActive = (fc.position ?? 'br') === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={p.label}
                    title={p.label}
                    aria-pressed={isActive}
                    onClick={() => setFacecam({ position: p.id })}
                    className="flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-xs font-semibold transition-all hover:scale-[1.03] active:scale-[0.98]"
                    style={{
                      borderColor: isActive ? 'var(--accent)' : 'transparent',
                      background: isActive ? 'var(--accent-subtle, rgba(124, 140, 248, 0.18))' : 'rgba(255, 255, 255, 0.03)',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <span className="text-sm leading-none">{p.icon}</span>
                    <span className="text-[10px] mt-1 font-medium truncate max-w-full">{p.label}</span>
                  </button>
                );
              })}
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
          <Field label="Camera shape">
            <Select
              value={fc.shape ?? (fc.round ? 'circle' : 'rectangle')}
              onValueChange={(s) => {
                const shape = s as 'circle' | 'squircle' | 'rectangle';
                setFacecam({ shape, round: shape === 'circle' });
              }}
              options={[
                { value: 'circle', label: 'Circle' },
                { value: 'squircle', label: 'Squircle (Smooth Apple style)' },
                { value: 'rectangle', label: 'Rectangle' },
              ]}
              ariaLabel="Camera shape"
            />
          </Field>
          {fc.shape === 'squircle' ? (
            <Field label={`Squircle curvature — ${Math.round((fc.squircleCurvature ?? 0.6) * 100)}%`}>
              <Slider
                value={fc.squircleCurvature ?? 0.6}
                min={0.2}
                max={1.0}
                step={0.05}
                ariaLabel="Squircle curvature"
                onValueChange={(squircleCurvature) => setFacecam({ squircleCurvature })}
              />
            </Field>
          ) : null}
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
  const [models, setModels] = useState<Array<{ id: string; label: string; sizeMb: number; downloaded: boolean; language: string }>>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('ggml-tiny.en');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadPct, setDownloadPct] = useState<number>(0);
  const [transcribing, setTranscribing] = useState<boolean>(false);

  const refreshModels = async () => {
    try {
      const list = (await bridge().invoke('captions:models', undefined)) as CaptionModel[];
      setModels(list);
      // Pick first downloaded model if current not downloaded
      const hasCurrent = list.some((m: CaptionModel) => m.id === selectedModelId && m.downloaded);
      if (!hasCurrent) {
        const firstDownloaded = list.find((m: CaptionModel) => m.downloaded);
        if (firstDownloaded) setSelectedModelId(firstDownloaded.id);
      }
    } catch {
      setModels([]);
    }
  };

  useEffect(() => {
    void refreshModels();
  }, []);

  const handleDownloadModel = async (id: string) => {
    const m = models.find((x) => x.id === id);
    setDownloadingId(id);
    setDownloadPct(0);
    showToast(`Downloading ${m?.label ?? id}…`, 'info');

    const off = bridge().on('whisper:download', ({ pct, done, error }) => {
      if (error) {
        showToast(`Model download failed: ${error}`, 'error');
        setDownloadingId(null);
        off();
      } else if (done) {
        showToast(`${m?.label ?? 'Model'} ready!`, 'success');
        setDownloadingId(null);
        off();
        void refreshModels();
      } else {
        setDownloadPct(pct);
      }
    });

    try {
      const res = await bridge().invoke('captions:downloadModel', { id });
      if (!res.ok && res.error) {
        showToast(`Model download failed: ${res.error}`, 'error');
        setDownloadingId(null);
        off();
      }
    } catch (e) {
      showToast(`Download failed: ${(e as Error).message}`, 'error');
      setDownloadingId(null);
      off();
    }
  };

  const handleTranscribe = async () => {
    if (!selectedModelId) return;
    setTranscribing(true);
    showToast('Extracting audio & generating AI subtitles…', 'info');
    try {
      const r = await bridge().invoke('captions:transcribe', {
        projectId: project.id,
        modelId: selectedModelId,
        language: 'auto',
      });
      if (r.ok) {
        showToast('Subtitles generated successfully!', 'success');
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
    } catch (e) {
      showToast(`Transcription error: ${(e as Error).message}`, 'error');
    } finally {
      setTranscribing(false);
    }
  };

  const activeModel = models.find((m) => m.id === selectedModelId) ?? models[0];

  return (
    <div className="space-y-4">
      {!ffmpeg?.available ? (
        <div className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
          Captions require FFmpeg for audio extraction. Please verify Media Engine in Settings.
        </div>
      ) : null}

      <Field label="Whisper AI Model">
        <Select
          value={activeModel?.id ?? ''}
          onValueChange={(id) => setSelectedModelId(id)}
          options={models.map((m) => ({
            value: m.id,
            label: `${m.label} (${m.sizeMb} MB)${m.downloaded ? ' — Ready' : ' — Need Download'}`,
          }))}
          ariaLabel="Whisper model"
          fullWidth
        />
      </Field>

      {/* Model Status Card */}
      {activeModel ? (
        <div className="rounded-lg border border-hairline p-3 space-y-2.5 bg-black/20">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white/90">{activeModel.label}</span>
            {activeModel.downloaded ? (
              <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded inline-flex items-center gap-1">
                <IconCheck size={11} />
                <span>Ready (Downloaded)</span>
              </span>
            ) : (
              <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded inline-flex items-center gap-1">
                <IconDownload size={11} />
                <span>Needs Download ({activeModel.sizeMb} MB)</span>
              </span>
            )}
          </div>

          {activeModel.downloaded ? (
            <Button
              variant="primary"
              disabled={transcribing || !ffmpeg?.available}
              onClick={handleTranscribe}
            >
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {transcribing ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Generating Subtitles…</span>
                  </>
                ) : (
                  <>
                    <IconSparkle size={14} />
                    <span>Generate AI Subtitles</span>
                  </>
                )}
              </span>
            </Button>
          ) : (
            <div className="space-y-2">
              <Button
                variant="primary"
                disabled={downloadingId === activeModel.id}
                onClick={() => handleDownloadModel(activeModel.id)}
              >
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <IconDownload size={14} />
                  <span>
                    {downloadingId === activeModel.id
                      ? `Downloading… ${downloadPct}%`
                      : `Download Model (${activeModel.sizeMb} MB)`}
                  </span>
                </span>
              </Button>
              {downloadingId === activeModel.id ? (
                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all duration-200"
                    style={{ width: `${downloadPct}%` }}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* Models Quick List */}
      <div className="rounded-lg border border-hairline p-3 space-y-2">
        <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Available Speech Models (Offline GGML)
        </div>
        <div className="space-y-1.5 max-h-36 overflow-auto pr-1">
          {models.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
              <div>
                <span className="font-medium text-white/80">{m.label}</span>
                <span className="text-white/40 ml-1.5">({m.sizeMb} MB)</span>
              </div>
              {m.downloaded ? (
                <span className="text-emerald-400 text-[11px] inline-flex items-center gap-1">
                  <IconCheck size={11} />
                  <span>Installed</span>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={downloadingId === m.id}
                  onClick={() => handleDownloadModel(m.id)}
                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white/90 transition-colors inline-flex items-center gap-1"
                >
                  <IconDownload size={11} />
                  <span>{downloadingId === m.id ? `${downloadPct}%` : 'Download'}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={async () => {
            const r = await bridge().invoke('captions:import', { projectId: project.id });
            showToast(r.ok ? 'Subtitles imported.' : (r.error ?? 'Import cancelled.'), r.ok ? 'success' : 'info');
          }}
        >
          Import .srt
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
      </div>

      {/* Subtitle Visual Appearance */}
      <div className="pt-2 border-t border-white/10 space-y-3">
        <h4 className="text-xs font-semibold text-white/90">Subtitle Visual Style</h4>
        <Field label="Display Style">
          <Select
            value={project.style.captions.style}
            onValueChange={(val) =>
              commit({
                ...project,
                style: {
                  ...project.style,
                  captions: { ...project.style.captions, style: val as 'clean' | 'bold' | 'boxed' | 'pill' | 'karaoke' },
                },
              })
            }
            options={[
              { value: 'karaoke', label: 'Karaoke Highlight (Active Accent)' },
              { value: 'pill', label: 'Translucent Glass Pill' },
              { value: 'boxed', label: 'High-Contrast Box' },
              { value: 'clean', label: 'Clean Shadowed Text' },
            ]}
            ariaLabel="Subtitle style"
            fullWidth
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Text Color">
            <ColorPicker
              value={project.style.captions.color}
              onChange={(color) =>
                commit({
                  ...project,
                  style: { ...project.style, captions: { ...project.style.captions, color } },
                })
              }
              ariaLabel="Text Color"
            />
          </Field>
          <Field label="Highlight Color">
            <ColorPicker
              value={project.style.captions.highlightColor}
              onChange={(highlightColor) =>
                commit({
                  ...project,
                  style: { ...project.style, captions: { ...project.style.captions, highlightColor } },
                })
              }
              ariaLabel="Highlight Color"
            />
          </Field>
        </div>
        <Field label={`Font Size — ${project.style.captions.sizePx}px`}>
          <Slider
            value={project.style.captions.sizePx}
            min={16}
            max={64}
            step={2}
            ariaLabel="Font Size"
            onValueChange={(sizePx) =>
              commit({
                ...project,
                style: { ...project.style, captions: { ...project.style.captions, sizePx } },
              })
            }
          />
        </Field>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {captions.length} cue{captions.length === 1 ? '' : 's'} loaded
        </div>
        <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-hairline p-2 text-xs">
          {captions.slice(0, 15).map((c, i) => (
            <div key={i} className="tabular" style={{ color: 'var(--text-muted)' }}>
              {formatClock(c.startUs)} — {c.text.slice(0, 52)}
            </div>
          ))}
          {captions.length === 0 ? <span style={{ color: 'var(--text-muted)' }}>No captions yet. Click Generate AI Subtitles above.</span> : null}
        </div>
      </div>
      {transcribing ? <div className="text-xs text-indigo-400 animate-pulse">Running Whisper inference locally…</div> : null}
    </div>
  );
}
