import type { SessionManifest, Segment } from '@recast/shared';

/**
 * Crash-recovery planning (pure; the main process performs the IO/remux).
 * A session is recoverable when the manifest exists, its state is not
 * `completed`, and at least one closed segment file is present on disk.
 */

export interface RecoveryPlan {
  sessionId: string;
  recoverable: boolean;
  reason: string;
  segments: Segment[];
  missingSegments: string[];
}

export function planRecovery(
  manifest: SessionManifest,
  sessionDir: string,
  fileExists: (pathInSessionDir: string) => boolean,
): RecoveryPlan {
  const missing: string[] = [];
  const present: Segment[] = [];
  for (const seg of manifest.screen.segments) {
    if (fileExists(seg.file)) present.push(seg);
    else missing.push(seg.file);
  }
  void sessionDir;
  if (manifest.state === 'completed') {
    return {
      sessionId: manifest.id,
      recoverable: false,
      reason: 'Session already completed cleanly.',
      segments: present,
      missingSegments: missing,
    };
  }
  if (present.length === 0) {
    return {
      sessionId: manifest.id,
      recoverable: false,
      reason: 'No closed segments on disk — nothing to recover.',
      segments: [],
      missingSegments: missing,
    };
  }
  return {
    sessionId: manifest.id,
    recoverable: true,
    reason: `${present.length} closed segment(s) found; last ${missing.length} may be missing.`,
    segments: present,
    missingSegments: missing,
  };
}

export function isCrashed(manifest: SessionManifest): boolean {
  return manifest.state === 'active' || manifest.state === 'crashed';
}
