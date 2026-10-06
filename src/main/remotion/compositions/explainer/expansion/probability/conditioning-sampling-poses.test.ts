import { describe, expect, it } from 'vitest';
import { validatePopulation } from '../kits/population';
import {
  conditioningSamplingFields,
  conditioningSamplingPage,
  conditioningSamplingPages,
  conditioningSamplingPose,
  conditioningSamplingView,
} from './conditioning-sampling-poses';
import { conditioningSamplingScenes } from './conditioning-sampling-poses.fixtures';

describe('authored conditioning / selection poses', () => {
  for (const [index, scene] of conditioningSamplingScenes.entries()) {
    it(`${index}: pure repeated, shuffled and every 30fps frame; five beats and final hold`, () => {
      const frames = Array.from({ length: 301 }, (_, frame) => frame / 30);
      const results = frames.map((t) => conditioningSamplingPose(t, scene));
      const pages = conditioningSamplingPages(scene);
      const pageIndices = frames.map((t) => conditioningSamplingPage(t, scene));
      expect(conditioningSamplingPages(scene)).toEqual(pages);
      expect(new Set(pages.map((page) => page.id)).size).toBe(pages.length);
      expect([...new Set(pageIndices)]).toEqual(pages.map((_, page) => page));
      expect(conditioningSamplingPage(scene.resolveAt, scene)).toBe(pages.length - 1);
      expect(conditioningSamplingPage(100, scene)).toBe(pages.length - 1);
      for (const t of [NaN, Infinity, -Infinity])
        expect(conditioningSamplingPage(t, scene)).toBe(0);
      for (const page of pages)
        expect(
          page.fields.reduce((n, field) => n + Math.ceil(Array.from(field.text).length / 30), 0),
        ).toBeLessThanOrEqual(9);
      for (const i of [...frames.keys()].sort((a, b) => ((a * 137) % 301) - ((b * 137) % 301))) {
        expect(conditioningSamplingPose(frames[i], scene)).toEqual(results[i]);
        expect(conditioningSamplingPage(frames[i], scene)).toBe(pageIndices[i]);
        expect(Object.values(results[i]).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(
          true,
        );
      }
      for (const t of [NaN, Infinity, -Infinity])
        expect(Object.values(conditioningSamplingPose(t, scene))).toEqual([0, 0, 0, 0, 0]);
      const fields = ['reveal', 'action', 'response', 'check', 'resolve'] as const;
      const times = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
      ];
      fields.forEach((key, i) => {
        expect(conditioningSamplingPose(times[i], scene)[key]).toBe(0);
        expect(conditioningSamplingPose(times[i] + 0.7, scene)[key]).toBe(1);
      });
      expect(conditioningSamplingPose(10, scene)).toEqual(conditioningSamplingPose(100, scene));
      const rows = conditioningSamplingView(scene);
      expect(conditioningSamplingView(scene)).toEqual(rows);
      expect(rows.flatMap((row) => row.population?.marks ?? []).length).toBeLessThanOrEqual(100);
      for (const row of rows) {
        for (const field of conditioningSamplingFields(row)) {
          expect(
            pages
              .flatMap((page) => page.fields)
              .filter((entry) => entry.sourceId === field.sourceId)
              .map((entry) => entry.text)
              .join(''),
          ).toBe(field.text);
        }
        if (row.population) {
          validatePopulation(row.population);
          for (const [slot, mark] of row.population.marks.entries()) {
            expect(mark.membership).toEqual([row.groupId]);
            expect(mark.id).toBe(`${row.id}-display-${String(slot).padStart(3, '0')}`);
          }
          if (scene.storyId === '12')
            expect(row.population.sourceDenominator).toEqual({
              state: 'unknown',
              qualifier: 'not supplied',
            });
          if (
            scene.storyId === '11' &&
            row.groupId === scene.eventId &&
            scene.counts.subset.quantity.state === 'known'
          ) {
            expect(row.population.sourceDenominator).toEqual({
              state: 'known',
              value:
                scene.counts.subset.quantity.amount.kind === 'rational'
                  ? scene.counts.subset.quantity.amount.value
                  : undefined,
            });
          }
          expect(row.population.basis).toEqual(row.quantity?.basis);
        }
        if (row.display?.membersPerMark.denominator !== 1) expect(row.population).toBeUndefined();
        if (row.quantity?.state !== 'known') expect(row.population).toBeUndefined();
      }
      if (scene.storyId === '11') {
        expect(rows[0].role).toContain('not denominator');
        expect(rows[1].groupId).toBe(scene.denominatorId);
      } else {
        expect([
          ...new Set(rows.filter((row) => row.state === 'excluded').map((row) => row.groupId)),
        ]).toEqual(scene.excludedIds);
        expect(rows.every((row) => row.role.includes('sampling-frame only'))).toBe(true);
      }
    });
  }
});
