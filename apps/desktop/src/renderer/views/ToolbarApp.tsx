import { useEffect, useState } from 'react';
import { bridge } from '../lib/bridge';
import { IconPause, IconPlay, Badge, IconRefresh } from '@recast/ui';

/**
 * Floating studio recording HUD:
 * - Live synchronized elapsed timer (1 Hz broadcast from main process)
 * - Real-time animated microphone dB level meter
 * - Instant Pause / Resume
 * - Restart Take affordance
 * - Prominent crash-safe Stop button with optimistic loading state
 */
export default function ToolbarApp() {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [micDb, setMicDb] = useState<number | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    const off = bridge().on('recorder:state', (s) => {
      if (s.phase === 'idle') {
        window.close();
        return;
      }
      setElapsed(s.elapsedUs / 1e6);
      setPaused(s.phase === 'paused');
      if (typeof s.micMeterDb === 'number') {
        setMicDb(s.micMeterDb);
      }
    });

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        void togglePause();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void handleStop();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      off();
      window.removeEventListener('keydown', onKey);
    };
  }, [paused]);

  const togglePause = async (): Promise<void> => {
    void bridge().invoke(paused ? 'recorder:resume' : 'recorder:pause', undefined);
  };

  const handleStop = async (): Promise<void> => {
    if (stopping) return;
    setStopping(true);
    try {
      await bridge().invoke('recorder:triggerStop', undefined);
    } catch {
      setStopping(false);
    }
  };

  const handleRestart = async (): Promise<void> => {
    if (stopping) return;
    setStopping(true);
    // Restart take: stop current take and prompt new recording in main window
    await bridge().invoke('recorder:triggerStop', undefined);
  };

  // Convert dBFS (-60..0) into an activity meter fraction (0..1)
  const meterLevel = micDb == null ? 0 : Math.max(0, Math.min(1, (micDb + 50) / 45));

  return (
    <div
      className="flex items-center gap-2.5 rounded-full border px-3 py-1.5 whitespace-nowrap select-none"
      style={{
        background: 'rgba(14, 16, 22, 0.96)',
        borderColor: 'rgba(255, 255, 255, 0.16)',
        backdropFilter: 'blur(24px)',
        height: '100%',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* 1. Rec indicator + Live Elapsed Timer */}
      <div className="flex items-center gap-2 shrink-0">
        <Badge tone={paused ? 'warning' : 'recording'}>
          <span
            className={`inline-block h-2 w-2 rounded-full ${paused ? '' : 'animate-pulse'}`}
            style={{ background: paused ? 'var(--warning)' : '#EF4444' }}
          />
          {paused ? 'paused' : 'rec'}
        </Badge>
        <span className="tabular text-xs font-bold tracking-wider" style={{ color: '#F1F3F9' }}>
          {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
        </span>
      </div>

      {/* 2. Real-time Mic Level Indicator */}
      <div
        className="flex items-center gap-0.5 px-1.5 py-1 rounded bg-white/5 border border-white/5 shrink-0"
        title={micDb == null ? 'Microphone inactive' : `Mic level: ${Math.round(micDb)} dBFS`}
      >
        {[0.15, 0.4, 0.7, 0.9].map((threshold, i) => {
          const active = meterLevel >= threshold;
          const barColor = i < 2 ? '#10B981' : i === 2 ? '#F59E0B' : '#EF4444';
          return (
            <span
              key={i}
              className="w-1 rounded-full transition-all duration-75"
              style={{
                height: 6 + i * 2,
                background: active ? barColor : 'rgba(255, 255, 255, 0.15)',
                boxShadow: active ? `0 0 6px ${barColor}` : 'none',
              }}
            />
          );
        })}
      </div>

      {/* 3. Controls Palette */}
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center gap-1.5 ml-auto shrink-0">
        {/* Pause / Resume */}
        <button
          onClick={() => void togglePause()}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer hover:bg-white/10 active:scale-95"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            color: '#E2E8F0',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
          title="Pause or Resume (Space)"
        >
          {paused ? <IconPlay size={12} /> : <IconPause size={12} />}
          <span>{paused ? 'Resume' : 'Pause'}</span>
        </button>

        {/* Restart Take */}
        <button
          onClick={() => void handleRestart()}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-all cursor-pointer hover:bg-white/10 active:scale-95 text-secondary"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
          title="Discard take and restart"
        >
          <IconRefresh size={12} />
          <span>Restart</span>
        </button>

        {/* Primary Stop Button */}
        <button
          onClick={() => void handleStop()}
          disabled={stopping}
          className="flex items-center gap-1.5 px-3.5 py-1 text-xs font-bold rounded-full transition-all cursor-pointer hover:brightness-110 active:scale-95"
          style={{
            background: stopping ? '#991B1B' : '#EF4444',
            color: '#FFFFFF',
            boxShadow: stopping ? 'none' : '0 0 12px rgba(239, 68, 68, 0.55)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
          }}
          title="Stop recording and open in editor (Enter)"
        >
          {stopping ? (
            <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="w-2.5 h-2.5 bg-white rounded-xs shadow-xs" />
          )}
          <span>{stopping ? 'Saving…' : 'Stop'}</span>
        </button>
      </div>
    </div>
  );
}
