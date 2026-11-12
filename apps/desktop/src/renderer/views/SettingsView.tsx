import { useEffect, useState } from 'react';
import { useApp } from '../state/stores';
import { bridge } from '../lib/bridge';
import { Button, Field, Select, Switch, Badge, Divider, IconCheck } from '@recast/ui';
import { GITHUB_URL } from '@recast/shared';

/** Settings: appearance, permissions, media engine (ffmpeg + whisper), about. */
export function SettingsView() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const platform = useApp((s) => s.platform);
  const ffmpeg = useApp((s) => s.ffmpeg);
  const refreshFfmpeg = useApp((s) => s.refreshFfmpeg);
  const showToast = useApp((s) => s.showToast);
  const [permissions, setPermissions] = useState<{ screen: string; microphone: string; camera: string } | null>(null);
  const [models, setModels] = useState<Array<{ id: string; label: string; sizeMb?: number; downloaded: boolean }>>([]);
  const [whisperBin, setWhisperBin] = useState<string | null>(null);
  const [canInstallWhisper, setCanInstallWhisper] = useState(false);
  const [installingWhisper, setInstallingWhisper] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState<Record<string, number>>({});

  const refreshWhisper = (): void => {
    void bridge()
      .invoke('captions:status', undefined)
      .then((res) => {
        setWhisperBin(res.whisperBin);
        setCanInstallWhisper(res.canInstall);
        setModels(res.models);
      })
      .catch(() => {
        setWhisperBin(null);
        setCanInstallWhisper(false);
      });
  };

  useEffect(() => {
    void bridge().invoke('permissions:get', undefined).then(setPermissions).catch(() => setPermissions(null));
    refreshWhisper();

    const offDownload = bridge().on('whisper:download', (data) => {
      if (data.modelId === '__binary__') {
        if (data.done) {
          setInstallingWhisper(false);
          refreshWhisper();
          if (data.error) showToast(`Whisper install failed: ${data.error}`, 'error');
          else showToast('whisper.cpp installed successfully!', 'success');
        }
      } else {
        setDownloadingModel((prev) => ({ ...prev, [data.modelId]: data.pct }));
        if (data.done) {
          refreshWhisper();
          setDownloadingModel((prev) => {
            const next = { ...prev };
            delete next[data.modelId];
            return next;
          });
          if (data.error) showToast(`Model download failed: ${data.error}`, 'error');
          else showToast('Model downloaded successfully!', 'success');
        }
      }
    });

    return () => {
      offDownload();
    };
  }, [showToast]);

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Appearance
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Theme">
            <Select
              value={settings.theme}
              onValueChange={(v) => void setSettings({ theme: v as 'dark' | 'light' | 'system' })}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'Match system' },
              ]}
              ariaLabel="Theme"
            />
          </Field>
          <Field label="Language">
            <Select
              value={settings.language}
              onValueChange={(v) => void setSettings({ language: v as 'en' })}
              options={[{ value: 'en', label: 'English' }]}
              ariaLabel="Language"
            />
          </Field>
        </div>
      </section>

      <Divider />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Permissions
        </h2>
        {permissions ? (
          <div className="space-y-2 text-sm">
            {(['screen', 'microphone', 'camera'] as const).map((k) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-hairline p-3">
                <span className="capitalize">{k}</span>
                <span className="flex items-center gap-3">
                  <Badge tone={permissions[k] === 'granted' ? 'success' : 'warning'}>{permissions[k]}</Badge>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await bridge().invoke('permissions:openSystemSettings', { kind: k });
                      showToast('System Settings opened. Grant the permission, then restart Recast.', 'info');
                    }}
                  >
                    Open Settings
                  </Button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Permission status unavailable on this platform.
          </div>
        )}
      </section>

      <Divider />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Media engine
        </h2>
        {ffmpeg ? (
          <div className="space-y-3 rounded-lg border border-hairline p-4 text-sm">
            <div className="flex items-center justify-between">
              <span>FFmpeg</span>
              <span className="flex items-center gap-2">
                <Badge tone={ffmpeg.available ? 'success' : 'danger'}>
                  {ffmpeg.available ? `${ffmpeg.version} · ${ffmpeg.source}` : 'not found'}
                </Badge>
                {!ffmpeg.available ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      void bridge().invoke('ffmpeg:install', undefined).then(() => {
                        const off = bridge().on('ffmpeg:download', ({ pct, done, error }) => {
                          if (error) {
                            showToast(`FFmpeg install failed: ${error}`, 'error');
                            off();
                          } else if (done) {
                            showToast('FFmpeg installed.', 'success');
                            off();
                            void refreshFfmpeg();
                          } else {
                            showToast(`Downloading FFmpeg… ${pct}%`, 'info');
                          }
                        });
                      });
                    }}
                  >
                    Install
                  </Button>
                ) : null}
              </span>
            </div>
            {ffmpeg.path ? <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{ffmpeg.path}</div> : null}
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              FFmpeg is the safety net (remux, thumbnails, GIF, ProRes, loudnorm, Whisper audio extraction). The default
              record → edit → export path runs on WebCodecs and never shells out. See Settings → About → Media engine
              for licensing.
            </div>
          </div>
        ) : null}

        <div className="space-y-3 rounded-lg border border-hairline p-4 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">whisper.cpp binary</span>
              {whisperBin ? (
                <Badge tone="success">installed</Badge>
              ) : (
                <Badge tone="neutral">not found</Badge>
              )}
            </div>
            {!whisperBin && canInstallWhisper ? (
              <Button
                size="sm"
                disabled={installingWhisper}
                onClick={() => {
                  setInstallingWhisper(true);
                  showToast('Downloading prebuilt whisper.cpp binary…', 'info');
                  void bridge()
                    .invoke('captions:installBinary', undefined)
                    .then((res) => {
                      if (!res.ok) {
                        setInstallingWhisper(false);
                        showToast(`Install failed: ${res.error}`, 'error');
                      }
                    })
                    .catch((e) => {
                      setInstallingWhisper(false);
                      showToast(`Install error: ${(e as Error).message}`, 'error');
                    });
                }}
              >
                {installingWhisper ? 'Downloading…' : 'Install (1-Click)'}
              </Button>
            ) : null}
          </div>
          <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
            {whisperBin ? (
              <code>{whisperBin}</code>
            ) : (
              'whisper.cpp enables fully local, private AI subtitles with zero cloud telemetry. Click Install to auto-download.'
            )}
          </div>

          {/* Model Management */}
          <div className="mt-2 space-y-2 pt-2 border-t border-hairline">
            <div className="text-xs font-semibold text-secondary">Speech Recognition Models (Local GGML):</div>
            <div className="grid grid-cols-1 gap-2">
              {models.map((m) => {
                const isDownloading = typeof downloadingModel[m.id] === 'number';
                const pct = downloadingModel[m.id] ?? 0;
                return (
                  <div key={m.id} className="flex items-center justify-between rounded bg-white/5 p-2 text-xs">
                    <div>
                      <span className="font-medium">{m.label}</span>
                      {m.sizeMb ? <span className="ml-2 text-muted">({m.sizeMb} MB)</span> : null}
                    </div>
                    {m.downloaded ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-medium">
                        <IconCheck size={12} />
                        <span>Ready</span>
                      </span>
                    ) : isDownloading ? (
                      <span className="text-accent tabular font-medium">{pct}%</span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          setDownloadingModel((prev) => ({ ...prev, [m.id]: 0 }));
                          showToast(`Downloading ${m.label}…`, 'info');
                          void bridge().invoke('captions:downloadModel', { id: m.id });
                        }}
                      >
                        Download
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Diagnostics
        </h2>
        <div className="space-y-3 rounded-lg border border-hairline p-4 text-sm">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Recording problems? Copy the diagnostics bundle and attach it to the bug report — it contains the
            per-stage capture log, app/OS versions and settings (no personal data, no secrets).
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                void bridge()
                  .invoke('diagnostics:copy', undefined)
                  .then(() => showToast('Diagnostics bundle copied to the clipboard.', 'success'))
                  .catch((e) => showToast(`Copy failed: ${(e as Error).message}`, 'error'));
              }}
            >
              Copy diagnostics bundle
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void bridge()
                  .invoke('diagnostics:bundle', undefined)
                  .then((text) => {
                    void navigator.clipboard?.writeText?.(text).catch(() => undefined);
                    showToast('Bundle generated (clipboard copy attempted).', 'info');
                  })
                  .catch((e) => showToast(`Bundle failed: ${(e as Error).message}`, 'error'));
              }}
            >
              Copy (fallback)
            </Button>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            The capture log lives in the <code>logs/</code> folder of the data directory below and rotates at 512 KB.
          </div>
        </div>
      </section>

      <Divider />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          General
        </h2>
        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between">
            <span>Launch at login</span>
            <Switch checked={settings.launchAtLogin} onCheckedChange={(v) => void setSettings({ launchAtLogin: v })} ariaLabel="Launch at login" />
          </label>
          <label className="flex items-center justify-between">
            <span>Check for updates automatically (opt-in)</span>
            <Switch checked={settings.autoCheckUpdates} onCheckedChange={(v) => void setSettings({ autoCheckUpdates: v })} ariaLabel="Auto update checks" />
          </label>
          <label className="flex items-center justify-between">
            <span>Prefer hardware encoder</span>
            <Switch checked={settings.preferHardwareEncoder} onCheckedChange={(v) => void setSettings({ preferHardwareEncoder: v })} ariaLabel="Prefer hardware encoder" />
          </label>
        </div>
        {platform ? (
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Data directory: {platform.dataDir}
            {platform.isPortable ? ' (portable mode — settings live next to the executable)' : ''}
          </div>
        ) : null}
      </section>

      <Divider />

      <section className="space-y-2 text-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          About
        </h2>
        {platform ? (
          <div className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
            Recast {platform.versions.app} · Electron {platform.versions.electron} · Chromium {platform.versions.chrome}
          </div>
        ) : null}
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          GPL-3.0-or-later. FFmpeg builds with libx264 are GPL — the full license text ships next to the binaries and at{' '}
          <a href={GITHUB_URL} style={{ color: 'var(--accent)' }}>
            {GITHUB_URL}
          </a>
          .
        </div>
        <Button size="sm" onClick={() => void bridge().invoke('app:openUrl', { url: GITHUB_URL })}>
          Open project page
        </Button>
      </section>
    </div>
  );
}
