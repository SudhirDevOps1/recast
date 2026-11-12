import { useEffect, useState } from 'react';
import { Button, ColorPicker, Field, Select, Slider, Switch, IconDownload, IconUpload } from '@recast/ui';
import type { RecastProject, StylePreset } from '@recast/shared';
import { BUILTIN_PRESETS } from '@recast/shared';
import { useApp } from '../state/stores';
import { bridge } from '../lib/bridge';

/**
 * Design panel: presets, aspect, frame chrome and full background control
 * (solid / gradient / mesh / echo with color pickers), plus the complete
 * cursor styling surface (look, colors, ripple, press scale, idle fade).
 */

const GRADIENT_PRESETS: Array<{ name: string; from: string; to: string; angleDeg: number }> = [
  { name: 'Aurora', from: '#6366F1', to: '#0EA5E9', angleDeg: 135 },
  { name: 'Sunset', from: '#F97316', to: '#DB2777', angleDeg: 160 },
  { name: 'Ember', from: '#7C2D12', to: '#F59E0B', angleDeg: 200 },
  { name: 'Mint', from: '#10B981', to: '#064E3B', angleDeg: 150 },
  { name: 'Violet', from: '#7C3AED', to: '#1E1B4B', angleDeg: 135 },
  { name: 'Slate', from: '#334155', to: '#0F172A', angleDeg: 180 },
];

export function StylePanel({
  project,
  commit,
}: {
  project: RecastProject;
  commit: (p: RecastProject) => void;
}): React.ReactElement {
  const showToast = useApp((s) => s.showToast);
  const style = project.style;

  const setStyle = (patch: Partial<StylePreset>): void => commit({ ...project, style: { ...style, ...patch } });
  const setFrame = (patch: Partial<StylePreset['frame']>): void => setStyle({ frame: { ...style.frame, ...patch } });
  const setBackground = (patch: Partial<StylePreset['frame']['background']>): void =>
    setFrame({ background: { ...style.frame.background, ...patch } });
  const setCursor = (patch: Partial<StylePreset['cursor']>): void => setStyle({ cursor: { ...style.cursor, ...patch } });

  const bg = style.frame.background;

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Preset</SectionTitle>
        <Field label="Style preset">
          <Select
            value={BUILTIN_PRESETS.some((p) => p.id === style.id) ? style.id : 'custom'}
            onValueChange={(v) => {
              const preset = BUILTIN_PRESETS.find((p) => p.id === v);
              if (preset) {
                commit({
                  ...project,
                  style: {
                    ...preset,
                    facecam: {
                      ...preset.facecam,
                      enabled: project.media.camera ? (project.style.facecam.enabled ?? true) : false,
                    },
                  },
                });
              }
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
            onValueChange={(v) => setStyle({ aspect: v })}
            options={[
              { value: 'source', label: 'Source' },
              { value: '16:9', label: '16:9' },
              { value: '9:16', label: '9:16 vertical' },
              { value: '1:1', label: '1:1 square' },
              { value: '4:5', label: '4:5 portrait' },
              { value: '21:9', label: '21:9 wide' },
              { value: 'custom', label: 'Custom…' },
            ]}
            ariaLabel="Aspect ratio"
          />
        </Field>
        {style.aspect === 'custom' ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <NumberBox
              label="Width"
              value={style.aspectCustom?.w ?? 1920}
              onCommit={(w) => setStyle({ aspectCustom: { w, h: style.aspectCustom?.h ?? 1080 } })}
            />
            <span style={{ color: 'var(--text-muted)' }}>×</span>
            <NumberBox
              label="Height"
              value={style.aspectCustom?.h ?? 1080}
              onCommit={(h) => setStyle({ aspectCustom: { w: style.aspectCustom?.w ?? 1920, h } })}
            />
          </div>
        ) : null}
      </section>

      <section>
        <SectionTitle>Frame</SectionTitle>
        <Field label={`Padding — ${style.frame.paddingPx} px`}>
          <Slider value={style.frame.paddingPx} min={0} max={160} ariaLabel="Padding" onValueChange={(v) => setFrame({ paddingPx: v })} />
        </Field>
        <Field label={`Corner radius — ${style.frame.radiusPx} px`}>
          <Slider value={style.frame.radiusPx} min={0} max={80} ariaLabel="Corner radius" onValueChange={(v) => setFrame({ radiusPx: v })} />
        </Field>
        <Field label={`Border — ${style.frame.borderWidthPx} px`}>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Slider
                value={style.frame.borderWidthPx}
                min={0}
                max={16}
                ariaLabel="Border width"
                onValueChange={(v) => setFrame({ borderWidthPx: v })}
              />
            </div>
            <ColorPicker value={style.frame.borderColor} onChange={(borderColor) => setFrame({ borderColor })} ariaLabel="Border color" />
          </div>
        </Field>
        <Field label="Shadow">
          <Select
            value={style.frame.shadow}
            onValueChange={(v) => setFrame({ shadow: v as StylePreset['frame']['shadow'] })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'soft', label: 'Soft' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
            ariaLabel="Shadow"
          />
        </Field>

        <Field label="Window titlebar">
          <Switch
            checked={style.frame.windowChrome?.enabled ?? false}
            onCheckedChange={(enabled) =>
              setFrame({
                windowChrome: {
                  ...(style.frame.windowChrome ?? {
                    style: 'macos-dark',
                    title: '',
                    heightPx: 34,
                    showButtons: true,
                  }),
                  enabled,
                },
              })
            }
            ariaLabel="Window chrome"
          />
        </Field>
        {style.frame.windowChrome?.enabled ? (
          <>
            <Field label="Chrome style">
              <Select
                value={style.frame.windowChrome.style ?? 'macos-dark'}
                onValueChange={(s) =>
                  setFrame({
                    windowChrome: {
                      ...style.frame.windowChrome!,
                      style: s as import('@recast/shared').WindowChromeStyle,
                    },
                  })
                }
                options={[
                  { value: 'macos-dark', label: 'macOS Dark' },
                  { value: 'macos-light', label: 'macOS Light' },
                  { value: 'glass', label: 'Glass Blur' },
                  { value: 'windows', label: 'Windows 11' },
                ]}
                ariaLabel="Chrome style"
              />
            </Field>
            <Field label="Window title">
              <input
                type="text"
                value={style.frame.windowChrome.title ?? ''}
                placeholder="e.g. My App, Terminal, Safari"
                onChange={(e) =>
                  setFrame({
                    windowChrome: {
                      ...style.frame.windowChrome!,
                      title: e.target.value,
                    },
                  })
                }
                className="w-full rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent"
              />
            </Field>
            <Field label="Window buttons">
              <Switch
                checked={style.frame.windowChrome.showButtons ?? true}
                onCheckedChange={(showButtons) =>
                  setFrame({
                    windowChrome: {
                      ...style.frame.windowChrome!,
                      showButtons,
                    },
                  })
                }
                ariaLabel="Window buttons"
              />
            </Field>
          </>
        ) : null}
      </section>

      <section>
        <SectionTitle>Background</SectionTitle>
        <Field label="Type">
          <Select
            value={bg.type}
            onValueChange={(v) => {
              const t = v as StylePreset['frame']['background']['type'];
              if (t === 'gradient') setBackground({ type: t, gradient: bg.gradient ?? { from: '#1B2030', to: '#0E1015', angleDeg: 160 } });
              else if (t === 'solid') setBackground({ type: t, color: bg.color ?? '#101418' });
              else if (t === 'procedural') setBackground({ type: t, procedural: bg.procedural ?? { preset: 'aurora', animationSpeed: 0 } });
              else if (t === 'echo') setBackground({ type: t, echo: bg.echo ?? { blurPx: 48, dim: 0.35, scale: 1.1 } });
              else setBackground({ type: t });
            }}
            options={[
              { value: 'transparent', label: 'Transparent' },
              { value: 'solid', label: 'Solid color' },
              { value: 'procedural', label: 'Studio Wallpapers' },
              { value: 'gradient', label: 'Gradient' },
              { value: 'mesh', label: 'Mesh gradient' },
              { value: 'echo', label: 'Blurred echo' },
              { value: 'image', label: 'Image…' },
            ]}
            ariaLabel="Background type"
          />
        </Field>
        {bg.type === 'procedural' ? (
          <Field label="Wallpaper theme">
            <Select
              value={bg.procedural?.preset ?? 'aurora'}
              onValueChange={(p) =>
                setBackground({
                  procedural: {
                    preset: p as 'aurora' | 'sunset' | 'midnight' | 'cyber' | 'obsidian',
                    animationSpeed: 0,
                  },
                })
              }
              options={[
                { value: 'aurora', label: 'Aurora Borealis' },
                { value: 'sunset', label: 'Sunset Mirage' },
                { value: 'midnight', label: 'Midnight Cyan' },
                { value: 'cyber', label: 'Cyber Synthwave' },
                { value: 'obsidian', label: 'Obsidian Studio' },
              ]}
              ariaLabel="Wallpaper theme"
            />
          </Field>
        ) : null}

        <Field label="Dot pattern overlay">
          <Switch
            checked={bg.dotGrid?.enabled ?? false}
            onCheckedChange={(enabled) =>
              setBackground({
                dotGrid: {
                  ...(bg.dotGrid ?? {
                    color: 'rgba(255, 255, 255, 0.08)',
                    sizePx: 2,
                    spacingPx: 24,
                    style: 'dots',
                  }),
                  enabled,
                },
              })
            }
            ariaLabel="Dot pattern overlay"
          />
        </Field>
        {bg.dotGrid?.enabled ? (
          <>
            <Field label="Pattern style">
              <Select
                value={bg.dotGrid.style ?? 'dots'}
                onValueChange={(st) =>
                  setBackground({
                    dotGrid: {
                      ...bg.dotGrid!,
                      style: st as 'dots' | 'grid' | 'crosses',
                    },
                  })
                }
                options={[
                  { value: 'dots', label: 'Dots' },
                  { value: 'grid', label: 'Grid lines' },
                  { value: 'crosses', label: 'Crosses' },
                ]}
                ariaLabel="Pattern style"
              />
            </Field>
            <Field label={`Spacing — ${bg.dotGrid.spacingPx} px`}>
              <Slider
                value={bg.dotGrid.spacingPx}
                min={12}
                max={64}
                step={2}
                ariaLabel="Dot spacing"
                onValueChange={(spacingPx) =>
                  setBackground({
                    dotGrid: {
                      ...bg.dotGrid!,
                      spacingPx,
                    },
                  })
                }
              />
            </Field>
          </>
        ) : null}
        {bg.type === 'image' ? (
          <div className="space-y-2">
            {bg.imageFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-hairline p-2">
                <img
                  src={`recast-media://local/${bg.imageFile.split(/[\\/]/).map(encodeURIComponent).join('/')}`}
                  alt="Background"
                  className="h-14 w-24 rounded-md object-cover"
                  style={{ background: 'var(--bg-sunken)' }}
                />
                <div className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                  {bg.imageFile.split(/[\\/]/).pop()}
                </div>
                <Button size="sm" onClick={() => setBackground({ imageFile: undefined })} aria-label="Remove background image">
                  Remove
                </Button>
              </div>
            ) : null}
            <Button
              className="w-full"
              onClick={async () => {
                const r = await bridge().invoke('styles:pickBackgroundImage', { projectId: project.id });
                if (r.path) setBackground({ type: 'image', imageFile: r.path });
                else if (r.error) showToast(r.error, 'error');
              }}
            >
              <span className="inline-flex items-center gap-2">
                <IconUpload size={14} /> {bg.imageFile ? 'Change image…' : 'Choose image…'}
              </span>
            </Button>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              The image is copied into the session folder and travels with the recording.
            </p>
          </div>
        ) : null}
        {bg.type === 'solid' ? (
          <Field label="Color">
            <ColorPicker value={bg.color ?? '#101418'} onChange={(color) => setBackground({ color })} ariaLabel="Background color" />
          </Field>
        ) : null}
        {bg.type === 'gradient' && bg.gradient ? (
          <>
            <div className="flex items-center gap-3">
              <ColorPicker value={bg.gradient.from} onChange={(from) => setBackground({ gradient: { ...bg.gradient!, from } })} ariaLabel="Gradient start" />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>to</span>
              <ColorPicker value={bg.gradient.to} onChange={(to) => setBackground({ gradient: { ...bg.gradient!, to } })} ariaLabel="Gradient end" />
            </div>
            <Field label={`Angle — ${bg.gradient.angleDeg}°`}>
              <Slider
                value={bg.gradient.angleDeg}
                min={0}
                max={360}
                step={5}
                ariaLabel="Gradient angle"
                onValueChange={(v) => setBackground({ gradient: { ...bg.gradient!, angleDeg: v } })}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              {GRADIENT_PRESETS.map((g) => (
                <button
                  key={g.name}
                  type="button"
                  title={g.name}
                  aria-label={`Gradient ${g.name}`}
                  onClick={() => setBackground({ gradient: { from: g.from, to: g.to, angleDeg: g.angleDeg } })}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 6,
                    border: '1px solid var(--hairline-strong)',
                    background: `linear-gradient(${g.angleDeg}deg, ${g.from}, ${g.to})`,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </>
        ) : null}
        {bg.type === 'echo' && bg.echo ? (
          <>
            <Field label={`Blur — ${bg.echo.blurPx} px`}>
              <Slider value={bg.echo.blurPx} min={0} max={120} ariaLabel="Echo blur" onValueChange={(v) => setBackground({ echo: { ...bg.echo!, blurPx: v } })} />
            </Field>
            <Field label={`Dim — ${Math.round(bg.echo.dim * 100)}%`}>
              <Slider value={bg.echo.dim} min={0} max={1} step={0.05} ariaLabel="Echo dim" onValueChange={(v) => setBackground({ echo: { ...bg.echo!, dim: v } })} />
            </Field>
            <Field label={`Backdrop scale — ${bg.echo.scale.toFixed(2)}×`}>
              <Slider value={bg.echo.scale} min={1} max={2} step={0.05} ariaLabel="Echo scale" onValueChange={(v) => setBackground({ echo: { ...bg.echo!, scale: v } })} />
            </Field>
          </>
        ) : null}
        {bg.type === 'mesh' ? (
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Mesh gradients render from the accent palette — try a preset for different moods.
          </p>
        ) : null}
      </section>

      <section>
        <SectionTitle>Cursor</SectionTitle>
        <Field label="Look">
          <Select
            value={style.cursor.look}
            onValueChange={(v) => setCursor({ look: v as StylePreset['cursor']['look'] })}
            options={[
              { value: 'pointer', label: 'Rendered pointer' },
              { value: 'dot', label: 'Dot' },
              { value: 'circle', label: 'Circle' },
              { value: 'native', label: 'Native arrow' },
              { value: 'none', label: 'Hidden (no cursor)' },
            ]}
            ariaLabel="Cursor look"
          />
        </Field>
        <Field label={`Size — ${style.cursor.sizePx} px`}>
          <Slider value={style.cursor.sizePx} min={8} max={96} ariaLabel="Cursor size" onValueChange={(v) => setCursor({ sizePx: v })} />
        </Field>
        <Field label="Colors">
          <div className="flex items-center gap-3">
            <ColorPicker value={style.cursor.color} onChange={(color) => setCursor({ color })} ariaLabel="Cursor color" />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>outline</span>
            <ColorPicker value={style.cursor.outlineColor} onChange={(outlineColor) => setCursor({ outlineColor })} ariaLabel="Cursor outline color" />
          </div>
        </Field>
        <Field label={`Outline — ${style.cursor.outlineWidthPx} px`}>
          <Slider value={style.cursor.outlineWidthPx} min={0} max={8} step={0.5} ariaLabel="Cursor outline width" onValueChange={(v) => setCursor({ outlineWidthPx: v })} />
        </Field>
        <Field label="Drop shadow">
          <Switch checked={style.cursor.shadow} onCheckedChange={(v) => setCursor({ shadow: v })} ariaLabel="Cursor shadow" />
        </Field>
        <Field label="Click ripple">
          <Switch checked={style.cursor.ripple} onCheckedChange={(v) => setCursor({ ripple: v })} ariaLabel="Click ripple" />
        </Field>
        {style.cursor.ripple ? (
          <Field label="Ripple color">
            <ColorPicker value={style.cursor.rippleColor ?? '#FFFFFF'} onChange={(rippleColor) => setCursor({ rippleColor })} ariaLabel="Ripple color" />
          </Field>
        ) : null}
        <Field label={`Press scale — ${style.cursor.pressScale.toFixed(2)}×`}>
          <Slider value={style.cursor.pressScale} min={0.6} max={1.4} step={0.05} ariaLabel="Press scale" onValueChange={(v) => setCursor({ pressScale: v })} />
        </Field>
        <Field label={`Idle fade — ${style.cursor.idleFadeMs === 0 ? 'never' : `${style.cursor.idleFadeMs} ms`}`}>
          <Slider value={style.cursor.idleFadeMs} min={0} max={5000} step={100} ariaLabel="Idle fade" onValueChange={(v) => setCursor({ idleFadeMs: v })} />
        </Field>
        <Field label={`Motion smoothing — ${Math.round(style.cursor.cursorSmoothing * 100)}%`}>
          <Slider value={style.cursor.cursorSmoothing ?? 0} min={0} max={1} step={0.05} ariaLabel="Cursor smoothing" onValueChange={(v) => setCursor({ cursorSmoothing: v })} />
        </Field>
        <Field label="Motion trail">
          <Switch checked={style.cursor.trail ?? false} onCheckedChange={(v) => setCursor({ trail: v })} ariaLabel="Cursor motion trail" />
        </Field>
        <Field label="Click bounce">
          <Switch checked={style.cursor.clickBounce ?? false} onCheckedChange={(v) => setCursor({ clickBounce: v })} ariaLabel="Click bounce" />
        </Field>
        <Field label="Radar wave rings">
          <Switch checked={style.cursor.radarRings ?? false} onCheckedChange={(radarRings) => setCursor({ radarRings })} ariaLabel="Radar wave rings" />
        </Field>
        {style.cursor.radarRings ? (
          <>
            <Field label="Radar wave color">
              <ColorPicker value={style.cursor.radarColor ?? '#7C8CF8'} onChange={(radarColor) => setCursor({ radarColor })} ariaLabel="Radar wave color" />
            </Field>
            <Field label={`Radar ring count — ${style.cursor.radarRingCount ?? 3}`}>
              <Slider value={style.cursor.radarRingCount ?? 3} min={1} max={4} step={1} ariaLabel="Radar ring count" onValueChange={(radarRingCount) => setCursor({ radarRingCount })} />
            </Field>
          </>
        ) : null}
        <Field label="Cursor spotlight">
          <Switch checked={style.cursor.spotlight ?? false} onCheckedChange={(spotlight) => setCursor({ spotlight })} ariaLabel="Cursor spotlight" />
        </Field>
        {style.cursor.spotlight ? (
          <>
            <Field label={`Spotlight radius — ${style.cursor.spotlightRadiusPx ?? 120} px`}>
              <Slider value={style.cursor.spotlightRadiusPx ?? 120} min={40} max={260} step={5} ariaLabel="Spotlight radius" onValueChange={(spotlightRadiusPx) => setCursor({ spotlightRadiusPx })} />
            </Field>
            <Field label={`Spotlight dim — ${Math.round((style.cursor.spotlightOpacity ?? 0.45) * 100)}%`}>
              <Slider value={style.cursor.spotlightOpacity ?? 0.45} min={0.15} max={0.85} step={0.05} ariaLabel="Spotlight opacity" onValueChange={(spotlightOpacity) => setCursor({ spotlightOpacity })} />
            </Field>
          </>
        ) : null}
      </section>

      <div className="flex gap-2 pt-1">
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

function NumberBox({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }): React.ReactElement {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="inline-flex items-center gap-1.5">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input
        type="number"
        min={16}
        max={8192}
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && n >= 16 && n <= 8192) onCommit(Math.round(n));
          else setDraft(String(value));
        }}
        className="tabular"
        style={{
          width: 76,
          padding: '4px 8px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--hairline-strong)',
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          fontSize: 12,
          outline: 'none',
        }}
      />
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
      {children}
    </div>
  );
}
