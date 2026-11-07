import { useEffect } from 'react';
import { useApp, useEditor } from '../state/stores';
import { bridge } from '../lib/bridge';
import { IconFilm, IconRecord, IconSettings, IconFolder, IconCommand, IconX, Badge } from '@recast/ui';
import { Library } from './Library';
import { RecorderView } from './RecorderView';
import { EditorView } from './EditorView';
import { ExportView } from './ExportView';
import { SettingsView } from './SettingsView';
import { Onboarding } from './Onboarding';
import { CommandPalette } from './CommandPalette';

/**
 * Main app shell: custom title bar, left nav, view switch, toast, onboarding
 * and the ⌘K command palette. Recording state arrives as main-process events.
 */
export default function App() {
  const route = useApp((s) => s.route);
  const navigate = useApp((s) => s.navigate);
  const platform = useApp((s) => s.platform);
  const toast = useApp((s) => s.toast);
  const setRecorderState = useApp((s) => s.setRecorderState);
  const refreshPlatform = useApp((s) => s.refreshPlatform);
  const refreshFfmpeg = useApp((s) => s.refreshFfmpeg);
  const refreshLibrary = useApp((s) => s.refreshLibrary);
  const editorOpen = useEditor((s) => s.project != null);

  useEffect(() => {
    void refreshPlatform();
    void refreshFfmpeg();
    void refreshLibrary();
    void bridge()
      .invoke('app:getSettings', undefined)
      .then((s) => {
        useApp.setState({ settings: s });
        document.documentElement.dataset.theme = s.theme === 'system' ? 'dark' : s.theme;
      });
  }, [refreshPlatform, refreshFfmpeg, refreshLibrary]);

  useEffect(() => {
    const offState = bridge().on('recorder:state', (s) => {
      setRecorderState(s.phase === 'idle' ? null : s);
      bridge().send('recorder:stats', { phase: s.phase, elapsedUs: s.elapsedUs / 1000, bytes: s.bytes });
    });
    const offOpen = bridge().on('app:open-project', (id) => {
      void openProject(typeof id === 'string' ? id : id[0]);
    });
    const offCrash = bridge().on('session:crashed', ({ sessionId }) => {
      useApp.getState().showToast(`Recovered a crashed recording session (${sessionId}) — it is back in your Library.`, 'success');
      void refreshLibrary();
    });
    const offHotkey = bridge().on('recorder:hotkey', ({ action }) => {
      if (action === 'toggle-record') {
        navigate(useApp.getState().route === 'record' ? 'library' : 'record');
      }
    });
    return () => {
      offState();
      offOpen();
      offCrash();
      offHotkey();
    };
  }, [setRecorderState, refreshLibrary, navigate]);

  async function openProject(id: string): Promise<void> {
    const project = await bridge().invoke('library:open', { id });
    if (project) {
      useEditor.getState().setProject(project);
      navigate('editor');
    }
  }
  void editorOpen;

  return (
    <div className="flex h-full flex-col">
      {/* Custom title bar */}
      <header
        data-tauri-drag-region=""
        className="flex items-center justify-between border-b border-hairline px-4"
        style={{ height: 'var(--titlebar-height)', WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span className="text-[15px] font-bold tracking-tight" style={{ marginLeft: platform?.platform === 'darwin' ? 64 : 0 }}>
            Recast
          </span>
          {useApp.getState().recorderState ? (
            <Badge tone="recording">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--recording)' }} />
              Recording
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            aria-label="Command palette"
            title="Command palette (Ctrl+K)"
            className="rc-icon-button"
            onClick={() => window.dispatchEvent(new CustomEvent('recast:palette'))}
          >
            <IconCommand />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left nav */}
        <nav className="flex w-14 flex-col items-center gap-1 border-r border-hairline py-3" aria-label="Primary">
          <NavButton icon={<IconFolder />} label="Library" active={route === 'library'} onClick={() => navigate('library')} />
          <NavButton icon={<IconRecord />} label="Record" active={route === 'record'} onClick={() => navigate('record')} />
          <NavButton icon={<IconFilm />} label="Editor" active={route === 'editor'} onClick={() => editorOpen && navigate('editor')} disabled={!editorOpen} />
          <div className="mt-auto">
            <NavButton icon={<IconSettings />} label="Settings" active={route === 'settings'} onClick={() => navigate('settings')} />
          </div>
        </nav>

        {/* View */}
        <main className="min-w-0 flex-1 overflow-auto">
          {route === 'library' && <Library />}
          {route === 'record' && <RecorderView />}
          {route === 'editor' && <EditorView />}
          {route === 'export' && <ExportView />}
          {route === 'settings' && <SettingsView />}
        </main>
      </div>

      {platform?.capabilities.cursorTracking === false ? (
        <div className="border-t border-hairline bg-surface px-4 py-1.5 text-xs" style={{ color: 'var(--warning)' }}>
          Wayland session: cursor zoom and global hotkeys are limited. See docs/platform-support.md for details and fixes.
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2 text-sm shadow-2"
          style={{
            background: 'var(--surface-raised)',
            borderColor: toast.tone === 'error' ? 'var(--danger)' : toast.tone === 'success' ? 'var(--success)' : 'var(--hairline-strong)',
            color: toast.tone === 'error' ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          <span className="inline-flex items-center gap-2">
            {toast.tone !== 'info' ? <IconX size={12} /> : null}
            {toast.message}
          </span>
        </div>
      ) : null}

      <CommandPalette />
      <Onboarding />
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
      style={{
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      {icon}
    </button>
  );
}
