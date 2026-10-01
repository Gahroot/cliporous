import { reveal } from '../diagrams/motion';
import type { TechnologyBeats } from '../technology/types';
import type { Money, OwnershipChangeScene } from './types';

export function ownershipPose(
  t: number,
  scene: OwnershipChangeScene,
): { shares: number; total: number; issuedReveal: number } {
  const issuedReveal = reveal(t, scene.actionAt, 0.7);
  return {
    shares: scene.shares,
    total: t < scene.responseAt ? scene.beforeTotal : scene.afterTotal,
    issuedReveal,
  };
}

export function formatMoney(money: Money): string {
  return `${(money.minorUnits / 100).toFixed(money.minorUnits % 100 ? 2 : 0)} ${money.currency}`;
}
export function fundFlowPose(
  t: number,
  beats: TechnologyBeats,
): { contributed: number; deployed: number } {
  return {
    contributed: reveal(t, beats.actionAt, 0.65),
    deployed: reveal(t, beats.responseAt, 0.65),
  };
}
/** Exact counters for tests and explicitly stated quantity movement; total is always conserved. */
export function conservedFlowState(
  totalMinor: number,
  deployedMinor: number,
  pose: ReturnType<typeof fundFlowPose>,
): {
  sourceMinor: number;
  accountMinor: number;
  targetMinor: number;
} {
  const contributed = Math.floor(totalMinor * pose.contributed);
  const deployed = Math.min(contributed, Math.floor(deployedMinor * pose.deployed));
  return {
    sourceMinor: totalMinor - contributed,
    accountMinor: contributed - deployed,
    targetMinor: deployed,
  };
}
