import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cssProps } from './primitives';
import { IconX, IconCheck } from '../icons';

const overlayStyle = cssProps(
  'position:fixed;inset:0;background:rgba(6,8,12,0.6);backdrop-filter:blur(6px);z-index:60',
);
const contentStyle = cssProps(
  'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius-xl);box-shadow:var(--shadow-3);padding:var(--space-5);min-width:400px;max-width:640px;max-height:80vh;overflow:auto;z-index:61',
);

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="rc-dialog-overlay" style={overlayStyle} />
        <DialogPrimitive.Content
          className="rc-dialog-content"
          style={{ ...contentStyle, ...(width ? { width } : {}) }}
          aria-describedby={undefined}
        >
          <DialogPrimitive.Close className="rc-dialog-close" aria-label="Close dialog">
            <IconX size={14} />
          </DialogPrimitive.Close>
          <DialogPrimitive.Title style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 700, paddingRight: 28 }}>
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description
              style={{ marginTop: 'var(--space-2)', color: 'var(--text-secondary)', fontSize: 'var(--text-md)' }}
            >
              {description}
            </DialogPrimitive.Description>
          ) : null}
          <div style={{ marginTop: 'var(--space-4)' }}>{children}</div>
          {footer ? (
            <div
              style={{
                marginTop: 'var(--space-5)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-2)',
              }}
            >
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const selectTriggerStyle = cssProps(
  'height:34px;padding:0 12px;border:1px solid var(--hairline-strong);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-md);display:flex;align-items:center;gap:8px;justify-content:space-between;min-width:180px',
);
const selectContentStyle = cssProps(
  'background:var(--surface-raised);border:1px solid var(--hairline);border-radius:var(--radius-lg);box-shadow:var(--shadow-2);padding:4px;z-index:70;max-height:320px;overflow:auto',
);
const selectItemStyle = cssProps(
  'padding:6px 10px;border-radius:var(--radius-sm);font-size:var(--text-md);outline:none',
);

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  ariaLabel,
  fullWidth,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Stretch to the container instead of the 180 px default (stacked rows). */
  fullWidth?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className="rc-select-trigger"
        style={fullWidth ? { ...selectTriggerStyle, minWidth: 0, width: '100%' } : selectTriggerStyle}
        aria-label={ariaLabel}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon style={{ color: 'var(--text-muted)' }}>
          <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true">
            <path d="m2 4 3 3 3-3" stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content style={selectContentStyle} position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                style={selectItemStyle}
                className="rc-select-item"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <IconCheck size={13} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onValueChange(v[0] ?? value)}
      aria-label={ariaLabel}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 20, width: '100%' }}
    >
      <SliderPrimitive.Track
        style={{ height: 4, width: '100%', borderRadius: 999, background: 'var(--hairline-strong)' }}
      >
        <SliderPrimitive.Range style={{ background: 'var(--accent)', borderRadius: 999, height: '100%' }} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="rc-slider-thumb"
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'var(--text-primary)',
          border: '2px solid var(--accent)',
          outline: 'none',
        }}
      />
    </SliderPrimitive.Root>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      className="rc-switch"
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      disabled={disabled}
      style={{
        width: 36,
        height: 21,
        borderRadius: 999,
        background: checked ? 'var(--accent)' : 'var(--hairline-strong)',
        position: 'relative',
        outline: 'none',
        border: 'none',
      }}
    >
      <SwitchPrimitive.Thumb
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: 15,
          height: 15,
          borderRadius: '50%',
          background: '#fff',
          transform: checked ? 'translateX(15px)' : 'none',
          transition: 'transform var(--dur-base) var(--ease-out)',
          boxShadow: 'var(--shadow-1)',
        }}
      />
    </SwitchPrimitive.Root>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              padding: '4px 8px',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-2)',
              zIndex: 80,
            }}
            sideOffset={6}
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function Tabs({
  tabs,
  value,
  onValueChange,
}: {
  tabs: Array<{ value: string; label: string }>;
  value: string;
  onValueChange: (v: string) => void;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange}>
      <TabsPrimitive.List
        className="rc-tabstrip"
        style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--hairline)', marginBottom: -1 }}
      >
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="rc-tab"
            style={{
              padding: '8px 14px',
              fontSize: 'var(--text-md)',
              fontWeight: 600,
              color: value === t.value ? 'var(--text-primary)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              borderBottom: value === t.value ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              outline: 'none',
            }}
          >
            {t.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((t) => (
        <TabsPrimitive.Content key={t.value} value={t.value} style={{ paddingTop: 'var(--space-4)' }} />
      ))}
    </TabsPrimitive.Root>
  );
}
