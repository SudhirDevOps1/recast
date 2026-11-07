import { useEffect, useState } from 'react';
import { useApp } from '../state/stores';
import { bridge } from '../lib/bridge';
import { Button, Field, Select, Switch, Badge, Divider } from '@recast/ui';
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
  const [models, setModels] = useState<Array<{ id: string; label: string; downloaded: boolean }>>([]);
  const [whisperBin] = useState<string | null>(null);

  useEffect(() => {
    void bridge().invoke('permissions:get', undefined).then(setPermissions).catch(() => setPermissions(null));
    void bridge()
      .invoke('captions:models', undefined)
      .then((m: Array<{ id: string; label: string; downloaded: boolean }>) => setModels(m))
      .catch(() => setModels([]));
    void import('@recast/shared').then((s) => void s);
  }, []);

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
              onValueChange={(v) => void setSettings({ language: v as 'en' | 'hi' })}
              options={[
                { value: 'en', label: 'English' },
                { value: 'hi', label: 'हिन्दी' },
              ]}
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

        <div className="space-y-2 rounded-lg border border-hairline p-4 text-sm">
          <div className="flex items-center justify-between">
            <span>whisper.cpp binary</span>
            <Badge tone={whisperBin ? 'success' : 'neutral'}>{whisperBin ? 'found' : 'not found'}</Badge>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {whisperBin ?? 'Install via `brew install whisper-cpp` (macOS) or `scoop install whisper-cpp` (Windows) to enable local captions.'}
          </div>
          {models.length > 0 ? (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Models: {models.map((m) => `${m.label}${m.downloaded ? ' ✓' : ''}`).join(' · ')}
            </div>
          ) : null}
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
