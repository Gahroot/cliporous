import { KINETIC_TIMING } from '../hero-catalog';
import { phase, ratchetAngle, smoothPhase, spinUpCoast } from '../mechanisms/kinematics';

export type KineticPose = Readonly<{
  flywheel: { angle: number; push: number };
  lever: { pivotX: number; angle: number };
  pulley: { travel: number };
  spring: { compression: number };
  ratchet: { angle: number; pawl: number };
}>;

/** Signature schedules are shared with catalog impact metadata and pose tests. */
export function sampleKineticPose(t: number, at: number): KineticPose {
  const time = t - at;
  const wheel = spinUpCoast(time, {
    startAt: 0.15,
    driveAt: KINETIC_TIMING.flywheel,
    coastAt: 1.3,
    stopAt: 2.1,
    speed: 6,
  });
  const push = [0.15, 0.42, 0.69].reduce(
    (sum, start) => sum + Math.sin(Math.PI * phase(time, start, start + 0.26)),
    0,
  );
  const ratchetPhase = (phase(time, 0.3, KINETIC_TIMING.ratchet) * 3) % 1;
  // The pawl rides over a moving tooth and seats BEFORE the wheel's hold phase.
  const pawlLift = smoothPhase(ratchetPhase, 0, 0.2) * (1 - smoothPhase(ratchetPhase, 0.52, 0.65));
  return {
    flywheel: { angle: wheel.angle, push },
    lever: {
      pivotX: 0.55 * smoothPhase(time, 0.45, 0.85),
      angle: -0.12 + 0.34 * smoothPhase(time, 0.85, KINETIC_TIMING.lever),
    },
    pulley: { travel: 0.72 * smoothPhase(time, 0.35, KINETIC_TIMING.pulley) },
    spring: {
      compression:
        0.65 * smoothPhase(time, 0.2, 0.7) * (1 - smoothPhase(time, 1, KINETIC_TIMING.spring)),
    },
    ratchet: {
      angle: ratchetAngle(time, 0.3, KINETIC_TIMING.ratchet, 3),
      pawl: pawlLift * 0.18,
    },
  };
}
