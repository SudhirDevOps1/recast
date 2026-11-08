import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  RecastProjectSchema,
  makeEmptyProject,
  getBuiltinPreset,
  DEFAULT_PRESET_ID,
  buildExportName,
  type RecastProject,
} from '@recast/shared';
import { computeAutoZoom, type CursorSample } from '@recast/editor';
import { atomicWrite, readProjectFile, projectFilePath } from './store';
import { recordingsDir } from './paths';
import { settingsStore } from './context';

/**
 * `.recast` project files: human-readable JSON at schemaVersion 1, written
 * atomically on every autosave (5 s). Cursor JSONL is parsed into samples and
 * clicks; auto-zoom keyframes are computed at project creation so the editor
 * opens with zoom already applied.
 */

export function loadProject(id: string): RecastProject | null {
  const raw = readProjectFile(id);
  if (!raw) return null;
  try {
    return RecastProjectSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveProject(project: RecastProject): void {
  const clean = RecastProjectSchema.parse(project);
  clean.updatedAt = new Date().toISOString();
  atomicWrite(projectFilePath(clean.id), JSON.stringify(clean, null, 2));
}

export function readCursorJsonl(sessionDir: string, file = 'cursor.jsonl'): {
  samples: CursorSample[];
  clicks: Array<{ tUs: number; x: number; y: number }>;
} {
  const samples: CursorSample[] = [];
  const clicks: Array<{ tUs: number; x: number; y: number }> = [];
  const p = join(sessionDir, file);
  if (!existsSync(p)) return { samples, clicks };
  const lines = readFileSync(p, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as { tUs: number; type: string; x?: number; y?: number };
      if (e.type === 'move' && e.x != null && e.y != null) {
        samples.push({ tUs: e.tUs, x: e.x, y: e.y });
      } else if (e.type === 'down' && e.x != null && e.y != null) {
        clicks.push({ tUs: e.tUs, x: e.x, y: e.y });
        samples.push({ tUs: e.tUs, x: e.x, y: e.y });
      }
    } catch {
      /* skip malformed line */
    }
  }
  return { samples, clicks };
}

export interface BuildProjectInput {
  sessionId: string;
  manifest: import('@recast/shared').SessionManifest;
  name?: string;
}

/** Manifest + cursor data → a ready-to-edit project with auto-zoom applied. */
export function buildProjectFromSession(input: BuildProjectInput): RecastProject {
  const { sessionId, manifest } = input;
  const settings = settingsStore();
  const preset = getBuiltinPreset(settings.defaultPresetId) ?? getBuiltinPreset(DEFAULT_PRESET_ID)!;
  const now = new Date().toISOString();
  const project = makeEmptyProject(`prj-${sessionId}`, input.name ?? `Recording ${new Date().toLocaleString()}`, now, preset);

  project.media = {
    dir: recordingsDir(),
    width: manifest.video.width,
    height: manifest.video.height,
    fps: manifest.video.fps,
    segments: manifest.screen.segments,
    audio: manifest.audio
      ? { file: manifest.audio.file, startUs: 0, endUs: manifest.screen.segments.at(-1)?.endUs ?? 0 }
      : null,
    cursor: { file: 'cursor.jsonl', available: existsSync(join(recordingsDir(), sessionId, 'cursor.jsonl')) },
  };

  // Timeline: one clip per segment, back to back.
  let t = 0;
  project.timeline.clips = manifest.screen.segments.map((seg) => ({
    id: `clip-${seg.id}`,
    segmentId: seg.id,
    track: 'screen' as const,
    sourceInUs: seg.startUs,
    sourceOutUs: seg.endUs,
    timelineInUs: t,
    speed: 1,
    transitionIn: 'none' as const,
    transitionMs: 450,
  }));
  t = manifest.screen.segments.reduce((acc, seg) => acc + (seg.endUs - seg.startUs), 0);
  project.timeline.durationUs = t;

  // Cursor → auto-zoom keyframes.
  if (project.media.cursor?.available) {
    const { samples, clicks } = readCursorJsonl(project.media.dir);
    if (samples.length > 20) {
      project.zoom.autoKeyframes = computeAutoZoom(
        samples,
        clicks,
        manifest.video.width,
        manifest.video.height,
        project.zoom.intensity,
      );
    }
  }

  return project;
}

export function suggestExportName(project: RecastProject, format: string, existing: string[] = []): string {
  return buildExportName(project.name, format as import('@recast/shared').ExportFormat, new Date(), existing);
}

export type { RecastProject };
