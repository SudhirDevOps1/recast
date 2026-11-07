import { useEffect, useMemo, useState } from 'react';
import { useApp, useEditor } from '../state/stores';
import { Kbd } from '@recast/ui';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** ⌘K / Ctrl+K command palette over real editor and app actions. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const navigate = useApp((s) => s.navigate);
  const refreshLibrary = useApp((s) => s.refreshLibrary);
  const showToast = useApp((s) => s.showToast);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery('');
        setSelected(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onCustom = (): void => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('recast:palette', onCustom as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('recast:palette', onCustom as EventListener);
    };
  }, []);

  const commands = useMemo<Command[]>(() => {
    const editor = useEditor.getState();
    const list: Command[] = [
      { id: 'nav-record', label: 'Go to Record', hint: 'N', run: () => navigate('record') },
      { id: 'nav-library', label: 'Go to Library', run: () => navigate('library') },
      { id: 'nav-settings', label: 'Go to Settings', run: () => navigate('settings') },
      {
        id: 'editor-split',
        label: 'Split clip at playhead',
        hint: 'S',
        run: () => {
          const project = editor.project;
          if (!project) return showToast('No project open.', 'error');
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
        },
      },
      {
        id: 'editor-autozoom',
        label: 'Toggle auto zoom',
        run: () => {
          const { project, commit } = useEditor.getState();
          if (!project) return showToast('No project open.', 'error');
          commit({ ...project, zoom: { ...project.zoom, enabled: !project.zoom.enabled } });
        },
      },
      {
        id: 'editor-undo',
        label: 'Undo',
        hint: '⌘Z',
        run: () => useEditor.getState().undo(),
      },
      {
        id: 'editor-redo',
        label: 'Redo',
        hint: '⇧⌘Z',
        run: () => useEditor.getState().redo(),
      },
      {
        id: 'editor-save',
        label: 'Save project now',
        hint: '⌘S',
        run: () => void useEditor.getState().save(),
      },
      {
        id: 'library-refresh',
        label: 'Refresh library',
        run: () => void refreshLibrary(),
      },
    ];
    return list;
  }, [navigate, refreshLibrary, showToast]);

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[15vh]" style={{ background: 'rgba(6,8,12,0.6)' }} onClick={() => setOpen(false)}>
      <div
        className="w-[520px] overflow-hidden rounded-xl border border-hairline shadow-3"
        style={{ background: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSelected((s) => Math.min(filtered.length - 1, s + 1));
            if (e.key === 'ArrowUp') setSelected((s) => Math.max(0, s - 1));
            if (e.key === 'Enter') {
              filtered[selected]?.run();
              setOpen(false);
            }
          }}
          placeholder="Type a command…"
          className="w-full border-b border-hairline bg-transparent px-4 py-3 text-md outline-none"
          aria-label="Command search"
        />
        <ul className="max-h-72 overflow-auto py-1">
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${i === selected ? 'bg-accent-subtle' : ''}`}
                style={{ background: i === selected ? 'var(--accent-subtle)' : 'transparent' }}
                onMouseEnter={() => setSelected(i)}
                onClick={() => {
                  c.run();
                  setOpen(false);
                }}
              >
                <span>{c.label}</span>
                {c.hint ? <Kbd>{c.hint}</Kbd> : null}
              </button>
            </li>
          ))}
          {filtered.length === 0 ? <li className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>No matching commands.</li> : null}
        </ul>
      </div>
    </div>
  );
}
