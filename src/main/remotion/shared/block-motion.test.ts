import { describe, expect, it } from 'vitest';
import { getBlockMotion, getBlockReveal } from './block-motion';

describe('editorial block motion', () => {
  it.each([24, 30, 60])('has a stable reading hold and a complete exit at %i fps', (fps) => {
    const duration = fps * 4;
    expect(getBlockMotion(0, fps, duration)).toEqual({ opacity: 0, transform: 'translateY(18px)' });
    for (const frame of [fps, fps * 2, fps * 3]) {
      expect(getBlockMotion(frame, fps, duration)).toEqual({
        opacity: 1,
        transform: 'translateY(0px)',
      });
    }
    expect(getBlockMotion(duration - 1, fps, duration)).toEqual({
      opacity: 0,
      transform: 'translateY(0px)',
    });
  });

  it.each([
    1, 2, 3,
  ])('keeps a %i-frame insert visible instead of fading away its content', (duration) => {
    for (let frame = 0; frame < duration; frame++) {
      expect(getBlockMotion(frame, 30, duration).opacity).toBe(1);
      expect(getBlockReveal(frame, 30, duration)).toBe(1);
    }
  });

  it.each([
    4, 10, 15, 30, 120,
  ])('bounds motion and reserves reading time in %i frames', (duration) => {
    const frames = Array.from({ length: duration }, (_, frame) =>
      getBlockMotion(frame, 30, duration),
    );
    for (const { opacity, transform } of frames) {
      expect(opacity).toBeGreaterThanOrEqual(0);
      expect(opacity).toBeLessThanOrEqual(1);
      expect(transform).not.toMatch(/NaN|Infinity|scale/);
    }
    const hold = frames.filter(({ opacity }) => opacity === 1);
    expect(hold.length).toBeGreaterThanOrEqual(Math.floor(duration * 0.5));
  });

  it('uses seconds for the entrance at different frame rates', () => {
    expect(getBlockMotion(6, 30, 120)).toEqual(getBlockMotion(12, 60, 240));
  });

  it.each([
    4, 15, 30, 120,
  ])('finishes even a dense stagger before the reading hold in %i frames', (duration) => {
    const finish = Math.max(1, Math.floor((duration - 1) * 0.55));
    for (let index = 0; index < 12; index++) {
      let previous = 0;
      for (let frame = 0; frame <= finish; frame++) {
        const progress = getBlockReveal(frame, 30, duration, index, 12);
        expect(progress).toBeGreaterThanOrEqual(previous);
        expect(progress).toBeLessThanOrEqual(1);
        previous = progress;
      }
      expect(previous).toBe(1);
    }
  });

  it('renders identically when frames are requested out of order', () => {
    const reference = [0, 6, 15, 60, 119].map((frame) => getBlockMotion(frame, 30, 120));
    for (const [index, frame] of [0, 6, 15, 60, 119].entries()) {
      getBlockMotion(119 - frame, 30, 120);
      expect(getBlockMotion(frame, 30, 120)).toEqual(reference[index]);
    }
  });
});
