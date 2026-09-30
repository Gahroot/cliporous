import type { SynchronizationScene } from './composed-types';
import { smoothPhase } from './kinematics';
import type { Vec3 } from './paths';

export const SYNC_BELT_SCALE = 0.9;
export const SYNC_MAIL_START: Vec3 = [-0.62, -0.45, 0];
export const SYNC_MAIL_END: Vec3 = [1.63, -0.45, 0];
export const SYNC_GATE_LIFT_SECONDS = 0.22;
export interface SynchronizationPose {
  leftDistance: number;
  rightDistance: number;
  phaseError: number;
  metronomeAngle: number;
  gateLift: number;
  carrier: { id: 'mail-0'; position: Vec3 };
  received: boolean;
}

/** The trailing belt catches up by moving FORWARD, never by rewinding its phase. */
export function sampleSynchronizationPose(
  scene: SynchronizationScene,
  t: number,
): SynchronizationPose {
  const correction = smoothPhase(t, scene.rhythmAt, scene.alignAt);
  const before = 2 * smoothPhase(t, scene.disagreeAt, scene.alignAt);
  const travel = smoothPhase(t, scene.alignAt + SYNC_GATE_LIFT_SECONDS, scene.transferAt);
  const distance = before + ((SYNC_MAIL_END[0] - SYNC_MAIL_START[0]) * travel) / SYNC_BELT_SCALE;
  const phaseError = 0.35 * (1 - correction);
  // A finite, seekable rhythm: no idle pendulum after the successful handoff.
  const since = Math.max(0, Math.min(t, scene.transferAt) - scene.rhythmAt);
  const envelope =
    smoothPhase(t, scene.rhythmAt, scene.rhythmAt + 0.2) *
    (1 - smoothPhase(t, scene.transferAt - 0.35, scene.transferAt));
  return {
    leftDistance: distance,
    rightDistance: distance - phaseError,
    phaseError,
    metronomeAngle: 0.32 * Math.sin(since * Math.PI * 4) * envelope,
    gateLift: 0.45 * smoothPhase(t, scene.alignAt, scene.alignAt + SYNC_GATE_LIFT_SECONDS),
    carrier: {
      id: 'mail-0',
      position: [
        SYNC_MAIL_START[0] + (SYNC_MAIL_END[0] - SYNC_MAIL_START[0]) * travel,
        SYNC_MAIL_START[1],
        0,
      ],
    },
    received: t >= scene.transferAt,
  };
}
