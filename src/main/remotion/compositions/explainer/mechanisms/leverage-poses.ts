import type { LeverageScene } from '../types';
import { type LeverPose, leverPose, smoothPhase } from './kinematics';

/** The beam returns level before its fulcrum slides, then rotates about that new contact. */
export function sampleLeverage(t: number, scene: LeverageScene): LeverPose {
  const attempt = smoothPhase(t, scene.effortAt, scene.pivotAt);
  const pivot = smoothPhase(t, scene.pivotAt, scene.liftAt);
  const lift = smoothPhase(t, scene.liftAt, scene.holdAt);
  const initialAngle = 0.035 * Math.sin(Math.PI * attempt) ** 2;
  return leverPose(-0.25 + pivot * 0.8, initialAngle + lift * 0.3);
}
