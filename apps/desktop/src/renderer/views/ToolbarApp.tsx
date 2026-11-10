import { useEffect, useState } from 'react';
import { bridge } from '../lib/bridge';
import { IconPause, IconPlay, Badge } from '@recast/ui';

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

  const handleStop = async (): Promise<void> => {
    await bridge().invoke('recorder:triggerStop', undefined);
    window.close();
  };

  return (
    <div
      className="flex items-center gap-2 rounded-full border px-3 py-1.5 whitespace-nowrap select-none"
      style={{
        background: 'rgba(16,20,28,0.96)',
        borderColor: 'rgba(255,255,255,0.18)',
        backdropFilter: 'blur(20px)',
        height: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* 1. Recording indicator + Timer */}
      <div className="flex items-center gap-2 shrink-0">
        <Badge tone={paused ? 'warning' : 'recording'}>
          <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: paused ? 'var(--warning)' : 'var(--recording)' }} />
          {paused ? 'paused' : 'rec'}
        </Badge>
        <span className="tabular text-xs font-semibold mr-1" style={{ color: '#e8ebf2' }}>
          {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
        </span>
      </div>

      {/* 2. Primary Playback & Stop Controls (Positioned up-front so NEVER cut off) */}
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center gap-1.5 shrink-0 pl-1 pr-2 border-r border-hairline">
        <button
          onClick={() => void handleStop()}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full transition-all cursor-pointer hover:brightness-110 active:scale-95"
          style={{
            background: '#EF4444',
            color: '#FFFFFF',
            boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)',
          }}
          title="Stop recording & open editor"
        >
          <span className="w-2.5 h-2.5 bg-white rounded-xs" />
          <span>Stop</span>
        </button>

        <button
          onClick={() => {
            void bridge().invoke(paused ? 'recorder:resume' : 'recorder:pause', undefined);
            window.dispatchEvent(new CustomEvent('toolbar:toggle-pause'));
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors cursor-pointer hover:bg-white/10"
          style={{
            background: 'rgba(255,255,255,0.08)',
            color: '#e8ebf2',
          }}
          title={paused ? 'Resume recording' : 'Pause recording'}
        >
          {paused ? <IconPlay size={12} /> : <IconPause size={12} />}
          <span>{paused ? 'Resume' : 'Pause'}</span>
        </button>
      </div>

      {/* 3. Live Tool Palette */}
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center gap-1 shrink-0">
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
            className="w-3.5 h-3.5 rounded-full border ml-0.5 cursor-pointer"
            style={{
              background: c,
              borderColor: color === c ? '#ffffff' : 'transparent',
              transform: color === c ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
