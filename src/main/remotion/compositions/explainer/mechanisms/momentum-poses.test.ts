import { describe, expect, it } from 'vitest';
import { BELT_RADIUS } from '../hero-props/transport-poses';
import type { MomentumScene } from '../types';
import { beltTravel } from './kinematics';
import { type MomentumPose, sampleMomentum } from './momentum-poses';

const cases: { name: string; scene: MomentumScene; duration: number }[] = [
  {
    name: 'minimum beat gaps / 3.5s',
    scene: {
      kind: 'momentum',
      label: 'Small pushes build momentum',
      pushAt: 0.3,
      repeatAt: 0.75,
      engageAt: 1.4,
      coastAt: 2.3,
    },
    duration: 3.5,
  },
  {
    name: 'normal timing / 5.2s',
    scene: {
      kind: 'momentum',
      label: 'Small pushes build momentum',
      pushAt: 0.4,
      repeatAt: 1.25,
      engageAt: 2.4,
      coastAt: 4,
    },
    duration: 5.2,
  },
  {
    name: 'long output run / 8s',
    scene: {
      kind: 'momentum',
      label: 'Small pushes build momentum',
      pushAt: 0.3,
      repeatAt: 1.1,
      engageAt: 1.9,
      coastAt: 6.9,
    },
    duration: 8,
  },
];

function values(pose: MomentumPose): number[] {
  return [...Object.values(pose.flywheel), ...Object.values(pose.output), pose.clutch];
}

function boundaries(scene: MomentumScene): number[] {
  return [
    ...[scene.pushAt, scene.repeatAt, (scene.repeatAt + scene.engageAt) / 2].flatMap((start) => [
      start,
      start + 0.18,
      start + 0.3,
    ]),
    scene.engageAt - 0.2,
    scene.engageAt,
    scene.engageAt + 0.25,
    scene.coastAt,
    scene.coastAt + 0.6,
  ];
}

describe.each(cases)('momentum: $name', ({ scene, duration }) => {
  it('is finite and continuous before, at and after every phase boundary', () => {
    for (const time of boundaries(scene)) {
      const before = values(sampleMomentum(time - 1e-6, scene));
      const at = values(sampleMomentum(time, scene));
      const after = values(sampleMomentum(time + 1e-6, scene));
      expect([...before, ...at, ...after].every(Number.isFinite)).toBe(true);
      for (const [index, value] of at.entries()) {
        expect(Math.abs(value - before[index])).toBeLessThan(1e-4);
        expect(Math.abs(value - after[index])).toBeLessThan(1e-4);
      }
    }
    for (const time of [-100, 1e6, NaN, Infinity, -Infinity]) {
      expect(values(sampleMomentum(time, scene)).every(Number.isFinite)).toBe(true);
    }
  });

  it('samples the same frames identically in shuffled, repeated and reverse order', () => {
    const frames = Array.from({ length: Math.ceil((duration + 1) * 30) }, (_, id) => id - 15);
    const expected = new Map(frames.map((frame) => [frame, sampleMomentum(frame / 30, scene)]));
    const shuffled = [
      ...frames.filter((frame) => frame % 3 === 0).reverse(),
      ...frames.filter((frame) => frame % 3 !== 0),
    ];
    for (const frame of [...shuffled, ...[...frames].reverse(), ...shuffled]) {
      expect(sampleMomentum(frame / 30, scene)).toEqual(expected.get(frame));
    }
  });

  it('builds speed with three increasingly strong shoe strokes, without moving the output', () => {
    expect(sampleMomentum(scene.pushAt, scene).flywheel).toEqual({ angle: 0, speed: 0, push: 0 });
    const first = sampleMomentum(scene.pushAt + 0.18, scene);
    const second = sampleMomentum(scene.repeatAt + 0.18, scene);
    const third = sampleMomentum((scene.repeatAt + scene.engageAt) / 2 + 0.18, scene);
    expect(first.flywheel.speed).toBeGreaterThan(0);
    expect(first.flywheel.speed).toBeCloseTo(third.flywheel.speed * 0.2, 12);
    expect(second.flywheel.speed).toBeCloseTo(third.flywheel.speed * 0.55, 12);
    expect(third.flywheel.speed).toBeLessThan(5.3);
    expect(first.flywheel.push).toBeCloseTo(0.45, 12);
    expect(second.flywheel.push).toBeCloseTo(0.75, 12);
    expect(third.flywheel.push).toBeCloseTo(1, 12);
    for (const time of [
      ...Array.from({ length: Math.ceil(scene.engageAt * 60) }, (_, frame) => frame / 60),
      scene.engageAt,
    ]) {
      expect(sampleMomentum(time, scene).output).toEqual({
        angle: 0,
        speed: 0,
        distance: 0,
        tokenX: 0.7,
      });
    }
  });

  it('contacts once before synchronizing and keeps the drive speeds matched thereafter', () => {
    expect(sampleMomentum(scene.engageAt - 0.2, scene).clutch).toBe(0);
    expect(sampleMomentum(scene.engageAt, scene).clutch).toBe(1);
    const slipping = sampleMomentum(scene.engageAt + 0.125, scene);
    expect(slipping.output.speed).toBeGreaterThan(0);
    expect(slipping.output.speed).toBeLessThan(slipping.flywheel.speed);
    const seated = sampleMomentum(scene.engageAt + 0.25, scene);
    const angleOffset = seated.flywheel.angle - seated.output.angle;
    for (let frame = 0; frame <= Math.ceil(duration * 60); frame++) {
      const time = scene.engageAt + 0.25 + frame / 60;
      const pose = sampleMomentum(time, scene);
      expect(pose.clutch).toBe(1);
      expect(pose.output.speed).toBeCloseTo(pose.flywheel.speed, 12);
      expect(pose.flywheel.angle - pose.output.angle).toBeCloseTo(angleOffset, 12);
    }
  });

  it('never reverses either angle, and all linked travel keeps the single token on the belt', () => {
    let previous = sampleMomentum(-1, scene);
    for (let frame = 0; frame <= Math.ceil(duration * 60); frame++) {
      const pose = sampleMomentum(frame / 60, scene);
      expect(pose.flywheel.angle).toBeGreaterThanOrEqual(previous.flywheel.angle);
      expect(pose.output.angle).toBeGreaterThanOrEqual(previous.output.angle);
      expect(pose.output.distance).toBeLessThanOrEqual(previous.output.distance);
      expect(pose.flywheel.speed).toBeGreaterThanOrEqual(0);
      expect(pose.flywheel.speed).toBeLessThan(5.3);
      expect(pose.output.speed).toBeGreaterThanOrEqual(0);
      expect(pose.flywheel.push).toBeGreaterThanOrEqual(0);
      expect(pose.flywheel.push).toBeLessThanOrEqual(1);
      expect(pose.clutch).toBeGreaterThanOrEqual(0);
      expect(pose.clutch).toBeLessThanOrEqual(1);
      expect(pose.output.tokenX - 0.14).toBeGreaterThan(-1);
      expect(pose.output.tokenX + 0.14).toBeLessThan(1);
      expect(pose.output.tokenX).toBe(0.7 + pose.output.distance);
      expect(beltTravel(pose.output.distance, BELT_RADIUS, 0.2).wheelAngle).toBeCloseTo(
        pose.output.angle,
        12,
      );
      previous = pose;
    }
  });

  it('has angular and linear derivatives equal to the reported continuous speeds', () => {
    const step = 1e-5;
    const times = [
      ...boundaries(scene),
      ...Array.from({ length: Math.ceil(duration * 30) }, (_, frame) => frame / 30),
    ];
    for (const time of times) {
      const before = sampleMomentum(time - step, scene);
      const pose = sampleMomentum(time, scene);
      const after = sampleMomentum(time + step, scene);
      expect((after.flywheel.angle - before.flywheel.angle) / (2 * step)).toBeCloseTo(
        pose.flywheel.speed,
        6,
      );
      expect((after.output.angle - before.output.angle) / (2 * step)).toBeCloseTo(
        pose.output.speed,
        6,
      );
      expect((after.output.distance - before.output.distance) / (2 * step)).toBeCloseTo(
        -BELT_RADIUS * pose.output.speed,
        6,
      );
      expect((after.output.tokenX - before.output.tokenX) / (2 * step)).toBeCloseTo(
        -BELT_RADIUS * pose.output.speed,
        6,
      );
    }
  });

  it('coasts without accelerating again and holds exact final positions for at least 0.5s', () => {
    const stopAt = scene.coastAt + 0.6;
    const stopped = sampleMomentum(stopAt, scene);
    expect(duration - stopAt).toBeGreaterThanOrEqual(0.5);
    expect(stopped.flywheel.speed).toBe(0);
    expect(stopped.flywheel.push).toBe(0);
    expect(stopped.output).toEqual({ angle: 5.6, speed: 0, distance: -1.4, tokenX: -0.7 });
    expect(stopped.clutch).toBe(1);
    const speed = 5.6 / (scene.coastAt - scene.engageAt + 0.175);
    const expectedAngle = [scene.pushAt, scene.repeatAt, (scene.repeatAt + scene.engageAt) / 2]
      .map((start, index) => speed * [0.2, 0.35, 0.45][index] * (scene.coastAt - start + 0.21))
      .reduce((sum, angle) => sum + angle, 0);
    expect(stopped.flywheel.angle).toBeCloseTo(expectedAngle, 12);
    let previous = sampleMomentum(scene.coastAt, scene);
    for (let frame = 1; frame <= 18; frame++) {
      const pose = sampleMomentum(scene.coastAt + frame / 30, scene);
      expect(pose.flywheel.speed).toBeLessThanOrEqual(previous.flywheel.speed);
      expect(pose.output.speed).toBeLessThanOrEqual(previous.output.speed);
      previous = pose;
    }
    for (const time of [stopAt, stopAt + 0.5, duration, 1e6]) {
      expect(sampleMomentum(time, scene)).toEqual(stopped);
    }
    for (let frame = 0; frame <= 30; frame++) {
      expect(sampleMomentum(stopAt + frame / 60, scene)).toEqual(stopped);
    }
  });
});
