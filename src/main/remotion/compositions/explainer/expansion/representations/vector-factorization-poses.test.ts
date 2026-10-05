import { describe, expect, it } from 'vitest';
import {
  vectorFactorizationIdentity,
  vectorFactorizationPages,
  vectorFactorizationPose,
} from './vector-factorization-poses';
import {
  parseVectorFactorization,
  vectorFactorizationFixtures,
} from './vector-factorization-test-fixtures';

describe('frozen vector/factorization source and seek poses', () => {
  for (const [index, fixture] of vectorFactorizationFixtures().entries()) {
    it(`${fixture.id}/${index}: real parser both modes, all frames, shuffled and repeated seeks`, () => {
      const before = JSON.stringify(fixture);
      for (const mode of ['diagram', 'hybrid'] as const) {
        const scene = parseVectorFactorization(fixture, mode);
        const source = JSON.stringify(scene);
        const pages = vectorFactorizationPages(scene);
        expect(new Set(pages.map((p) => p.id)).size).toBe(pages.length);
        const snapshots = Array.from({ length: 361 }, (_, frame) =>
          vectorFactorizationPose(scene, frame / 30),
        );
        for (const frame of Array.from({ length: 361 }, (_, i) => (i * 97) % 361)) {
          expect(vectorFactorizationPose(scene, frame / 30)).toEqual(snapshots[frame]);
          const pose = snapshots[frame];
          for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
            expect(Number.isFinite(pose[key])).toBe(true);
            expect(pose[key]).toBeGreaterThanOrEqual(0);
            expect(pose[key]).toBeLessThanOrEqual(1);
          }
          expect(pose.page).toBeGreaterThanOrEqual(0);
          expect(pose.page).toBeLessThan(pages.length);
        }
        for (const t of [NaN, Infinity, -Infinity])
          expect(vectorFactorizationPose(scene, t)).toEqual(
            vectorFactorizationPose(scene, scene.setupAt),
          );
        expect(vectorFactorizationPose(scene, scene.resolveAt).page).toBe(pages.length - 1);
        expect(vectorFactorizationPose(scene, 100).page).toBe(pages.length - 1);
        if (scene.storyId === '56') {
          const identity = vectorFactorizationIdentity(scene);
          expect(identity.includes('=')).toBe(scene.result.state === 'derived');
          if (scene.result.state === 'derived') {
            expect(identity).toContain(
              `(${scene.result.operands[0].numerator}/${scene.result.operands[0].denominator})`,
            );
            expect(identity).toContain(
              `+ (${scene.result.operands[1].numerator}/${scene.result.operands[1].denominator})`,
            );
          }
        }
        expect(JSON.stringify(scene)).toBe(source);
      }
      expect(JSON.stringify(fixture)).toBe(before);
    });
  }
});
