import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SettingsSchema, type Settings, type ProjectMeta } from '@recast/shared';
import { settingsFile, libraryDbFile, projectsDir } from './paths';

/**
 * Storage: settings.json (atomic) + library.db (better-sqlite3, WAL mode).
 * Project files (.recast) live under projects/<id>.recast and are written
 * atomically (tmp + rename + fsync) on the 5 s autosave.
 */

export function loadSettings(): Settings {
  try {
    const raw = readFileSync(settingsFile(), 'utf8');
    const parsed = SettingsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    /* first run or corrupt file → defaults */
  }
  return SettingsSchema.parse({});
}

export function saveSettings(settings: Settings): void {
  atomicWrite(settingsFile(), JSON.stringify(settings, null, 2));
}

/** tmp file in the same directory → rename. Guarantees no torn writes. */
export function atomicWrite(file: string, data: string | Uint8Array): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  duration_us: number;
  width: number;
  height: number;
  has_captions: number;
  thumbnail_file: string | null;
}

export class LibraryStore {
  private db: Database.Database;

  constructor() {
    this.db = new Database(libraryDbFile());
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        duration_us INTEGER NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        has_captions INTEGER NOT NULL DEFAULT 0,
        thumbnail_file TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  listProjects(): ProjectMeta[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      durationUs: r.duration_us,
      width: r.width,
      height: r.height,
      hasCaptions: r.has_captions === 1,
      thumbnailFile: r.thumbnail_file,
    }));
  }

  upsertProject(meta: Omit<ProjectMeta, 'thumbnailFile'> & { thumbnailFile: string | null }): void {
    this.db
      .prepare(
        `INSERT INTO projects (id, name, created_at, updated_at, duration_us, width, height, has_captions, thumbnail_file)
         VALUES (@id, @name, @createdAt, @updatedAt, @durationUs, @width, @height, @hasCaptions, @thumbnailFile)
         ON CONFLICT(id) DO UPDATE SET
           name=@name, updated_at=@updatedAt, duration_us=@durationUs,
           width=@width, height=@height, has_captions=@hasCaptions, thumbnail_file=@thumbnailFile`,
      )
      .run({
        id: meta.id,
        name: meta.name,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        durationUs: meta.durationUs,
        width: meta.width,
        height: meta.height,
        hasCaptions: meta.hasCaptions ? 1 : 0,
        thumbnailFile: meta.thumbnailFile,
      });
  }

  deleteProject(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  registerSession(id: string, state: string): void {
    this.db
      .prepare('INSERT INTO sessions (id, state, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET state=state')
      .run(id, state, new Date().toISOString());
  }

  setSessionState(id: string, state: string): void {
    this.db.prepare('UPDATE sessions SET state = ? WHERE id = ?').run(state, id);
  }

  pendingSessions(): Array<{ id: string; state: string }> {
    return this.db
      .prepare("SELECT id, state FROM sessions WHERE state IN ('active', 'crashed') ORDER BY created_at DESC")
      .all() as Array<{ id: string; state: string }>;
  }

  close(): void {
    this.db.close();
  }
}

export function projectFilePath(id: string): string {
  return `${projectsDir()}/${id}.recast`;
}

export function readProjectFile(id: string): string | null {
  const p = projectFilePath(id);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}
