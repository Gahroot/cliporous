import { BUSINESS_RECIPES } from '../catalog';
import type { BusinessAssetId } from '../types';
import type { BusinessAssetRecord } from './types';

/** React-free authored metadata; no model imports, render functions or source parser. */
function asset(
  id: BusinessAssetId,
  name: string,
  authoredMeshCeiling: number,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  sourceDependencies: readonly string[],
): BusinessAssetRecord {
  return {
    id,
    name,
    authoredMeshCeiling,
    bounds: { min, max },
    allowedRecipes: BUSINESS_RECIPES.filter((recipe) => recipe.assets.includes(id)).map(
      (recipe) => recipe.id,
    ),
    sourceDependencies,
    provenance: 'project-authored',
    standaloneHero: false,
  };
}

export const BUSINESS_ASSETS: readonly BusinessAssetRecord[] = [
  asset(
    'A-01',
    'Commercial storefront and cutaway',
    24,
    [-1.65, -1.25, -1.25],
    [2.25, 1.65, 1.7],
    [
      'Same source-named business and supported internal service/task relationships',
      'Authored architecture is illustrative, not a measured floorplan',
    ],
  ),
  asset(
    'A-02',
    'Service station',
    21,
    [-1.1, -1.6, -1.4],
    [1.1, 0, 1.4],
    [
      'Named service station or an explicit illustrative service metaphor',
      'Occupancy is separately source-stated; no booking inferred from time',
    ],
  ),
  asset(
    'A-03',
    'Branch pod',
    21,
    [-1.1, -1.25, -0.9],
    [1.1, 1.2, 1.2],
    [
      'Distinct supported local unit identity and any shared-standard relationship',
      'No performance gain or replicated-unit count inferred from the lens',
    ],
  ),
  asset(
    'A-04',
    'Operating desk and inbox',
    24,
    [-0.85, -1.45, -0.6],
    [0.85, 0.25, 0.65],
    [
      'Named task/operating record or explicit desk/inbox illustration',
      'Pending is a declared task state, not a completion animation',
    ],
  ),
  asset(
    'A-05',
    'Permission card',
    12,
    [-0.84, -1.02, -0.05],
    [0.84, 1.02, 0.12],
    [
      'Named delegate and explicit action permission or unknown boundary',
      'Capability does not grant permission',
    ],
  ),
  asset(
    'A-06',
    'Approval rail',
    24,
    [-1.25, -0.61, -0.7],
    [1.42, 0.78, 0.45],
    [
      'Source-stated review/approver role and gate state',
      'Accepted segment requires actual supported approval, not a pending request',
    ],
  ),
  asset(
    'A-07',
    'Playbook binder and versions',
    21,
    [-1.52, -0.9, -0.2],
    [0.72, 0.9, 1.47],
    [
      'Named playbook identity and explicit source revision(s)',
      'Inspection cannot approve a revision or imply model retraining',
    ],
  ),
  asset(
    'A-08',
    'Exception trolley and inbox',
    24,
    [-0.74, -0.92, -0.56],
    [0.74, 0.46, 0.62],
    [
      'Source-supported exception/review or pending operating record',
      'Cleared work requires a supported later state',
    ],
  ),
  asset(
    'A-09',
    'Commitment folio',
    21,
    [-1.82, -0.8, -0.17],
    [1.9, 0.8, 1.33],
    [
      'Commitment/contribution identity with distinct legal-record and cash states',
      'Visible cash requires source-stated paid contribution',
    ],
  ),
  asset(
    'A-10',
    'Distribution tier trays',
    24,
    [-2.52, -0.96, -0.44],
    [2.52, 0.7, 0.43],
    [
      'Four source-stated ordered tier/allocation identities or an explicit non-numeric illustration',
      'Numeric fills require exact supported ratios and valid priority eligibility; no default fund terms',
    ],
  ),
  asset(
    'A-11',
    'Maturity ladder',
    21,
    [-0.97, -1.08, -0.95],
    [0.97, 1.54, 0.99],
    [
      'Three source-stated obligation/date slots or an explicit date-free illustration',
      'Focus does not imply liquidity, a return or a guaranteed refinance',
    ],
  ),
  asset(
    'A-12',
    'Economic-rights layers',
    23,
    [-0.85, -0.7, -0.78],
    [0.85, 1.33, 0.78],
    [
      'Distinct underlying asset, ownership and claim identities',
      'Separation is an inspection; transferability is not liquid payout',
    ],
  ),
  asset(
    'A-13',
    'Data-center rack',
    8,
    [-1.19, -1.37, -0.73],
    [1.19, 1.37, 0.73],
    [
      'Named supported physical/compute capacity or explicit rack illustration',
      'Fixed server details and emphasis are illustrative, not utilization/telemetry',
    ],
  ),
  asset(
    'A-14',
    'Power-readiness substation',
    19,
    [-1.51, -1.19, -0.96],
    [1.51, 1.67, 0.96],
    [
      'Source-stated physical power-readiness state',
      'Money ready does not make power ready; unknown does not become success',
    ],
  ),
  asset(
    'A-15',
    'Cooling loop',
    19,
    [-1.61, -1.22, -0.84],
    [1.61, 0.98, 0.84],
    [
      'Source-stated cooling state or explicit infrastructure illustration',
      'Static loop/fan is not a measured-flow or physics simulation',
    ],
  ),
  asset(
    'A-16',
    'Provider connector panel',
    13,
    [-1.4, -1.1, -0.18],
    [1.4, 1.1, 1.96],
    [
      'Source-named provider/system boundary and stated connection/transition',
      'Configuration is not observed processing, certification or successful exit',
    ],
  ),
];

export function businessAsset(id: string): BusinessAssetRecord | null {
  return BUSINESS_ASSETS.find((entry) => entry.id === id) ?? null;
}
