import { Button, Field, Slider, Switch } from '@recast/ui';
import { IconRefresh, IconTrash } from '@recast/ui';
import type { RecastProject } from '@recast/shared';

interface CropPanelProps {
  project: RecastProject;
  commit: (p: RecastProject) => void;
}

export function CropPanel({ project, commit }: CropPanelProps): React.ReactElement {
  const mediaW = project.media.width || 1920;
  const mediaH = project.media.height || 1080;
  const crop = project.crop;
  const isEnabled = crop != null;

  const activeCrop = crop ?? {
    x: 0,
    y: 0,
    w: mediaW,
    h: mediaH,
  };

  const handleToggle = (enabled: boolean): void => {
    if (enabled) {
      commit({
        ...project,
        crop: {
          x: Math.round(mediaW * 0.05),
          y: Math.round(mediaH * 0.05),
          w: Math.round(mediaW * 0.9),
          h: Math.round(mediaH * 0.9),
        },
      });
    } else {
      commit({
        ...project,
        crop: null,
      });
    }
  };

  const updateCrop = (patch: Partial<typeof activeCrop>): void => {
    const updated = { ...activeCrop, ...patch };
    // Clamp to media bounds
    const x = Math.max(0, Math.min(mediaW - 50, updated.x));
    const y = Math.max(0, Math.min(mediaH - 50, updated.y));
    const w = Math.max(50, Math.min(mediaW - x, updated.w));
    const h = Math.max(50, Math.min(mediaH - y, updated.h));
    commit({
      ...project,
      crop: { x, y, w, h },
    });
  };

  const applyAspect = (ar: number): void => {
    let w = mediaW;
    let h = Math.round(w / ar);
    if (h > mediaH) {
      h = mediaH;
      w = Math.round(h * ar);
    }
    const x = Math.round((mediaW - w) / 2);
    const y = Math.round((mediaH - h) / 2);
    commit({
      ...project,
      crop: { x, y, w, h },
    });
  };

  return (
    <div className="space-y-4">
      <Field label="Frame crop">
        <Switch checked={isEnabled} onCheckedChange={handleToggle} ariaLabel="Enable frame cropping" />
      </Field>

      {!isEnabled ? (
        <div className="rounded-lg border border-hairline p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Frame cropping lets you cut out taskbars, window borders, or unwanted screen areas after recording. The editor will center and zoom the remaining content seamlessly.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Aspect ratio presets
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: '16:9', ar: 16 / 9 },
                { label: '4:3', ar: 4 / 3 },
                { label: '1:1', ar: 1 },
                { label: '9:16', ar: 9 / 16 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyAspect(p.ar)}
                  className="px-2 py-1.5 text-xs font-semibold rounded border border-white/10 hover:border-accent hover:text-accent transition-all cursor-pointer bg-white/5"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <Field label={`Horizontal offset — ${activeCrop.x} px`}>
            <Slider
              value={activeCrop.x}
              min={0}
              max={Math.max(0, mediaW - 100)}
              step={2}
              ariaLabel="Crop X offset"
              onValueChange={(x) => updateCrop({ x })}
            />
          </Field>

          <Field label={`Vertical offset — ${activeCrop.y} px`}>
            <Slider
              value={activeCrop.y}
              min={0}
              max={Math.max(0, mediaH - 100)}
              step={2}
              ariaLabel="Crop Y offset"
              onValueChange={(y) => updateCrop({ y })}
            />
          </Field>

          <Field label={`Width — ${activeCrop.w} px`}>
            <Slider
              value={activeCrop.w}
              min={100}
              max={mediaW}
              step={2}
              ariaLabel="Crop width"
              onValueChange={(w) => updateCrop({ w })}
            />
          </Field>

          <Field label={`Height — ${activeCrop.h} px`}>
            <Slider
              value={activeCrop.h}
              min={100}
              max={mediaH}
              step={2}
              ariaLabel="Crop height"
              onValueChange={(h) => updateCrop({ h })}
            />
          </Field>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() =>
                commit({
                  ...project,
                  crop: { x: 0, y: 0, w: mediaW, h: mediaH },
                })
              }
            >
              <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
                <IconRefresh size={12} /> Fit full screen
              </span>
            </Button>

            <Button
              variant="ghost"
              onClick={() => commit({ ...project, crop: null })}
            >
              <span className="inline-flex items-center gap-1.5 text-xs text-danger">
                <IconTrash size={12} /> Remove crop
              </span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
