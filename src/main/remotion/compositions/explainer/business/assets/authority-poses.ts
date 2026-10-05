import { reveal } from '../../diagrams/motion';
import { type BusinessClock, businessPhases, type HandshakeState } from '../motion';

export const AUTHORITY_ASSET_IDS = ['A-05', 'A-06', 'A-07', 'A-08'] as const;
export type AuthorityAssetId = (typeof AUTHORITY_ASSET_IDS)[number];

/** Authored mounted-mesh ceilings, including hidden sheets/marks; not GPU measurements. */
export const AUTHORITY_ASSET_BUDGETS = {
  'A-05': 12,
  'A-06': 24,
  'A-07': 21,
  'A-08': 24,
} as const satisfies Record<AuthorityAssetId, number>;

/** Local-space envelopes across every bounded pose, including the binder's cover sweep. */
export const AUTHORITY_ASSET_BOUNDS = {
  'A-05': { min: [-0.84, -1.02, -0.05], max: [0.84, 1.02, 0.12] },
  'A-06': { min: [-1.25, -0.61, -0.7], max: [1.42, 0.78, 0.45] },
  'A-07': { min: [-1.52, -0.9, -0.2], max: [0.72, 0.9, 1.47] },
  'A-08': { min: [-0.74, -0.92, -0.56], max: [0.74, 0.46, 0.62] },
} as const satisfies Record<
  AuthorityAssetId,
  { min: readonly [number, number, number]; max: readonly [number, number, number] }
>;

export type AuthorityPermissionState = 'allowed' | 'denied' | 'unknown';
export interface PermissionCardProps {
  state: AuthorityPermissionState;
  focus: number;
}
export interface ApprovalRailProps {
  /** Visual acceptance progress, supplied only for a source-approved gate. */
  accepted: number;
}
export interface PlaybookBinderProps {
  open: number;
  /** Two authored guidance-version slots, not training iterations or model versions. */
  revision?: 0 | 1;
}
export interface ExceptionTrolleyProps {
  pending: boolean;
}

/** Facts belong to the validated pack; elapsed time never grants authority or clears an exception. */
export interface AuthorityAssetFacts {
  permissionState: AuthorityPermissionState;
  gateState: HandshakeState;
  revision?: 0 | 1;
  pending: boolean;
}
export interface AuthorityAssetPose {
  permissionCard: PermissionCardProps;
  approvalRail: ApprovalRailProps;
  playbookBinder: PlaybookBinderProps;
  exceptionTrolley: ExceptionTrolleyProps;
  gateState: HandshakeState;
}

/** Pure, finite, seekable model parameters. All motion stops by resolveAt. */
export function sampleAuthorityAssets(
  clock: BusinessClock,
  facts: AuthorityAssetFacts,
): AuthorityAssetPose {
  const p = businessPhases(clock);
  const b = clock.beats;
  return {
    permissionCard: {
      state: facts.permissionState,
      focus: reveal(p.time, b.responseAt, b.resolveAt - b.responseAt),
    },
    approvalRail: { accepted: facts.gateState === 'approved' ? p.check : 0 },
    playbookBinder: { open: p.response, revision: facts.revision ?? 0 },
    exceptionTrolley: { pending: facts.pending },
    gateState: facts.gateState,
  };
}
