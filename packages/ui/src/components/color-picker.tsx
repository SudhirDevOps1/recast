/**
 * Compact color picker: swatch button + popover with a native color input,
 * a hex field and preset swatches. Dependency-free (click-outside + Esc).
 */
import { useEffect, useRef, useState } from 'react';

export const DEFAULT_SWATCHES: string[] = [
  '#7C8CF8',
  '#9BA8FF',
  '#F5F7FA',
  '#FFD666',
  '#FF7A59',
  '#4ADE80',
  '#22D3EE',
  '#F472B6',
  '#101418',
  '#FFFFFF',
];

/** Expand a 6-digit hex to 8 digits (opaque), pass 8-digit through. */
function normalizeHex(hex: string): string {
  const h = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return `${h}FF`.toLowerCase();
  return h;
}

export function ColorPicker({
  value,
  onChange,
  ariaLabel,
  swatches = DEFAULT_SWATCHES,
}: {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel?: string;
  swatches?: string[];
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isTransparent = value.length === 9 && value.endsWith('00');
  const swatch = isTransparent ? 'transparent' : value.slice(0, 7);
  const native = /^#[0-9a-fA-F]{6}$/.test(value.slice(0, 7)) ? value.slice(0, 7) : '#7c8cf8';

  const commitText = (raw: string): void => {
    setDraft(raw);
    const h = raw.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(h) || /^#[0-9a-fA-F]{8}$/.test(h)) onChange(h.toLowerCase());
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label={ariaLabel ?? 'Pick color'}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px 4px 4px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--hairline-strong)',
          background: 'var(--surface-raised)',
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            background: swatch,
            border: '1px solid var(--hairline-strong)',
            backgroundImage: isTransparent
              ? 'linear-gradient(45deg, var(--hairline-strong) 25%, transparent 25%, transparent 75%, var(--hairline-strong) 75%), linear-gradient(45deg, var(--hairline-strong) 25%, transparent 25%, transparent 75%, var(--hairline-strong) 75%)'
              : undefined,
            backgroundSize: '6px 6px',
            backgroundPosition: '0 0, 3px 3px',
          }}
        />
        <span className="tabular" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {isTransparent ? 'none' : value.slice(0, 7)}
        </span>
      </button>

      {open ? (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Color picker"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 60,
            width: 208,
            padding: 10,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-raised)',
            border: '1px solid var(--hairline-strong)',
            boxShadow: 'var(--shadow-lg)',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={native}
              aria-label="Color wheel"
              onChange={(e) => onChange(e.target.value)}
              style={{ width: 34, height: 26, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <input
              value={draft}
              onChange={(e) => commitText(e.target.value)}
              aria-label="Hex value"
              spellCheck={false}
              className="tabular"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--hairline-strong)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {swatches.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Use ${s}`}
                onClick={() => onChange(normalizeHex(s))}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  background: s,
                  border: value.toLowerCase() === s.toLowerCase() ? '2px solid var(--accent)' : '1px solid var(--hairline-strong)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange('#00000000')}
            className="tabular"
            style={{
              textAlign: 'left',
              padding: '3px 6px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Transparent
          </button>
        </div>
      ) : null}
    </div>
  );
}
