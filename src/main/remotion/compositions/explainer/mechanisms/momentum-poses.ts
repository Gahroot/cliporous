import { BELT_RADIUS } from '../hero-props/transport-poses';
import type { MomentumScene } from '../types';
import { type SpinPose, smoothPhase, spinUpCoast } from './kinematics';

const PUSH_SECONDS = 0.18;
const RESET_SECONDS = 0.12;
const CLUTCH_SECONDS = 0.25;
const COAST_SECONDS = 0.6;
const TOKEN_START = 0.7;
const OUTPUT_TRAVEL = 1.4;
const OUTPUT_ANGLE = OUTPUT_TRAVEL / BELT_RADIUS;
const PUSH_WEIGHTS = [0.2, 0.35, 0.45] as const;
const SHOE_STROKES = [0.45, 0.75, 1] as const;

export type MomentumPose = Readonly<{
  flywheel: SpinPose & { readonly push: number };
  output: SpinPose & { readonly distance: number; readonly tokenX: number };
  /** The friction faces make contact at engageAt, then synchronize over 0.25s. */
  clutch: number;
}>;

/** Three additive impulses, then a friction clutch; no frame history or wrapped cargo travel. */
export function sampleMomentum(t: number, scene: MomentumScene): MomentumPose {
  const stopAt = scene.coastAt + COAST_SECONDS;
  // The integral of the unit-speed output is cruise duration minus half its ramp,
  // plus half its coast. Normalize once so even a long scene cannot run off the belt.
  const activeDuration = scene.coastAt - scene.engageAt - CLUTCH_SECONDS / 2 + COAST_SECONDS / 2;
  const speed = OUTPUT_ANGLE / activeDuration;
  const starts = [scene.pushAt, scene.repeatAt, (scene.repeatAt + scene.engageAt) / 2];
  let angle = 0;
  let wheelSpeed = 0;
  let push = 0;
  for (const [index, startAt] of starts.entries()) {
    const impulse = spinUpCoast(t, {
      startAt,
      driveAt: startAt + PUSH_SECONDS,
      coastAt: scene.coastAt,
      stopAt,
      speed: speed * PUSH_WEIGHTS[index],
    });
    angle += impulse.angle;
    wheelSpeed += impulse.speed;
    push +=
      SHOE_STROKES[index] *
      smoothPhase(t, startAt, startAt + PUSH_SECONDS) *
      (1 - smoothPhase(t, startAt + PUSH_SECONDS, startAt + PUSH_SECONDS + RESET_SECONDS));
  }
  const output = spinUpCoast(t, {
    startAt: scene.engageAt,
    driveAt: scene.engageAt + CLUTCH_SECONDS,
    coastAt: scene.coastAt,
    stopAt,
    speed,
  });
  // Pin the analytic endpoint against roundoff, not against an overshooting/clamped trajectory.
  const outputAngle = Number.isFinite(t) && t >= stopAt ? OUTPUT_ANGLE : output.angle;
  // Positive wheel rotation carries the conveyor's TOP to the left. Both drive pulleys
  // and the conveyor roller have the same radius/sign; there is no hidden reversing gear.
  const distance = 0 - outputAngle * BELT_RADIUS;
  return {
    flywheel: { angle, speed: wheelSpeed, push },
    output: { angle: outputAngle, speed: output.speed, distance, tokenX: TOKEN_START + distance },
    clutch: smoothPhase(t, scene.engageAt - 0.2, scene.engageAt),
  };
}
