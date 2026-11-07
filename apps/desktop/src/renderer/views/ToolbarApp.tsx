import { useEffect, useState } from 'react';
import { bridge } from '../lib/bridge';
import { IconPause, IconRecord, IconStop, IconButton, Badge } from '@recast/ui';

/** Floating toolbar window: timer, pause, stop. Frameless, transparent, always-on-top. */
export default function ToolbarApp() {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const off = bridge().on('recorder:state', (s) => {
      if (s.phase === 'idle') {
        window.close();
        return;
      }
      setElapsed(s.elapsedUs / 1e6);
      setPaused(s.phase === 'paused');
    });
    return off;
  }, []);

  return (
    <div
      className="flex items-center gap-3 rounded-full border px-4 py-2"
      style={{
        background: 'rgba(16,20,28,0.92)',
        borderColor: 'rgba(255,255,255,0.14)',
        backdropFilter: 'blur(16px)',
        height: '100%',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <Badge tone={paused ? 'warning' : 'recording'}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: paused ? 'var(--warning)' : 'var(--recording)' }} />
        {paused ? 'paused' : 'rec'}
      </Badge>
      <span className="tabular text-sm" style={{ color: '#e8ebf2' }}>
        {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
      </span>
      <span style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center gap-1">
        <IconButton
          label={paused ? 'Resume' : 'Pause'}
          onClick={() => {
            void bridge().invoke(paused ? 'recorder:resume' : 'recorder:pause', undefined);
            window.dispatchEvent(new CustomEvent('toolbar:toggle-pause'));
          }}
        >
          <IconPause />
        </IconButton>
        <IconButton
          label="Stop"
          danger
          onClick={() => {
            void (async () => {
              await bridge().invoke('recorder:stop', undefined);
              window.close();
            })();
          }}
        >
          <IconStop />
        </IconButton>
        <IconRecord size={10} />
      </span>
    </div>
  );
}
