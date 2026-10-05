import { describe, expect, it } from 'vitest';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import {
  FUNDS_ACCEPTED_VARIANTS,
  FUNDS_RESOURCE_FIXTURES,
  FUNDS_SOURCE_FIXTURES,
  type FundsSourceFixture,
  fundsFixtureContext,
} from '../../remotion/compositions/explainer/business/funds/fixtures';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import {
  DISTRIBUTION_WATERFALL_SPEC,
  FUND_LIFECYCLE_SPEC,
  FUND_LIQUIDITY_SPEC,
} from './kinds-business-funds';

const specs = [FUND_LIFECYCLE_SPEC, DISTRIBUTION_WATERFALL_SPEC, FUND_LIQUIDITY_SPEC];
const fixtures = [...FUNDS_SOURCE_FIXTURES, ...FUNDS_ACCEPTED_VARIANTS, ...FUNDS_RESOURCE_FIXTURES];
const cases = fixtures.flatMap((fixture) => {
  const recipe = BUSINESS_RECIPES.find((candidate) => candidate.id === fixture.id);
  if (!recipe) throw new Error('Missing frozen funds recipe');
  return recipe.modes.map(
    (mode): FundsSourceFixture => ({
      ...fixture,
      name: `${fixture.id}:${fixture.name}:${mode}`,
      raw: { ...fixture.raw, visualMode: mode },
    }),
  );
});

describe('concrete funds planner specifications (root registration is Step 21)', () => {
  it('provides three concrete kinds for eight real presets without new families/limits', () => {
    expect(FUNDS_SOURCE_FIXTURES).toHaveLength(8);
    expect(new Set(specs.map((spec) => spec.kind)).size).toBe(3);
    for (const spec of specs) {
      expect([
        'list',
        'compare',
        'words',
        'data',
        'framework',
        'story',
        'process',
        'object',
      ]).toContain(spec.family);
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.layouts).toEqual(['stack', 'stack-flipped', 'takeover', 'pip', 'over']);
      expect(spec.limits).toContain('8 semantic entities/12 relationships/4 holds');
      expect(spec.limits).toContain('>=0.8s final hold');
      expect(spec.limits).toContain('>=1.5s');
      expect(spec.schema).toContain('minorUnits');
      expect(spec.schema).toContain('denominator');
      expect(spec.schema).toContain('basis:{subjectId:fund.id');
      expect(spec.schema).not.toContain('subjectIds');
      expect(spec.schema).toContain('condition');
      expect(spec.schema).toContain('source');
      expect(spec.schema.length).toBeLessThan(12000);
      const raw: unknown = JSON.parse(spec.schema.split('\n')[0]);
      const example = FUNDS_SOURCE_FIXTURES.find((fixture) => fixture.raw.kind === spec.kind);
      if (!example) throw new Error('Missing authored specification example');
      expect(spec.parse(raw, fundsFixtureContext(example))).not.toBeNull();
    }
  });

  it.each(cases)('$name uses the concrete parser and neutral beat-bound cues', (fixture) => {
    const spec = specs.find((candidate) => candidate.kind === fixture.raw.kind);
    if (!spec) throw new Error('Missing concrete funds grammar');
    const before = structuredClone(fixture);
    const ctx = fundsFixtureContext(fixture);
    const scene = spec.parse(fixture.raw, ctx);
    expect(scene, ctx.issues.join('; ')).not.toBeNull();
    expect(ctx.issues).toEqual([]);
    expect(fixture).toEqual(before);
    if (!scene) throw new Error('Missing accepted funds scene');
    // Dispatch the cue signature as concretely as the parser, without widening/casting it.
    const cues =
      scene.kind === 'fund-lifecycle'
        ? FUND_LIFECYCLE_SPEC.cues(scene)
        : scene.kind === 'distribution-waterfall'
          ? DISTRIBUTION_WATERFALL_SPEC.cues(scene)
          : FUND_LIQUIDITY_SPEC.cues(scene);
    expect(cues.map((cue) => cue.at)).toEqual([
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
    ]);
    expect(cues).toEqual(
      scene.kind === 'fund-lifecycle'
        ? FUND_LIFECYCLE_SPEC.cues(scene)
        : scene.kind === 'distribution-waterfall'
          ? DISTRIBUTION_WATERFALL_SPEC.cues(scene)
          : FUND_LIQUIDITY_SPEC.cues(scene),
    );
    for (const cue of cues) {
      expect(SCENE_CUE_KINDS).toContain(cue.kind);
      expect(['flip', 'tick']).toContain(cue.kind);
      expect(cue.gain).toBe(0.16);
      expect(Number.isFinite(cue.at)).toBe(true);
      expect(cue.at).toBeLessThan(scene.resolveAt);
    }
  });

  it.each(
    FUNDS_SOURCE_FIXTURES,
  )('$id triggers naturally and refuses unsupported/mode-swapped data', (fixture) => {
    const spec = specs.find((candidate) => candidate.kind === fixture.raw.kind);
    if (!spec) throw new Error('Missing funds grammar');
    expect(
      spec.triggers.some((pattern) =>
        pattern.test(fixture.words.map((word) => word.text).join(' ')),
      ),
    ).toBe(true);
    for (const raw of [
      { ...fixture.raw, arbitraryRenderer: 'execute code' },
      { ...fixture.raw, visualMode: 'webgl' },
      { ...fixture.raw, setupWord: NaN },
    ]) {
      const ctx = fundsFixtureContext(fixture);
      expect(spec.parse(raw, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });

  it.each([
    [FUND_LIFECYCLE_SPEC, 'We commit code, contribute a patch, then deploy the software.'],
    [DISTRIBUTION_WATERFALL_SPEC, 'The waterfall in the valley flows beside a priority queue.'],
    [FUND_LIQUIDITY_SPEC, 'The navigation bar uses a cash-colored palette.'],
  ])('avoids unrelated words and generic AI finance promises', (spec, text) => {
    expect(spec.triggers.some((pattern) => pattern.test(text))).toBe(false);
    expect(
      spec.triggers.some((pattern) => pattern.test('AI may change every business someday.')),
    ).toBe(false);
    expect(spec.avoid.length).toBeGreaterThan(0);
  });
});
