import { describe, expect, it } from 'vitest';
import { diagramPose, reveal } from './motion';

const beats = { setupAt: 0.25, actionAt: 2, responseAt: 4, checkAt: 6, resolveAt: 8 };
describe('frame-only diagram motion', () => {
  it('does not reveal results early and holds the final state', () => {
    expect(diagramPose(1, beats).action).toBe(0);
    expect(diagramPose(3, beats).response).toBe(0);
    expect(diagramPose(7.9, beats).resolve).toBe(0);
    expect(diagramPose(8.5, beats)).toEqual(diagramPose(9, beats));
  });
  it('is bounded and seekable in arbitrary frame order', () => {
    const samples = [0, 1, 3.7, 4.2, 6.1, 9];
    const reference = samples.map((t) => diagramPose(t, beats));
    for (const t of [...samples].reverse()) {
      const p = diagramPose(t, beats);
      expect(p).toEqual(reference[samples.indexOf(t)]);
      expect(p.modelOpacity + p.diagramOpacity).toBeCloseTo(1);
      for (const value of [p.setup, p.action, p.response, p.check, p.resolve]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
  it('can reveal cost at the action beat before latency at response, without revealing later facts', () => {
    expect(diagramPose(1.9, beats, 'action').diagramOpacity).toBe(0);
    const cost = diagramPose(2.8, beats, 'action');
    expect(cost.diagramOpacity).toBe(1);
    expect(cost.response).toBe(0);
    expect(cost.check).toBe(0);
    expect(cost.resolve).toBe(0);
    expect(diagramPose(2.8, beats).diagramOpacity).toBe(0);
  });
  it('rejects non-finite or invalid probe intervals', () => {
    expect(reveal(Number.NaN, 0)).toBe(0);
    expect(reveal(2, 1, -1)).toBe(0);
  });
});
