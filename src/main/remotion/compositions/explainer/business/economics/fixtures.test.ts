import { describe, expect, it } from 'vitest';
import {
  parseOperatingCostScene,
  parseScaleEconomicsScene,
  parseValueCaptureScene,
} from '../../../../../ai/explainer/business-economics-contract';
import type { ParseContext, Rec } from '../../../../../ai/explainer/kind-spec';
import {
  cloneEconomicsFixture,
  ECONOMICS_SOURCE_FIXTURES,
  ECONOMICS_SOURCE_NEGATIVES,
  economicsFixtureContext,
} from './fixtures';
import { economicsFacts } from './identities';
import { economicsReadingCards, economicsReadingFits } from './readability';
import { ECONOMICS_RECIPE_IDS, economicsRecipeId } from './types';

function parse(raw: Rec, ctx: ParseContext) {
  switch (raw.kind) {
    case 'operating-cost':
      return parseOperatingCostScene(raw, ctx);
    case 'scale-economics':
      return parseScaleEconomicsScene(raw, ctx);
    case 'value-capture':
      return parseValueCaptureScene(raw, ctx);
    default:
      throw new Error('Unknown fixture kind');
  }
}
describe('economics dedicated source fixtures', () => {
  it('has one independent invented primary for all seven recipes', () => {
    expect(ECONOMICS_SOURCE_FIXTURES.map((f) => f.id)).toEqual(ECONOMICS_RECIPE_IDS);
    expect(new Set(ECONOMICS_SOURCE_FIXTURES.map((f) => JSON.stringify(f.words))).size).toBe(7);
  });
  for (const primary of ECONOMICS_SOURCE_FIXTURES) {
    it(`${primary.id}: accepts production-sized source windows and declared modes`, () => {
      const f = cloneEconomicsFixture(primary.id),
        ctx = economicsFixtureContext(f);
      const diagram = parse(f.raw, ctx);
      expect(diagram, ctx.issues.join('; ')).not.toBeNull();
      if (!diagram) return;
      expect(economicsRecipeId(diagram)).toBe(primary.id);
      expect(diagram.finalHoldSeconds).toBeGreaterThanOrEqual(0.8);
      expect(economicsReadingFits(diagram)).toBe(true);
      expect(economicsReadingCards(diagram)).toHaveLength(economicsFacts(diagram).length);
      expect(ctx.win.endTime - ctx.win.startTime).toBeLessThanOrEqual(12);
      const first = f.words[0],
        last = f.words.at(-1);
      if (!first || !last)
        throw new Error('Authored economics fixture requires real first/last speech');
      expect(ctx.win.startTime).toBeCloseTo(Math.max(0, first.start - 0.25));
      expect(ctx.win.endTime).toBeCloseTo(last.end + 0.35);
      const hybridRaw = { ...f.raw, visualMode: 'hybrid' },
        hybridCtx = economicsFixtureContext(f);
      const hybrid = parse(hybridRaw, hybridCtx);
      if (primary.id === 'OP-38') expect(hybrid).toBeNull();
      else {
        expect(hybrid, hybridCtx.issues.join('; ')).not.toBeNull();
        if (hybrid) expect(economicsFacts(hybrid)).toEqual(economicsFacts(diagram));
      }
      const clocks = Object.keys(diagram).filter((key) => key.endsWith('At'));
      expect(clocks).toEqual(['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt']);
    });
  }
  for (const negative of ECONOMICS_SOURCE_NEGATIVES) {
    it(`${negative.recipeId}: rejects ${negative.name}`, () => {
      const ctx = economicsFixtureContext(negative.fixture);
      expect(parse(negative.fixture.raw, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    });
  }
  it('has a substantive local-source negative for every recipe', () => {
    expect(new Set(ECONOMICS_SOURCE_NEGATIVES.map((f) => f.recipeId))).toEqual(
      new Set(ECONOMICS_RECIPE_IDS),
    );
  });
});
