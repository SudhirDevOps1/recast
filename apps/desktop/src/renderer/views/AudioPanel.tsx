import { Field, Slider, Switch } from '@recast/ui';
import type { RecastProject } from '@recast/shared';

/**
 * Audio panel: gain, fades, noise gate and loudness normalization.
 * Edits live in `project.audioEdits`; gain/gate/fades are applied in the
 * renderer during export, normalization runs as a post-pass (ffmpeg loudnorm).
 */
export function AudioPanel({
  project,
  commit,
}: {
  project: RecastProject;
  commit: (p: RecastProject) => void;
}): React.ReactElement {
  const edits = project.audioEdits;
  const gateOn = edits.noiseGateDb != null;

  const setEdits = (patch: Partial<RecastProject['audioEdits']>): void => {
    commit({ ...project, audioEdits: { ...edits, ...patch } });
  };

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Level</SectionTitle>
        <Field label={`Gain — ${edits.gainDb > 0 ? '+' : ''}${edits.gainDb.toFixed(1)} dB`}>
          <Slider
            value={edits.gainDb}
            min={-24}
            max={12}
            step={0.5}
            ariaLabel="Audio gain"
            onValueChange={(v) => setEdits({ gainDb: v })}
          />
        </Field>
      </section>

      <section>
        <SectionTitle>Fades</SectionTitle>
        <Field label={`Fade in — ${edits.fadeInMs} ms`}>
          <Slider
            value={edits.fadeInMs}
            min={0}
            max={2000}
            step={50}
            ariaLabel="Audio fade in"
            onValueChange={(v) => setEdits({ fadeInMs: v })}
          />
        </Field>
        <Field label={`Fade out — ${edits.fadeOutMs} ms`}>
          <Slider
            value={edits.fadeOutMs}
            min={0}
            max={2000}
            step={50}
            ariaLabel="Audio fade out"
            onValueChange={(v) => setEdits({ fadeOutMs: v })}
          />
        </Field>
      </section>

      <section>
        <SectionTitle>Cleanup</SectionTitle>
        <Field label="Noise gate">
          <Switch
            checked={gateOn}
            onCheckedChange={(v) => setEdits({ noiseGateDb: v ? -38 : undefined })}
            ariaLabel="Noise gate enabled"
          />
        </Field>
        {gateOn ? (
          <Field label={`Gate threshold — ${edits.noiseGateDb} dB`}>
            <Slider
              value={edits.noiseGateDb ?? -38}
              min={-60}
              max={-20}
              step={1}
              ariaLabel="Noise gate threshold"
              onValueChange={(v) => setEdits({ noiseGateDb: v })}
            />
          </Field>
        ) : null}
        <Field label="Normalize to −14 LUFS">
          <Switch
            checked={edits.normalizeLufs}
            onCheckedChange={(v) => setEdits({ normalizeLufs: v })}
            ariaLabel="Normalize loudness"
          />
        </Field>
        <p className="mt-1 text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
          Normalization runs at export when FFmpeg is available (Settings → Media engine).
        </p>
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
