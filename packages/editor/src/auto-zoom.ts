import type { RecastProject } from '@recast/shared';
import { buildTimeMap } from '@recast/shared';
import { buildZoomTrack, followCursorTrack, poseAt, type FollowStep, type CursorSample } from './zoom-math';
/**
 * Build the camera (zoom) track for a project at time t.
 * Auto mode derives keyframes from cursor data when available; manual mode
 * uses project.zoom.manualKeyframes; follow mode tracks the cursor directly.
 */
export function buildProjectZoomTrack(
  project: RecastProject,
  cursorSamples: CursorSample[],
  _cursorClicks: Array<{ tUs: number; x: number; y: number }>,
): { track: FollowStep[]; durationUs: number } {
  const map = buildTimeMap(project.timeline.clips);
  const { width, height } = project.media;
  const w = width || 1920;
  const h = height || 1080;

  if (!project.zoom.enabled) {
    return { track: [], durationUs: map.durationUs };
  }

  if (project.zoom.mode === 'follow' && cursorSamples.length > 0) {
    return { track: followCursorTrack(cursorSamples, w, h, project.zoom.intensity), durationUs: map.durationUs };
  }

  const keyframes =
    project.zoom.mode === 'manual' ? project.zoom.manualKeyframes : project.zoom.autoKeyframes;
  const track = buildZoomTrack(keyframes, w, h, project.zoom.intensity, map.durationUs);
  return { track, durationUs: map.durationUs };
}

/** Evaluate the zoom pose at timeline time tUs for preview/export. */
export function zoomPoseAt(track: FollowStep[], tUs: number) {
  return poseAt(track, tUs);
}
