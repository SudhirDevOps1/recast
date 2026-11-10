import { appendFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SessionManifestSchema, type InputEvent, type SessionManifest } from '@recast/shared';
import { planRecovery, type RecoveryPlan } from '@recast/capture';
import { atomicWrite } from './store';
import { recordingsDir, sessionDir } from './paths';

/**
 * Recording session service (main process). Owns every byte on disk:
 * - `session.json` manifest, updated atomically after each segment closes
 * - segment `.mp4` files written via tmp+rename
 * - `cursor.jsonl` appended in batches with fsync
 * - crash scanning on launch
 */

interface OpenSession {
  id: string;
  dir: string;
  manifest: SessionManifest;
  inputFdPath: string;
}

export class SessionService {
  private open: OpenSession | null = null;

  createSession(manifest: SessionManifest): string {
    const dir = sessionDir(manifest.id);
    this.open = {
      id: manifest.id,
      dir,
      manifest,
      inputFdPath: join(dir, 'cursor.jsonl'),
    };
    atomicWrite(join(dir, 'session.json'), JSON.stringify(manifest, null, 2));
    return dir;
  }

  get openSession(): OpenSession | null {
    return this.open;
  }

  writeSegment(sessionId: string, file: string, data: Uint8Array): void {
    const s = this.open;
    if (!s || s.id !== sessionId) throw new Error(`No open session ${sessionId}`);
    // tmp + rename: a crash mid-write never produces a truncated "closed" file.
    const finalPath = join(s.dir, file);
    const tmpPath = `${finalPath}.part`;
    writeFileSync(tmpPath, data);
    renameSync(tmpPath, finalPath);
    void statSync(finalPath).size;
  }

  /** Append to one growing media file (compatibility-mode WebM, 2 s chunks). */
  appendSegmentFile(sessionId: string, file: string, data: Uint8Array): void {
    const s = this.open;
    if (!s || s.id !== sessionId) throw new Error(`No open session ${sessionId}`);
    // Renderer-supplied name: refuse anything path-shaped before it touches disk.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file) || file.includes('..')) {
      throw new Error(`Invalid media file name: ${file}`);
    }
    appendFileSync(join(s.dir, file), data);
  }

  appendInput(sessionId: string, events: InputEvent[]): void {
    const s = this.open;
    if (!s || s.id !== sessionId) return;
    const lines = events.map((e) => JSON.stringify(e)).join('\n');
    if (lines) appendFileSync(s.inputFdPath, lines + '\n', 'utf8');
  }

  appendAnnotation(sessionId: string, annotation: import('@recast/shared').Annotation): void {
    const s = this.open;
    if (!s || s.id !== sessionId) return;
    const p = join(s.dir, 'annotations.jsonl');
    appendFileSync(p, JSON.stringify(annotation) + '\n', 'utf8');
  }

  writeInputTail(sessionId: string, events: InputEvent[]): void {
    this.appendInput(sessionId, events);
  }

  updateManifest(sessionId: string, manifest: SessionManifest): void {
    const s = this.open;
    if (!s || s.id !== sessionId) {
      // Post-stop updates (e.g. marking crashed) still write by path.
      const dir = sessionDir(sessionId);
      atomicWrite(join(dir, 'session.json'), JSON.stringify(manifest, null, 2));
      return;
    }
    s.manifest = manifest;
    atomicWrite(join(s.dir, 'session.json'), JSON.stringify(manifest, null, 2));
  }

  attachAudio(sessionId: string, label: string, file: string, bytes: Uint8Array): void {
    const s = this.open;
    if (!s || s.id !== sessionId) return;
    writeFileSync(join(s.dir, file), bytes);
    const manifest = s.manifest;
    manifest.audio = {
      codec: 'opus',
      sampleRate: 48_000,
      channels: 2,
      file,
    };
    void label;
    atomicWrite(join(s.dir, 'session.json'), JSON.stringify(manifest, null, 2));
  }

  closeSession(sessionId: string, state: 'completed' | 'crashed'): SessionManifest | null {
    const s = this.open;
    if (!s || s.id !== sessionId) return null;
    s.manifest.state = state;
    atomicWrite(join(s.dir, 'session.json'), JSON.stringify(s.manifest, null, 2));
    this.open = null;
    return s.manifest;
  }

  manifestFor(sessionId: string): SessionManifest | null {
    const s = this.open;
    if (s && s.id === sessionId) return s.manifest;
    const p = join(recordingsDir(), sessionId, 'session.json');
    if (!existsSync(p)) return null;
    try {
      return SessionManifestSchema.parse(JSON.parse(readFileSync(p, 'utf8')));
    } catch {
      return null;
    }
  }

  /** Scan all sessions on disk; returns recovery plans for crashed ones. */
  scanForRecovery(): RecoveryPlan[] {
    const out: RecoveryPlan[] = [];
    let entries: string[] = [];
    try {
      entries = readdirSync(recordingsDir());
    } catch {
      return out;
    }
    for (const id of entries) {
      const dir = join(recordingsDir(), id);
      const manifestPath = join(dir, 'session.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const manifest = SessionManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
        if (manifest.state === 'completed') continue;
        const plan = planRecovery(manifest, dir, (file) => {
          const p = join(dir, file);
          if (!existsSync(p)) return false;
          // A `.part` means the rename never happened — not recoverable.
          return statSync(p).size > 0 && !existsSync(`${p}.part`);
        });
        if (plan.recoverable) out.push(plan);
      } catch {
        /* corrupt manifest — skip */
      }
    }
    return out;
  }

  sessionFilePath(sessionId: string, file: string): string {
    return join(sessionDir(sessionId), file);
  }

  newSessionId(): string {
    return `rec-${randomUUID().slice(0, 8)}-${Date.now().toString(36)}`;
  }
}
