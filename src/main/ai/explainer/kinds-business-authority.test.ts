import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_RAW_FIXTURES,
  type AuthorityRawFixture,
  parseAuthorityFixture,
} from '../../remotion/compositions/explainer/business/authority/fixtures';
import { AUTHORITY_SOURCE_NEGATIVES } from '../../remotion/compositions/explainer/business/authority/negative-fixtures';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import { DIAGRAM_LAYOUTS } from '../../remotion/compositions/explainer/diagrams/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  parseAuthorityHandoff,
  parseConstraintCheck,
  parseDelegationScope,
} from './business-authority-contract';
import { isRec, makeParseContext } from './kind-spec';
import {
  authorityHandoffSpec,
  constraintCheckSpec,
  delegationScopeSpec,
} from './kinds-business-authority';

const specs = [delegationScopeSpec, authorityHandoffSpec, constraintCheckSpec];

function runSpec(fixture: AuthorityRawFixture) {
  const ctx = makeParseContext(fixture.words, fixture.window);
  if (fixture.raw.kind === delegationScopeSpec.kind) {
    const scene = delegationScopeSpec.parse(fixture.raw, ctx);
    return { scene, cues: scene ? delegationScopeSpec.cues(scene) : [], issues: ctx.issues };
  }
  if (fixture.raw.kind === authorityHandoffSpec.kind) {
    const scene = authorityHandoffSpec.parse(fixture.raw, ctx);
    return { scene, cues: scene ? authorityHandoffSpec.cues(scene) : [], issues: ctx.issues };
  }
  if (fixture.raw.kind !== constraintCheckSpec.kind) throw new Error('Unowned authority kind');
  const scene = constraintCheckSpec.parse(fixture.raw, ctx);
  return { scene, cues: scene ? constraintCheckSpec.cues(scene) : [], issues: ctx.issues };
}

function expectedCues(fixture: AuthorityRawFixture): SceneCue[] {
  const { scene, issues } = parseAuthorityFixture(fixture);
  if (!scene) throw new Error(issues.join('; '));
  if (scene.kind === 'delegation-scope') return [{ kind: 'tick', at: scene.actionAt, gain: 0.18 }];
  if (scene.kind === 'authority-handoff')
    return [
      { kind: 'flip', at: scene.actionAt, gain: 0.16 },
      { kind: 'tick', at: scene.checkAt, gain: 0.12 },
    ];
  return [{ kind: 'tick', at: scene.checkAt, gain: 0.16 }];
}

describe('authority local kind specs without root registration', () => {
  it('uses exactly the three concrete owned parsers, not OP-10', () => {
    expect(specs.map((spec) => spec.kind)).toEqual([
      'delegation-scope',
      'authority-handoff',
      'constraint-check',
    ]);
    expect(delegationScopeSpec.parse).toBe(parseDelegationScope);
    expect(authorityHandoffSpec.parse).toBe(parseAuthorityHandoff);
    expect(constraintCheckSpec.parse).toBe(parseConstraintCheck);
  });

  it.each(
    AUTHORITY_RAW_FIXTURES,
  )('$recipeId parses real words/windows in every catalog mode with neutral bounded cues', (fixture) => {
    const recipe = BUSINESS_RECIPES.find((entry) => entry.id === fixture.recipeId);
    if (!recipe) throw new Error('Missing catalog recipe');
    for (const visualMode of recipe.modes) {
      const input: AuthorityRawFixture = {
        ...structuredClone(fixture),
        raw: { ...structuredClone(fixture.raw), visualMode },
      };
      const before = structuredClone(input);
      const result = runSpec(input);
      expect(result.issues).toEqual([]);
      expect(result.scene).toEqual(parseAuthorityFixture(input).scene);
      expect(result.scene?.visualMode).toBe(visualMode);
      expect(result.cues).toEqual(expectedCues(input));
      for (const cue of result.cues) {
        expect(['flip', 'tick']).toContain(cue.kind);
        expect(Number.isFinite(cue.at)).toBe(true);
        expect(cue.at).toBeGreaterThanOrEqual(input.window.startTime);
        expect(cue.at).toBeLessThanOrEqual(input.window.endTime);
        expect(cue.gain).toBeGreaterThan(0);
        expect(cue.gain).toBeLessThanOrEqual(0.3);
      }
      expect(runSpec(input)).toEqual(result);
      expect(input).toEqual(before);
    }
  });

  it.each(
    specs,
  )('$kind schema contains every real raw example and round-trips through its concrete spec', (spec) => {
    const schema: unknown = JSON.parse(spec.schema);
    if (!isRec(schema) || !Array.isArray(schema.examples))
      throw new Error('Invalid schema examples');
    const fixtures = AUTHORITY_RAW_FIXTURES.filter((fixture) => fixture.raw.kind === spec.kind);
    expect(schema.examples).toEqual(fixtures.map((fixture) => fixture.raw));
    expect(schema.examples).toHaveLength(fixtures.length);
    for (const [index, example] of schema.examples.entries()) {
      if (!isRec(example)) throw new Error('Example must be a raw record');
      const fixture = fixtures[index];
      if (!fixture) throw new Error('Unmatched schema example');
      const input = { ...fixture, raw: example };
      expect(runSpec(input).issues).toEqual([]);
      expect(runSpec(input).scene).toEqual(parseAuthorityFixture(input).scene);
    }
  });

  it.each(specs)('$kind has bounded metadata and grounded, nongeneric triggers', (spec) => {
    expect(spec.family).toBe('process');
    expect(spec.durationSec).toEqual([5, 12]);
    expect(spec.layouts).toEqual(DIAGRAM_LAYOUTS);
    expect(spec.limits).toContain('8 identities / 12 semantic edges / 4 holds');
    expect(spec.limits).toContain('1.5s');
    expect(spec.describe).toContain('source');
    expect(spec.describe.length).toBeGreaterThan(100);
    const phrase =
      spec.kind === 'delegation-scope'
        ? 'delegated permission and authority'
        : spec.kind === 'authority-handoff'
          ? 'accountable transfer and audit'
          : 'conflicting dated conditions and expiry';
    expect(spec.triggers.some((trigger) => trigger.test(phrase))).toBe(true);
    for (const generic of ['AI', 'business', 'companies', 'strategy', 'success'])
      expect(spec.triggers.some((trigger) => trigger.test(generic))).toBe(false);
  });

  it('has dedicated negative RAW source cases for every owned recipe', () => {
    expect([...new Set(AUTHORITY_SOURCE_NEGATIVES.map((entry) => entry.recipeId))]).toEqual(
      AUTHORITY_RAW_FIXTURES.map((fixture) => fixture.recipeId),
    );
    for (const fixture of AUTHORITY_RAW_FIXTURES)
      expect(
        AUTHORITY_SOURCE_NEGATIVES.filter((entry) => entry.recipeId === fixture.recipeId).length,
      ).toBeGreaterThanOrEqual(7);
  });

  it.each(
    AUTHORITY_SOURCE_NEGATIVES,
  )('$recipeId local spec rejects $name without emitting success cues', ({ fixture }) => {
    const before = structuredClone(fixture);
    const result = runSpec(fixture);
    expect(result.scene).toBeNull();
    expect(result.cues).toEqual([]);
    expect(result.scene).toEqual(parseAuthorityFixture(fixture).scene);
    expect(fixture).toEqual(before);
  });

  it('keeps OP-16 diagram-only and emits no cues on rejected source', () => {
    const fixture = AUTHORITY_RAW_FIXTURES.find((entry) => entry.recipeId === 'OP-16');
    if (!fixture) throw new Error('Missing OP-16');
    expect(runSpec({ ...fixture, raw: { ...fixture.raw, visualMode: 'hybrid' } }).scene).toBeNull();
    for (const input of AUTHORITY_RAW_FIXTURES) {
      const result = runSpec({
        ...input,
        raw: { ...input.raw, condition: 'if invented approval' },
      });
      expect(result.scene).toBeNull();
      expect(result.cues).toEqual([]);
    }
  });
});
