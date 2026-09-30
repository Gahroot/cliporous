import { STRUCTURE_TIMING } from '../hero-catalog';
import { smoothPhase } from '../mechanisms/kinematics';
import type { Vec3 } from '../mechanisms/paths';

export const BRIDGE_SIZE = {
  halfSpan: 1.1,
  pivotY: -0.18,
  top: 0.06,
  bottom: -0.06,
  noseInset: 0.1,
  depth: 0.66,
} as const;
export type BridgePose = Readonly<{ angle: number }>;

export const ARCH_BLOCK_IDS = [0, 1, 2, 3, 4, 5, 6] as const;
export type ArchBlockId = (typeof ARCH_BLOCK_IDS)[number];
export const ARCH_SIZE = {
  innerRadius: 0.72,
  outerRadius: 1.04,
  depth: 0.5,
  baseY: -0.25,
  seamRadians: 0.014,
  bevel: 0.004,
} as const;
export type ArchPose = Readonly<{
  seating: readonly [number, number, number, number, number, number, number];
}>;

function time(elapsed: number): number {
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(3, elapsed)) : 0;
}

export function sampleBridge(elapsed: number): BridgePose {
  return { angle: 0.82 * (1 - smoothPhase(time(elapsed), 0.3, STRUCTURE_TIMING.bridge)) };
}

/** Shared transform for contact tests. x is distance inward from a fixed hinge. */
export function bridgePoint(side: -1 | 1, angle: number, x: number, y: number): Vec3 {
  return [
    side * (BRIDGE_SIZE.halfSpan - x * Math.cos(angle) + y * Math.sin(angle)),
    BRIDGE_SIZE.pivotY + x * Math.sin(angle) + y * Math.cos(angle),
    0,
  ];
}

export function sampleArch(elapsed: number): ArchPose {
  const t = time(elapsed);
  const bottom = smoothPhase(t, 0.3, 0.52);
  const middle = smoothPhase(t, 0.48, 0.7);
  const upper = smoothPhase(t, 0.66, 0.88);
  const key = smoothPhase(t, 0.96, STRUCTURE_TIMING.arch);
  return { seating: [bottom, middle, upper, key, upper, middle, bottom] };
}

export function archBlockAngle(id: ArchBlockId): number {
  return ((id + 0.5) * Math.PI) / ARCH_BLOCK_IDS.length;
}

/** Radial seating stays in each block's own sector, so neighboring pieces cannot collide. */
export function archBlockOffset(id: ArchBlockId, seated: number): Vec3 {
  const lift = (1 - seated) * (id === 3 ? 0.65 : 0.3);
  const angle = archBlockAngle(id);
  return [Math.cos(angle) * lift, Math.sin(angle) * lift, 0];
}
