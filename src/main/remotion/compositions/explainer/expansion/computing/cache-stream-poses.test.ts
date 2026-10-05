import { describe, expect, it } from 'vitest';
import {
  cacheStreamFields,
  cacheStreamPages,
  cacheStreamPose,
  cacheStreamWrap,
} from './cache-stream-poses';
import { cacheStreamCases } from './cache-stream-test-fixtures';

describe('cache/stream source pages and pure seeks', () => {
  for (const [index, scene] of cacheStreamCases().entries())
    it(`source case ${index}`, () => {
      const pages = cacheStreamPages(scene),
        seen = new Set<number>();
      const firstFrame = Math.floor(scene.setupAt * 30);
      const frames = Array.from(
        { length: Math.ceil((scene.resolveAt + 0.8) * 30) - firstFrame + 1 },
        (_, i) => (firstFrame + i) / 30,
      );
      const expected = frames.map((t) => cacheStreamPose(scene, t));
      for (const pose of expected) {
        seen.add(pose.page);
        expect([
          pose.reveal,
          pose.action,
          pose.response,
          pose.check,
          pose.resolve,
          pose.time,
        ]).toEqual(expect.arrayContaining([expect.any(Number)]));
        expect(
          Object.values(pose)
            .filter((v) => typeof v === 'number')
            .every(Number.isFinite),
        ).toBe(true);
      }
      expect(seen.size).toBe(pages.length);
      for (let i = frames.length - 1; i >= 0; i--)
        expect(cacheStreamPose(scene, frames[i])).toEqual(expected[i]);
      for (const t of [NaN, Infinity, -Infinity])
        expect(cacheStreamPose(scene, t)).toEqual(cacheStreamPose(scene, scene.setupAt));
      expect(cacheStreamPose(scene, scene.resolveAt + 0.8).page).toBe(pages.length - 1);
      expect(cacheStreamPose(scene, scene.resolveAt + 100)).toEqual(
        cacheStreamPose(scene, scene.resolveAt + 0.8),
      );
      for (const entity of scene.entities)
        expect(
          pages
            .filter((p) => p.id.startsWith(`${entity.id}:`))
            .flatMap((p) => p.lines)
            .join(''),
        ).toBe(entity.label);
      for (const fact of [...scene.records, ...scene.relations]) {
        for (const targetId of fact.targetIds) {
          expect(
            pages
              .filter((p) => p.fact === fact && p.targetId === targetId)
              .flatMap((p) => p.lines)
              .join(''),
          ).toBe(cacheStreamFields(fact).join(''));
        }
      }
      const shuffled = frames
        .map((t, i) => ({ t, i }))
        .sort((a, b) => ((a.i * 37) % 101) - ((b.i * 37) % 101));
      for (const { t, i } of shuffled) expect(cacheStreamPose(scene, t)).toEqual(expected[i]);
      for (const at of [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
      ]) {
        for (const t of [at - 1 / 30, at, at + 1 / 30])
          expect(cacheStreamPose(scene, t)).toEqual(cacheStreamPose(scene, t));
      }
      expect(cacheStreamPose(scene, scene.setupAt).reveal).toBe(0);
      expect(cacheStreamPose(scene, scene.resolveAt + 0.8).reveal).toBe(1);
      expect(cacheStreamWrap('WWWW W'.repeat(16)).join('')).toBe('WWWW W'.repeat(16));
    });
});
