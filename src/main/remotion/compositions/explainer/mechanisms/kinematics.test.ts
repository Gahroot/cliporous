import { describe, expect, it } from 'vitest';
import {
  beltTravel,
  feedbackLevel,
  leverPose,
  phase,
  pulleyTravel,
  ratchetAngle,
  smoothPhase,
  spinUpCoast,
} from './kinematics';

const schedule = { startAt: 0.4, driveAt: 1.4, coastAt: 3, stopAt: 4.4, speed: 5 };

describe('authored mechanism kinematics', () => {
  it('clamps phases without overshoot and settles with zero end velocity', () => {
    for (const t of [-10, 0, 0.4, 1, 2, 10]) {
      expect(phase(t, 0.4, 2)).toBeGreaterThanOrEqual(0);
      expect(phase(t, 0.4, 2)).toBeLessThanOrEqual(1);
    }
    expect(smoothPhase(0.4, 0.4, 2)).toBe(0);
    expect(smoothPhase(2, 0.4, 2)).toBe(1);
    expect(phase(1, 2, 2)).toBe(0);
    expect(phase(NaN, 0, 1)).toBe(0);
  });

  it('integrates speed into a continuous unwrapped angle', () => {
    for (const t of [schedule.startAt, schedule.driveAt, schedule.coastAt, schedule.stopAt]) {
      const left = spinUpCoast(t - 0.000001, schedule);
      const right = spinUpCoast(t + 0.000001, schedule);
      expect(right.angle - left.angle).toBeLessThan(0.000011);
      expect(Math.abs(right.speed - left.speed)).toBeLessThan(0.00002);
    }
    for (let t = 0; t < 5; t += 0.07) {
      const velocity =
        (spinUpCoast(t + 0.00001, schedule).angle - spinUpCoast(t - 0.00001, schedule).angle) /
        0.00002;
      expect(velocity).toBeCloseTo(spinUpCoast(t, schedule).speed, 5);
    }
    expect(spinUpCoast(6, schedule)).toEqual(spinUpCoast(10000, schedule));
    expect(spinUpCoast(6, schedule).speed).toBe(0);
    expect(spinUpCoast(6, schedule).angle).toBeCloseTo(5 * (0.5 + 1.6 + 0.7));
  });

  it('does not depend on request order or previous frames', () => {
    const frames = [0, 12, 25, 42, 73, 90, 109, 132, 150];
    const poses = frames.map((frame) => spinUpCoast(frame / 30, schedule));
    for (const index of [8, 3, 0, 6, 2, 1, 7, 4, 5, 3]) {
      expect(spinUpCoast((frames[index] ?? 0) / 30, schedule)).toEqual(poses[index]);
    }
  });

  it('uses one distance for roller rotation and belt travel including reverse direction', () => {
    for (const distance of [-3, -0.1, 0, 0.4, 1.2, 100]) {
      const pose = beltTravel(distance, 0.2, 0.25);
      expect(pose.wheelAngle * -0.2).toBeCloseTo(distance);
      expect(pose.offset).toBeGreaterThanOrEqual(0);
      expect(pose.offset).toBeLessThan(0.25);
      const cable = pulleyTravel(distance, 0.5);
      expect(cable.loadY + cable.effortY).toBe(0);
      expect(cable.wheelAngle * 0.5).toBe(distance);
    }
  });

  it('holds each detent and never reverses the ratchet', () => {
    let previous = 0;
    for (let frame = 0; frame < 180; frame++) {
      const angle = ratchetAngle(frame / 30, 0.4, 3.4, 6);
      expect(angle).toBeGreaterThanOrEqual(previous);
      previous = angle;
    }
    expect(previous).toBeCloseTo(Math.PI);
    expect(ratchetAngle(0.8, 0.4, 3.4, 6)).toBe(ratchetAngle(0.89, 0.4, 3.4, 6));
  });

  it('keeps bounded response levels and rigid lever contact ratios', () => {
    for (let t = -1; t <= 10; t += 0.1) {
      const level = feedbackLevel(t, 2, 4, 0.9, 0.5);
      expect(level).toBeGreaterThanOrEqual(0.5);
      expect(level).toBeLessThanOrEqual(0.9);
    }
    expect(feedbackLevel(8, 2, 4, 0.9, 0.5)).toBe(0.5);
    const pose = leverPose(0.55, 0.2);
    expect(pose.effort[1] / pose.load[1]).toBeCloseTo(-1.7 / 0.6);
    expect(Math.hypot(pose.load[0] - pose.pivotX, pose.load[1])).toBeCloseTo(0.6);
  });

  it('fails closed to finite resting poses for invalid numerical inputs', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(spinUpCoast(value, schedule)).toEqual({ angle: 0, speed: 0 });
      expect(spinUpCoast(2, { ...schedule, speed: value })).toEqual({ angle: 0, speed: 0 });
      expect(beltTravel(1, value, 0.25)).toEqual({ distance: 0, wheelAngle: 0, offset: 0 });
      expect(pulleyTravel(value, 0.5)).toEqual({ wheelAngle: 0, loadY: 0, effortY: 0 });
      expect(Object.values(leverPose(value, value)).flat().every(Number.isFinite)).toBe(true);
    }
    expect(spinUpCoast(2, { ...schedule, driveAt: 4 })).toEqual({ angle: 0, speed: 0 });
  });
});
