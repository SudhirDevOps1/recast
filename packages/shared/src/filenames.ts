import type { ExportFormat } from './constants';

// eslint-disable-next-line no-control-regex -- stripping control chars is the whole point
const ILLEGAL = /[/\\:*?"<>|\u0000-\u001F]/g;

/** Strip filesystem-unsafe characters and control chars; trim trailing dots/spaces (Windows). */
export function sanitizeFilename(input: string): string {
  let s = input.replace(ILLEGAL, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // A separator that landed right before an extension: "my demo file .mp4" → "my demo file.mp4"
  s = s.replace(/ \./g, '.');
  s = s.replace(/\.+$/, '').trim();
  if (!s) s = 'untitled';
  return s.slice(0, 120);
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** `yyyyMMdd-HHmm` stamp used in export names. */
export function timestampStamp(d = new Date()): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

export const FORMAT_EXT: Record<ExportFormat, string> = {
  mp4: 'mp4',
  webm: 'webm',
  hevc: 'mp4',
  prores: 'mov',
  gif: 'gif',
};

/**
 * `recast-{project}-{yyyyMMdd-HHmm}.{ext}` — sanitized, de-duplicated against
 * files that already exist in the destination.
 */
export function buildExportName(
  projectName: string,
  format: ExportFormat,
  now = new Date(),
  existing: string[] = [],
): string {
  const base = sanitizeFilename(projectName).toLowerCase().replace(/\s+/g, '-');
  const stem = `recast-${base}-${timestampStamp(now)}`;
  const ext = FORMAT_EXT[format];
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  let name = `${stem}.${ext}`;
  let i = 2;
  while (taken.has(name.toLowerCase())) {
    name = `${stem}-${i}.${ext}`;
    i += 1;
  }
  return name;
}

/** De-duplicate an arbitrary file stem against existing names: `name (2).ext`. */
export function dedupeName(stem: string, ext: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(`${stem}.${ext}`.toLowerCase())) return `${stem}.${ext}`;
  let i = 2;
  while (taken.has(`${stem} (${i}).${ext}`.toLowerCase())) i += 1;
  return `${stem} (${i}).${ext}`;
}
