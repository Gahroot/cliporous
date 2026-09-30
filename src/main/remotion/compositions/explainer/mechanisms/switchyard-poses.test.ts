import { describe, expect, it } from 'vitest';
import {
  RAIL_CARRIER_LENGTH,
  RAIL_CARRIER_WIDTH,
  RAIL_STOP_SIZE,
  RAIL_WHEEL_RADIUS,
  sampleRailPoint,
  sampleRailStop,
} from '../hero-props/transport-poses';
import type { SwitchyardScene } from '../types';
import {
  SWITCHYARD_SEAT_SECONDS,
  SWITCHYARD_TOKEN_IDS,
  type SwitchyardPose,
  sampleSwitchyard,
} from './switchyard-poses';

const scene: SwitchyardScene = {
  kind: 'switchyard',
  label: 'Route the requests',
  route: 'left',
  leftLabel: 'Review',
  rightLabel: 'Publish',
  approachAt: 0.35,
  seatAt: 1.5,
  commitAt: 2.1,
  arriveAt: 3.7,
};
const scenes: SwitchyardScene[] = [scene, { ...scene, route: 'right' }];
type Carrier = SwitchyardPose['tokens'][number];

function separateCarriers(a: Carrier, b: Carrier): boolean {
  const axes = (heading: number): [number, number][] => [
    [Math.cos(heading), Math.sin(heading)],
    [-Math.sin(heading), Math.cos(heading)],
  ];
  const aAxes = axes(a.heading);
  const bAxes = axes(b.heading);
  const radius = (local: [number, number][], axis: [number, number]) =>
    (RAIL_CARRIER_WIDTH / 2) * Math.abs(local[0][0] * axis[0] + local[0][1] * axis[1]) +
    (RAIL_CARRIER_LENGTH / 2) * Math.abs(local[1][0] * axis[0] + local[1][1] * axis[1]);
  return [...aAxes, ...bAxes].some((axis) => {
    const distance = Math.abs(
      (a.position[0] - b.position[0]) * axis[0] + (a.position[1] - b.position[1]) * axis[1],
    );
    return distance > radius(aAxes, axis) + radius(bAxes, axis);
  });
}

for (const data of scenes) {
  describe(`switchyard ${data.route}`, () => {
    it('keeps three stable identities on the same rig centerline, including shuffled seeks', () => {
      for (const t of [9, 0.7, 2, 0, 3.1, 9, 1.5, 0.7, Number.NaN, Number.POSITIVE_INFINITY]) {
        const pose = sampleSwitchyard(t, data);
        expect(pose).toEqual(sampleSwitchyard(t, data));
        expect(pose.tokens.map((token) => token.id)).toEqual(SWITCHYARD_TOKEN_IDS);
        expect(Number.isFinite(pose.seat)).toBe(true);
        expect(Number.isFinite(pose.arrival)).toBe(true);
        for (const token of pose.tokens) {
          expect(token.progress).toBeGreaterThanOrEqual(0);
          expect(token.progress).toBeLessThanOrEqual(1);
          expect(token.position).toEqual(sampleRailPoint(token.progress, data.route));
          expect(token.position.every(Number.isFinite)).toBe(true);
          expect([token.heading, token.travel, ...token.wheelAngles].every(Number.isFinite)).toBe(
            true,
          );
          expect(
            ((token.wheelAngles[0] + token.wheelAngles[1]) / 2) * RAIL_WHEEL_RADIUS,
          ).toBeCloseTo(-token.travel, 12);
        }
      }
    });

    it('holds every leading face before the junction throughout switch seating and commitment', () => {
      for (let frame = 0; frame <= data.commitAt * 240; frame++) {
        const t = frame / 240;
        const pose = sampleSwitchyard(t, data);
        for (const token of pose.tokens) {
          expect(token.position[1] + RAIL_CARRIER_LENGTH / 2).toBeLessThan(0);
        }
        if (t < data.seatAt) expect(pose.seat).toBeLessThan(1);
        if (t >= data.seatAt) expect(pose.seat).toBe(1);
      }
      expect(sampleSwitchyard(data.seatAt - SWITCHYARD_SEAT_SECONDS, data).seat).toBe(0);
      expect(sampleSwitchyard(data.seatAt, data).seat).toBe(1);
    });

    it('never resets, reverses, spawns at the exit, overlaps, or enters the wrong branch', () => {
      let previous = sampleSwitchyard(-1, data);
      for (let frame = 0; frame <= 5 * 240; frame++) {
        const pose = sampleSwitchyard(frame / 240, data);
        for (const token of pose.tokens) {
          const prior = previous.tokens.find((item) => item.id === token.id);
          expect(prior).toBeDefined();
          expect(token.progress).toBeGreaterThanOrEqual(prior?.progress ?? 0);
          if (data.route === 'left') expect(token.position[0]).toBeLessThanOrEqual(0);
          else expect(token.position[0]).toBeGreaterThanOrEqual(0);
        }
        for (let i = 1; i < pose.tokens.length; i++) {
          const a = pose.tokens[i - 1];
          const b = pose.tokens[i];
          // Oriented chassis bounds include wheels: a center-only distance check is insufficient.
          expect(separateCarriers(a, b)).toBe(true);
        }
        previous = pose;
      }
    });

    it('arrives at the receiver before showing the consequence, and holds exactly', () => {
      const arrived = sampleSwitchyard(data.arriveAt, data);
      expect(arrived.tokens[0].position).toEqual(sampleRailPoint(1, data.route));
      expect(arrived.arrival).toBe(0);
      expect(sampleSwitchyard(data.arriveAt + 0.18, data).arrival).toBe(1);
      expect(sampleSwitchyard(100, data)).toEqual(sampleSwitchyard(5, data));
      const front = arrived.tokens[0];
      const stop = sampleRailStop(data.route);
      const dx = stop.position[0] - front.position[0];
      const dy = stop.position[1] - front.position[1];
      expect(stop.heading).toBe(front.heading);
      expect(dx * Math.cos(front.heading) + dy * Math.sin(front.heading)).toBeCloseTo(0, 12);
      expect(
        -dx * Math.sin(front.heading) + dy * Math.cos(front.heading) - RAIL_STOP_SIZE[1] / 2,
      ).toBeCloseTo(RAIL_CARRIER_LENGTH / 2, 12);
    });

    it('has continuous positions and zero-velocity holds around all beat boundaries', () => {
      const eps = 1e-5;
      for (const t of [
        data.approachAt,
        data.seatAt - 0.35,
        data.seatAt - SWITCHYARD_SEAT_SECONDS,
        data.seatAt,
        data.commitAt,
        data.arriveAt,
      ]) {
        const before = sampleSwitchyard(t - eps, data);
        const after = sampleSwitchyard(t + eps, data);
        for (const token of before.tokens) {
          const next = after.tokens[token.id];
          expect(Math.abs(token.progress - next.progress)).toBeLessThan(eps);
          expect(Math.abs(token.heading - next.heading)).toBeLessThan(eps);
          for (const side of [0, 1] as const) {
            expect(Math.abs(token.wheelAngles[side] - next.wheelAngles[side])).toBeLessThan(eps);
          }
        }
        expect(Math.abs(before.seat - after.seat)).toBeLessThan(eps);
      }
    });
  });
}
