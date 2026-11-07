import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const sizeStyle: Record<Size, string> = {
  sm: 'height:28px;padding:0 10px;font-size:var(--text-sm);border-radius:var(--radius-md)',
  md: 'height:34px;padding:0 14px;font-size:var(--text-md);border-radius:var(--radius-md)',
  lg: 'height:40px;padding:0 18px;font-size:var(--text-lg);border-radius:var(--radius-lg)',
};

function variantStyle(variant: Variant): string {
  switch (variant) {
    case 'primary':
      return 'background:var(--accent);color:var(--accent-contrast);border:1px solid transparent';
    case 'secondary':
      return 'background:var(--surface-raised);color:var(--text-primary);border:1px solid var(--hairline-strong)';
    case 'danger':
      return 'background:transparent;color:var(--danger);border:1px solid var(--hairline-strong)';
    case 'ghost':
    default:
      return 'background:transparent;color:var(--text-secondary);border:1px solid transparent';
  }
}

/** Tiny inline CSS string → object helper (keeps tokens usable without a CSS-in-JS lib). */
export function cssProps(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const idx = decl.indexOf(':');
    if (idx <= 0) continue;
    const key = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (key && val) out[camel(key)] = val;
  }
  return out;
}

function camel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', style, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`rc-button ${className ?? ''}`}
      style={{
        ...cssProps(variantStyle(variant)),
        ...cssProps(sizeStyle[size]),
        transition: 'background var(--dur-fast) var(--ease-out)',
        cursor: 'default',
        ...style,
      }}
      {...rest}
    />
  );
});

export function IconButton({
  label,
  children,
  active,
  danger,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; danger?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="rc-icon-button"
      style={{
        width: 30,
        height: 30,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-md)',
        border: '1px solid transparent',
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: danger ? 'var(--danger)' : active ? 'var(--accent)' : 'var(--text-secondary)',
        transition: 'all var(--dur-fast) var(--ease-out)',
        cursor: 'default',
        ...rest.style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--hairline-strong)',
        borderBottomWidth: 2,
        borderRadius: 'var(--radius-sm)',
        padding: '1px 5px',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </kbd>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'recording';
  children: ReactNode;
}) {
  const colors: Record<string, string> = {
    neutral: 'var(--hairline-strong)',
    accent: 'var(--accent)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    recording: 'var(--recording)',
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        letterSpacing: '0.02em',
        padding: '2px 8px',
        borderRadius: 999,
        border: `1px solid ${colors[tone]}`,
        color: colors[tone],
      }}
    >
      {children}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</label>
      {children}
      {hint ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{hint}</span> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-8)',
        textAlign: 'center',
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ color: 'var(--text-muted)' }}>{icon}</div>
      <div style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', fontWeight: 600 }}>{title}</div>
      <div style={{ maxWidth: 360, fontSize: 'var(--text-md)' }}>{body}</div>
      {action}
    </div>
  );
}

export function Progress({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'recording' }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        height: 6,
        borderRadius: 999,
        background: 'var(--hairline)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.min(100, Math.max(0, value * 100))}%`,
          height: '100%',
          borderRadius: 999,
          background: tone === 'recording' ? 'var(--recording)' : 'var(--accent)',
          transition: 'width var(--dur-base) var(--ease-out)',
        }}
      />
    </div>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: 'var(--hairline)', width: '100%' }} />;
}
