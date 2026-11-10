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
    });
    const offOpen = bridge().on('app:open-project', (id) => {
      void openProject(typeof id === 'string' ? id : id[0]);
    });
    const offCrash = bridge().on('session:crashed', ({ sessionId }) => {
      useApp.getState().showToast(`Recovered a crashed recording session (${sessionId}) — it is back in your Library.`, 'success');
      void refreshLibrary();
    });
    // Persistent stop flow at root level — works regardless of active view
    const offStop = bridge().on('recorder:requestStop', async () => {
      const { stopRecordingFlow } = await import('../lib/record-flow');
      const projectId = await stopRecordingFlow();
      useApp.getState().setRecorderState(null);
      void useApp.getState().refreshLibrary();
      if (projectId) {
        await openProject(projectId);
      }
    });
    const offHotkey = bridge().on('recorder:hotkey', ({ action }) => {
      if (action === 'toggle-record') {
        if (useApp.getState().recorderState) {
          // If recording, hotkey stops cleanly and opens editor!
          void bridge().invoke('recorder:triggerStop', undefined);
        } else {
          navigate(useApp.getState().route === 'record' ? 'library' : 'record');
        }
      } else if (action === 'toggle-pause') {
        const s = useApp.getState().recorderState;
        if (s) {
          void bridge().invoke(s.phase === 'paused' ? 'recorder:resume' : 'recorder:pause', undefined);
        }
      }
    });
    return () => {
      offState();
      offOpen();
      offCrash();
      offStop();
      offHotkey();
    };
  }, [setRecorderState, refreshLibrary, navigate]);

  async function openProject(id: string): Promise<void> {
    const project = await bridge().invoke('library:open', { id });
    if (project) {
      useEditor.getState().setProject(project);
      // Set the app-store id too — Export reads useApp.projectId.
      navigate('editor', id);
    }
  }
  void editorOpen;

  return (
    <div className="flex h-full flex-col">
      {/* Custom title bar */}
      <header
        data-tauri-drag-region=""
        className="glass flex items-center justify-between border-b border-hairline px-4"
        style={{ height: 'var(--titlebar-height)', WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-6 w-6 items-center justify-center rounded-lg"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-press))', boxShadow: '0 0 0 1px var(--glass-hairline), 0 2px 8px var(--accent-glow)' }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 1.8v8.4l6.4-4.2L3 1.8Z" fill="var(--accent-contrast)" />
              </svg>
            </span>
            <span className="text-[15px] font-bold tracking-tight" style={{ marginLeft: platform?.platform === 'darwin' ? 64 : 0 }}>
              Recast
            </span>
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
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-2">
              {toast.tone !== 'info' ? <IconX size={12} /> : null}
              {toast.message}
            </span>
            {toast.action ? (
              <button
                className="shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors hover:opacity-80"
                style={{ borderColor: 'currentColor' }}
                onClick={() => {
                  toast.action?.run();
                  useApp.setState({ toast: null });
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
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
