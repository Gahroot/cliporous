import { describe, expect, it } from 'vitest';
import {
  parseCapitalStructureScene,
  parseEconomicRightsScene,
  parseInvestmentOutcomesScene,
} from '../../../../../ai/explainer/business-capital-contract';
import { boundedBusinessInput } from '../../../../../ai/explainer/business-contract';
import { isRec } from '../../../../../ai/explainer/kind-spec';
import { diagramPose } from '../../diagrams/motion';
import { businessTextWidth } from '../text-width';
import { BUSINESS_INPUT_LIMITS } from '../types';
import { CAPITAL_SOURCE_FIXTURES, capitalFixtureContext } from './fixtures';
import { capitalCards, capitalPages, CAPITAL_READING as R } from './presentation';
import {
  capitalHoldCount,
  capitalIdentities,
  capitalRelationCount,
  CAPITAL_LIMITS as L,
} from './types';

describe('CAPITAL six authored primary raw/source fixtures', () => {
  it('owns exactly the six frozen new routes, not OP-58 or a kind substitution', () => {
    expect(CAPITAL_SOURCE_FIXTURES.map((f) => f.id)).toEqual([
      'OP-57',
      'OP-59',
      'OP-60',
      'OP-61',
      'OP-62',
      'OP-64',
    ]);
    expect(CAPITAL_SOURCE_FIXTURES.map((f) => f.raw.preset)).toEqual([
      'ownership-versus-claims',
      'source-outcome-set',
      'conditional-rounds',
      'financing-versus-capacity',
      'obligations-and-maturity',
      'claim-asset-distinction',
    ]);
  });
  for (const fixture of CAPITAL_SOURCE_FIXTURES) {
    it(`${fixture.id}: bounded real JSON, real five source beats, complete fixed-font post-handoff pages`, () => {
      const ctx = capitalFixtureContext(fixture);
      expect(boundedBusinessInput(fixture.raw, ctx)).toBe(true);
      expect(new TextEncoder().encode(JSON.stringify(fixture.raw)).byteLength).toBeLessThanOrEqual(
        BUSINESS_INPUT_LIMITS.bytes,
      );
      const scene =
        fixture.raw.kind === 'economic-rights'
          ? parseEconomicRightsScene(fixture.raw, ctx)
          : fixture.raw.kind === 'investment-outcomes'
            ? parseInvestmentOutcomesScene(fixture.raw, ctx)
            : parseCapitalStructureScene(fixture.raw, ctx);
      expect(scene, ctx.issues.join('; ')).not.toBeNull();
      if (!scene) throw new Error(ctx.issues.join('; '));
      expect(ctx.win.endTime - ctx.win.startTime).toBeGreaterThanOrEqual(5);
      expect(ctx.win.endTime - ctx.win.startTime).toBeLessThanOrEqual(12);
      expect(scene.finalHoldSeconds).toBeGreaterThanOrEqual(0.8);
      const beatKeys = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'];
      const seconds = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
      ];
      for (const [i, key] of beatKeys.entries()) {
        const index = fixture.raw[key];
        if (typeof index !== 'number') throw new Error('Missing indexed source beat');
        expect(seconds[i]).toBeCloseTo(ctx.at(index), 8);
      }
      const identities = capitalIdentities(scene);
      expect(identities.length).toBeLessThanOrEqual(L.identities);
      expect(new Set(identities.map((a) => a.id)).size).toBe(identities.length);
      expect(capitalRelationCount(scene)).toBeLessThanOrEqual(L.relations);
      expect(capitalHoldCount(scene)).toBeLessThanOrEqual(L.holds);
      const pages = capitalPages(scene);
      expect(pages.length).toBeLessThanOrEqual(L.pages);
      expect(pages.flatMap((p) => p.cards.map((c) => c.card.id))).toEqual(
        capitalCards(scene).map((c) => c.id),
      );
      for (const page of pages) {
        expect(diagramPose(page.start, scene).diagramOpacity).toBeCloseTo(1, 8);
        expect(page.end - page.start).toBeGreaterThanOrEqual(1.5);
        for (const layout of page.cards) {
          expect(layout.bodyLines.map((l) => l.id).length).toBe(
            new Set(layout.bodyLines.map((l) => l.id)).size,
          );
          for (const line of layout.bodyLines) {
            expect(businessTextWidth(line.text, R.bodySize)).toBeLessThanOrEqual(
              layout.width - 2 * R.padding,
            );
            expect(line.y).toBeLessThanOrEqual(layout.y + layout.height - R.padding);
          }
          const actual = layout.bodyLines
            .map((l) => l.text)
            .join('')
            .replace(/\s/gu, '');
          expect(actual).toBe(
            layout.card.lines
              .map((l) => l.text)
              .join('')
              .replace(/\s/gu, ''),
          );
        }
      }
      if (scene.kind === 'investment-outcomes') {
        expect(pages).toHaveLength(1);
        expect(pages[0].cards).toHaveLength(scene.outcomes.length);
        expect(new Set(pages[0].cards.map((c) => c.width)).size).toBe(1);
        expect(scene.outcomes.map((o) => [o.measure, o.amount.money?.minorUnits ?? null])).toEqual([
          ['loss', 2000],
          ['proceeds', 0],
          ['return', null],
        ]);
        expect(scene.outcomes.every((o) => o.probability === null)).toBe(true);
      }
      if (scene.kind === 'capital-structure' && scene.preset === 'obligations-and-maturity') {
        expect(scene.obligations.map((o) => o.maturity)).toEqual(['2030-06-30', '2031-06-30']);
        expect(
          scene.obligations.every((o) => !Object.keys(o).some((key) => key.endsWith('At'))),
        ).toBe(true);
      }
      expect(isRec(JSON.parse(JSON.stringify(fixture.raw)))).toBe(true);
    });
  }
});
