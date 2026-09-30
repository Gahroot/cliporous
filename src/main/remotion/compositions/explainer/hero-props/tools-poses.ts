import { TOOLS_TIMING } from '../hero-catalog';
import { clamp01, smoothPhase } from '../mechanisms/kinematics';
import type { Vec3 } from '../mechanisms/paths';

export type MetronomePose = Readonly<{ angle: number }>;
export const METRONOME_SWING = 0.4;

/** Shared synchronization rig input: phase in radians, amplitude in [0, 1]. No clock. */
export function metronomePoseAtPhase(phase: number, amplitude = 1): MetronomePose {
  const strength = clamp01(amplitude);
  return {
    angle:
      Number.isFinite(phase) && strength > 0 ? METRONOME_SWING * Math.sin(phase) * strength : 0,
  };
}

function sampleTime(elapsed: number): number {
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(4, elapsed)) : 0;
}

export function sampleMetronomePose(elapsed: number): MetronomePose {
  const t = sampleTime(elapsed);
  const amplitude = smoothPhase(t, 0.2, 0.4) * (1 - smoothPhase(t, 2, 2.4));
  return metronomePoseAtPhase(((t - TOOLS_TIMING.metronome) * Math.PI * 2) / 0.8, amplitude);
}

export const WATERING_CAN = {
  spout: [1.12, 0.46, 0] as Vec3,
  target: [1.32, -0.95, 0] as Vec3,
  tilt: -0.55,
  flightSec: 0.32,
  drops: 8,
} as const;

/** Absolute seconds in the caller's timeline; stopAt is the LAST emission, not last arrival. */
export type WateringSchedule = Readonly<{
  tiltAt: number;
  flowAt: number;
  stopAt: number;
  restAt: number;
}>;
export const WATERING_SCHEDULE: WateringSchedule = {
  tiltAt: 0.25,
  flowAt: TOOLS_TIMING['watering-can'] - WATERING_CAN.flightSec,
  stopAt: 1.33,
  restAt: 1.95,
};
export type WaterDropPose = Readonly<{ id: number; position: Vec3; visible: boolean }>;
export type WateringCanPose = Readonly<{
  tilt: number;
  drops: readonly WaterDropPose[];
  /** Fraction received at the target; never advances before the first contact. */
  received: number;
}>;

/** Outlet in rig-local coordinates, after clockwise rotation about the can body origin. */
export function wateringCanSpout(tilt: number): Vec3 {
  const angle = Number.isFinite(tilt) ? tilt : 0;
  const [x, y, z] = WATERING_CAN.spout;
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z];
}

/**
 * A bounded eight-drop pour. The can, drops and target share ONE local coordinate system.
 * Drops start at the tilted rose, follow downward parabolas, then merge into the receiver.
 * Relay scenes may author a new schedule/target and place the entire rig in a parent group.
 */
export function sampleWateringPour(
  time: number,
  schedule: WateringSchedule = WATERING_SCHEDULE,
  target: Vec3 = WATERING_CAN.target,
): WateringCanPose {
  const { tiltAt, flowAt, stopAt, restAt } = schedule;
  const valid =
    [time, tiltAt, flowAt, stopAt, restAt, ...target].every(Number.isFinite) &&
    flowAt > tiltAt &&
    stopAt > flowAt &&
    restAt > stopAt;
  const t = valid ? Math.min(time, Math.max(restAt, stopAt + WATERING_CAN.flightSec) + 0.1) : 0;
  const timing = valid ? schedule : WATERING_SCHEDULE;
  const receiver = valid ? target : WATERING_CAN.target;
  const source = wateringCanSpout(WATERING_CAN.tilt);
  const tilt =
    WATERING_CAN.tilt *
    smoothPhase(t, timing.tiltAt, timing.flowAt) *
    (1 - smoothPhase(t, timing.stopAt, timing.restAt));
  let received = 0;
  const drops = Array.from({ length: WATERING_CAN.drops }, (_, id): WaterDropPose => {
    const emitAt =
      timing.flowAt + (id / (WATERING_CAN.drops - 1)) * (timing.stopAt - timing.flowAt);
    const landAt = emitAt + WATERING_CAN.flightSec;
    const u = clamp01((t - emitAt) / WATERING_CAN.flightSec);
    received += smoothPhase(t, landAt, landAt + 0.1) / WATERING_CAN.drops;
    return {
      id,
      position: [
        source[0] + (receiver[0] - source[0]) * u,
        source[1] + (receiver[1] - source[1]) * u * u,
        source[2] + (receiver[2] - source[2]) * u,
      ],
      visible: t >= emitAt && t <= landAt,
    };
  });
  return { tilt, drops, received };
}

export function sampleWateringCanPose(elapsed: number): WateringCanPose {
  return sampleWateringPour(sampleTime(elapsed));
}

export type WrenchPose = Readonly<{
  gap: number;
  angle: number;
  nutAngle: number;
  lift: number;
}>;
export const WRENCH_GEOMETRY = {
  nutRadius: 0.21,
  jawHalfGap: 0.19,
  travel: 0.66,
  turn: Math.PI / 6,
} as const;

/** The open jaws seat BEFORE torque. Wrench and nut then turn together about the same axis. */
export function sampleWrenchPose(elapsed: number, down = false): WrenchPose {
  const t = sampleTime(elapsed);
  const turn = smoothPhase(t, TOOLS_TIMING.wrench + 0.1, 1.4);
  const angle = (down ? 1 : -1) * WRENCH_GEOMETRY.turn * turn;
  return {
    gap: WRENCH_GEOMETRY.travel * (1 - smoothPhase(t, 0.25, TOOLS_TIMING.wrench)),
    angle,
    nutAngle: angle,
    lift: 0.07 * (down ? turn : 1 - turn),
  };
}
