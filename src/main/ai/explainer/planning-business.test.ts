import { describe, expect, it } from 'vitest';
import {
  BUSINESS_KIND_OWNERS,
  BUSINESS_RECIPES,
} from '../../remotion/compositions/explainer/business/catalog';
import {
  businessSourceFixture,
  businessSourceFixtures,
} from '../../remotion/compositions/explainer/business/source-fixtures';
import { BUSINESS_SCENE_KINDS } from '../../remotion/compositions/explainer/types';
import { parsePlanWithDiagnostics } from '../explainer-scenes';
import { ALL_KIND_SPECS, getKindSpec } from './kinds';
import { buildShortlist, SHORTLIST_LIMITS } from './shortlist';

const sources = businessSourceFixtures();
describe('all eighty frozen recipes are production-planner reachable', () => {
  it('covers each recipe/preset/presentation independently, without duplicate grammar keys', () => {
    expect(BUSINESS_RECIPES).toHaveLength(80);
    expect(BUSINESS_SCENE_KINDS).toHaveLength(26);
    expect(Object.keys(BUSINESS_KIND_OWNERS)).toHaveLength(26);
    expect(new Set(ALL_KIND_SPECS.map((spec) => spec.kind)).size).toBe(ALL_KIND_SPECS.length);
    expect(sources).toHaveLength(
      BUSINESS_RECIPES.reduce((count, recipe) => count + recipe.modes.length, 0),
    );
    for (const recipe of BUSINESS_RECIPES) {
      const spec = getKindSpec(recipe.kind);
      expect(spec?.describe.length).toBeGreaterThan(20);
      expect(spec?.schema).toContain(recipe.preset);
      expect(spec?.triggers.length).toBeGreaterThan(0);
      expect(
        sources.filter((source) => source.id === recipe.id).map((source) => source.visualMode),
      ).toEqual(recipe.modes);
      for (const mode of ['diagram', 'hybrid'] as const) {
        if (!recipe.modes.includes(mode)) expect(businessSourceFixture(recipe.id, mode)).toBeNull();
      }
    }
    expect(SHORTLIST_LIMITS.maxKinds).toBe(16);
    expect(SHORTLIST_LIMITS.maxProps).toBe(10);
  });
  it.each(
    sources,
  )('$fixtureId: actual words select the grammar and root parser accepts the actual treatment', (source) => {
    const shortlist = buildShortlist(source.words);
    expect(shortlist.kinds.map((kind) => kind.kind)).toContain(source.raw.kind);
    expect(shortlist.kinds.length).toBeLessThanOrEqual(16);
    expect(shortlist.heroProps.length).toBeLessThanOrEqual(10);
    const result = parsePlanWithDiagnostics(
      { scenes: [{ ...source.raw, layout: 'stack' }] },
      source.words,
      { minStart: 0, maxEnd: 90 },
    );
    expect(result.rejected).toEqual([]);
    expect(result.omitted).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].scene.kind).toBe(source.raw.kind);
    if (result.accepted[0].scene.kind === 'possible-futures')
      expect(result.accepted[0].scene.businessAlternatives?.version).toBe(1);
    if (result.accepted[0].scene.kind === 'portfolio-exposure')
      expect(result.accepted[0].scene.dependencyLens?.version).toBe(1);
    expect(result.accepted[0].scene.pulses).toBeUndefined();
    expect(result.accepted[0].scene.overlayStamp).toBeUndefined();
  });
});
