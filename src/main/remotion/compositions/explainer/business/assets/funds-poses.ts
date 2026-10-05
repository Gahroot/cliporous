import { reveal } from '../../diagrams/motion';
import { type BusinessClock, businessPhases } from '../motion';

export const FUNDS_ASSET_IDS = ['A-09', 'A-10', 'A-11', 'A-12'] as const;
export type FundsAssetId = (typeof FUNDS_ASSET_IDS)[number];

/** Authored mounted-mesh ceilings, including hidden parts; not GPU-memory measurements. */
export const FUNDS_ASSET_BUDGETS = {
  'A-09': 21,
  'A-10': 24,
  'A-11': 21,
  'A-12': 23,
} as const satisfies Record<FundsAssetId, number>;

/** Local-space envelopes for every bounded pose, before a scene/board's outer transform. */
export const FUNDS_ASSET_BOUNDS = {
  'A-09': { min: [-1.82, -0.8, -0.17], max: [1.9, 0.8, 1.33] },
  'A-10': { min: [-2.52, -0.96, -0.44], max: [2.52, 0.7, 0.43] },
  'A-11': { min: [-0.97, -1.08, -0.95], max: [0.97, 1.54, 0.99] },
  'A-12': { min: [-0.85, -0.7, -0.78], max: [0.85, 1.33, 0.78] },
} as const satisfies Record<
  FundsAssetId,
  { min: readonly [number, number, number]; max: readonly [number, number, number] }
>;

export interface FundAssetsPose {
  open: number;
  tierReveals: readonly [number, number, number, number];
  maturityReveal: number;
  separation: number;
}

/**
 * Presentation only: opening a commitment never contributes cash. Tier reveals are
 * visibility weights, NOT fill ratios. A source-valid pack supplies contributed,
 * exact tier fills, maturity focus and all evidence/status labels independently.
 * Every transition settles by resolveAt, with no motion during the reading hold.
 */
export function sampleFundAssets(clock: BusinessClock): FundAssetsPose {
  const p = businessPhases(clock);
  if (p.holding) {
    return { open: 1, tierReveals: [1, 1, 1, 1], maturityReveal: 1, separation: 1 };
  }
  const b = clock.beats;
  const duration = (b.resolveAt - b.responseAt) / 4;
  const tier = (index: number): number => reveal(p.time, b.responseAt + duration * index, duration);
  return {
    open: p.action,
    tierReveals: [tier(0), tier(1), tier(2), tier(3)],
    maturityReveal: p.check,
    separation: p.response,
  };
}
