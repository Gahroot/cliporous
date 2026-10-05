import { describe, expect, it } from 'vitest';
import {
  CAPITAL_SOURCE_FIXTURES,
  type CapitalSourceFixture,
  capitalClaimAssetFixture,
  capitalDebtFixture,
  capitalFixtureContext,
  capitalOutcomeFixture,
  capitalRightsFixture,
  capitalRoundsFixture,
} from '../../remotion/compositions/explainer/business/capital/fixtures';
import type { CapitalScene } from '../../remotion/compositions/explainer/business/capital/types';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import { SCENE_CUE_KINDS, type SceneCue } from '../../remotion/compositions/explainer/types';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import {
  CAPITAL_STRUCTURE_SPEC,
  ECONOMIC_RIGHTS_SPEC,
  INVESTMENT_OUTCOMES_SPEC,
} from './kinds-business-capital';

const specs = [ECONOMIC_RIGHTS_SPEC, CAPITAL_STRUCTURE_SPEC, INVESTMENT_OUTCOMES_SPEC];
const variants = [
  capitalRightsFixture({ payout: 0, control: 'unknown' }),
  capitalRightsFixture({ payout: null, payoutState: 'negative', priority: 'unknown' }),
  capitalClaimAssetFixture({ transfer: 'negative', liquidity: 'negative' }),
  capitalClaimAssetFixture({ transfer: 'source-stated', liquidity: 'unknown' }),
  capitalRoundsFixture({ statuses: ['issued', 'conditional'] }),
  capitalDebtFixture(true, { commissioned: null }),
  capitalDebtFixture(false, { durationUnknown: true, principal: null }),
  capitalOutcomeFixture({
    mode: 'samples',
    outcomes: [
      { label: 'First', measure: 'loss', minor: 1000 },
      { label: 'Second', measure: 'proceeds', minor: 0 },
    ],
  }),
  capitalOutcomeFixture({
    mode: 'distribution',
    outcomes: [
      { label: 'Gain', measure: 'return', minor: 5000, numerator: 1 },
      { label: 'Loss', measure: 'loss', minor: 2000, numerator: 3 },
    ],
  }),
];
const cases = [...CAPITAL_SOURCE_FIXTURES, ...variants].flatMap((fixture) => {
  const recipe = BUSINESS_RECIPES.find((candidate) => candidate.id === fixture.id);
  if (!recipe) throw new Error('Missing frozen capital recipe');
  return recipe.modes.map((mode) => ({ fixture, mode, id: fixture.id }));
});
function parse(raw: Rec, ctx: ParseContext): CapitalScene | null {
  if (raw.kind === 'economic-rights') return ECONOMIC_RIGHTS_SPEC.parse(raw, ctx);
  if (raw.kind === 'capital-structure') return CAPITAL_STRUCTURE_SPEC.parse(raw, ctx);
  if (raw.kind === 'investment-outcomes') return INVESTMENT_OUTCOMES_SPEC.parse(raw, ctx);
  throw new Error('Missing concrete capital specification');
}
function cues(scene: CapitalScene): SceneCue[] {
  if (scene.kind === 'economic-rights') return ECONOMIC_RIGHTS_SPEC.cues(scene);
  if (scene.kind === 'capital-structure') return CAPITAL_STRUCTURE_SPEC.cues(scene);
  return INVESTMENT_OUTCOMES_SPEC.cues(scene);
}

describe('concrete capital planner specifications before Step 21 registration', () => {
  it('offers three concrete grammars, six new presets and truthful source examples', () => {
    expect(CAPITAL_SOURCE_FIXTURES).toHaveLength(6);
    expect(new Set(specs.map((spec) => spec.kind)).size).toBe(3);
    for (const spec of specs) {
      expect(['compare', 'framework', 'data']).toContain(spec.family);
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.layouts).toEqual(['stack', 'stack-flipped', 'takeover', 'pip', 'over']);
      expect(spec.schema).toContain('subjectId:company.id');
      expect(spec.schema).not.toContain('subjectIds');
      expect(spec.limits).toContain('8 semantic entities/12 relationships/4 holds');
      expect(spec.limits).toContain('>=0.8s');
      expect(spec.limits).toContain('>=1.5s');
      expect(spec.schema.length).toBeLessThan(18000);
      const raw: unknown = JSON.parse(spec.schema.split('\n')[0]);
      const fixture = CAPITAL_SOURCE_FIXTURES.find((candidate) => candidate.raw.kind === spec.kind);
      if (!isRec(raw) || !fixture) throw new Error('Missing real capital specification example');
      const ctx = capitalFixtureContext(fixture);
      expect(parse(raw, ctx), ctx.issues.join('; ')).not.toBeNull();
      expect(ctx.issues).toEqual([]);
    }
  });
  it.each(cases)('$id:$mode preserves facts and neutral source-indexed cues', ({
    fixture,
    mode,
  }) => {
    const input: CapitalSourceFixture = { ...fixture, raw: { ...fixture.raw, visualMode: mode } };
    const before = structuredClone(input);
    const ctx = capitalFixtureContext(input);
    const scene = parse(input.raw, ctx);
    expect(scene, ctx.issues.join('; ')).not.toBeNull();
    expect(ctx.issues).toEqual([]);
    expect(input).toEqual(before);
    if (!scene) throw new Error('Missing accepted capital scene');
    expect(scene.visualMode).toBe(mode);
    const first = cues(scene);
    expect(first).toEqual(cues(scene));
    expect(first.map((cue) => cue.at)).toEqual([
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
    ]);
    for (const cue of first) {
      expect(SCENE_CUE_KINDS).toContain(cue.kind);
      expect(['flip', 'tick']).toContain(cue.kind);
      expect(cue.gain).toBe(0.16);
      expect(Number.isFinite(cue.at)).toBe(true);
      expect(cue.at).toBeLessThan(scene.resolveAt);
    }
  });
  it.each(
    CAPITAL_SOURCE_FIXTURES,
  )('$id admits all declared ordinary/native source layouts', (fixture) => {
    const spec = specs.find((candidate) => candidate.kind === fixture.raw.kind);
    if (!spec) throw new Error('Missing capital grammar');
    for (const layout of spec.layouts) {
      const ctx = capitalFixtureContext(fixture);
      expect(
        parse({ ...fixture.raw, layout }, ctx),
        `${layout}: ${ctx.issues.join('; ')}`,
      ).not.toBeNull();
      expect(ctx.issues).toEqual([]);
    }
  });
  it.each(
    CAPITAL_SOURCE_FIXTURES,
  )('$id triggers on authored speech and rejects unsupported renderer fields', (fixture) => {
    const spec = specs.find((candidate) => candidate.kind === fixture.raw.kind);
    if (!spec) throw new Error('Missing capital grammar');
    expect(
      spec.triggers.some((pattern) =>
        pattern.test(fixture.words.map((word) => word.text).join(' ')),
      ),
    ).toBe(true);
    for (const raw of [
      { ...fixture.raw, arbitraryRights: 'grant control' },
      { ...fixture.raw, visualMode: 'webgl' },
      { ...fixture.raw, setupWord: Number.POSITIVE_INFINITY },
      { ...fixture.raw, layout: 'arbitrary' },
    ])
      expect(parse(raw, capitalFixtureContext(fixture))).toBeNull();
  });
  it('keeps outcome sets diagram-only even if a model is requested', () => {
    const fixture = capitalOutcomeFixture();
    expect(
      INVESTMENT_OUTCOMES_SPEC.parse(
        { ...fixture.raw, visualMode: 'hybrid' },
        capitalFixtureContext(fixture),
      ),
    ).toBeNull();
    expect(
      INVESTMENT_OUTCOMES_SPEC.parse(
        { ...fixture.raw, modelSource: fixture.raw.company },
        capitalFixtureContext(fixture),
      ),
    ).toBeNull();
  });
  it.each([
    [ECONOMIC_RIGHTS_SPEC, 'The module owns its output and claims a parse error.'],
    [CAPITAL_STRUCTURE_SPEC, 'The software handles two rounds of deployment.'],
    [INVESTMENT_OUTCOMES_SPEC, 'The task queue has an outcome and a loss function.'],
  ])('does not force unrelated or generic AI text into a financial specialization', (spec, text) => {
    expect(spec.triggers.some((pattern) => pattern.test(text))).toBe(false);
    expect(spec.triggers.some((pattern) => pattern.test('AI may change businesses someday.'))).toBe(
      false,
    );
    expect(spec.avoid.length).toBeGreaterThan(0);
  });
});
