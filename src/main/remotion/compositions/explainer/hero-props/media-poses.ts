import { MEDIA_TIMING } from '../hero-catalog';
import { smoothPhase } from '../mechanisms/kinematics';

export type MicrophonePose = Readonly<{ enabled: number; wave: number }>;
export type CameraPose = Readonly<{ focus: number; shutter: number; button: number }>;
export type ClapperboardPose = Readonly<{ angle: number }>;

export const CLAPPER_GEOMETRY = {
  width: 2,
  barHeight: 0.2,
  pivotX: -1,
  contactY: 0.35,
  openAngle: 0.46,
} as const;

function sampleTime(elapsed: number): number {
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(3, elapsed)) : 0;
}

/** Switch first, then one finite voice envelope. Down is a real mute, not time reversal. */
export function sampleMicrophonePose(elapsed: number, down = false): MicrophonePose {
  const t = sampleTime(elapsed);
  if (down) {
    const on = 1 - smoothPhase(t, 0.3, MEDIA_TIMING.microphone);
    return { enabled: on, wave: on };
  }
  return {
    enabled: smoothPhase(t, 0.3, 0.65),
    wave: smoothPhase(t, 0.65, MEDIA_TIMING.microphone) * (1 - smoothPhase(t, 1.1, 1.7)),
  };
}

/** Focus must finish before either the release button or the visible leaf shutter moves. */
export function sampleCameraPose(elapsed: number): CameraPose {
  const t = sampleTime(elapsed);
  const reopen = 1 - smoothPhase(t, 1.04, 1.17);
  return {
    focus: smoothPhase(t, 0.25, 0.7),
    shutter: smoothPhase(t, 0.86, MEDIA_TIMING.camera) * reopen,
    button: smoothPhase(t, 0.8, MEDIA_TIMING.camera) * reopen,
  };
}

/** Bottom of the moving bar meets the fixed bar exactly once, then holds contact. */
export function sampleClapperboardPose(elapsed: number): ClapperboardPose {
  return {
    angle:
      CLAPPER_GEOMETRY.openAngle *
      (1 - smoothPhase(sampleTime(elapsed), 0.3, MEDIA_TIMING.clapperboard)),
  };
}
