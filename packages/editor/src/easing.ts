/**
 * Easing curves for motion editing — pure, deterministic, allocation-free.
 *
 * Used by the zoom-track builder (per-keyframe approach curves), clip intro
 * transitions and cursor effects. Every curve maps t ∈ [0, 1] → progress,
 * with `pop` overshooting past 1 briefly (ease-out-back) for physical pop.
 */

export type EaseName = 'linear' | 'in' | 'out' | 'inout' | 'hold' | 'pop';

export const EASE_NAMES: readonly EaseName[] = ['linear', 'in', 'out', 'inout', 'hold', 'pop'];

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Evaluate an easing curve. `t` is clamped to [0, 1] first. */
export function evalEase(name: EaseName, t: number): number {
  const x = clamp01(t);
  switch (name) {
    case 'linear':
      return x;
    case 'in':
      return x * x * x;
    case 'out':
      return 1 - Math.pow(1 - x, 3);
    case 'inout':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'hold':
      // Stay on the previous value, then snap at the end.
      return x >= 1 ? 1 : 0;
    case 'pop': {
      // easeOutBack with a restrained overshoot (~10 %).
      const c1 = 1.35;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
  }
}

export const EASE_LABELS: Record<EaseName, string> = {
  linear: 'Linear',
  in: 'Ease in',
  out: 'Silky (spring)',
  inout: 'Smooth (in-out)',
  hold: 'Hold, then snap',
  pop: 'Pop (bounce)',
};

/** Linear interpolation helper shared by the motion modules. */
export function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}
