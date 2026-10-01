import { describe, expect, it } from 'vitest';
import { contactOffset, phaseProgress, revealAt, travelPoint, unitProgress } from './motion';

const FROM = { x: 64, y: 220 };
const TO = { x: 760, y: 640 };

describe('technology finite motion', () => {
  it('reaches exact contacts, remains bounded, and is independent of seek order', () => {
    const frames = Array.from({ length: 361 }, (_, frame) => frame);
    const poses = frames.map((frame) => travelPoint(frame / 30, 1.5, 3.5, FROM, TO));
    for (const frame of [...frames].reverse()) {
      const pose = travelPoint(frame / 30, 1.5, 3.5, FROM, TO);
      expect(pose).toEqual(poses[frame]);
      expect(pose.x).toBeGreaterThanOrEqual(FROM.x);
      expect(pose.x).toBeLessThanOrEqual(TO.x);
      expect(pose.y).toBeGreaterThanOrEqual(FROM.y);
      expect(pose.y).toBeLessThanOrEqual(TO.y);
    }
    expect(travelPoint(1.5, 1.5, 3.5, FROM, TO)).toEqual(FROM);
    expect(travelPoint(3.5, 1.5, 3.5, FROM, TO)).toEqual(TO);
    expect(travelPoint(12, 1.5, 3.5, FROM, TO)).toEqual(TO);
  });

  it('has no receiver reaction before contact or idle motion after settling', () => {
    for (const t of [-1, 0, 1.99, 2, 2.5, 9]) expect(contactOffset(t, 2)).toBe(0);
    expect(Math.abs(contactOffset(2.03, 2))).toBeGreaterThan(0);
    for (let frame = 0; frame < 300; frame++) {
      expect(Math.abs(contactOffset(frame / 30, 2, 100))).toBeLessThanOrEqual(8);
    }
  });

  it('samples both sides of boundaries without non-finite values', () => {
    for (const boundary of [0, 1, 2, 2.25, 8]) {
      for (const delta of [-1 / 30, 0, 1 / 30]) {
        const t = boundary + delta;
        expect(phaseProgress(t, 1, 2)).toBeGreaterThanOrEqual(0);
        expect(phaseProgress(t, 1, 2)).toBeLessThanOrEqual(1);
        expect(revealAt(t, 2)).toBeGreaterThanOrEqual(0);
        expect(revealAt(t, 2)).toBeLessThanOrEqual(1);
      }
    }
    expect(revealAt(1.99, 2)).toBe(0);
    expect(revealAt(2.25, 2)).toBe(1);
    expect(unitProgress(Number.NaN, 0, 1)).toBe(0);
    expect(unitProgress(1, 2, 2)).toBe(0);
    expect(unitProgress(2, 2, 2)).toBe(1);
  });
});
