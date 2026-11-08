import { Button, Field, IconButton, Select, Slider, Switch } from '@recast/ui';
import { IconKeyframe, IconSparkle, IconTrash, IconX } from '@recast/ui';
import {
  computeAutoZoom,
  EASE_LABELS,
  formatClock,
  poseAt,
  type CursorSample,
  type EaseName,
  type FollowStep,
} from '@recast/editor';
import type { RecastProject, TransitionKind } from '@recast/shared';
import { useApp, useEditor } from '../state/stores';
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

  const recalcAuto = (): void => {
    if (cursorSamples.length < 20) return;
    const kfs = computeAutoZoom(cursorSamples, cursorClicks, project.media.width || 1920, project.media.height || 1080, project.zoom.intensity);
    commit({ ...project, zoom: { ...project.zoom, mode: 'auto', autoKeyframes: kfs } });
    showToast(`Auto zoom rebuilt — ${kfs.length} keyframes.`, 'success');
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
          <div className="flex gap-2">
            <Button onClick={recalcAuto} disabled={cursorSamples.length < 20}>
              <span className="inline-flex items-center gap-2">
                <IconSparkle size={14} /> Recompute auto zoom
              </span>
            </Button>
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
