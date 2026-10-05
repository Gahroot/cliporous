import { describe, expect, it } from 'vitest';
import { BUSINESS_KIND_OWNERS, BUSINESS_RECIPES, businessRecipe } from './catalog';
import { BUSINESS_PRESETS } from './types';

describe('frozen complete business metadata, not rendered evidence', () => {
  it('covers each OP exactly once with a unique kind/preset and dedicated fixture', () => {
    expect(BUSINESS_RECIPES.map((entry) => entry.id)).toEqual(
      Array.from({ length: 80 }, (_, index) => `OP-${String(index + 1).padStart(2, '0')}`),
    );
    expect(new Set(BUSINESS_RECIPES.map((entry) => `${entry.kind}/${entry.preset}`)).size).toBe(80);
    expect(new Set(BUSINESS_RECIPES.flatMap((entry) => entry.fixtureIds)).size).toBe(80);
    for (const entry of BUSINESS_RECIPES) {
      expect(entry.fixtureIds).toEqual([`business-${entry.id}`]);
      expect(entry.sourceRequirements.length).toBeGreaterThan(0);
      expect(entry.objective.length).toBeGreaterThan(0);
      expect(entry.modes.length).toBeGreaterThan(0);
      expect(entry.modes.every((mode) => mode === 'diagram' || mode === 'hybrid')).toBe(true);
      expect(new Set(entry.modes).size).toBe(entry.modes.length);
      expect(entry.treatments.length).toBeGreaterThan(0);
      expect(businessRecipe(entry.kind, entry.preset)).toBe(entry);
    }
    expect(businessRecipe('task-map', 'unknown')).toBeNull();
  });
  it('retains all 26 concrete grammars and every frozen new preset without aliases', () => {
    expect(Object.keys(BUSINESS_PRESETS)).toHaveLength(26);
    let presets = 0;
    for (const [kind, values] of Object.entries(BUSINESS_PRESETS)) {
      for (const preset of values) {
        const entry = businessRecipe(kind, preset);
        expect(entry, `${kind}/${preset}`).not.toBeNull();
        expect(entry?.owner).toBe(
          Object.entries(BUSINESS_KIND_OWNERS).find(([name]) => name === kind)?.[1],
        );
        presets++;
      }
    }
    expect(presets).toBe(77);
    expect(
      BUSINESS_RECIPES.filter((entry) => !(entry.kind in BUSINESS_PRESETS)).map(
        (entry) => entry.id,
      ),
    ).toEqual(['OP-10', 'OP-58', 'OP-75']);
  });
  it('includes every authored asset and treatment in at least one admissible recipe', () => {
    const assets = [...new Set(BUSINESS_RECIPES.flatMap((entry) => entry.assets))].sort();
    const treatments = [...new Set(BUSINESS_RECIPES.flatMap((entry) => entry.treatments))].sort();
    expect(assets).toEqual(
      Array.from({ length: 16 }, (_, index) => `A-${String(index + 1).padStart(2, '0')}`),
    );
    expect(treatments).toEqual(
      Array.from({ length: 12 }, (_, index) => `M-${String(index + 1).padStart(2, '0')}`),
    );
    expect(
      BUSINESS_RECIPES.filter((entry) => entry.modes.length === 1).map((entry) => entry.id),
    ).toEqual(['OP-02', 'OP-16', 'OP-31', 'OP-38', 'OP-44', 'OP-52', 'OP-59', 'OP-71']);
  });
  it('assigns cross-topic recipes to the frozen grammar owner', () => {
    for (const [id, owner] of [
      ['OP-18', 'work'],
      ['OP-24', 'markets'],
      ['OP-32', 'work'],
      ['OP-35', 'infrastructure'],
      ['OP-63', 'infrastructure'],
      ['OP-74', 'authority'],
    ])
      expect(BUSINESS_RECIPES.find((entry) => entry.id === id)?.owner).toBe(owner);
  });
});
