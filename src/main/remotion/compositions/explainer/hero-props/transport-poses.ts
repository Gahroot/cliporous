import { TRANSPORT_TIMING } from '../hero-catalog';
import { clamp01, phase, smoothPhase } from '../mechanisms/kinematics';
import type { Vec3 } from '../mechanisms/paths';

export const BELT_RADIUS = 0.25;
export const BELT_LENGTH = 4 + 2 * Math.PI * BELT_RADIUS;
export type BeltPoint = Readonly<{ x: number; y: number; angle: number }>;

/** Closed capsule, clockwise from top-left; distance is shared by tread, rollers and cargo. */
export function sampleBeltPoint(distance: number, halfLength: 1 | 1.5 = 1): BeltPoint {
  const length = 4 * halfLength + 2 * Math.PI * BELT_RADIUS;
  const d = Number.isFinite(distance) ? ((distance % length) + length) % length : 0;
  if (d <= 2 * halfLength) return { x: -halfLength + d, y: BELT_RADIUS, angle: 0 };
  const arc = Math.PI * BELT_RADIUS;
  if (d < 2 * halfLength + arc) {
    const angle = Math.PI / 2 - (d - 2 * halfLength) / BELT_RADIUS;
    return {
      x: halfLength + BELT_RADIUS * Math.cos(angle),
      y: BELT_RADIUS * Math.sin(angle),
      angle: angle - Math.PI / 2,
    };
  }
  if (d <= 4 * halfLength + arc)
    return { x: halfLength - (d - 2 * halfLength - arc), y: -BELT_RADIUS, angle: -Math.PI };
  const angle = -Math.PI / 2 - (d - 4 * halfLength - arc) / BELT_RADIUS;
  return {
    x: -halfLength + BELT_RADIUS * Math.cos(angle),
    y: BELT_RADIUS * Math.sin(angle),
    angle: angle - Math.PI / 2,
  };
}

export function sampleRailPoint(progress: number, route: 'left' | 'right'): Vec3 {
  const u = clamp01(progress);
  if (u <= 0.45) return [0, -0.9 + (u / 0.45) * 0.9, 0.15];
  const branch = (u - 0.45) / 0.55;
  return [(route === 'left' ? -1 : 1) * 0.8 * branch * branch, 0.9 * branch, 0.15];
}

export const RAIL_CARRIER_LENGTH = 0.14;
export const RAIL_CARRIER_WIDTH = 0.32;
export const RAIL_WHEEL_RADIUS = 0.038;
export const RAIL_HALF_GAUGE = 0.14;
export const RAIL_STOP_SIZE = [0.34, 0.09, 0.12] as const;

/** Tangent heading measured from local +Y; shared by carrier bodies and receiving stops. */
export function sampleRailHeading(progress: number, route: 'left' | 'right'): number {
  const branch = Math.max(0, (clamp01(progress) - 0.45) / 0.55);
  return -Math.atan2((route === 'left' ? -1 : 1) * 1.6 * branch, 0.9);
}

/** Parallel rails use the normal, not a fixed horizontal offset that narrows on curves. */
export function sampleRailTrackPoint(
  progress: number,
  route: 'left' | 'right',
  offset: number,
): Vec3 {
  const center = sampleRailPoint(progress, route);
  const heading = sampleRailHeading(progress, route);
  return [center[0] + Math.cos(heading) * offset, center[1] + Math.sin(heading) * offset, 0];
}

/** Exact arc length of the same straight/quadratic rail centerline; wheels cannot slip. */
export function sampleRailTravel(progress: number): number {
  const u = clamp01(progress);
  if (u <= 0.45) return (u / 0.45) * 0.9;
  const branch = (u - 0.45) / 0.55;
  return (
    0.9 +
    (branch * Math.hypot(1.6 * branch, 0.9)) / 2 +
    (0.81 / 3.2) * Math.asinh((1.6 * branch) / 0.9)
  );
}

/** Parallel-curve distance adds offset × heading change; outside wheels travel farther. */
export function sampleRailWheelAngles(
  progress: number,
  route: 'left' | 'right',
  start = 0,
): readonly [number, number] {
  const travel = sampleRailTravel(progress) - sampleRailTravel(start);
  const turn = sampleRailHeading(progress, route) - sampleRailHeading(start, route);
  return [
    -(travel - RAIL_HALF_GAUGE * turn) / RAIL_WHEEL_RADIUS,
    -(travel + RAIL_HALF_GAUGE * turn) / RAIL_WHEEL_RADIUS,
  ];
}

/** A buffer stop facing the arriving carrier, not an axis-aligned obstacle across the curve. */
export function sampleRailStop(route: 'left' | 'right'): { position: Vec3; heading: number } {
  const end = sampleRailPoint(1, route);
  const heading = sampleRailHeading(1, route);
  const offset = RAIL_CARRIER_LENGTH / 2 + RAIL_STOP_SIZE[1] / 2;
  return {
    position: [end[0] - Math.sin(heading) * offset, end[1] + Math.cos(heading) * offset, 0.13],
    heading,
  };
}

export type TransportPose = Readonly<{
  conveyor: { distance: number };
  valve: { open: number; flow: number };
  gauge: { value: number };
  rail: { route: 'left' | 'right'; seat: number; tokenProgress: number };
}>;

export function sampleTransportPose(t: number, at: number): TransportPose {
  const time = t - at;
  const open = smoothPhase(time, 0.25, TRANSPORT_TIMING.valve);
  return {
    conveyor: { distance: 0.65 * smoothPhase(time, 0.3, TRANSPORT_TIMING.conveyor) },
    valve: { open, flow: phase(time, TRANSPORT_TIMING.valve, 1.9) },
    gauge: { value: 0.15 + 0.55 * smoothPhase(time, 0.35, TRANSPORT_TIMING['pressure-gauge']) },
    rail: {
      route: 'right',
      seat: smoothPhase(time, 0.25, TRANSPORT_TIMING['rail-switch']),
      tokenProgress: smoothPhase(time, 0.85, 1.85),
    },
  };
}
