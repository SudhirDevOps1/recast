import { useEffect, useState } from 'react';
import { useApp } from '../state/stores';
import { bridge } from '../lib/bridge';
import { Button, EmptyState, IconFilm, IconRecord, IconTrash, Badge, IconButton } from '@recast/ui';
import { formatClock } from '@recast/shared';
import { useEditor } from '../state/stores';

/** Library: real recordings from the sqlite store, with generated poster
 *  thumbnails (ffmpeg when available, protocol URL otherwise). */
export function Library() {
  const library = useApp((s) => s.library);
  const navigate = useApp((s) => s.navigate);
  const refreshLibrary = useApp((s) => s.refreshLibrary);
  const showToast = useApp((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  // Poster frames: one IPC per project, cached in state for the session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const p of library) {
        if (thumbs[p.id]) continue;
        try {
          const r = await bridge().invoke('projects:generateThumbnails', { projectId: p.id });
          const first = r.thumbnails?.[0]?.dataUrl;
          if (!cancelled && first) setThumbs((prev) => ({ ...prev, [p.id]: first }));
        } catch {
          /* thumbnails stay best-effort; the film icon remains the fallback */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cache only grows
  }, [library]);

  async function open(id: string): Promise<void> {
    setBusy(true);
    try {
      const project = await bridge().invoke('library:open', { id });
      if (project) {
        useEditor.getState().setProject(project);
        // Set the app-store id too — Export reads useApp.projectId.
        navigate('editor', id);
      } else {
        showToast('This project could not be opened — its file is missing or invalid.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    await bridge().invoke('library:delete', { id });
    void refreshLibrary();
  }

  if (library.length === 0) {
    return (
      <EmptyState
        icon={<IconFilm size={40} />}
        title="No recordings yet"
        body="Record your first clip — 90 seconds of product demo, auto-zoomed and exported in under five minutes. Everything stays on your machine."
        action={
          <Button variant="primary" onClick={() => navigate('record')}>
            <span className="inline-flex items-center gap-2">
              <IconRecord size={12} /> Record now
            </span>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
      {library.map((p) => (
        <div
          key={p.id}
          className="group overflow-hidden rounded-xl border border-hairline transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2"
          style={{ background: 'var(--surface)' }}
        >
          <button className="relative block w-full" onClick={() => void open(p.id)} disabled={busy} aria-label={`Open ${p.name}`}>
            {thumbs[p.id] ? (
              <img
                src={thumbs[p.id]}
                alt=""
                className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                loading="lazy"
              />
            ) : (
              <div
                className="flex h-36 items-center justify-center transition-colors group-hover:opacity-90"
                style={{ background: 'var(--bg-sunken)' }}
              >
                <IconFilm size={28} />
              </div>
            )}
            <div className="tabular absolute bottom-2 right-2 rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(8,10,14,0.72)', color: '#e8ebf2', backdropFilter: 'blur(4px)' }}>
              {formatClock(p.durationUs)}
            </div>
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              style={{ background: 'rgba(8,10,14,0.35)' }}
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ background: 'rgba(124,140,248,0.92)', color: '#0b0e12' }}
                aria-hidden="true"
              >
                <IconRecord size={16} />
              </span>
            </div>
          </button>
          <div className="flex items-start justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{p.name}</div>
              <div className="tabular mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {p.width}×{p.height}
                {p.hasCaptions ? <Badge tone="accent">captions</Badge> : null}
              </div>
            </div>
            <IconButton
              label="Delete recording"
              danger
              onClick={() => void remove(p.id)}
            >
              <IconTrash />
            </IconButton>
          </div>
        </div>
      ))}
    </div>
  );
}
