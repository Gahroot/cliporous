import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExpansionSourceFixture } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionBaseRate,
  parseExpansionBayesUpdate,
} from '../../../../../ai/explainer/expansion-probability-base-update-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { baseUpdatePose, baseUpdateResultLines, baseUpdateRows } from './base-update-poses';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/probability/base-update.source.json',
    'utf8',
  ),
) as { stories: ExpansionSourceFixture[] };
describe('base/update seekable poses', () => {
  for (const story of packet.stories)
    it(`${story.id}: all frames, shuffled/repeated seeks and nonfinite probes`, () => {
      const ctx = makeParseContext(story.words, story.window);
      const scene =
        story.id === '09'
          ? parseExpansionBaseRate(story.proposal, ctx)
          : parseExpansionBayesUpdate(story.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Real parser scene required');
      const snapshot = JSON.stringify(scene);
      const poses = Array.from({ length: 301 }, (_, frame) => baseUpdatePose(frame / 30, scene));
      for (let i = 0; i < 301; i++) {
        const frame = (i * 137) % 301;
        expect(baseUpdatePose(frame / 30, scene)).toEqual(poses[frame]);
        for (const value of Object.values(poses[frame])) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
      for (const t of [NaN, Infinity, -Infinity, -10])
        expect(Object.values(baseUpdatePose(t, scene))).toEqual([0, 0, 0, 0, 0]);
      for (const t of [scene.resolveAt + 0.25, 9.2, 10, 1000])
        expect(Object.values(baseUpdatePose(t, scene))).toEqual([1, 1, 1, 1, 1]);
      const beats = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
      beats.forEach((beat, i) => {
        expect(Object.values(baseUpdatePose(scene[beat], scene))[i]).toBe(0);
        expect(Object.values(baseUpdatePose(scene[beat] + 0.25, scene))[i]).toBe(1);
      });
      expect(baseUpdateRows({ ...scene, visualMode: 'hybrid' })).toEqual(baseUpdateRows(scene));
      expect(baseUpdateResultLines({ ...scene, visualMode: 'hybrid' })).toEqual(
        baseUpdateResultLines(scene),
      );
      expect(JSON.stringify(scene)).toBe(snapshot);
    });
});
