import {
  sampleRailHeading,
  sampleRailPoint,
  sampleRailTravel,
  sampleRailWheelAngles,
} from '../hero-props/transport-poses';
import type { SwitchyardScene } from '../types';
import { smoothPhase } from './kinematics';
import type { Vec3 } from './paths';

export const SWITCHYARD_TOKEN_IDS = [0, 1, 2] as const;
export const SWITCHYARD_SEAT_SECONDS = 0.3;

export type SwitchyardPose = Readonly<{
  seat: number;
  arrival: number;
  tokens: readonly Readonly<{
    id: number;
    progress: number;
    position: Vec3;
    heading: number;
    travel: number;
    wheelAngles: readonly [number, number];
  }>[];
}>;

/** One persistent queue. All tokens use the rig's exact centerline and share travel.
 * The leading face stops before the junction while the tongue moves. No wrap/reset. */
export function sampleSwitchyard(t: number, scene: SwitchyardScene): SwitchyardPose {
  const approach = smoothPhase(t, scene.approachAt, scene.seatAt - 0.35);
  const seat = smoothPhase(t, scene.seatAt - SWITCHYARD_SEAT_SECONDS, scene.seatAt);
  const transfer = smoothPhase(t, scene.commitAt, scene.arriveAt);
  return {
    seat,
    arrival: smoothPhase(t, scene.arriveAt, scene.arriveAt + 0.18),
    tokens: SWITCHYARD_TOKEN_IDS.map((id) => {
      const queued = 0.36 - id * 0.12;
      const start = id === 0 ? 0.22 : id === 1 ? 0.1 : 0;
      const progress = start + (queued - start) * approach + 0.64 * transfer;
      const travel = sampleRailTravel(progress) - sampleRailTravel(start);
      return {
        id,
        progress,
        position: sampleRailPoint(progress, scene.route),
        heading: sampleRailHeading(progress, scene.route),
        travel,
        wheelAngles: sampleRailWheelAngles(progress, scene.route, start),
      };
    }),
  };
}
