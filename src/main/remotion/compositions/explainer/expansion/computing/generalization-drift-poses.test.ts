import { describe, expect, it } from 'vitest';
import {
  generalizationDriftFields,
  generalizationDriftPose,
  generalizationDriftWrap,
} from './generalization-drift-poses';
import {
  acceptedGeneralizationDrift,
  GENERALIZATION_DRIFT_STATES,
  generalizationDriftSourceCases,
  maximumGeneralizationDriftFixture,
} from './generalization-drift-test-fixtures';

const fixtures = [
  ...generalizationDriftSourceCases(),
  ...(['71', '72'] as const).flatMap((id) =>
    GENERALIZATION_DRIFT_STATES.map((state) => maximumGeneralizationDriftFixture(id, state)),
  ),
];
describe('held-out generalization and evaluation drift source-preserving seekable poses', () => {
  for (const [index, fixture] of fixtures.entries())
    it(`source case ${index}/${fixture.id}: real parser, finite shuffled seeks, complete pages at 30fps and stable final hold`, () => {
      const scene = acceptedGeneralizationDrift(fixture),
        before = structuredClone(scene);
      const first = generalizationDriftPose(scene, scene.setupAt);
      expect(scene.records).toHaveLength(2);
      expect(scene.entities).toHaveLength(3);
      expect(scene.relations).toHaveLength(2);
      const reached = new Set<number>();
      for (
        let frame = Math.ceil(scene.setupAt * 30);
        frame <= Math.floor(scene.resolveAt * 30);
        frame++
      )
        reached.add(generalizationDriftPose(scene, frame / 30).page);
      expect([...reached]).toEqual(first.pages.map((_, i) => i));
      expect(first.pages.length).toBeLessThanOrEqual(24);
      for (const category of generalizationDriftFields(scene))
        for (const column of [0, 1]) {
          const actual = first.pages
            .filter((p) => p.category === category.category)
            .flatMap((p) => p.lanes[column]);
          expect(actual).toEqual(category.lanes[column].flatMap(generalizationDriftWrap));
          expect(actual.join('')).toBe(category.lanes[column].join(''));
        }
      const times = [
        NaN,
        Infinity,
        -Infinity,
        -1e9,
        1e9,
        scene.resolveAt,
        scene.checkAt,
        scene.responseAt,
        scene.actionAt,
        scene.setupAt,
        scene.resolveAt - 1 / 30,
      ];
      const expected = times.map((t) => generalizationDriftPose(scene, t));
      for (let i = times.length - 1; i >= 0; i--) {
        const p = generalizationDriftPose(scene, times[i]);
        expect(p).toEqual(expected[i]);
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          expect(Number.isFinite(p[key])).toBe(true);
          expect(p[key]).toBeGreaterThanOrEqual(0);
          expect(p[key]).toBeLessThanOrEqual(1);
        }
      }
      expect(generalizationDriftPose(scene, scene.resolveAt).page).toBe(first.pages.length - 1);
      expect(generalizationDriftPose(scene, scene.resolveAt + 0.8)).toEqual(
        generalizationDriftPose(scene, 1e9),
      );
      expect(scene).toEqual(before);
      for (const r of scene.records)
        if (r.result.state === 'unknown' || r.result.state === 'missing') {
          expect('amount' in r.result).toBe(false);
          expect(
            generalizationDriftFields(scene)
              .find((p) => p.category === 'Supplied results')
              ?.lanes.flat()
              .join(''),
          ).not.toContain('Exact: 0');
        }
    });
});
