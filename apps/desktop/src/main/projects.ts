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

export function readCursorJsonl(
  sessionDir: string,
  file = 'cursor.jsonl',
  displayScaleFactor = 1,
): {
  samples: CursorSample[];
  clicks: Array<{ tUs: number; x: number; y: number }>;
  keys: Array<{ tUs: number; key: string }>;
} {
  const samples: CursorSample[] = [];
  const clicks: Array<{ tUs: number; x: number; y: number }> = [];
  const keys: Array<{ tUs: number; key: string }> = [];
  const p = join(sessionDir, file);
  if (!existsSync(p)) return { samples, clicks, keys };
  // Cursor samples are recorded in Electron DIP coordinates; the video frames
  // are physical pixels. Scale here so every consumer (auto-zoom, editor,
  // compositor, export) works in one consistent pixel space.
  const sf = Number.isFinite(displayScaleFactor) && displayScaleFactor > 0 ? displayScaleFactor : 1;
  const lines = readFileSync(p, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as { tUs: number; type: string; x?: number; y?: number; key?: string };
      if (e.type === 'move' && e.x != null && e.y != null) {
        samples.push({ tUs: e.tUs, x: e.x * sf, y: e.y * sf });
      } else if (e.type === 'down' && e.x != null && e.y != null) {
        clicks.push({ tUs: e.tUs, x: e.x * sf, y: e.y * sf });
        samples.push({ tUs: e.tUs, x: e.x * sf, y: e.y * sf });
      } else if (e.type === 'key' && e.key) {
        keys.push({ tUs: e.tUs, key: e.key });
      }
    } catch {
      /* skip malformed line */
    }
  }
  return { samples, clicks, keys };
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
    // The SESSION directory, not the recordings root: every consumer joins a
    // bare filename to this path (segments, audio, cursor.jsonl, thumbnails,
    // recast-media URLs). With the root here none of those resolved — black
    // previews, dead exports, and a silent zero-sample cursor track.
    dir: join(recordingsDir(), sessionId),
    width: manifest.video.width,
    height: manifest.video.height,
    fps: manifest.video.fps,
    segments: manifest.screen.segments,
    audio: manifest.audio
      ? { file: manifest.audio.file, startUs: 0, endUs: manifest.screen.segments.at(-1)?.endUs ?? 0 }
      : null,
    camera: manifest.camera?.segments[0] ?? null,
    cursor: { file: 'cursor.jsonl', available: existsSync(join(recordingsDir(), sessionId, 'cursor.jsonl')) },
  };

  if (manifest.camera?.segments[0]) {
    project.style.facecam.enabled = true;
  }

  // Timeline: one clip per segment, back to back.
  let t = 0;
  project.timeline.clips = manifest.screen.segments.map((seg) => {
    const clip = {
      id: `clip-${seg.id}`,
      segmentId: seg.id,
      track: 'screen' as const,
      sourceInUs: seg.startUs,
      sourceOutUs: seg.endUs,
      timelineInUs: t,
      speed: 1,
      transitionIn: 'none' as const,
      transitionMs: 450,
    };
    t += Math.max(0, seg.endUs - seg.startUs);
    return clip;
  });
  project.timeline.durationUs = t;

  // Cursor → auto-zoom keyframes. Samples are scaled from DIP to the video's
  // physical pixel space with the display factor stamped at record time.
  if (project.media.cursor?.available) {
    const { samples, clicks } = readCursorJsonl(project.media.dir, 'cursor.jsonl', manifest.displayScaleFactor ?? 1);
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

  // Load any annotations captured live during recording
  const annotationsPath = join(project.media.dir, 'annotations.jsonl');
  if (existsSync(annotationsPath)) {
    try {
      const lines = readFileSync(annotationsPath, 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        project.annotations.push(JSON.parse(line));
      }
    } catch {
      /* ignore malformed lines */
    }
  }

  return project;
}

export function suggestExportName(project: RecastProject, format: string, existing: string[] = []): string {
  return buildExportName(project.name, format as import('@recast/shared').ExportFormat, new Date(), existing);
}

export type { RecastProject };
