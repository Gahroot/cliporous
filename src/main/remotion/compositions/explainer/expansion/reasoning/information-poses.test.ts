import { describe, expect, it } from 'vitest';
import { informationPose } from './information-poses';

import { informationSourceScenes } from './information-poses.fixtures';

describe('information frame-seekable source poses', () => {
  it('keeps every frame finite, bounded, identical after shuffled seeks and in final hold', () => {
    for (const mode of ['diagram', 'hybrid'] as const)
      for (const scene of informationSourceScenes(mode)) {
        const frames = Array.from(
          { length: Math.ceil((scene.resolveAt + 1) * 30) + 1 },
          (_, i) => i / 30,
        );
        const expected = frames.map((t) => informationPose(scene, t));
        for (const i of frames.map((_, i) => i).sort((a, b) => (a % 7) - (b % 7) || b - a)) {
          const pose = informationPose(scene, frames[i]);
          expect(pose).toEqual(expected[i]);
          for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
            expect(Number.isFinite(pose[key])).toBe(true);
            expect(pose[key]).toBeGreaterThanOrEqual(0);
            expect(pose[key]).toBeLessThanOrEqual(1);
            if (i > 0) expect(pose[key]).toBeGreaterThanOrEqual(expected[i - 1][key]);
          }
          expect(pose.entities.map((entity) => entity.id)).toEqual(
            scene.entities.map((entity) => entity.id),
          );
          expect(pose.records.map((record) => record.id)).toEqual(
            scene.storyId === '06' ? scene.records.map((record) => record.id) : [],
          );
          if (scene.storyId === '06') {
            expect(pose.detailIndex).toBeGreaterThanOrEqual(0);
            expect(pose.detailIndex).toBeLessThan(scene.records.length);
            if (frames[i] >= scene.resolveAt)
              expect(scene.records[pose.detailIndex].id).toBe(scene.focusRecordId);
          }
        }
        expect(informationPose(scene, scene.resolveAt + 0.2)).toEqual(
          informationPose(scene, scene.resolveAt + 1),
        );
        for (const invalid of [NaN, Infinity, -Infinity])
          expect(informationPose(scene, invalid)).toEqual(informationPose(scene, 0));
      }
  });
  it('accepts actual maximum raw records, entities and unbroken labels without truncation', () => {
    for (const mode of ['diagram', 'hybrid'] as const) {
      const [confounder, missing] = informationSourceScenes(mode).slice(-2);
      expect(confounder.entities.map((entry) => entry.label.length)).toEqual([28, 28, 28]);
      expect(confounder.label).toHaveLength(48);
      expect(confounder.scope).toHaveLength(40);
      expect(confounder.condition).toHaveLength(96);
      expect(missing.entities).toHaveLength(8);
      if (missing.storyId !== '06') throw new Error('Wrong maximum fixture');
      expect(missing.records).toHaveLength(12);
      expect(missing.records.filter((entry) => entry.topic.length === 96)).toHaveLength(10);
      expect(
        missing.records.filter((entry) => entry.state === 'known' && entry.content.length === 96),
      ).toHaveLength(8);
      expect(
        missing.records.filter((entry) => entry.state === 'known').map((entry) => entry.content),
      ).toContain('false');
      expect(
        missing.records.filter((entry) => entry.state === 'known').map((entry) => entry.content),
      ).toContain('zero');
    }
  });
  it('does not fabricate numeric effects or missing values', () => {
    for (const mode of ['diagram', 'hybrid'] as const)
      for (const scene of informationSourceScenes(mode)) {
        if (scene.storyId === '05') expect(scene.causalStatus.status).toBe('unestablished');
        else {
          expect(scene.resolution.status).toBe('unresolved');
          for (const record of scene.records.filter((entry) => entry.state !== 'known'))
            expect(record).not.toHaveProperty('content');
        }
      }
  });
});
