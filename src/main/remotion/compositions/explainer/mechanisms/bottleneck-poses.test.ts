import { describe, expect, it } from 'vitest';
import type { BottleneckScene } from '../types';
import { sampleBottleneck } from './bottleneck-poses';

const scene: BottleneckScene = {
  kind: 'bottleneck',
  label: 'Work queues',
  tokenCount: 6,
  feedAt: 0.3,
  queueAt: 1.2,
  openAt: 2.1,
  clearAt: 3.5,
};

describe('bottleneck conservation and gate interlock', () => {
  it.each([
    4, 6, 8,
  ] as const)('conserves all %i tokens without collisions or passage through the closed gate', (tokenCount) => {
    const data = { ...scene, tokenCount };
    for (let frame = 0; frame < 180; frame++) {
      const t = frame / 30;
      const pose = sampleBottleneck(t, data);
      expect(pose.tokens.map((token) => token.id)).toEqual(
        Array.from({ length: tokenCount }, (_, i) => i),
      );
      for (const [index, token] of pose.tokens.entries()) {
        expect(Number.isFinite(token.x)).toBe(true);
        if (pose.gate < 1) expect(token.x + 0.12).toBeLessThan(-0.08);
        const previous = pose.tokens[index - 1];
        if (previous) expect(previous.x - token.x).toBeGreaterThanOrEqual(0.33 - 1e-10);
        if (t >= data.clearAt) expect(token.x - 0.12).toBeGreaterThan(0.08);
      }
    }
  });

  it('is continuous around each beat and independently seekable', () => {
    for (const time of [
      4.5,
      scene.openAt,
      scene.feedAt,
      scene.queueAt,
      scene.clearAt,
      scene.openAt + 0.05,
    ]) {
      const a = sampleBottleneck(time - 1e-6, scene);
      const b = sampleBottleneck(time + 1e-6, scene);
      for (const [index, token] of a.tokens.entries()) {
        expect(Math.abs(token.x - (b.tokens[index]?.x ?? NaN))).toBeLessThan(1e-4);
      }
    }
    expect(sampleBottleneck(5, scene)).toEqual(sampleBottleneck(500, scene));
    const middle = sampleBottleneck(3, scene);
    for (const t of [10, 0, 5, 1, 2]) sampleBottleneck(t, scene);
    expect(sampleBottleneck(3, scene)).toEqual(middle);
  });
});
