import { describe, expect, it } from 'vitest';
import { fitScalePages, fitScalePose } from './fit-scale-poses';
import {
  accepted as fitAccepted,
  packet as fitPacket,
  linkedFixture,
  maximumPacking,
  qualifiedResult,
} from './fit-scale-test-fixtures';
import { regionsDimensionsPages, regionsDimensionsPose } from './regions-dimensions-poses';
import { cases as regionCases } from './regions-dimensions-test-fixtures';
import { sectionUnfoldPages, sectionUnfoldPose } from './section-unfold-poses';
import { sectionAccepted, sectionCases } from './section-unfold-test-fixtures';
import { visibilityAccessPages, visibilityAccessPose } from './visibility-access-poses';
import { sources, accepted as visibilityAccepted } from './visibility-access-test-fixtures';

const modes = ['diagram', 'hybrid'] as const;
const fitSources = [
  ...fitPacket.stories.flatMap((story) => [story, ...story.paraphrases]),
  maximumPacking(),
  linkedFixture('measured'),
  linkedFixture('schematic'),
  linkedFixture('measured', true),
  ...(['unknown', 'missing', 'disputed'] as const).flatMap((state) => [
    qualifiedResult('59', state),
    qualifiedResult('60', state),
  ]),
];
const entries = [
  ...sectionCases.flatMap((source) =>
    modes.map((mode) => {
      const scene = sectionAccepted(source, mode);
      const pages = sectionUnfoldPages(scene);
      return {
        scene,
        count: pages.length,
        pageAt: (time: number) => sectionUnfoldPose(scene, time, pages).page,
      };
    }),
  ),
  ...fitSources.flatMap((source) =>
    modes.map((mode) => {
      const scene = fitAccepted(source, mode);
      return {
        scene,
        count: fitScalePages(scene).length,
        pageAt: (time: number) => fitScalePose(scene, time).page,
      };
    }),
  ),
  ...sources.flatMap((source) =>
    modes.map((mode) => {
      const scene = visibilityAccepted(source, mode);
      const pages = visibilityAccessPages(scene);
      return {
        scene,
        count: pages.length,
        pageAt: (time: number) => visibilityAccessPose(scene, time, pages).page,
      };
    }),
  ),
  ...regionCases().map((scene) => ({
    scene,
    count: regionsDimensionsPages(scene).length,
    pageAt: (time: number) => regionsDimensionsPose(scene, time).page,
  })),
];

/** Pose-page reachability is CPU evidence, not native pixels or reading-time proof. */
describe('every factual geometry page reaches a frame inside the authored active window', () => {
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
      expect(seen.size, 'Cached factual pages must actually appear before the final hold').toBe(
        entry.count,
      );
    });
  }
});
