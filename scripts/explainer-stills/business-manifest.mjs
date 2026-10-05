import { BUSINESS_RECIPES } from '../../src/main/remotion/compositions/explainer/business/catalog.ts';

export const BUSINESS_MANIFEST = Object.freeze({
  recipe: BUSINESS_RECIPES.map((r) => r.id),
  asset: Array.from({ length: 16 }, (_, i) => `A-${String(i + 1).padStart(2, '0')}`),
  motion: Array.from({ length: 12 }, (_, i) => `M-${String(i + 1).padStart(2, '0')}`),
  sequence: Array.from({ length: 8 }, (_, i) => `S-${String(i + 1).padStart(2, '0')}`),
});

export function businessTargetMatches(target, scene) {
  const mode = scene.visualMode ?? scene.businessAlternatives?.visualMode;
  return BUSINESS_RECIPES.some(
    (r) =>
      r.kind === scene.kind &&
      r.preset === scene.preset &&
      r.modes.includes(mode) &&
      (target.category === 'recipe'
        ? target.id === r.id
        : target.category === 'asset'
          ? mode === 'hybrid' && r.assets.includes(target.id)
          : target.category === 'motion' && r.treatments.includes(target.id)),
  );
}

/** Every native layout, with both palettes. No invented max-label facts.
 * @param {any} contrast
 * @returns {{name: string, layout: import('../../src/main/remotion/compositions/explainer/types').ExplainerLayout, aspect: import('../../src/main/remotion/compositions/explainer/types').ExplainerAspect, palette?: any}[]}
 */
export function businessCases(contrast) {
  const layouts =
    /** @type {[import('../../src/main/remotion/compositions/explainer/types').ExplainerLayout, import('../../src/main/remotion/compositions/explainer/types').ExplainerAspect][]} */ ([
      ['stack', '9:16'],
      ['stack-flipped', '9:16'],
      ['takeover', '9:16'],
      ['pip', '9:16'],
      ['over', '9:16'],
      ['over', '16:9'],
      ['takeover', '16:9'],
    ]);
  return layouts.flatMap(([layout, aspect]) => [
    { name: `${layout}-${aspect.replace(':', '-')}-default`, layout, aspect },
    { name: `${layout}-${aspect.replace(':', '-')}-contrast`, layout, aspect, palette: contrast },
  ]);
}

export function assertBusinessFixtures(fixtures) {
  const expected = BUSINESS_RECIPES.flatMap((r) => r.modes.map((m) => `business-${r.id}-${m}`));
  if (
    fixtures.length !== expected.length ||
    new Set(fixtures.map((f) => f.name)).size !== expected.length ||
    expected.some((name) => !fixtures.some((f) => f.name === name))
  )
    throw new Error('Business fixtures require exact catalog mode completeness');
  for (const f of fixtures) {
    if (
      !f.source ||
      !Array.isArray(f.source.words) ||
      !f.source.raw ||
      !f.covers?.some((t) => t.category === 'recipe' && businessTargetMatches(t, f.scene))
    )
      throw new Error(`${f.name}: missing source-parsed recipe`);
  }
}
