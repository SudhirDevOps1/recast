import { useCallback, useEffect } from 'react';
import { useApp, useEditor } from '../state/stores';
import { bridge } from '../lib/bridge';
import { IconFilm, IconRecord, IconSettings, IconFolder, IconCommand, IconCheck, IconWarning, IconSparkle, Badge } from '@recast/ui';
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
  const recorderState = useApp((s) => s.recorderState);
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

  const openProject = useCallback(
    async (id: string): Promise<void> => {
      try {
        const project = await bridge().invoke('library:open', { id });
        if (!project) {
          useApp.getState().showToast('That recording could not be opened — its project file is missing.', 'error');
          return;
        }
        useEditor.getState().setProject(project);
        // Set the app-store id too — Export reads useApp.projectId.
        navigate('editor', id);
      } catch (e) {
        useApp.getState().showToast(`Could not open the recording: ${(e as Error).message}`, 'error');
      }
    },
    [navigate],
  );

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
    // Persistent stop flow at root level — works regardless of active view.
    // A failed stop must still leave the app in a usable state: the recorder
    // state is cleared in `finally`, never only on the happy path.
    const offStop = bridge().on('recorder:requestStop', async () => {
      try {
        const { stopRecordingFlow } = await import('../lib/record-flow');
        const projectId = await stopRecordingFlow();
        if (projectId) await openProject(projectId);
      } catch (e) {
        useApp.getState().showToast(`Could not finish the recording: ${(e as Error).message}`, 'error');
      } finally {
        useApp.getState().setRecorderState(null);
        void useApp.getState().refreshLibrary();
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
  }, [setRecorderState, refreshLibrary, navigate, openProject]);

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
          {recorderState ? (
            <Badge tone="recording">
              <span
                className="rc-live-dot inline-block h-2 w-2 rounded-full"
                data-paused={recorderState.phase === 'paused' ? 'true' : undefined}
                style={{ background: 'var(--recording)' }}
              />
              {recorderState.phase === 'paused' ? 'Paused' : 'Recording'}
              {recorderState.elapsedUs > 0 ? (
                <span className="tabular" style={{ opacity: 0.85 }}>
                  {formatElapsed(recorderState.elapsedUs)}
                </span>
              ) : null}
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
          <div key={route} className="rc-view h-full">
            {route === 'library' && <Library />}
            {route === 'record' && <RecorderView />}
            {route === 'editor' && <EditorView />}
            {route === 'export' && <ExportView />}
            {route === 'settings' && <SettingsView />}
          </div>
        </main>
      </div>

      {platform?.capabilities.cursorTracking === false ? (
        <div className="border-t border-hairline bg-surface px-4 py-1.5 text-xs" style={{ color: 'var(--warning)' }}>
          Wayland session: cursor zoom and global hotkeys are limited. See docs/platform-support.md for details and fixes.
        </div>
      ) : null}

      {toast ? (
        <div
          role={toast.tone === 'error' ? 'alert' : 'status'}
          data-tone={toast.tone}
          className="rc-toast fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2 pl-5 text-sm"
          style={{
            background: 'var(--surface-raised)',
            borderColor: toast.tone === 'error' ? 'var(--danger)' : toast.tone === 'success' ? 'var(--success)' : 'var(--hairline-strong)',
            color: toast.tone === 'error' ? 'var(--danger)' : 'var(--text-primary)',
            ['--toast-accent' as string]: toast.tone === 'error' ? 'var(--danger)' : toast.tone === 'success' ? 'var(--success)' : 'var(--accent)',
          } as React.CSSProperties}
        >
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-2">
              {toast.tone === 'error' ? <IconWarning size={13} /> : toast.tone === 'success' ? <IconCheck size={13} /> : <IconSparkle size={13} />}
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
      className="rc-nav-button flex h-10 w-10 items-center justify-center rounded-lg"
      style={
        {
          '--rc-nav-bg': active ? 'var(--accent-subtle)' : 'transparent',
          '--rc-nav-fg': active ? 'var(--accent)' : 'var(--text-secondary)',
        } as React.CSSProperties
      }
    >
      {icon}
    </button>
  );
}

/** 0:07 / 1:03:04 — the badge is read at a glance, never in full microseconds. */
function formatElapsed(us: number): string {
  const total = Math.max(0, Math.floor(us / 1_000_000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
