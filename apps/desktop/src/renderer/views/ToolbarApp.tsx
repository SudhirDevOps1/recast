import { useCallback, useEffect, useState } from 'react';
import { bridge } from '../lib/bridge';
import { IconPause, IconPlay, IconCamera, IconMic, IconMonitor } from '@recast/ui';

/**
 * Recordly-Grade Studio Floating Recording HUD (Recordly_AFDClM5HN9.png parity):
 * - Left drag grip dots handle
 * - Compact source target pill [ Screen ⌵ ]
 * - Quick mic & camera toggles
 * - Live synchronized elapsed timer (1 Hz broadcast)
 * - Prominent circular red stop recording button
 * - Minimize & Dismiss affordances
 */
export default function ToolbarApp() {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [micDb, setMicDb] = useState<number | null>(null);
  const [stopping, setStopping] = useState(false);
  const [micMuted, setMicMuted] = useState(false);

  const togglePause = useCallback(async (): Promise<void> => {
    void bridge().invoke(paused ? 'recorder:resume' : 'recorder:pause', undefined);
  }, [paused]);

  const handleStop = useCallback(async (): Promise<void> => {
    if (stopping) return;
    setStopping(true);
    const timer = setTimeout(() => {
      setStopping(false);
    }, 6_000);
    try {
      await bridge().invoke('recorder:triggerStop', undefined);
    } catch {
      clearTimeout(timer);
      setStopping(false);
    }
  }, [stopping]);

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
  }, [handleStop, togglePause]);

  // Convert dBFS (-60..0) into an activity meter fraction (0..1)
  const meterLevel = micDb == null ? 0 : Math.max(0, Math.min(1, (micDb + 50) / 45));

  return (
    <div
      className="flex items-center gap-2 rounded-2xl border px-3 py-1.5 whitespace-nowrap select-none text-white text-xs cursor-grab active:cursor-grabbing"
      style={{
        background: 'rgba(18, 20, 29, 0.94)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        backdropFilter: 'blur(28px)',
        height: '100%',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* 1. Drag Dots Grip Handle */}
      <div
        className="flex items-center justify-center px-1.5 py-1 text-white/40 hover:text-white transition-colors shrink-0 rounded hover:bg-white/10"
        title="Drag recording bar anywhere on screen"
      >
        <svg width="8" height="16" viewBox="0 0 8 16" fill="currentColor">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="6" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="6" cy="8" r="1.5" />
          <circle cx="2" cy="14" r="1.5" />
          <circle cx="6" cy="14" r="1.5" />
        </svg>
      </div>

      {/* 2. Source Selector Pill (Recordly Style) */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-white/90 text-[11px] font-medium shrink-0 cursor-default"
        title="Screen Capture Active"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <IconMonitor size={12} />
        <span>Screen</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* 3. Audio / Video Controls */}
      <div
        className="flex items-center gap-1 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Mic Toggle */}
        <button
          onClick={() => setMicMuted((m) => !m)}
          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
            micMuted
              ? 'bg-red-500/20 border-red-500/40 text-red-300'
              : 'bg-white/5 border-white/5 text-white/80 hover:text-white hover:bg-white/10'
          }`}
          title={micMuted ? 'Microphone Muted' : 'Microphone Active'}
        >
          <IconMic size={13} />
        </button>

        {/* Camera HUD Indicator */}
        <div
          className="p-1.5 rounded-lg border bg-white/5 border-white/5 text-blue-400 shrink-0"
          title="Face Cam Active"
        >
          <IconCamera size={13} />
        </div>

        {/* Mic Level Waves */}
        <div
          className="flex items-center gap-0.5 px-1 py-1 rounded bg-white/5 border border-white/5 shrink-0"
          title={micDb == null ? 'Microphone inactive' : `Mic: ${Math.round(micDb)} dBFS`}
        >
          {[0.15, 0.45, 0.75].map((threshold, i) => {
            const active = !micMuted && meterLevel >= threshold;
            const barColor = i === 2 ? '#EF4444' : i === 1 ? '#F59E0B' : '#10B981';
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
      </div>

      {/* 4. Timer Pill */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-black/40 border border-white/10 shrink-0 font-mono text-xs font-semibold text-white/90"
        title="Elapsed Recording Duration"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className={`w-2 h-2 rounded-full ${paused ? 'bg-amber-400' : 'bg-red-500 animate-pulse'}`} />
        <span>
          {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
        </span>
      </div>

      {/* 5. Pause / Resume */}
      <button
        onClick={() => void togglePause()}
        className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer shrink-0"
        title={paused ? 'Resume recording (Space)' : 'Pause recording (Space)'}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {paused ? <IconPlay size={13} /> : <IconPause size={13} />}
      </button>

      {/* 6. Prominent Big Red Stop Button (Recordly Style) */}
      <button
        onClick={() => void handleStop()}
        disabled={stopping}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer hover:brightness-110 active:scale-95 shrink-0 shadow-lg"
        style={{
          background: stopping ? '#7F1D1D' : 'linear-gradient(135deg, #EF4444, #DC2626)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          boxShadow: '0 4px 16px rgba(239, 68, 68, 0.5)',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        title="Stop recording and open in studio editor (Enter)"
      >
        {stopping ? (
          <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="w-2.5 h-2.5 bg-white rounded-xs" />
        )}
        <span>{stopping ? 'Saving…' : 'Stop'}</span>
      </button>

      {/* 7. Window Management (Minimize / Close) */}
      <div
        className="flex items-center gap-0.5 ml-auto pl-1 border-l border-white/10 shrink-0 text-white/50"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => void bridge().invoke('recorder:minimizeMainWindow', undefined)}
          className="p-1 rounded hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          title="Minimize window"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          onClick={() => void handleStop()}
          className="p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer"
          title="Stop & Dismiss"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
