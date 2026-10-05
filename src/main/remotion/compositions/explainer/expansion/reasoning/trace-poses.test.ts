import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseClaimSourceBoard,
  parseEvidenceToClaimTrace,
} from '../../../../../ai/explainer/expansion-reasoning-trace-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { tracePageTime, tracePose } from './trace-poses';

const packet = JSON.parse(
  readFileSync('scripts/explainer-stills/fixtures/expansion/reasoning/trace.source.json', 'utf8'),
) as { stories: TemporalFixtureSeed[] };
const fixtures = temporalSourceFixtures(packet.stories);

describe('trace poses, real attributed raw source (CPU)', () => {
  for (const fixture of fixtures)
    it(`${fixture.id}: full frames and nonsequential seeks retain exact identity`, () => {
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene =
        fixture.id === '01'
          ? parseEvidenceToClaimTrace(fixture.proposal, ctx)
          : parseClaimSourceBoard(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Valid fixture rejected');
      const times = Array.from(
        { length: Math.ceil(fixture.window.endTime * 30) + 1 },
        (_, i) => i / 30,
      );
      const baseline = times.map((t) => tracePose(scene, t));
      for (const i of [...times.keys()].sort(
        (a, b) => ((a * 73) % times.length) - ((b * 73) % times.length),
      )) {
        const pose = tracePose(scene, times[i]);
        expect(pose).toEqual(baseline[i]);
        expect(tracePose(scene, times[i])).toEqual(pose);
        expect(pose.entities.map((entity) => entity.id)).toEqual(
          scene.entities.map((entity) => entity.id),
        );
        const ordered =
          scene.storyId === '01'
            ? [...scene.entities].sort((a, b) => {
                const rank = (id: string): number => {
                  const role = scene.records.find((record) => record.entityId === id)?.role;
                  return role === 'claim' ? 2 : role === 'excerpt' ? 1 : 0;
                };
                return rank(a.id) - rank(b.id);
              })
            : scene.entities.flatMap((source) =>
                scene.records.some((record) => record.entityId === source.id)
                  ? []
                  : [
                      source,
                      ...scene.entities.filter((entity) =>
                        scene.records.some(
                          (record) =>
                            record.role !== 'claim' &&
                            record.sourceId === source.id &&
                            record.entityId === entity.id,
                        ),
                      ),
                    ],
              );
        expect(new Set(ordered.map((entity) => entity.id)).size).toBe(scene.entities.length);
        for (const entity of pose.entities) {
          const slot = ordered.findIndex((entry) => entry.id === entity.id);
          expect([entity.x, entity.y]).toEqual([
            119 + 238 * (slot % 4),
            20 + 142 * Math.floor(slot / 4),
          ]);
          // Authored identity rail, not the old board: icon at y=20, label at y=50.
          expect(entity.x - 119).toBeGreaterThanOrEqual(0);
          expect(entity.x + 119).toBeLessThanOrEqual(952);
          expect(entity.y + 30).toBeLessThan(286);
        }
        const check = (value: unknown): void => {
          if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
          else if (value && typeof value === 'object') Object.values(value).forEach(check);
        };
        check(pose);
        for (const p of [pose, ...pose.entities.map((entity) => entity.pose), ...pose.relations])
          for (const name of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
            expect(p[name]).toBeGreaterThanOrEqual(0);
            expect(p[name]).toBeLessThanOrEqual(1);
          }
      }
      const final = tracePose(scene, scene.resolveAt + 0.25);
      expect(final.pages.map((page) => page.id)).toEqual([
        ...scene.records.map((record) => `record/${record.entityId}`),
        ...scene.relations.map(
          (relation) => `relation/${relation.fromId}/${relation.role}/${relation.toId}`,
        ),
        'resolve',
      ]);
      for (const [index, page] of final.pages.entries()) {
        const interval = tracePageTime(scene, page);
        const sample = Number.isFinite(interval.end)
          ? (interval.start + interval.end) / 2
          : interval.start + 0.25;
        expect(tracePose(scene, sample).page).toBe(index);
        expect(tracePose(scene, sample).setup).toBe(1);
      }
      expect(tracePose(scene, scene.resolveAt + 0.25)).toEqual(
        tracePose(scene, fixture.window.endTime),
      );
      expect(tracePose(scene, Number.NaN)).toEqual(tracePose(scene, scene.setupAt - 1));
      expect(tracePose({ ...scene, visualMode: 'diagram' }, 7)).toEqual(
        tracePose({ ...scene, visualMode: 'hybrid' }, 7),
      );
    });
});
