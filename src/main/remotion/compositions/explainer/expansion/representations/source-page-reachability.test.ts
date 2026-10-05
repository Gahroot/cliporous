import { describe, expect, it } from 'vitest';
import { informationLossPose } from './information-loss-poses';
import { informationLossCases } from './information-loss-test-fixtures';
import { projectionMatrixPages, projectionMatrixPose } from './projection-matrix-poses';
import { cases } from './projection-matrix-test-fixtures';
import { unitsEquivalencePose } from './units-equivalence-poses';
import { unitsEquivalenceCases } from './units-equivalence-test-fixtures';
import { vectorFactorizationPose } from './vector-factorization-poses';
import {
  parseVectorFactorization,
  vectorFactorizationFixtures,
} from './vector-factorization-test-fixtures';

const entries = [
  ...cases().map((scene) => {
    const pages = projectionMatrixPages(scene);
    return { scene, pose: (time: number) => projectionMatrixPose(scene, time, pages) };
  }),
  ...unitsEquivalenceCases().map((scene) => ({
    scene,
    pose: (time: number) => unitsEquivalencePose(scene, time),
  })),
  ...informationLossCases().map((scene) => ({
    scene,
    pose: (time: number) => informationLossPose(scene, time),
  })),
  ...vectorFactorizationFixtures().flatMap((fixture) =>
    (['diagram', 'hybrid'] as const).map((mode) => {
      const scene = parseVectorFactorization(fixture, mode);
      return { scene, pose: (time: number) => vectorFactorizationPose(scene, time) };
    }),
  ),
];
/** Checking a cached page's glyphs is not proof that the page ever reaches the video. */
describe('every factual representation page reaches an authored 30fps frame', () => {
  for (const [index, entry] of entries.entries()) {
    it(`accepted source case ${index}, story ${entry.scene.storyId}/${entry.scene.visualMode}`, () => {
      const count = entry.pose(entry.scene.setupAt).pages.length;
      const seen = new Set<number>();
      const lastFrame = Math.ceil((entry.scene.resolveAt + 0.8) * 30);
      for (let frame = 0; frame <= lastFrame; frame++) seen.add(entry.pose(frame / 30).page);
      expect(
        seen.size,
        `${count} pages must actually appear, not just exist in pose metadata`,
      ).toBe(count);
    });
  }
});
