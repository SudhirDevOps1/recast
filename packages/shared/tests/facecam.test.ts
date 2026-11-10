import { describe, expect, it } from 'vitest';
import { RecastProjectSchema } from '../src/project';
import { StylePresetSchema, DEFAULT_FACECAM, BUILTIN_PRESETS } from '../src/style';
import { makeEmptyProject } from '../src/project';

describe('facecam schema backward compatibility', () => {
  it('an old .recaststyle without facecam parses with the default facecam block', () => {
    const oldPreset = JSON.parse(JSON.stringify(BUILTIN_PRESETS[0])) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (oldPreset as any).facecam;
    const parsed = StylePresetSchema.safeParse(oldPreset);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.facecam).toEqual(DEFAULT_FACECAM);
    }
  });

  it('a project manifest without media.camera defaults to null', () => {
    const project = makeEmptyProject('prj-x', 'Test', new Date().toISOString(), BUILTIN_PRESETS[0]!);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = JSON.parse(JSON.stringify(project)) as any;
    delete raw.media.camera;
    const parsed = RecastProjectSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.media.camera).toBeNull();
    }
  });

  it('facecam rejects out-of-range values (UI sliders own the clamping)', () => {
    const parsed = StylePresetSchema.safeParse({
      ...BUILTIN_PRESETS[0],
      facecam: { enabled: true, widthFraction: 5, marginFraction: -3 },
    });
    expect(parsed.success).toBe(false);
  });
});

