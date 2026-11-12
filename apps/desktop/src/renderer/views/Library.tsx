import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useEditor } from '../state/stores';
import { bridge } from '../lib/bridge';
import {
  Button,
  EmptyState,
  IconFilm,
  IconRecord,
  IconTrash,
  IconSearch,
  IconUpload,
  Badge,
  IconButton,
  Select,
} from '@recast/ui';
import { formatClock } from '@recast/shared';

type SortKey = 'newest' | 'oldest' | 'longest' | 'name';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'longest', label: 'Longest first' },
  { value: 'name', label: 'Name (A–Z)' },
];

/** Run at most `limit` async jobs at once (thumbnails shell out to ffmpeg). */
async function runPool<T>(items: T[], limit: number, job: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item === undefined) return;
      await job(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Library: real recordings from the sqlite store, with generated poster
 * thumbnails (ffmpeg when available, protocol URL otherwise), search, sort and
 * a two-step delete so a single misclick cannot destroy a take.
 */
export function Library() {
  const library = useApp((s) => s.library);
  const navigate = useApp((s) => s.navigate);
  const refreshLibrary = useApp((s) => s.refreshLibrary);
  const showToast = useApp((s) => s.showToast);

  const [openingId, setOpeningId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [thumbPending, setThumbPending] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const requested = useRef<Set<string>>(new Set());
  const mounted = useRef(true);

  async function handleImport(path?: string): Promise<void> {
    setImporting(true);
    try {
      const res = await bridge().invoke('library:importMedia', path ? { path } : undefined);
      if (res.projectId) {
        showToast('Video imported successfully into Recast Studio!', 'success');
        await refreshLibrary();
        await open(res.projectId);
      } else if (res.error) {
        showToast(res.error, 'error');
      }
    } catch (e) {
      showToast(`Import failed: ${(e as Error).message}`, 'error');
    } finally {
      if (mounted.current) setImporting(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  // Poster frames: requested once per project, four at a time, cached for the
  // session. A skeleton holds the card size while the frame is being written.
  useEffect(() => {
    const missing = library.filter((p) => !requested.current.has(p.id));
    if (missing.length === 0) return;
    for (const p of missing) requested.current.add(p.id);
    setThumbPending((prev) => ({ ...prev, ...Object.fromEntries(missing.map((p) => [p.id, true])) }));

    void runPool(missing, 4, async (p) => {
      try {
        const r = await bridge().invoke('projects:generateThumbnails', { projectId: p.id });
        const first = r.thumbnails?.[0]?.dataUrl;
        if (mounted.current && first) setThumbs((prev) => ({ ...prev, [p.id]: first }));
      } catch {
        /* thumbnails are best-effort; the film icon remains the fallback */
      } finally {
        if (mounted.current) {
          setThumbPending((prev) => {
            const next = { ...prev };
            delete next[p.id];
            return next;
          });
        }
      }
    });
  }, [library]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? library.filter((p) => p.name.toLowerCase().includes(needle)) : library;
    const sorted = [...filtered];
    switch (sort) {
      case 'oldest':
        sorted.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        break;
      case 'longest':
        sorted.sort((a, b) => b.durationUs - a.durationUs);
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'newest':
      default:
        sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        break;
    }
    return sorted;
  }, [library, query, sort]);

  async function open(id: string): Promise<void> {
    setOpeningId(id);
    try {
      const project = await bridge().invoke('library:open', { id });
      if (!project) {
        showToast('This recording could not be opened — its project file is missing or invalid.', 'error');
        return;
      }
      useEditor.getState().setProject(project);
      // Set the app-store id too — Export reads useApp.projectId.
      navigate('editor', id);
    } catch (e) {
      showToast(`Could not open the recording: ${(e as Error).message}`, 'error');
    } finally {
      setOpeningId(null);
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await bridge().invoke('library:delete', { id });
      setThumbs((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      requested.current.delete(id);
      showToast('Recording deleted.', 'success');
    } catch (e) {
      showToast(`Could not delete the recording: ${(e as Error).message}`, 'error');
    } finally {
      setConfirmId(null);
      void refreshLibrary();
    }
  }

  if (library.length === 0) {
    return (
      <div
        className="relative h-full flex flex-col justify-center"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) {
            const p = bridge().pathForFile(file);
            void handleImport(p);
          }
        }}
      >
        {isDragOver ? (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm border-2 border-dashed border-indigo-400 rounded-xl m-4 pointer-events-none">
            <IconUpload size={48} className="text-indigo-400 mb-3" />
            <p className="text-lg font-semibold text-white">Drop video here to import into Recast Studio</p>
            <p className="text-xs text-white/60 mt-1">Supports MP4, WebM, MOV, MKV, AVI</p>
          </div>
        ) : null}
        <EmptyState
          icon={<IconFilm size={40} />}
          title="No recordings yet"
          body="Record your first clip — or import an existing video to edit, crop (9:16 Shorts), apply studio wallpapers, and add subtitles. Everything stays local on your machine."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="secondary" onClick={() => void handleImport()} disabled={importing}>
                <span className="inline-flex items-center gap-2">
                  <IconUpload size={14} /> {importing ? 'Importing…' : 'Import video'}
                </span>
              </Button>
              <Button variant="primary" onClick={() => navigate('record')}>
                <span className="inline-flex items-center gap-2">
                  <IconRecord size={12} /> Record now
                </span>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) {
          const p = bridge().pathForFile(file);
          void handleImport(p);
        }
      }}
    >
      {isDragOver ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm border-2 border-dashed border-indigo-400 rounded-xl m-4 pointer-events-none">
          <IconUpload size={48} className="text-indigo-400 mb-3" />
          <p className="text-lg font-semibold text-white">Drop video here to import into Recast Studio</p>
          <p className="text-xs text-white/60 mt-1">Supports MP4, WebM, MOV, MKV, AVI</p>
        </div>
      ) : null}
      <div className="rc-library-toolbar">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Library</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {library.length} recording{library.length === 1 ? '' : 's'} · stored on this machine
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void handleImport()} disabled={importing}>
            <span className="inline-flex items-center gap-1.5">
              <IconUpload size={14} /> {importing ? 'Importing…' : 'Import video'}
            </span>
          </Button>
          <label className="relative">
            <span className="sr-only">Search recordings</span>
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <IconSearch size={14} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recordings"
              className="rc-input rc-input-icon w-56"
            />
          </label>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)} options={SORT_OPTIONS} ariaLabel="Sort recordings" />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<IconSearch size={32} />}
          title="No matches"
          body={`Nothing in the library matches “${query.trim()}”.`}
          action={
            <Button size="sm" onClick={() => setQuery('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="rc-library-grid rc-stagger">
          {visible.map((p) => (
            <article key={p.id} className="rc-card overflow-hidden rounded-xl border border-hairline" style={{ background: 'var(--surface)' }}>
              <button
                type="button"
                className="relative block w-full text-left"
                onClick={() => void open(p.id)}
                disabled={openingId !== null}
                aria-label={`Open ${p.name}`}
                aria-busy={openingId === p.id}
              >
                <div className="rc-thumb h-40 w-full">
                  {thumbs[p.id] ? (
                    <img src={thumbs[p.id]} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : thumbPending[p.id] ? (
                    <div className="rc-skeleton h-full w-full" aria-hidden="true" />
                  ) : (
                    <div className="flex h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                      <IconFilm size={28} />
                    </div>
                  )}
                </div>
                <div className="tabular absolute bottom-2 right-2 rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(8,10,14,0.72)', color: '#e8ebf2', backdropFilter: 'blur(4px)' }}>
                  {formatClock(p.durationUs)}
                </div>
                <div className="rc-play-hint" aria-hidden="true">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'rgba(124,140,248,0.92)', color: '#0b0e12' }}>
                    {openingId === p.id ? <IconRecord size={16} /> : <IconPlayGlyph />}
                  </span>
                </div>
              </button>

              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold" title={p.name}>
                      {p.name}
                    </div>
                    <div className="tabular mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>{formatDate(p.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {p.width}×{p.height}
                      </span>
                      {p.hasCaptions ? <Badge tone="accent">captions</Badge> : null}
                    </div>
                  </div>
                  <IconButton label={`Delete ${p.name}`} danger onClick={() => setConfirmId(p.id)}>
                    <IconTrash />
                  </IconButton>
                </div>

                {confirmId === p.id ? (
                  <div
                    className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-2 py-2"
                    style={{ borderColor: 'var(--danger)', background: 'rgba(248,113,113,0.08)' }}
                    role="alertdialog"
                    aria-label={`Delete ${p.name}`}
                  >
                    <span className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
                      Delete permanently?
                    </span>
                    <span className="ml-auto inline-flex gap-1">
                      <Button size="sm" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void remove(p.id)}>
                        Delete
                      </Button>
                    </span>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Filled play triangle — the shared IconPlay is the transport glyph. */
function IconPlayGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5L8 5.5Z" fill="currentColor" />
    </svg>
  );
}
