import { describe, expect, it } from 'vitest';
import { cacheStreamPages, cacheStreamPose } from './cache-stream-poses';
import { cacheStreamCases } from './cache-stream-test-fixtures';
import { generalizationDriftPages, generalizationDriftPose } from './generalization-drift-poses';
import { generalizationDriftCases } from './generalization-drift-test-fixtures';
import { retryProductPages, retryProductPose } from './retry-product-poses';
import { retryProductCases } from './retry-product-test-fixtures';
import type { ExpansionComputingScene } from './types';
import { versionsPermissionsPages, versionsPermissionsPose } from './versions-permissions-poses';
import { versionsPermissionsCases } from './versions-permissions-test-fixtures';

function bothModes<T extends ExpansionComputingScene>(scenes: readonly T[]): T[] {
  return scenes
    .filter((scene) => scene.visualMode === 'diagram')
    .flatMap((scene) =>
      (['diagram', 'hybrid'] as const).map((visualMode) => ({ ...scene, visualMode })),
    );
}
const entries = [
  ...bothModes(cacheStreamCases()).map((scene) => ({
    scene,
    count: cacheStreamPages(scene).length,
    pageAt: (time: number) => cacheStreamPose(scene, time).page,
  })),
  ...bothModes(retryProductCases()).map((scene) => ({
    scene,
    count: retryProductPages(scene).length,
    pageAt: (time: number) => retryProductPose(scene, time).page,
  })),
  ...bothModes(versionsPermissionsCases()).map((scene) => ({
    scene,
    count: versionsPermissionsPages(scene).length,
    pageAt: (time: number) => versionsPermissionsPose(scene, time).page,
  })),
  ...bothModes(generalizationDriftCases()).map((scene) => ({
    scene,
    count: generalizationDriftPages(scene).length,
    pageAt: (time: number) => generalizationDriftPose(scene, time).page,
  })),
];
/** Actual authored frame-page reachability is CPU evidence, not native pixels or reading-time proof. */
describe('every factual computing page reaches an authored 30fps frame before final hold', () => {
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
