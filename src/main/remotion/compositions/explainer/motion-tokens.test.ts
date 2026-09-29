import { describe, expect, it } from 'vitest';
import { reactionAt } from './motion';
import {
  decodeLabel,
  emphasisImpulse,
  followThrough,
  MOTION,
  motionProgress,
  settleOffset,
  staggerDelay,
} from './motion-tokens';

describe('motion vocabulary', () => {
  it.each(
    Object.keys(MOTION) as (keyof typeof MOTION)[],
  )('%s is seekable, starts at zero and settles', (weight) => {
    expect(motionProgress(29, 30, 1, weight)).toBe(0);
    expect(motionProgress(30, 30, 1, weight)).toBe(0);
    const frames = [31, 35, 50, 80, 180];
    const forward = frames.map((f) => motionProgress(f, 30, 1, weight));
    expect(
      [...frames]
        .reverse()
        .map((f) => motionProgress(f, 30, 1, weight))
        .reverse(),
    ).toEqual(forward);
    expect(forward.at(-1)).toBeCloseTo(1, 4);
    expect(forward.every(Number.isFinite)).toBe(true);
  });

  it('heavy motion overshoots less than default; playful has the most bounce', () => {
    const peak = (weight: keyof typeof MOTION): number =>
      Math.max(...Array.from({ length: 120 }, (_, i) => motionProgress(i, 60, 0, weight)));
    expect(peak('heavy')).toBeLessThan(1.01);
    expect(peak('default')).toBeGreaterThan(peak('heavy'));
    expect(peak('playful')).toBeGreaterThan(peak('default'));
  });

  it('samples lag in seconds and staggers symmetrically', () => {
    expect(followThrough((f) => f * 2, 30, 30, 0.1)).toBe(54);
    for (const [index, expected] of [0.15, 0.05, 0.05, 0.15].entries()) {
      expect(staggerDelay(index, 4, 0.1, 'center')).toBeCloseTo(expected);
    }
    expect(staggerDelay(0, 5, 0.1, 'edges')).toBe(0);
    expect(staggerDelay(2, 5, 0.1, 'edges')).toBe(0.2);
  });

  it('decodes only a short label and always restores the exact original text', () => {
    expect(decodeLabel('Hello world', 0, 30)).toBe('');
    expect(decodeLabel('Hello world', 15, 30)).toBe('Hello world');
    expect(decodeLabel('Hello world', 5, 30)).toHaveLength(11);
    expect(decodeLabel('Hello world', 5, 30)[5]).toBe(' ');
    expect(decodeLabel('Hello world', 5, 30)).toBe(decodeLabel('Hello world', 5, 30));
    expect(decodeLabel('你好 🌎', 30, 30)).toBe('你好 🌎');
  });

  it('recoil and impulses begin and finish continuously', () => {
    expect(settleOffset(0)).toBe(0);
    expect(settleOffset(1.2)).toBe(0);
    expect(emphasisImpulse(30, 30, 1)).toBe(0);
    expect(emphasisImpulse(57, 30, 1)).toBe(0);
  });
});

describe('overlapping reactions', () => {
  const first = { at: 1, strength: 'pulse' as const, target: 0 };
  it('does not snap/reset the existing pulse when a new one starts', () => {
    const second = { ...first, at: 1.1 };
    expect(reactionAt([first, second], 33, 30, 0)).toEqual(reactionAt([first], 33, 30, 0));
    expect(reactionAt([first, second], 35, 30, 0).scale).toBeGreaterThan(
      reactionAt([first], 35, 30, 0).scale,
    );
  });
  it('bounds combined motion and isolates whole-scene/element targets', () => {
    const pulses = Array.from({ length: 30 }, () => first);
    expect(reactionAt(pulses, 35, 30, 0).scale).toBeLessThanOrEqual(1.12);
    expect(reactionAt(pulses, 35, 30)).toEqual({ scale: 1, x: 0, rotate: 0, glow: 0 });
    expect(reactionAt(pulses, 90, 30, 0)).toEqual({ scale: 1, x: 0, rotate: 0, glow: 0 });
  });
});
