import { describe, expect, it } from 'vitest';
import { comparisonMetricReveal, tokenAttentionPose } from './poses';

const beats = { setupAt: 0.3, actionAt: 2, responseAt: 4, checkAt: 6, resolveAt: 8 };
describe('AI frame-driven reveals', () => {
  it('target is selected before its explanatory link appears', () => {
    expect(tokenAttentionPose(3, beats)).toEqual({ selected: 1, linked: 0 });
    expect(tokenAttentionPose(8.5, beats)).toEqual(tokenAttentionPose(9, beats));
  });
  it('reveals cost, latency and score at their distinct spoken cues', () => {
    expect(comparisonMetricReveal(3, beats, 'cost')).toBe(1);
    expect(comparisonMetricReveal(3, beats, 'latency')).toBe(0);
    expect(comparisonMetricReveal(5, beats, 'score')).toBe(0);
    expect(comparisonMetricReveal(7, beats, 'score')).toBe(1);
  });
});
