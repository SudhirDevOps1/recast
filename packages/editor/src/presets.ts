import { StylePresetSchema, type StylePreset } from '@recast/shared';

/**
 * `.recaststyle` serialization. Import always validates with the schema —
 * a malformed preset never reaches the editor (and is applied as one undo
 * step by the caller).
 */
export function serializeStyle(preset: StylePreset): string {
  return JSON.stringify(preset, null, 2);
}

export function parseStyle(json: string): { preset: StylePreset | null; error: string | null } {
  try {
    const raw: unknown = JSON.parse(json);
    const parsed = StylePresetSchema.safeParse(raw);
    if (!parsed.success) {
      return { preset: null, error: `Invalid .recaststyle: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}` };
    }
    return { preset: parsed.data, error: null };
  } catch (e) {
    return { preset: null, error: `Invalid JSON: ${(e as Error).message}` };
  }
}

/** Naming for exported files: recast-{preset}.recaststyle */
export function styleFileName(preset: StylePreset): string {
  return `${preset.id || preset.name.toLowerCase().replace(/\s+/g, '-')}.recaststyle`;
}
