import { useEffect, useState } from 'react';
import { useApp } from '../state/stores';
import { bridge } from '../lib/bridge';
import { Dialog, Button, Badge, IconCamera, IconMic, IconMonitor, IconSparkle } from '@recast/ui';
import type { PermissionStatus } from '@recast/shared';

/**
 * First-run onboarding: permissions → preset → guided 10-second recording.
 * Shown once; completion is recorded in settings (firstRunDone).
 */
export function Onboarding() {
  const platform = useApp((s) => s.platform);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [perms, setPerms] = useState<PermissionStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [startedAt] = useState(Date.now());

  useEffect(() => {
    void (async () => {
      const settings = await bridge().invoke('app:getSettings', undefined);
      // First run: open onboarding after 600 ms so the window paints first.
      const seen = (settings as Record<string, unknown>).firstRunDone === true;
      if (!seen && Date.now() - startedAt < 5_000) {
        setTimeout(() => setOpen(true), 600);
      }
      setPerms(await bridge().invoke('permissions:get', undefined));
    })();
  }, [startedAt]);

  /** Every close path must persist firstRunDone, or the Welcome dialog
   *  reopens on the next launch and its overlay blocks the app. */
  const close = (): void => {
    setOpen(false);
    void bridge().invoke('app:setSettings', { firstRunDone: true } as never).catch(() => undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) close(); else setOpen(true); }}
      title="Welcome to Recast"
      description="Three quick steps and you're recording. Everything stays on your machine."
      width={520}
      footer={
        <>
          <Button
            onClick={async () => {
              await bridge().invoke('app:setSettings', { defaultPresetId: 'clean-dark' } as never);
              close();
            }}
          >
            Skip
          </Button>
          <Button variant="primary" onClick={() => setStep(step === 2 ? 2 : ((step + 1) as 1 | 2))}>
            {step === 2 ? 'Record 10-second clip' : 'Next'}
          </Button>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-3">
          {(['screen', 'microphone', 'camera'] as const).map((k) => (
            <div key={k} className="flex items-center justify-between rounded-lg border border-hairline p-3">
              <span className="flex items-center gap-2 text-sm capitalize">
                {k === 'screen' ? <IconMonitor /> : k === 'microphone' ? <IconMic /> : <IconCamera />} {k}
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={perms?.[k] === 'granted' ? 'success' : 'warning'}>{perms?.[k] ?? 'unknown'}</Badge>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (k === 'screen') await bridge().invoke('permissions:openSystemSettings', { kind: 'screen' });
                    else await bridge().invoke('permissions:request', { kind: k });
                    setPerms(await bridge().invoke('permissions:get', undefined));
                  }}
                >
                  {perms?.[k] === 'granted' ? 'Recheck' : 'Grant'}
                </Button>
              </span>
            </div>
          ))}
          {platform ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {platform.platform === 'darwin'
                ? 'macOS shows a one-time permission prompt. Screen recording requires re-launching the app after granting.'
                : 'Windows and Linux generally do not gate screen recording behind a prompt.'}
            </p>
          ) : null}
        </div>
      ) : step === 1 ? (
        <div className="space-y-3">
          <p className="text-sm">Pick the look for your recordings — change any time in the editor.</p>
          <div className="grid grid-cols-3 gap-2">
            {['clean-light', 'soft-studio', 'bold-punch'].map((id) => (
              <button
                key={id}
                onClick={async () => {
                  await bridge().invoke('app:setSettings', { defaultPresetId: id } as never);
                }}
                className="rounded-lg border border-hairline p-3 text-xs"
                style={{ borderColor: 'var(--accent)' }}
              >
                {id.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            The guided clip records your screen for 10 seconds and drops you straight into the editor with auto-zoom
            applied — that's the whole loop.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              close();
              void bridge().invoke('library:createSample', undefined);
            }}
          >
            <span className="inline-flex items-center gap-2">
              <IconSparkle size={14} /> Start guided recording
            </span>
          </Button>
        </div>
      )}
    </Dialog>
  );
}
