import { reveal } from '../../diagrams/motion';
import { type BusinessClock, businessPhases } from '../motion';

export const INFRASTRUCTURE_ASSET_IDS = ['A-13', 'A-14', 'A-15', 'A-16'] as const;

/** Maximum mounted authored meshes, including hidden details; not GPU/resource measurements. */
export const INFRASTRUCTURE_ASSET_BUDGETS = {
  'A-13': 8,
  'A-14': 19,
  'A-15': 19,
  'A-16': 13,
} as const;

/** Local-space envelopes, including the open switch and fully detached provider plugs. */
export const INFRASTRUCTURE_ASSET_BOUNDS = {
  'A-13': { min: [-1.19, -1.37, -0.73], max: [1.19, 1.37, 0.73] },
  'A-14': { min: [-1.51, -1.19, -0.96], max: [1.51, 1.67, 0.96] },
  'A-15': { min: [-1.61, -1.22, -0.84], max: [1.61, 0.98, 0.84] },
  'A-16': { min: [-1.4, -1.1, -0.18], max: [1.4, 1.1, 1.96] },
} as const;

export interface InfrastructureAssetPose {
  rack: { reveal: number; activity: number };
  substation: { reveal: number };
  cooling: { reveal: number };
  provider: { reveal: number; progress: number };
}

/**
 * Presentation only, settled by resolveAt. Activity is an illustrative rack emphasis,
 * not utilization or telemetry. The caller supplies source-stated ready/active/connected
 * flags separately: elapsed time cannot establish physical readiness or configuration.
 */
export function sampleInfrastructureAssets(clock: BusinessClock): InfrastructureAssetPose {
  const p = businessPhases(clock);
  return {
    rack: { reveal: p.setup, activity: p.action },
    substation: { reveal: p.action },
    cooling: { reveal: p.response },
    provider: {
      reveal: p.setup,
      progress: reveal(p.time, clock.beats.checkAt, clock.beats.resolveAt - clock.beats.checkAt),
    },
  };
}
