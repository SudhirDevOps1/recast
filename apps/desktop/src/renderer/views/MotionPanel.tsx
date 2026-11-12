import { Button, Field, IconButton, Select, Slider, Switch } from '@recast/ui';
import { IconKeyframe, IconSparkle, IconTrash, IconX } from '@recast/ui';
import {
  suggestZooms,
  EASE_LABELS,
  formatClock,
  poseAt,
  type CursorSample,
  type EaseName,
  type FollowStep,
} from '@recast/editor';
import type { RecastProject, TransitionKind } from '@recast/shared';
import { useState } from 'react';
import { useApp, useEditor } from '../state/stores';
import { bridge } from '../lib/bridge';
import { relayoutProject } from './TimelineStrip';

/**
 * Motion panel: camera (zoom) controls, per-clip intro transitions & speed,
 * whole-video fades and cursor effects — the Screen-Studio-style animation
 * editing surface.
 */

const EASE_OPTIONS = (Object.keys(EASE_LABELS) as EaseName[]).map((value) => ({ value, label: EASE_LABELS[value] }));

const TRANSITION_OPTIONS: Array<{ value: TransitionKind; label: string }> = [
  { value: 'none', label: 'None — hard cut' },
  { value: 'fade', label: 'Fade in' },
  { value: 'slide-left', label: 'Slide from right' },
  { value: 'slide-up', label: 'Rise from bottom' },
  { value: 'zoom', label: 'Zoom settle' },
];

export function MotionPanel({
  project,
  zoomTrack,
  currentTimeUs,
  cursorSamples,
  cursorClicks,
  commit,
}: {
  project: RecastProject;
  zoomTrack: FollowStep[];
  currentTimeUs: number;
  cursorSamples: CursorSample[];
  cursorClicks: Array<{ tUs: number; x: number; y: number }>;
  commit: (p: RecastProject) => void;
}): React.ReactElement {
  const showToast = useApp((s) => s.showToast);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const setSelectedClip = useEditor((s) => s.setSelectedClip);
  const sel = project.timeline.clips.find((c) => c.id === selectedClipId) ?? null;

  const [suggestHeuristic, setSuggestHeuristic] = useState<'combined' | 'dwell' | 'clicks'>('clicks');

  const runSuggestZooms = async (): Promise<void> => {
    let samples = cursorSamples;
    let clicks = cursorClicks;
    if (samples.length < 10 && clicks.length === 0) {
      try {
        const data = (await bridge().invoke('capture:readCursor', { sessionId: project.id } as never)) as {
          samples?: CursorSample[];
          clicks?: Array<{ tUs: number; x: number; y: number }>;
        } | null;
        if (data?.samples && data.samples.length > 0) samples = data.samples;
        if (data?.clicks && data.clicks.length > 0) clicks = data.clicks;
      } catch {
        // fallback
      }
    }
    if (samples.length < 10 && clicks.length === 0) {
      showToast('No cursor data found in this recording to analyze.', 'error');
      return;
    }
    const suggested = suggestZooms(
      samples,
      clicks,
      project.media.width || 1920,
      project.media.height || 1080,
      {
        heuristic: suggestHeuristic,
        intensity: project.zoom.intensity,
      },
    );
    if (suggested.length === 0) {
      showToast('No high-confidence zoom points found.', 'info');
      return;
    }
    commit({
      ...project,
      zoom: {
        ...project.zoom,
        mode: 'manual',
        manualKeyframes: suggested,
      },
    });
    showToast(`${suggested.length} zoom suggestions applied as editable keyframes!`, 'success');
  };

  const updateClip = (fields: Partial<typeof sel & object>): void => {
    if (!sel) return;
    const clips = project.timeline.clips.map((c) => (c.id === sel.id ? { ...c, ...fields } : c));
    commit(relayoutProject(project, clips));
  };

  const addKeyframeAtPlayhead = (): void => {
    const pose = zoomTrack.length > 0 ? poseAt(zoomTrack, currentTimeUs) : null;
    const w = project.media.width || 1920;
    const h = project.media.height || 1080;
    commit({
      ...project,
      zoom: {
        ...project.zoom,
        mode: 'manual',
        manualKeyframes: [
          ...project.zoom.manualKeyframes,
          {
            id: `kf-${Date.now()}`,
            tUs: Math.round(currentTimeUs),
            zoom: Math.min(4, Math.max(1, pose?.scale ?? 1.6)),
            cx: pose?.cx ?? w / 2,
            cy: pose?.cy ?? h / 2,
            ease: 'out',
          },
        ],
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ Selected clip */}
      <section>
        <SectionTitle>Selected clip</SectionTitle>
        {sel ? (
          <div className="space-y-3 rounded-lg border border-hairline p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {sel.segmentId}
              </span>
              <span className="tabular" style={{ color: 'var(--text-muted)' }}>
                {formatClock(sel.sourceOutUs - sel.sourceInUs)} @ {sel.speed.toFixed(2)}×
              </span>
            </div>
            <Field label="Intro transition">
              <Select
                value={sel.transitionIn}
                onValueChange={(v) => updateClip({ transitionIn: v as TransitionKind })}
                options={TRANSITION_OPTIONS}
                ariaLabel="Intro transition"
              />
            </Field>
            {sel.transitionIn !== 'none' ? (
              <Field label={`Duration — ${sel.transitionMs} ms`}>
                <Slider
                  value={sel.transitionMs}
                  min={120}
                  max={1500}
                  step={30}
                  ariaLabel="Transition duration"
                  onValueChange={(v) => updateClip({ transitionMs: v })}
                />
              </Field>
            ) : null}
            <Field label={`Speed — ${sel.speed.toFixed(2)}×`}>
              <Slider
                value={sel.speed}
                min={0.25}
                max={4}
                step={0.05}
                ariaLabel="Clip speed"
                onValueChange={(v) => updateClip({ speed: v })}
              />
              <div className="flex items-center gap-1.5 mt-2">
                {[0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => updateClip({ speed: spd })}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-all cursor-pointer ${
                      Math.abs(sel.speed - spd) < 0.04
                        ? 'bg-accent text-white font-bold'
                        : 'bg-white/5 hover:bg-white/10 text-muted'
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  commit(relayoutProject(project, project.timeline.clips.filter((c) => c.id !== sel.id)));
                  setSelectedClip(null);
                }}
              >
                <span className="inline-flex items-center gap-2" style={{ color: 'var(--danger)' }}>
                  <IconTrash size={13} /> Delete clip
                </span>
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Click a clip in the timeline to edit its intro transition and speed.
          </p>
        )}
      </section>

      {/* ------------------------------------------------ Camera / zoom */}
      <section>
        <SectionTitle>Camera</SectionTitle>
        <div className="space-y-3">
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
          <div className="rounded-lg border border-hairline p-3 space-y-2">
            <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Zoom Intelligence
            </div>
            <div className="flex flex-col gap-2">
              <Select
                value={suggestHeuristic}
                onValueChange={(v) => setSuggestHeuristic(v as 'combined' | 'dwell' | 'clicks')}
                options={[
                  { value: 'clicks', label: 'Clicks only (Smart Auto-Zoom)' },
                  { value: 'combined', label: 'Clicks + Dwell pauses' },
                  { value: 'dwell', label: 'Dwell pause only' },
                ]}
                ariaLabel="Suggestion heuristic"
                fullWidth
              />
              <Button variant="primary" onClick={runSuggestZooms}>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <IconSparkle size={13} /> Suggest zooms
                </span>
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={addKeyframeAtPlayhead}>
              <span className="inline-flex items-center gap-2">
                <IconKeyframe size={14} /> Keyframe at playhead
              </span>
            </Button>
          </div>
          {project.zoom.mode === 'manual'
            ? project.zoom.manualKeyframes.map((kf) => (
                <div key={kf.id} className="rounded-lg border border-hairline p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="tabular">
                      {formatClock(kf.tUs)} · {kf.zoom.toFixed(2)}×
                    </span>
                    <IconButton
                      label="Remove keyframe"
                      danger
                      onClick={() =>
                        commit({
                          ...project,
                          zoom: { ...project.zoom, manualKeyframes: project.zoom.manualKeyframes.filter((k) => k.id !== kf.id) },
                        })
                      }
                    >
                      <IconX size={12} />
                    </IconButton>
                  </div>
                  <div className="mt-2">
                    <span style={{ color: 'var(--text-muted)' }}>Zoom</span>
                    <Slider
                      value={kf.zoom}
                      min={1}
                      max={4}
                      step={0.05}
                      ariaLabel="Keyframe zoom"
                      onValueChange={(v) =>
                        commit({
                          ...project,
                          zoom: {
                            ...project.zoom,
                            manualKeyframes: project.zoom.manualKeyframes.map((k) => (k.id === kf.id ? { ...k, zoom: v } : k)),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="mt-1">
                    <span style={{ color: 'var(--text-muted)' }}>Approach</span>
                    <Select
                      value={kf.ease}
                      onValueChange={(v) =>
                        commit({
                          ...project,
                          zoom: {
                            ...project.zoom,
                            manualKeyframes: project.zoom.manualKeyframes.map((k) => (k.id === kf.id ? { ...k, ease: v as EaseName } : k)),
                          },
                        })
                      }
                      options={EASE_OPTIONS}
                      ariaLabel="Keyframe easing"
                    />
                  </div>
                </div>
              ))
            : null}
        </div>
      </section>

      {/* ------------------------------------------------ Fades */}
      <section>
        <SectionTitle>Video fades</SectionTitle>
        <div className="space-y-3">
          <Field label={`Fade in — ${(project.animation?.fadeInMs ?? 0)} ms`}>
            <Slider
              value={project.animation?.fadeInMs ?? 0}
              min={0}
              max={2000}
              step={50}
              ariaLabel="Fade in"
              onValueChange={(v) => commit({ ...project, animation: { fadeInMs: v, fadeOutMs: project.animation?.fadeOutMs ?? 0 } })}
            />
          </Field>
          <Field label={`Fade out — ${(project.animation?.fadeOutMs ?? 0)} ms`}>
            <Slider
              value={project.animation?.fadeOutMs ?? 0}
              min={0}
              max={2000}
              step={50}
              ariaLabel="Fade out"
              onValueChange={(v) => commit({ ...project, animation: { fadeInMs: project.animation?.fadeInMs ?? 0, fadeOutMs: v } })}
            />
          </Field>
        </div>
      </section>

      {/* ------------------------------------------------ Cursor FX */}
      <section>
        <SectionTitle>Cursor effects</SectionTitle>
        <div className="space-y-3">
          <Field label="Release bounce">
            <Switch
              checked={project.style.cursor.clickBounce}
              onCheckedChange={(v) => commit({ ...project, style: { ...project.style, cursor: { ...project.style.cursor, clickBounce: v } } })}
              ariaLabel="Cursor release bounce"
            />
          </Field>
          <Field label="Motion trail">
            <Switch
              checked={project.style.cursor.trail}
              onCheckedChange={(v) => commit({ ...project, style: { ...project.style, cursor: { ...project.style.cursor, trail: v } } })}
              ariaLabel="Cursor motion trail"
            />
          </Field>
          <Field label={`Smoothing — ${Math.round((project.style.cursor.cursorSmoothing ?? 0) * 100)}%`}>
            <Slider
              value={project.style.cursor.cursorSmoothing ?? 0}
              min={0}
              max={1}
              step={0.05}
              ariaLabel="Cursor smoothing"
              onValueChange={(v) => commit({ ...project, style: { ...project.style, cursor: { ...project.style.cursor, cursorSmoothing: v } } })}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
      {children}
    </div>
  );
}
