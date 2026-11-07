import { useEffect, useState } from 'react';
import { useApp } from '../state/stores';
import { bridge } from '../lib/bridge';
import { Button, EmptyState, IconFilm, IconRecord, IconTrash, Badge, IconButton } from '@recast/ui';
import { formatClock } from '@recast/shared';
import { useEditor } from '../state/stores';

/** Library: real recordings from the sqlite store, honest empty state. */
export function Library() {
  const library = useApp((s) => s.library);
  const navigate = useApp((s) => s.navigate);
  const refreshLibrary = useApp((s) => s.refreshLibrary);
  const showToast = useApp((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  async function open(id: string): Promise<void> {
    setBusy(true);
    try {
      const project = await bridge().invoke('library:open', { id });
      if (project) {
        useEditor.getState().setProject(project);
        navigate('editor');
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
          className="group overflow-hidden rounded-xl border border-hairline transition-shadow hover:shadow-2"
          style={{ background: 'var(--surface)' }}
        >
          <button className="block w-full" onClick={() => void open(p.id)} disabled={busy} aria-label={`Open ${p.name}`}>
            <div
              className="flex h-36 items-center justify-center"
              style={{ background: 'var(--bg-sunken)' }}
            >
              <IconFilm size={28} />
            </div>
          </button>
          <div className="flex items-start justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{p.name}</div>
              <div className="tabular mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {formatClock(p.durationUs)} · {p.width}×{p.height}
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
