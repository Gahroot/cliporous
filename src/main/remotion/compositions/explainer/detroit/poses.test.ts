import { describe, expect, it } from 'vitest';
import { detroitPose } from './poses';

const beats = { setupAt: 0.3, actionAt: 2, responseAt: 4, checkAt: 6, resolveAt: 8 };
describe('Detroit authored reveal', () => {
  it('keeps labels at the check beat and a quiet final hold', () => {
    expect(detroitPose(5, beats).label).toBe(0);
    expect(detroitPose(8.5, beats)).toEqual(detroitPose(9, beats));
    for (const t of [9, 3, 0, 6.2]) expect(detroitPose(t, beats)).toEqual(detroitPose(t, beats));
  });
  it('bounds even out-of-range montage indices', () => {
    expect(detroitPose(1, beats, 100)).toEqual(detroitPose(1, beats, 2));
    expect(detroitPose(1, beats, -5)).toEqual(detroitPose(1, beats, 0));
  });
});
