import { useEffect, useState } from 'react';
import { bridge } from '../lib/bridge';
import { IconPause, IconStop, IconButton, Badge } from '@recast/ui';

type Tool = 'select' | 'pen' | 'highlighter' | 'arrow' | 'rect';

/** Floating live annotation & control toolbar: timer, tools, pause, stop. */
export default function ToolbarApp() {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#EF4444');
  void sessionId;

  useEffect(() => {
    const off = bridge().on('recorder:state', (s) => {
      if (s.phase === 'idle') {
        window.close();
        return;
      }
      setElapsed(s.elapsedUs / 1e6);
      setPaused(s.phase === 'paused');
      if (s.sessionId) setSessionId(s.sessionId);
    });
    return off;
  }, []);

  const selectTool = (t: Tool): void => {
    setTool(t);
  };

  return (
    <div
      className="flex items-center gap-2.5 rounded-full border px-3 py-1.5"
      style={{
        background: 'rgba(16,20,28,0.94)',
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
      <span className="tabular text-xs font-semibold mr-1" style={{ color: '#e8ebf2' }}>
        {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
      </span>

      {/* Live Tool Palette */}
      <span style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center gap-1 border-l border-r border-hairline px-2">
        <button
          onClick={() => selectTool('select')}
          className="px-2 py-0.5 text-xs rounded transition-colors"
          style={{
            background: tool === 'select' ? 'var(--accent)' : 'transparent',
            color: tool === 'select' ? '#0b0e12' : '#e8ebf2',
            fontWeight: tool === 'select' ? '600' : 'normal',
          }}
          title="Pointer (Select)"
        >
          Select
        </button>
        <button
          onClick={() => selectTool('pen')}
          className="px-2 py-0.5 text-xs rounded transition-colors"
          style={{
            background: tool === 'pen' ? 'var(--accent)' : 'transparent',
            color: tool === 'pen' ? '#0b0e12' : '#e8ebf2',
            fontWeight: tool === 'pen' ? '600' : 'normal',
          }}
          title="Pen (Draw)"
        >
          Pen
        </button>
        <button
          onClick={() => selectTool('highlighter')}
          className="px-2 py-0.5 text-xs rounded transition-colors"
          style={{
            background: tool === 'highlighter' ? 'var(--accent)' : 'transparent',
            color: tool === 'highlighter' ? '#0b0e12' : '#e8ebf2',
            fontWeight: tool === 'highlighter' ? '600' : 'normal',
          }}
          title="Highlighter"
        >
          Highlight
        </button>
        <button
          onClick={() => selectTool('arrow')}
          className="px-2 py-0.5 text-xs rounded transition-colors"
          style={{
            background: tool === 'arrow' ? 'var(--accent)' : 'transparent',
            color: tool === 'arrow' ? '#0b0e12' : '#e8ebf2',
            fontWeight: tool === 'arrow' ? '600' : 'normal',
          }}
          title="Arrow"
        >
          Arrow
        </button>
        <button
          onClick={() => selectTool('rect')}
          className="px-2 py-0.5 text-xs rounded transition-colors"
          style={{
            background: tool === 'rect' ? 'var(--accent)' : 'transparent',
            color: tool === 'rect' ? '#0b0e12' : '#e8ebf2',
            fontWeight: tool === 'rect' ? '600' : 'normal',
          }}
          title="Box"
        >
          Box
        </button>

        {/* Color presets */}
        {['#EF4444', '#7C8CF8', '#10B981', '#F59E0B'].map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="w-3.5 h-3.5 rounded-full border ml-0.5"
            style={{
              background: c,
              borderColor: color === c ? '#ffffff' : 'transparent',
              transform: color === c ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        ))}
      </span>

      {/* Playback Controls */}
      <span style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center gap-1">
        <IconButton
          label={paused ? 'Resume' : 'Pause'}
          onClick={() => {
            void bridge().invoke(paused ? 'recorder:resume' : 'recorder:pause', undefined);
            window.dispatchEvent(new CustomEvent('toolbar:toggle-pause'));
          }}
        >
          <IconPause size={13} />
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
          <IconStop size={13} />
        </IconButton>
      </span>
    </div>
  );
}
