import { useEffect, useRef, useState } from 'react';

/**
 * Area selection overlay: dimmed backdrop, drag to select, live pixel size,
 * 4× magnifier, Enter confirms, Esc cancels. Arrow keys nudge by 1 px
 * (Shift = 10 px). The selection is posted to the main process via IPC.
 */
export default function AreaApp() {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        void finish(null);
        return;
      }
      if (e.key === 'Enter' && rect) {
        void finish(rect);
        return;
      }
      if (!rect) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') setRect({ ...rect, x: rect.x - step, w: rect.w + step });
      if (e.key === 'ArrowRight') setRect({ ...rect, w: rect.w + step });
      if (e.key === 'ArrowUp') setRect({ ...rect, y: rect.y - step, h: rect.h + step });
      if (e.key === 'ArrowDown') setRect({ ...rect, h: rect.h + step });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    // 4× magnifier: sample a small region around the cursor from the backdrop
    // video. A snapshot is supplied by the main process via recast-media URL.
    const video = document.createElement('video');
    const url = new URLSearchParams(window.location.search).get('snapshot');
    if (!url) return;
    video.src = url;
    video.muted = true;
    void video.play().catch(() => undefined);
    const draw = (): void => {
      const canvas = canvasRef.current;
      if (canvas && cursor && video.readyState >= 2) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        const sx = Math.max(0, cursor.x - 20);
        const sy = Math.max(0, cursor.y - 20);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, sx, sy, 40, 40, 0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }, [cursor]);

  async function finish(rect: { x: number; y: number; w: number; h: number } | null): Promise<void> {
    await bridge().invoke('area:selected', { rect } as never);
    window.close();
  }

  function bridge(): { invoke: (c: string, p: unknown) => Promise<unknown> } {
    return (window as unknown as { recast: { invoke: (c: string, p: unknown) => Promise<unknown> } }).recast;
  }

  return (
    <div
      className="fixed inset-0"
      style={{ background: 'rgba(4,6,10,0.35)', cursor: 'crosshair' }}
      onPointerDown={(e) => {
        dragStart.current = { x: e.clientX, y: e.clientY };
        setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
      }}
      onPointerMove={(e) => {
        setCursor({ x: e.clientX, y: e.clientY });
        if (dragStart.current) {
          const x = Math.min(dragStart.current.x, e.clientX);
          const y = Math.min(dragStart.current.y, e.clientY);
          setRect({ x, y, w: Math.abs(e.clientX - dragStart.current.x), h: Math.abs(e.clientY - dragStart.current.y) });
        }
      }}
      onPointerUp={() => {
        if (rect && rect.w > 8 && rect.h > 8) void finish(rect);
        dragStart.current = null;
      }}
    >
      {rect ? (
        <div
          className="absolute border-2"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderColor: 'var(--accent)', background: 'rgba(124,140,248,0.08)' }}
        >
          <span
            className="tabular absolute -top-6 left-0 rounded px-1.5 text-xs"
            style={{ background: 'var(--accent)', color: '#0b0e12' }}
          >
            {Math.round(rect.w)} × {Math.round(rect.h)}
          </span>
        </div>
      ) : null}
      {cursor ? (
        <canvas
          ref={canvasRef}
          width={96}
          height={96}
          className="absolute rounded-lg border"
          style={{
            left: cursor.x + 18,
            top: cursor.y + 18,
            borderColor: 'var(--hairline-strong)',
            imageRendering: 'pixelated',
          }}
        />
      ) : null}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm"
        style={{ background: 'rgba(16,20,28,0.9)', color: '#e8ebf2' }}
      >
        Drag to select · Enter to confirm · Esc to cancel · arrows nudge 1 px (Shift 10 px)
      </div>
    </div>
  );
}
