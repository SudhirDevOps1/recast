import { useEffect, useRef, useState } from 'react';
import { bridge } from '../lib/bridge';

/**
 * Floating studio webcam HUD:
 * - Live real-time camera stream visible on the user's screen during recording
 * - Fully draggable across displays via -webkit-app-region: drag
 * - Window has setContentProtection(true) so it is excluded from raw screen capture
 * - Mirror flip toggle and shape controls
 */
export default function CameraBubbleApp(): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mirrored, setMirrored] = useState(true);
  const [shape, setShape] = useState<'circle' | 'squircle'>('squircle');
  const [sizeMode, setSizeMode] = useState<'sm' | 'md' | 'lg'>('md');
  const [hovered, setHovered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySize = async (mode: 'sm' | 'md' | 'lg') => {
    setSizeMode(mode);
    const px = mode === 'sm' ? 160 : mode === 'md' ? 220 : 300;
    try {
      await bridge().invoke('camera:setSize', { size: px });
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let active = true;

    async function initCamera(): Promise<void> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }

    void initCamera();

    const off = bridge().on('recorder:state', (s) => {
      if (s.phase === 'idle') {
        window.close();
      }
    });

    return () => {
      active = false;
      off();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const borderRadius = shape === 'circle' ? '9999px' : '48px';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative w-full h-full select-none flex items-center justify-center p-2 cursor-grab active:cursor-grabbing"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Outer frame with gradient border & studio shadow */}
      <div
        className="relative w-full h-full overflow-hidden transition-all duration-300"
        style={{
          borderRadius,
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.75), 0 0 0 2px rgba(255, 255, 255, 0.25)',
          background: '#0F1218',
        }}
      >
        {error ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-xs text-rose-300 bg-neutral-900 pointer-events-none">
            <span>Camera unavailable</span>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover pointer-events-none"
            style={{
              transform: mirrored ? 'scaleX(-1)' : 'none',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Top Drag Pill Indicator on Hover */}
        {hovered && (
          <div
            className="absolute top-2 inset-x-0 flex items-center justify-center pointer-events-none"
          >
            <span className="text-[10px] font-bold text-white/80 bg-black/60 px-2 py-0.5 rounded-full border border-white/20 backdrop-blur-sm">
              ⋮⋮ Drag Bubble
            </span>
          </div>
        )}

        {/* Hover Controls Overlay */}
        {hovered && (
          <div
            className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1.5 pointer-events-auto"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* Size Controls Row */}
            <div className="flex items-center gap-1 bg-black/75 px-1.5 py-0.5 rounded-full border border-white/20 backdrop-blur-sm">
              <button
                onClick={() => void applySize('sm')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                  sizeMode === 'sm' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                }`}
                title="Small Bubble (160px)"
              >
                S
              </button>
              <button
                onClick={() => void applySize('md')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                  sizeMode === 'md' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                }`}
                title="Medium Bubble (220px)"
              >
                M
              </button>
              <button
                onClick={() => void applySize('lg')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                  sizeMode === 'lg' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                }`}
                title="Large Bubble (300px)"
              >
                L
              </button>
            </div>

            {/* Actions Row */}
            <div className="flex items-center gap-1.5">
              {/* Mirror Toggle */}
              <button
                onClick={() => setMirrored((m) => !m)}
                className="p-1 rounded-full bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 transition-all text-[11px] w-6 h-6 flex items-center justify-center"
                title="Mirror Webcam"
              >
                ⇄
              </button>

              {/* Shape Toggle */}
              <button
                onClick={() => setShape((s) => (s === 'circle' ? 'squircle' : 'circle'))}
                className="p-1 rounded-full bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 transition-all text-[11px] w-6 h-6 flex items-center justify-center"
                title="Toggle Shape (Circle / Squircle)"
              >
                {shape === 'circle' ? '▢' : '◯'}
              </button>

              {/* Close / Hide Bubble */}
              <button
                onClick={() => window.close()}
                className="p-1 rounded-full bg-black/70 hover:bg-red-600/90 text-white/80 hover:text-white border border-white/20 transition-all text-[11px] w-6 h-6 flex items-center justify-center"
                title="Hide live bubble"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
