import { LEAK_SEAL_SECONDS, type ResourceLeakScene } from '../types';
import { clamp01, phase, smoothPhase } from './kinematics';

/** Authored volumes are tank-capacity fractions, not claims about a real resource. */
export const RESOURCE_INITIAL_LEVEL = 0.26;
export const RESOURCE_FINAL_LEVEL = 0.84;
export const LEAK_OPEN_SECONDS = 0.18;

export type ResourceLeakPose = Readonly<{
  level: number;
  /** Both gates and their streams use this one normalized aperture. */
  leakOpen: number;
  inletRate: number;
  leakRate: number;
  incoming: number;
  escaped: number;
}>;

/** Integral of a smooth opening, with a linear tail once fully open. */
function rampArea(t: number, startAt: number, endAt: number): number {
  const u = phase(t, startAt, endAt);
  return (endAt - startAt) * (u ** 3 - u ** 4 / 2) + Math.max(0, t - endAt);
}

function smoothRate(t: number, startAt: number, endAt: number): number {
  const u = phase(t, startAt, endAt);
  return (6 * u * (1 - u)) / (endAt - startAt);
}

/** Integrated flow, not an accumulated simulation: every frame conserves the same volume. */
export function sampleResourceLeak(t: number, scene: ResourceLeakScene): ResourceLeakPose {
  const { inflowAt, leakAt, sealAt, retainAt } = scene;
  const closedAt = sealAt + LEAK_SEAL_SECONDS;
  if (
    ![t, inflowAt, leakAt, sealAt, retainAt].every(Number.isFinite) ||
    leakAt <= inflowAt ||
    sealAt <= leakAt + LEAK_OPEN_SECONDS ||
    retainAt <= closedAt
  ) {
    return {
      level: RESOURCE_INITIAL_LEVEL,
      leakOpen: 0,
      inletRate: 0,
      leakRate: 0,
      incoming: 0,
      escaped: 0,
    };
  }
  const time = Math.min(t, retainAt);
  const initialFill = smoothPhase(time, inflowAt, leakAt);
  const retainedFill = smoothPhase(time, closedAt, retainAt);
  const leakOpen = clamp01(
    smoothPhase(time, leakAt, leakAt + LEAK_OPEN_SECONDS) - smoothPhase(time, sealAt, closedAt),
  );
  // Clamp the integrals at closure: no cancellation of enormous time values on a late seek.
  const leakTime = Math.min(time, closedAt);
  const area = sealAt - leakAt + (LEAK_SEAL_SECONDS - LEAK_OPEN_SECONDS) / 2;
  const leakFraction =
    time >= closedAt
      ? 1
      : clamp01(
          (rampArea(leakTime, leakAt, leakAt + LEAK_OPEN_SECONDS) -
            rampArea(leakTime, sealAt, closedAt)) /
            area,
        );
  const incoming = 0.24 * initialFill + 0.14 * leakFraction + 0.54 * retainedFill;
  const escaped = 0.34 * leakFraction;
  return {
    level: time >= retainAt ? RESOURCE_FINAL_LEVEL : RESOURCE_INITIAL_LEVEL + incoming - escaped,
    leakOpen,
    inletRate:
      0.24 * smoothRate(time, inflowAt, leakAt) +
      (0.14 * leakOpen) / area +
      0.54 * smoothRate(time, closedAt, retainAt),
    leakRate: (0.34 * leakOpen) / area,
    incoming,
    escaped,
  };
}
