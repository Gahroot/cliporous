import { describe, expect, it } from 'vitest';
import { energyFieldPages, energyFieldPose } from './energy-field-poses';
import { energyFieldFixtureScenes } from './energy-field-test-fixtures';
import { interferenceCyclePages, interferenceCyclePose } from './interference-cycle-poses';
import { interferenceCycleCases } from './interference-cycle-test-fixtures';
import { resourceDiffusionPages, resourceDiffusionPose } from './resource-diffusion-poses';
import { resourceDiffusionCases } from './resource-diffusion-test-fixtures';
import { supplyIncentivesPages, supplyIncentivesPose } from './supply-incentives-poses';
import { supplyIncentivesFixtures } from './supply-incentives-test-fixtures';
import type { ExpansionPhysicalScene } from './types';

function bothModes<T extends ExpansionPhysicalScene>(scenes: readonly T[]): T[] {
  return scenes
    .filter((scene) => scene.visualMode === 'diagram')
    .flatMap((scene) =>
      (['diagram', 'hybrid'] as const).map((visualMode) => ({ ...scene, visualMode })),
    );
}
const entries = [
  ...bothModes(supplyIncentivesFixtures()).map((scene) => ({
    scene,
    count: supplyIncentivesPages(scene).length,
    pageAt: (time: number) => supplyIncentivesPose(scene, time).page,
  })),
  ...bothModes(resourceDiffusionCases()).map((scene) => ({
    scene,
    count: resourceDiffusionPages(scene).length,
    pageAt: (time: number) => resourceDiffusionPose(scene, time).page,
  })),
  ...bothModes(interferenceCycleCases()).map((scene) => ({
    scene,
    count: interferenceCyclePages(scene).length,
    pageAt: (time: number) => interferenceCyclePose(scene, time).page,
  })),
  ...bothModes(energyFieldFixtureScenes()).map((scene) => ({
    scene,
    count: energyFieldPages(scene).length,
    pageAt: (time: number) => energyFieldPose(scene, time).page,
  })),
];
/** Actual frame-page reachability is CPU evidence, not native pixels, physics or reading-time proof. */
describe('every factual physical page reaches an authored 30fps frame before final hold', () => {
  for (const [index, entry] of entries.entries()) {
    it(`accepted source ${index}, story ${entry.scene.storyId}/${entry.scene.visualMode}`, () => {
      const seen = new Set<number>();
      for (
        let frame = Math.ceil(entry.scene.setupAt * 30);
        frame <= Math.floor(entry.scene.resolveAt * 30);
        frame++
      ) {
        const page = entry.pageAt(frame / 30);
        expect(Number.isInteger(page)).toBe(true);
        expect(page).toBeGreaterThanOrEqual(0);
        expect(page).toBeLessThan(entry.count);
        seen.add(page);
      }
      expect(
        seen.size,
        'Cached factual pages must actually appear inside the authored active window',
      ).toBe(entry.count);
    });
  }
});
