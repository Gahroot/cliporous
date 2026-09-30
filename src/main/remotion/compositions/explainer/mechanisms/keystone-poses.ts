import { ARCH_SIZE, type ArchPose } from '../hero-props/structures-poses';
import { KEYSTONE_WITHDRAW_SECONDS, type KeystoneScene } from '../types';
import { smoothPhase } from './kinematics';

export const KEYSTONE_INSERT_SECONDS = 0.3;
/** A visible pause between the last side pair seating and the keystone moving. */
export const KEYSTONE_SIDE_HOLD_SECONDS = 0.06;

/** Shared centering/strut dimensions: all in ArchRig's unscaled coordinate system. */
export const KEYSTONE_SUPPORT = {
  // Leave a sub-pixel fitting seam outside ArchRig's inward bevel and arc facets.
  outerRadius: ARCH_SIZE.innerRadius - ARCH_SIZE.bevel - 0.002,
  thickness: 0.09,
  endAngle: Math.PI / 10,
  depth: 0.3,
  drop: 0.42,
  strutX: 0.34,
  strutRadius: 0.035,
  strutLength: 0.62,
  shoeHalfWidth: 0.075,
  shoeBottom: 0.38,
  sleeveRadius: 0.075,
  sleeveBore: 0.047,
  sleeveBottomY: ARCH_SIZE.baseY - 0.69,
  sleeveTopY: ARCH_SIZE.baseY - 0.18,
  footWidth: 0.2,
  footDepth: 0.34,
  footBottomY: ARCH_SIZE.baseY - 0.76,
} as const;

export type KeystonePose = Readonly<{
  arch: ArchPose;
  /** Curved centering translates vertically; it never fades or scales away. */
  supportY: number;
  /** Rigid struts translate into hollow sleeves, without crossing their foot plates. */
  strutY: number;
}>;

function pose(seating: ArchPose['seating'], drop: number): KeystonePose {
  const supportY = ARCH_SIZE.baseY - drop;
  return {
    arch: { seating },
    supportY,
    strutY: supportY + KEYSTONE_SUPPORT.shoeBottom - KEYSTONE_SUPPORT.strutLength / 2,
  };
}

/** Paired seats → final 0.3s key insertion → locked hold → 0.45s support lowering. */
export function sampleKeystone(t: number, scene: KeystoneScene): KeystonePose {
  const { supportsAt, blocksAt, lockAt, withdrawAt } = scene;
  const keyAt = lockAt - KEYSTONE_INSERT_SECONDS;
  const sidesAt = keyAt - KEYSTONE_SIDE_HOLD_SECONDS;
  if (
    ![t, supportsAt, blocksAt, lockAt, withdrawAt].every(Number.isFinite) ||
    supportsAt < 0 ||
    blocksAt <= supportsAt ||
    sidesAt <= blocksAt ||
    withdrawAt < 0
  ) {
    return pose([0, 0, 0, 0, 0, 0, 0], 0);
  }
  // Parser supplies this hold; keep an independent interlock for directly-authored scenes.
  const releaseAt = Math.max(withdrawAt, lockAt + 0.45);
  const settledAt = releaseAt + KEYSTONE_WITHDRAW_SECONDS;
  const time = Math.max(0, Math.min(t, settledAt));
  const pairSeconds = (sidesAt - blocksAt) / 3;
  const bottom = smoothPhase(time, blocksAt, blocksAt + pairSeconds);
  const middle = smoothPhase(time, blocksAt + pairSeconds, blocksAt + 2 * pairSeconds);
  const upper = smoothPhase(time, blocksAt + 2 * pairSeconds, sidesAt);
  const key = smoothPhase(time, keyAt, lockAt);
  const drop = KEYSTONE_SUPPORT.drop * smoothPhase(time, releaseAt, settledAt);
  // supportsAt marks an already-present hold: there is no unsupported arrival animation.
  return pose([bottom, middle, upper, key, upper, middle, bottom], drop);
}
