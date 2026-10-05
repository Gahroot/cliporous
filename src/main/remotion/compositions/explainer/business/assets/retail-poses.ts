import { reveal } from '../../diagrams/motion';
import { type BusinessClock, businessPhases } from '../motion';

export const RETAIL_ASSET_IDS = ['A-01', 'A-02', 'A-03', 'A-04'] as const;

/** Authored mounted-mesh ceilings, including hidden occupants; not GPU/RSS measurements. */
export const RETAIL_ASSET_BUDGETS = {
  'A-01': 24,
  'A-02': 21,
  'A-03': 21,
  'A-04': 24,
} as const;

/** Conservative local-space extents across all bounded poses, including hidden parts. */
export const RETAIL_ASSET_BOUNDS = {
  'A-01': { min: [-1.65, -1.25, -1.25], max: [2.25, 1.65, 1.7] },
  'A-02': { min: [-1.1, -1.6, -1.4], max: [1.1, 0, 1.4] },
  'A-03': { min: [-1.1, -1.25, -0.9], max: [1.1, 1.2, 1.2] },
  'A-04': { min: [-0.85, -1.45, -0.6], max: [0.85, 0.25, 0.65] },
} as const;

export interface RetailAssetParams {
  'A-01': { open: number };
  'A-02': { occupied: boolean };
  'A-03': { open: number };
  'A-04': { pending: boolean };
}

/**
 * Open means architectural inspection, not permission, availability or business success.
 * Source-bound occupancy/pending facts never advance with the presentation clock.
 * Omitted facts fail closed: an empty station and unresolved paperwork.
 */
export function sampleRetailAssets(
  clock: BusinessClock,
  states: { occupied?: boolean; pending?: boolean } = {},
): RetailAssetParams {
  const p = businessPhases(clock);
  return {
    'A-01': {
      open: reveal(p.time, clock.beats.actionAt, clock.beats.checkAt - clock.beats.actionAt),
    },
    'A-02': { occupied: states.occupied === true },
    'A-03': { open: p.response },
    'A-04': { pending: states.pending !== false },
  };
}
