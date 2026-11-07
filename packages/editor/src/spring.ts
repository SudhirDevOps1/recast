/**
 * Critically damped spring — closed-form step response.
 *
 * For x'' + 2ω·x' + ω²(x − goal) = 0 the exact solution over a constant-goal
 * interval is:
 *   x(t) = goal + (d + k·t)·e^(−ωt),  d = x0 − goal,  k = v0 + ω·d
 *   v(t) = (v0 − ω·k·t)·e^(−ωt)
 *
 * Being closed-form it is deterministic and frame-rate independent, which is
 * what keeps preview and export renders identical.
 */

export interface SpringState {
  x: number;
  v: number;
}

/** Advance a critically damped spring toward `goal` over `dt` seconds. */
export function springStep(state: SpringState, goal: number, omega: number, dt: number): SpringState {
  if (dt <= 0) return { x: state.x, v: state.v };
  const d = state.x - goal;
  const k = state.v + omega * d;
  const e = Math.exp(-omega * dt);
  const x1 = goal + (d + k * dt) * e;
  const v1 = (state.v - omega * k * dt) * e;
  return { x: x1, v: v1 };
}

/** Multi-dimensional helper: advance x and y independently. */
export function springStep2(
  state: { x: SpringState; y: SpringState },
  goalX: number,
  goalY: number,
  omega: number,
  dt: number,
): { x: SpringState; y: SpringState } {
  return {
    x: springStep(state.x, goalX, omega, dt),
    y: springStep(state.y, goalY, omega, dt),
  };
}

/** Critically damped springs never overshoot when starting at rest. */
export function settlesWithoutOvershoot(from: number, goal: number, samples: number[]): boolean {
  const lo = Math.min(from, goal);
  const hi = Math.max(from, goal);
  return samples.every((s) => s >= lo - 1e-9 && s <= hi + 1e-9);
}
