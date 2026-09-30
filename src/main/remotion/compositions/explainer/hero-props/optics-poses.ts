import { OPTICS_TIMING } from '../hero-catalog';
import { smoothPhase } from '../mechanisms/kinematics';

export type PrismPose = Readonly<{ incident: number; through: number; split: number }>;
export type AperturePose = Readonly<{ closed: number }>;

/** Shared by the model and coverage tests: opaque leaves overlap beneath the rim. */
export const APERTURE_GEOMETRY = {
  pivot: 0.55,
  swing: 0.85,
  innerRadius: 0.77,
  outerRadius: 1.24,
  layerStep: 0.024,
  bladeDepth: 0.018,
  // Convex envelope of a 60-degree sector across the full sweep. The hidden outer
  // margin supplies overlap at intermediate poses, not just the two endpoints.
  points: [
    [-0.30609, 0.52722],
    [-0.04168, -0.07371],
    [0.23182, -0.11337],
    [0.41883, 0.29984],
    [0.42599, 0.373],
    [0.42631, 0.44651],
    [0.41979, 0.51973],
    [0.4065, 0.59203],
    [0.38655, 0.66278],
    [0.36011, 0.73137],
    [0.3274, 0.7972],
    [0.28872, 0.85971],
    [0.2444, 0.91836],
    [0.19482, 0.97263],
    [0.1404, 1.02205],
    [0.08163, 1.06621],
    [0.0533, 1.03948],
    [0.02693, 1.01081],
    [0.00265, 0.98036],
    [-0.01941, 0.94825],
  ],
} as const;
export type MagnifierPose = Readonly<{ x: number; y: number; magnification: number }>;
export type TelescopePose = Readonly<{ extension: number; aim: number }>;

/** Bound phase division as well as the returned pose, including extreme finite seeks. */
function sampleTime(elapsed: number): number {
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(3, elapsed)) : 0;
}

export function samplePrism(elapsed: number): PrismPose {
  const t = sampleTime(elapsed);
  return {
    incident: smoothPhase(t, 0.3, 0.7),
    through: smoothPhase(t, 0.7, 0.82),
    split: smoothPhase(t, 0.82, OPTICS_TIMING.prism),
  };
}

export function sampleAperture(elapsed: number): AperturePose {
  return { closed: smoothPhase(sampleTime(elapsed), 0.3, OPTICS_TIMING.aperture) };
}

export function sampleMagnifier(elapsed: number): MagnifierPose {
  const t = sampleTime(elapsed);
  const align = smoothPhase(t, 0.25, 0.8);
  return {
    x: 0.8 * (1 - align),
    y: 0.22 + 0.35 * (1 - align),
    magnification: 1 + 1.5 * smoothPhase(t, 0.8, OPTICS_TIMING['magnifying-glass']),
  };
}

export function sampleTelescope(elapsed: number): TelescopePose {
  const t = sampleTime(elapsed);
  return {
    extension: smoothPhase(t, 0.25, 0.85),
    aim: 0.26 * smoothPhase(t, 0.85, OPTICS_TIMING.telescope),
  };
}
