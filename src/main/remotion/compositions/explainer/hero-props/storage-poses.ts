import { smoothPhase } from '../mechanisms/kinematics';

/** Shared mesh dimensions, in local model units. */
export const PARCEL_SIZE = {
  width: 1.5,
  depth: 1.15,
  height: 1.25,
  baseY: -0.65,
  thickness: 0.06,
} as const;

/** Keeps the falling paper's rear edge ahead of the carcass roof. */
export const CABINET_DRAWER_TRAVEL = 0.8;

export const CABINET_PAPER = {
  width: 0.95,
  depth: 0.56,
  thickness: 0.02,
  seatY: 0.24,
  startY: 1.5,
  closedZ: 0.08,
} as const;

export const RESERVOIR_SIZE = {
  width: 1.55,
  height: 1.8,
  depth: 0.72,
  bottomY: -0.75,
  fillHeight: 1.5,
  low: 0.16,
  high: 0.82,
} as const;

export type ParcelPose = Readonly<{
  sideAngle: number;
  endAngle: number;
  lidAngle: number;
}>;
export type FilingCabinetPose = Readonly<{
  drawer: number;
  /** Shared origin of the three-sheet stack, not an independent per-sheet animation. */
  paperY: number;
  paperZ: number;
}>;
export type ReservoirPose = Readonly<{ level: number; flow: number }>;

/** All samplers take local seconds (scene t - at). Invalid time means rest. */
export function sampleParcelPose(t: number): ParcelPose {
  const time = Number.isFinite(t) ? Math.min(t, 1.5) : 0;
  return {
    sideAngle: smoothPhase(time, 0.15, 0.6) * (Math.PI / 2),
    endAngle: smoothPhase(time, 0.45, 1) * (Math.PI / 2),
    lidAngle: smoothPhase(time, 1.05, 1.5) * (Math.PI / 2),
  };
}

export function sampleFilingCabinetPose(t: number): FilingCabinetPose {
  const time = Number.isFinite(t) ? Math.min(t, 1.65) : 0;
  const open = smoothPhase(time, 0.2, 0.65);
  const close = smoothPhase(time, 1.15, 1.65);
  const drawer = CABINET_DRAWER_TRAVEL * open * (1 - close);
  const drop = smoothPhase(time, 0.7, 1.1);
  return {
    drawer,
    paperY:
      drop === 1
        ? CABINET_PAPER.seatY
        : CABINET_PAPER.startY + (CABINET_PAPER.seatY - CABINET_PAPER.startY) * drop,
    // Wait above the open drawer; only a seated stack travels with its closing floor.
    paperZ: time <= 1.15 ? 0.88 : CABINET_PAPER.closedZ + drawer,
  };
}

export function sampleReservoirPose(t: number, down = false): ReservoirPose {
  const time = Number.isFinite(t) ? Math.min(t, 1.3) : 0;
  const p = smoothPhase(time, 0.2, 1.3);
  const start = down ? RESERVOIR_SIZE.high : RESERVOIR_SIZE.low;
  const end = down ? RESERVOIR_SIZE.low : RESERVOIR_SIZE.high;
  return {
    // Explicit endpoints avoid residual floating-point changes during the final hold.
    level: p === 0 ? start : p === 1 ? end : start + (down ? -0.66 : 0.66) * p,
    flow: 4 * p * (1 - p),
  };
}
