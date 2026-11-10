import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/stores';
import { bridge } from '../lib/bridge';
import { Button, Field, Select, Progress, Badge, IconDownload } from '@recast/ui';
import { formatClock } from '@recast/shared';
import { runExport, type ExportProgress } from '@recast/export';
import { buildTimeMap, buildZoomTrack, cuesAt, parseSrt, type CaptionLine, type FollowStep } from '@recast/editor';
import { captureMediaHost, beginChunkedExport } from '../lib/export-host';
import type { RecastProject } from '@recast/shared';

/** Quick-apply export bundles — every field stays editable below. */
const EXPORT_PRESETS: Array<{ label: string; format: 'mp4' | 'webm' | 'hevc' | 'prores' | 'gif'; resolution: '720p' | '1080p' | '1440p' | '2160p' | 'source'; fps: 24 | 30 | 60 }> = [
  { label: 'YouTube 1080p', format: 'mp4', resolution: '1080p', fps: 30 },
  { label: 'Smooth 60 fps', format: 'mp4', resolution: '1080p', fps: 60 },
  { label: '4K master', format: 'mp4', resolution: '2160p', fps: 30 },
  { label: 'Light 720p', format: 'mp4', resolution: '720p', fps: 24 },
  { label: 'Animated GIF', format: 'gif', resolution: '720p', fps: 24 },
  { label: 'WebM lossless-ish', format: 'webm', resolution: 'source', fps: 30 },
];

/** Export: format, resolution, honest estimates, used-path display, verify. */
export function ExportView() {
  const projectId = useApp((s) => s.projectId);
  const navigate = useApp((s) => s.navigate);
  const showToast = useApp((s) => s.showToast);
  const settings = useApp((s) => s.settings);
  const ffmpeg = useApp((s) => s.ffmpeg);
  const [format, setFormat] = useState<'mp4' | 'webm' | 'hevc' | 'prores' | 'gif'>('mp4');
  const [resolution, setResolution] = useState<'720p' | '1080p' | '1440p' | '2160p' | 'source'>('1080p');
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [estimate, setEstimate] = useState<{ sizeMb: number; seconds: number; durationUs: number } | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [project, setProject] = useState<RecastProject | null>(null);
  const [zoomTrack, setZoomTrack] = useState<FollowStep[]>([]);
  const [cursorEvents, setCursorEvents] = useState<Array<{ tUs: number; x: number; y: number; type: string }>>([]);
  const [keystrokes, setKeystrokes] = useState<Array<{ tUs: number; key: string }>>([]);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const cancelRef = useRef(false);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      const p = await bridge().invoke('library:open', { id: projectId });
      setProject(p as RecastProject);
      if (!p) return;
      // Cursor data → zoom track (deterministic, same as preview).
      const sessionId = p.id.startsWith('prj-') ? p.id.slice(4) : p.id;
      const cursor = await bridge().invoke('capture:readCursor', { sessionId });
      const samples = (cursor.samples ?? []) as Array<{ tUs: number; x: number; y: number }>;
      setCursorEvents(samples.map((s) => ({ ...s, type: 'move' })));
      if (Array.isArray(cursor.keys)) {
        setKeystrokes(cursor.keys as Array<{ tUs: number; key: string }>);
      }
      const map = buildTimeMap(p.timeline.clips);
      const kfs = p.zoom.mode === 'manual' ? p.zoom.manualKeyframes : p.zoom.autoKeyframes;
      setZoomTrack(p.zoom.enabled ? buildZoomTrack(kfs, p.media.width || 1920, p.media.height || 1080, p.zoom.intensity, map.durationUs) : []);
      if (p.captions) {
        const raw = await bridge().invoke('capture:readCaptions', { path: p.captions.file });
        if (typeof raw === 'string') {
          setCaptions(parseSrt(raw).map((c) => ({ text: c.text.replace(/\n/g, ' '), startUs: c.startUs, endUs: c.endUs })));
        }
      }
    })().catch(() => setProject(null));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !project) return;
    void bridge()
      .invoke('export:estimate', { projectId, format, resolution, fps })
      .then((e) => setEstimate({ sizeMb: e.estimatedBytes / 1_000_000, seconds: e.estimatedSeconds, durationUs: e.durationUs }))
      .catch(() => setEstimate(null));
  }, [projectId, project, format, resolution, fps]);

  // Background image decode for the compositor (same source as preview).
  const bg = project?.style.frame.background;
  useEffect(() => {
    if (!bg || bg.type !== 'image' || !bg.imageFile) {
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
    img.src = `recast-media://local/${bg.imageFile.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
    return () => {
      cancelled = true;
    };
  }, [bg?.type, bg?.imageFile]);

  if (!project) {
    return <div className="p-8 text-secondary">No project selected — open one from the Library first.</div>;
  }

  const busy = progress != null && !['done', 'failed', 'cancelled'].includes(progress.stage);

  // Decode elements: one muted video per segment, created once.
  function getVideoElement(segmentId: string): HTMLVideoElement | null {
    const proj = project;
    if (!proj) return null;
    let v = videoRefs.current.get(segmentId);
    if (!v) {
      const seg = proj.media.segments.find((s) => s.id === segmentId);
      if (!seg) return null;
      v = document.createElement('video');
      v.crossOrigin = 'anonymous'; // untainted canvas draws — required by WebCodecs
      v.src = `recast-media://local/${proj.media.dir.split(/[\\/]/).map(encodeURIComponent).join('/')}/${encodeURIComponent(seg.file)}`;
      v.muted = true;
      v.preload = 'auto';
      videoRefs.current.set(segmentId, v);
    }
    return v;
  }

  function getCameraElement(): HTMLVideoElement | null {
    const proj = project;
    if (!proj?.media.camera) return null;
    if (!cameraRef.current) {
      const cam = proj.media.camera;
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.src = `recast-media://local/${proj.media.dir.split(/[\\/]/).map(encodeURIComponent).join('/')}/${encodeURIComponent(cam.file)}`;
      v.muted = true;
      v.preload = 'auto';
      cameraRef.current = v;
    }
    return cameraRef.current;
  }

  async function pickDestination(): Promise<string | null> {
    const suggested = await bridge().invoke('export:suggestFilename', { projectId: projectId!, format });
    const { path } = await bridge().invoke('export:pickDestination', { defaultName: suggested.name });
    setDestination(path);
    return path;
  }

  async function run(): Promise<void> {
    // Read the destination into a local: setState above does NOT update the
    // closed-over variable in this invocation (the stale-closure bug made the
    // first "Start export" click a silent no-op — export appeared broken).
    let dest = destination;
    if (!dest) {
      dest = await pickDestination();
    }
    if (!dest) return;
    cancelRef.current = false;
    setProgress({ frame: 0, totalFrames: 0, encodeFps: 0, stage: 'rendering', usedPath: '' });
    // The render guard above doesn't narrow inside closures — re-guard here.
    const proj = project;
    if (!proj) return;
    try {
      await beginChunkedExport(dest);
      const result = await runExport(
        {
          destination: dest,
          format,
          fps,
          shortEdge: resolution === 'source' ? Math.min(proj.media.height || 1080, 2160) : Number.parseInt(resolution, 10),
          cancelCheck: () => cancelRef.current,
        },
        {
          project: proj,
          zoomTrack,
          cursorEvents,
          getCaptionsAt: (t) => cuesAt(captions, t),
          getVideoElement,
          getCameraElement,
          getBackgroundImage: () => bgImage,
          preferHardware: settings.preferHardwareEncoder,
          hasFfmpeg: ffmpeg?.available ?? false,
          normalizeLufs: proj.audioEdits.normalizeLufs,
          noiseGateDb: proj.audioEdits.noiseGateDb ?? null,
          keystrokeEvents: keystrokes,
        },
        captureMediaHost,
        (p) => setProgress({ ...p }),
      );
      if (result.verified) {
        showToast(`Export verified — ${formatClock(result.durationUs)} · ${result.usedPath}`, 'success');
      } else {
        showToast('Export finished, but ffprobe verification could not run. Check Settings → Media engine.', 'error');
      }
      void useApp.getState().refreshLibrary();
    } catch (e) {
      showToast(`Export failed: ${(e as Error).message}`, 'error');
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Export</h1>
        <Button onClick={() => navigate('editor')}>Back to editor</Button>
      </div>

      <section>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Presets
        </div>
        <div className="flex flex-wrap gap-2">
          {EXPORT_PRESETS.map((p) => {
            const active = format === p.format && resolution === p.resolution && fps === p.fps;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFormat(p.format);
                  setResolution(p.resolution);
                  setFps(p.fps);
                }}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--hairline-strong)',
                  background: active ? 'var(--accent-subtle)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Format">
          <Select
            value={format}
            onValueChange={(v) => setFormat(v as typeof format)}
            options={[
              { value: 'mp4', label: 'MP4 · H.264 (recommended)' },
              { value: 'webm', label: 'WebM · VP9' },
              { value: 'hevc', label: 'HEVC (if supported)' },
              { value: 'prores', label: 'ProRes 422 (via FFmpeg)' },
              { value: 'gif', label: 'GIF (via FFmpeg)' },
            ]}
            ariaLabel="Format"
          />
        </Field>
        <Field label="Resolution">
          <Select
            value={resolution}
            onValueChange={(v) => setResolution(v as typeof resolution)}
            options={[
              { value: '720p', label: '720p' },
              { value: '1080p', label: '1080p' },
              { value: '1440p', label: '1440p' },
              { value: '2160p', label: '4K' },
              { value: 'source', label: 'Source' },
            ]}
            ariaLabel="Resolution"
          />
        </Field>
        <Field label="Frame rate">
          <Select
            value={String(fps)}
            onValueChange={(v) => setFps(Number(v) as 24 | 30 | 60)}
            options={[
              { value: '24', label: '24 fps' },
              { value: '30', label: '30 fps' },
              { value: '60', label: '60 fps' },
            ]}
            ariaLabel="Frame rate"
          />
        </Field>
        <Field label="Destination">
          <Button onClick={() => void pickDestination()}>{destination ? 'Change…' : 'Choose file…'}</Button>
        </Field>
      </div>

      {estimate ? (
        <div className="tabular rounded-lg border border-hairline p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          ≈ {estimate.sizeMb.toFixed(1)} MB · renders in ≈ {estimate.seconds}s · {formatClock(estimate.durationUs)} long
        </div>
      ) : null}

      {progress ? (
        <div className="space-y-2">
          <Progress value={progress.totalFrames > 0 ? progress.frame / progress.totalFrames : 0} />
          <div className="tabular flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>
              {progress.stage} · frame {progress.frame}/{progress.totalFrames} · {progress.encodeFps.toFixed(1)} fps
            </span>
            {progress.usedPath ? <Badge tone="neutral">{progress.usedPath}</Badge> : null}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void run()}>
          <span className="inline-flex items-center gap-2">
            <IconDownload size={14} /> {busy ? 'Exporting…' : 'Start export'}
          </span>
        </Button>
        {busy ? (
          <Button
            size="lg"
            onClick={() => {
              cancelRef.current = true;
              void bridge().invoke('export:discard', { exportId: destination } as never);
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Cancel never leaves a partial file: bytes land in a `.part` file and are renamed only after the mux finishes and
        ffprobe verifies the result. The encoder actually used is shown above the button.
      </p>
    </div>
  );
}
