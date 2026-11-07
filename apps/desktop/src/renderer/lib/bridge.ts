import type { RecastBridge } from '../../preload/index';

/** Typed accessor for the injected bridge. Throws loudly when missing. */
export function bridge(): RecastBridge {
  const b = (window as unknown as { recast?: RecastBridge }).recast;
  if (!b) throw new Error('Recast bridge unavailable — preload failed or wrong environment.');
  return b;
}
