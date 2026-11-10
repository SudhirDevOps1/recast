import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, useRecorder } from '../state/stores';
import { bridge } from '../lib/bridge';
import { Button, Field, Select, Switch, Slider, Badge, IconRecord, IconStop, IconPause, IconPlay, IconMonitor, IconMic, IconSpeaker, IconCamera, IconRefresh } from '@recast/ui';
import type { DeviceInfo, ListSourcesResponse } from '@recast/shared';
import { startRecordingFlow, stopRecordingFlow, rendererRecorderHandle, acquireCaptureSources, releaseAcquiredSources, RecordingError, type AcquiredSources } from '../lib/record-flow';
import { logCapture } from '../lib/capture-log';

/**
 * Recorder: source picker with live thumbnails, mic + system audio with
 * honest per-OS notes, countdown, area selection overlay, fps/quality.
 * The actual capture pipeline lives in @recast/capture (renderer) — this
 * view drives it.
 */
export function RecorderView() {
  const platform = useApp((s) => s.platform);
  const recorderState = useApp((s) => s.recorderState);
  const showToast = useApp((s) => s.showToast);
  const opts = useRecorder();
  const [sources, setSources] = useState<ListSourcesResponse | null>(null);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const [permissionScreen] = useState<string | null>(null);
  const [micMeter, setMicMeter] = useState<number | null>(null);
  const [countingDown, setCountingDown] = useState<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const acquiredRef = useRef<AcquiredSources | null>(null);
  const cancelledRef = useRef(false);

  const refreshSources = useCallback(async (): Promise<void> => {
    setRefreshingSources(true);
    try {
      setSources(await bridge().invoke('sources:list', undefined));
    } catch (e) {
      showToast(`Could not enumerate sources: ${(e as Error).message}`, 'error');
    } finally {
      setRefreshingSources(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  // Real device enumeration (renderer-side — labels only become visible after
  // a getUserMedia grant). Re-enumerate on devicechange so a vanished
  // selection cannot silently break a take.
  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const micList: DeviceInfo[] = [];
      devices.forEach((d, i) => {
        if (d.kind !== 'audioinput') return;
        micList.push({
          id: d.deviceId,
          label: d.label || (d.deviceId ? `Microphone ${i + 1}` : 'System default'),
          default: d.deviceId === 'default' || d.deviceId === '',
        });
      });
      if (micList.length === 0) {
        micList.push({ id: 'default', label: 'System default', default: true });
      }
      setMics(micList);
    } catch (e) {
      logCapture('devices', 'warn', 'device enumeration failed', (e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    const handler = (): void => {
      void refreshDevices();
      void refreshSources();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [refreshDevices, refreshSources]);

  const recorderStateRef = useRef(recorderState);
  recorderStateRef.current = recorderState;

  // Screen-changed detection: the set of windows/displays on screen drifts
  // while the picker sits open, so re-enumerate (with fresh thumbnails)
  // whenever the app window regains focus and when displays are reconfigured.
  useEffect(() => {
    const onFocus = (): void => {
      if (recorderStateRef.current == null) void refreshSources();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshSources]);

  // Listen for Stop requested from floating toolbar or system tray
  useEffect(() => {
    const off = bridge().on('recorder:requestStop', () => {
      void finishRecording();
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mic meter via a lightweight getUserMedia loop (never recorded here).
  useEffect(() => {
    if (!opts.micEnabled) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setMicMeter(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // Mic permission just got granted — labels in enumerateDevices() are
        // now real; refresh the device list once.
        void refreshDevices();
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = (): void => {
          if (cancelled) {
            void ctx.close();
            return;
          }
          analyser.getFloatTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v));
          setMicMeter(peak);
          requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setMicMeter(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opts.micEnabled, refreshDevices]);

  const recording = recorderState?.phase === 'recording' || recorderState?.phase === 'paused';
  const paused = recorderState?.phase === 'paused';

  if (recording) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <Badge tone={paused ? 'warning' : 'recording'}>
          <span
            className={`inline-block h-2 w-2 rounded-full ${paused ? '' : 'animate-pulse'}`}
            style={{ background: paused ? 'var(--warning)' : 'var(--recording)' }}
          />
          {paused ? 'Paused' : 'Recording'}
        </Badge>
        <div className="tabular text-4xl font-bold">{Math.floor((recorderState?.elapsedUs ?? 0) / 1_000_000)}s</div>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {(recorderState?.bytes ?? 0) / 1_000_000 > 0.1
            ? `${((recorderState?.bytes ?? 0) / 1_000_000).toFixed(1)} MB · ${(recorderState?.droppedFrames ?? 0)} dropped frames`
            : paused
              ? 'Paused — segments so far are safe on disk.'
              : 'Segments are being written to disk — a crash cannot lose more than 2 seconds.'}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              if (paused) {
                void bridge().invoke('recorder:resume', undefined);
                rendererRecorderHandle()?.resume();
              } else {
                void bridge().invoke('recorder:pause', undefined);
                rendererRecorderHandle()?.pause();
              }
            }}
            size="lg"
          >
            <span className="inline-flex items-center gap-2">
              {paused ? <IconPlay size={14} /> : <IconPause size={14} />} {paused ? 'Resume' : 'Pause'}
            </span>
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => void finishRecording()}
          >
            <span className="inline-flex items-center gap-2">
              <IconStop size={14} /> Stop & open editor
            </span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">New recording</h1>
        {permissionScreen ? (
          <div className="mt-2 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
            Screen recording permission is {permissionScreen}. Grant it, then{' '}
            <button className="underline" onClick={() => void window.location.reload()}>
              reload
            </button>
            .
          </div>
        ) : null}
      </div>

      {/* Source picker */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Source
          </h2>
          <Button size="sm" onClick={() => void refreshSources()} disabled={refreshingSources} aria-label="Refresh sources">
            <span className="inline-flex items-center gap-2">
              <IconRefresh size={12} /> {refreshingSources ? 'Refreshing…' : 'Refresh'}
            </span>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {sources?.screens.map((s) => (
            <SourceCard
              key={s.id}
              label={s.name}
              icon={<IconMonitor />}
              thumbnail={s.thumbnailDataUrl}
              selected={opts.selectedScreenId === s.id && !opts.selectedWindowId}
              onClick={() => opts.set({ selectedScreenId: s.id, selectedWindowId: null })}
            />
          ))}
        </div>
        {sources?.windows.length ? (
          <details className="rounded-lg border border-hairline p-3">
            <summary className="cursor-pointer text-sm" style={{ color: 'var(--text-secondary)' }}>
              {sources.windows.length} windows
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
              {sources.windows.slice(0, 12).map((w) => (
                <SourceCard
                  key={w.id}
                  label={w.name}
                  icon={<IconMonitor />}
                  thumbnail={w.thumbnailDataUrl}
                  selected={opts.selectedWindowId === w.id}
                  onClick={() => opts.set({ selectedWindowId: w.id, selectedScreenId: null })}
                />
              ))}
            </div>
          </details>
        ) : null}
        {opts.selectedWindowId ? (
          <div className="rounded-lg border px-3 py-2 text-xs flex items-center gap-2" style={{ borderColor: 'var(--accent)', background: 'var(--accent-subtle, rgba(124,140,248,0.12))', color: '#e8ebf2' }}>
            <span className="font-semibold text-accent">Window capture active:</span>
            <span>Keep your chosen window open and visible on screen (not minimized) while recording so Windows can capture its frames.</span>
          </div>
        ) : null}
        {platform?.capabilities.areaSelection ? (
          <Button
            onClick={() =>
              void (async () => {
                const displayId = sources?.screens[0]?.displayId ?? 0;
                const { rect } = await bridge().invoke('area:pick', { displayId });
                opts.set({ areaRect: rect, selectedWindowId: null });
                if (rect) showToast(`Area selected: ${rect.w}×${rect.h}`, 'info');
              })()
            }
          >
            <span className="inline-flex items-center gap-2">
              <IconRefresh size={14} /> Select area…
            </span>
          </Button>
        ) : null}
        {opts.areaRect ? (
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Area: {opts.areaRect.w}×{opts.areaRect.h} at ({opts.areaRect.x}, {opts.areaRect.y}){' '}
            <button className="underline" onClick={() => opts.set({ areaRect: null })}>
              clear
            </button>
          </div>
        ) : null}
      </section>

      {/* Audio */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Microphone" hint={micMeter != null && micMeter < 0.005 ? 'No signal — check the device or input level.' : undefined}>
          <div className="flex items-center gap-3">
            <Switch checked={opts.micEnabled} onCheckedChange={(v) => opts.set({ micEnabled: v })} ariaLabel="Record microphone" />
            <IconMic />
            <div className="h-2 flex-1 rounded-full" style={{ background: 'var(--hairline)' }}>
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (micMeter ?? 0) * 200)}%`,
                  background: micMeter != null && micMeter < 0.005 ? 'var(--danger)' : 'var(--accent)',
                }}
              />
            </div>
          </div>
        </Field>
        <Field label="System audio" hint={platform?.capabilities.systemAudioNote}>
          <div className="flex items-center gap-3">
            <Switch
              checked={opts.systemAudio}
              onCheckedChange={(v) => opts.set({ systemAudio: v })}
              disabled={!platform?.capabilities.systemAudio}
              ariaLabel="Record system audio"
            />
            <IconSpeaker />
            {!platform?.capabilities.systemAudio ? (
              <span className="text-xs" style={{ color: 'var(--warning)' }}>
                unavailable on this platform
              </span>
            ) : null}
          </div>
        </Field>
        <Field label="Face camera" hint="Recorded as a separate picture-in-picture track. A camera problem never blocks the screen take.">
          <div className="flex items-center gap-3">
            <Switch checked={opts.cameraEnabled} onCheckedChange={(v) => opts.set({ cameraEnabled: v })} ariaLabel="Record camera" />
            <IconCamera />
          </div>
        </Field>
        {opts.cameraEnabled ? (
          <Field label="Camera device" hint="Used for the face-cam overlay; style it in the editor's Cam panel.">
            <Select
              value={opts.cameraDeviceId ?? 'default'}
              onValueChange={(v) => opts.set({ cameraDeviceId: v === 'default' ? null : v })}
              options={(sources?.cameras ?? []).map((c) => ({
                value: c.id || 'default',
                label: c.default ? `${c.label} (default)` : c.label,
              })).concat([{ value: 'default', label: 'System default' }])}
              ariaLabel="Camera device"
            />
          </Field>
        ) : null}
        <Field label="Microphone device" hint="Used for the recording when the microphone is on.">
          <Select
            value={opts.micDeviceId ?? 'default'}
            onValueChange={(v) => opts.set({ micDeviceId: v === 'default' ? null : v })}
            options={mics.map((m) => ({ value: m.id || 'default', label: m.default ? `${m.label} (default)` : m.label }))}
            ariaLabel="Microphone device"
          />
        </Field>
        <Field label="Frame rate">
          <Select
            value={String(opts.fps)}
            onValueChange={(v) => opts.set({ fps: Number(v) as 24 | 30 | 60 })}
            options={[
              { value: '24', label: '24 fps — cinematic' },
              { value: '30', label: '30 fps — standard' },
              { value: '60', label: '60 fps — fluid UI' },
            ]}
            ariaLabel="Frame rate"
          />
        </Field>
        <Field label="Quality">
          <Select
            value={opts.quality}
            onValueChange={(v) => opts.set({ quality: v as typeof opts.quality })}
            options={[
              { value: 'source', label: 'Source resolution' },
              { value: '1080p', label: '1080p' },
              { value: '1440p', label: '1440p' },
              { value: '2160p', label: '4K' },
            ]}
            ariaLabel="Quality"
          />
        </Field>
        <Field label="Countdown">
          <Select
            value={String(opts.countdownSec)}
            onValueChange={(v) => opts.set({ countdownSec: Number(v) as 0 | 3 | 5 | 10 })}
            options={[
              { value: '0', label: 'Off' },
              { value: '3', label: '3 seconds' },
              { value: '5', label: '5 seconds' },
              { value: '10', label: '10 seconds' },
            ]}
            ariaLabel="Countdown"
          />
        </Field>
      </section>

      <div className="flex items-center justify-between border-t border-hairline pt-4">
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Everything runs locally. No account, no cloud, no watermark.
        </div>
        <Button variant="primary" size="lg" onClick={() => void start()}>
          <span className="inline-flex items-center gap-2">
            <IconRecord size={14} /> Start recording
          </span>
        </Button>
      </div>

      {countingDown != null ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6" style={{ background: 'rgba(6,8,12,0.92)' }}>
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 132,
              height: 132,
              border: '6px solid var(--accent)',
              boxShadow: '0 0 0 1px var(--hairline), 0 8px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div className="tabular text-6xl font-bold" style={{ color: 'var(--accent)' }} aria-live="polite">
              {countingDown}
            </div>
          </div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Recording starts in {countingDown}s — press <kbd>Esc</kbd> to cancel
          </div>
          {/* Live preview underneath the ring: proof of what is being captured. */}
          <video
            ref={(el) => {
              previewRef.current = el;
              if (el && acquiredRef.current && el.srcObject !== acquiredRef.current.displayStream) {
                el.srcObject = acquiredRef.current.displayStream;
                void el.play().catch(() => undefined);
              }
            }}
            autoPlay
            muted
            playsInline
            className="max-h-[52vh] rounded-lg border border-hairline object-contain"
            style={{ background: '#000' }}
            aria-label="Live capture preview during countdown"
          />
        </div>
      ) : null}
    </div>
  );

  async function start(): Promise<void> {
    // 1) Acquire the streams SYNCHRONOUSLY inside the click's transient
    //    activation. The old flow ran the countdown first, so with a 5 s or
    //    10 s countdown Chromium rejected getDisplayMedia (activation expired)
    //    and recording simply never started.
    try {
      const { sessionId, startEpochMs } = await bridge().invoke('recorder:start', {
        screenId: opts.selectedScreenId ?? undefined,
        windowId: opts.selectedWindowId ?? undefined,
        micDeviceId: opts.micEnabled ? (opts.micDeviceId ?? 'default') : null,
        systemAudio: opts.systemAudio,
        cameraDeviceId: opts.cameraEnabled ? (opts.cameraDeviceId ?? 'default') : null,
        countdownSec: opts.countdownSec,
        fps: opts.fps,
        quality: opts.quality,
      });

      cancelledRef.current = false;
      acquiredRef.current = await acquireCaptureSources(showToast);
      logCapture('display-media', 'info', 'streams acquired before countdown');

      // 2) Countdown with a live preview; Esc cancels cleanly.
      const escHandler = (ev: KeyboardEvent): void => {
        if (ev.key === 'Escape') cancelledRef.current = true;
      };
      window.addEventListener('keydown', escHandler);
      try {
        if (opts.countdownSec > 0 && !cancelledRef.current) {
          for (let i = opts.countdownSec; i > 0; i--) {
            if (cancelledRef.current) break;
            setCountingDown(i);
            await new Promise((r) => setTimeout(r, 1_000));
          }
        }
      } finally {
        window.removeEventListener('keydown', escHandler);
        setCountingDown(null);
      }

      if (cancelledRef.current) {
        releaseAcquiredSources(acquiredRef.current);
        acquiredRef.current = null;
        logCapture('display-media', 'info', 'countdown cancelled — streams released');
        showToast('Recording cancelled.', 'info');
        return;
      }

      // 3) Hand the already-open streams to the pipeline.
      const acquired = acquiredRef.current;
      acquiredRef.current = null;
      await startRecordingFlow({ sessionId, startEpochMs, acquired: acquired! });
    } catch (e) {
      setCountingDown(null);
      releaseAcquiredSources(acquiredRef.current);
      acquiredRef.current = null;
      logCapture('pipeline', 'error', 'start failed', (e as Error).message);
      if (e instanceof RecordingError && e.action) {
        showToast(e.message, 'error', e.action);
      } else {
        const msg = e instanceof Error ? `${e.name === 'Error' ? '' : `${e.name}: `}${e.message}` : String(e);
        showToast(`Recording failed — ${msg}`, 'error');
      }
    }
  }

  async function finishRecording(): Promise<void> {
    const projectId = await stopRecordingFlow();
    useApp.getState().setRecorderState(null);
    void useApp.getState().refreshLibrary();
    if (projectId) {
      const project = await bridge().invoke('library:open', { id: projectId });
      if (project) {
        const { useEditor } = await import('../state/stores');
        useEditor.getState().setProject(project);
        // Carry the id in the app store too — the Export view loads its project
        // from useApp.projectId; without it export showed "No project selected".
        navigate('editor', projectId);
      }
    }
  }

  function navigate(route: 'editor', projectId?: string): void {
    useApp.getState().navigate(route, projectId);
  }
}

function SourceCard({
  label,
  icon,
  thumbnail,
  selected,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  thumbnail?: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-2 overflow-hidden rounded-lg border p-0 text-left transition-all"
      style={{
        borderColor: selected ? 'var(--accent)' : 'var(--hairline)',
        background: selected ? 'var(--accent-subtle)' : 'var(--surface)',
      }}
      aria-pressed={selected}
    >
      {thumbnail ? (
        <img src={thumbnail} alt="" className="aspect-video w-full object-cover" draggable={false} />
      ) : (
        <span className="flex aspect-video w-full items-center justify-center" style={{ background: 'var(--hairline)', color: 'var(--text-muted)' }}>
          {icon}
        </span>
      )}
      <span className="line-clamp-2 px-3 pb-2 text-xs">{label}</span>
    </button>
  );
}

// Slider import retained for mic gain in the next phase.
void Slider;
