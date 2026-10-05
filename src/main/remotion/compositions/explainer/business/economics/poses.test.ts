import { describe, expect, it } from 'vitest';
import {
  parseOperatingCostScene,
  parseScaleEconomicsScene,
  parseValueCaptureScene,
} from '../../../../../ai/explainer/business-economics-contract';
import { ECONOMICS_SOURCE_FIXTURES, economicsFixtureContext } from './fixtures';
import {
  economicsAssembly,
  economicsDecompositions,
  sampleEconomics,
  sampleEconomicsFrame,
} from './poses';
import { economicsPages } from './presentation';

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}
function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  return !value || typeof value !== 'object' || Object.values(value).every(finite);
}
describe('economics pure seekable treatments', () => {
  for (const f of ECONOMICS_SOURCE_FIXTURES) {
    it(`${f.id}: repeated/backward/shuffled/frame seeks retain exact facts and settled hold`, () => {
      const ctx = economicsFixtureContext(f);
      const scene =
        f.raw.kind === 'operating-cost'
          ? parseOperatingCostScene(f.raw, ctx)
          : f.raw.kind === 'scale-economics'
            ? parseScaleEconomicsScene(f.raw, ctx)
            : parseValueCaptureScene(f.raw, ctx);
      if (!scene) throw new Error(ctx.issues.join('; '));
      freeze(scene);
      const snapshot = JSON.stringify(scene);
      const sourceFacts = sampleEconomics(scene, scene.resolveAt).sourceFacts;
      const times = [
        scene.resolveAt,
        scene.setupAt,
        scene.responseAt,
        scene.actionAt,
        -1,
        Number.NaN,
        Infinity,
        scene.checkAt,
        scene.resolveAt,
      ];
      for (const t of times) {
        const a = sampleEconomics(scene, t);
        expect(a).toEqual(sampleEconomics(scene, t));
        expect(finite(a)).toBe(true);
        expect(a.sourceFacts).toEqual(sourceFacts);
        for (const group of a.decompositions) {
          expect(group.parts.reduce((n, p) => n + p.amount, 0)).toBe(group.total);
          expect(group.parts.every((p) => p.visualWeight >= 0 && p.visualWeight <= 1)).toBe(true);
        }
      }
      const startHold = sampleEconomics(scene, scene.resolveAt),
        endHold = sampleEconomics(scene, scene.resolveAt + scene.finalHoldSeconds);
      expect(startHold.decompositions).toEqual(endHold.decompositions);
      expect(startHold.snapshots).toEqual(endHold.snapshots);
      expect(startHold.alternatives).toEqual(endHold.alternatives);
      expect(sampleEconomicsFrame(scene, scene.responseAt * 30, 30)).toEqual(
        sampleEconomics(scene, scene.responseAt),
      );
      for (const [frame, fps] of [
        [Infinity, 30],
        [60, 0],
        [NaN, -1],
      ])
        expect(finite(sampleEconomicsFrame(scene, frame, fps))).toBe(true);
      expect(JSON.stringify(scene)).toBe(snapshot);
      const pages = economicsPages(scene);
      for (const page of pages) expect(page.end - page.start).toBeGreaterThanOrEqual(1.5 - 1e-7);
      expect(pages.at(-1)?.start).toBeLessThanOrEqual(scene.resolveAt);
      if (scene.preset === 'accounting-bases')
        expect(economicsDecompositions(scene)[0]?.parts.map((p) => p.id)).toEqual([
          ...scene.costs.map((p) => p.identity.id),
          'stated-cost-remainder',
        ]);
      if (scene.preset === 'source-stated-allocation') {
        expect(startHold.fills).toEqual([0.4, 0.25, 0.15, 0.2]);
        expect(economicsDecompositions(scene)[0].parts.map((p) => p.id)).toEqual([
          ...scene.allocations.map((p) => p.identity.id),
          scene.remainder.identity.id,
        ]);
      }
      if (scene.preset === 'output-staffing') {
        const instance = economicsAssembly(scene, startHold);
        expect(instance?.assembly).toEqual({ asset: 'A-02', occupied: false });
        expect(startHold.alternatives.map((p) => [p.area, p.opacity, p.baseline])).toEqual([
          [1, 1, 0],
          [1, 1, 0],
        ]);
        for (const page of pages)
          expect(page.cards.map((p) => p.card.id.split(':')[0])).toEqual(
            scene.samples.map((p) => p.identity.id),
          );
      }
      if (scene.preset === 'comparable-pricing-bases')
        expect(economicsAssembly(scene, startHold)).toBeNull();
      if (scene.preset === 'implementation-periods')
        expect(startHold.snapshots.map((p) => p.date)).toEqual(scene.periods.map((p) => p.date));
    });
  }
});
