import { describe, expect, it } from 'vitest';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import {
  evaluationSourceFixture,
  INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES,
  INFRASTRUCTURE_SOURCE_FIXTURES,
  type InfrastructureSourceFixture,
  infrastructureSourceContext,
} from '../../remotion/compositions/explainer/business/infrastructure/fixtures';
import type { InfrastructureScene } from '../../remotion/compositions/explainer/business/infrastructure/types';
import { SCENE_CUE_KINDS, type SceneCue } from '../../remotion/compositions/explainer/types';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { CAPACITY_MAP_SPEC, OPERATING_LINEAGE_SPEC } from './kinds-business-infrastructure';

const specs = [CAPACITY_MAP_SPEC, OPERATING_LINEAGE_SPEC];
const cases = [
  ...INFRASTRUCTURE_SOURCE_FIXTURES,
  ...INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES,
].flatMap((fixture) => {
  const recipe = BUSINESS_RECIPES.find((candidate) => candidate.id === fixture.id);
  if (!recipe) throw new Error('Missing frozen infrastructure recipe');
  return recipe.modes.map((mode) => ({
    fixture,
    mode,
    id: fixture.id,
    fixtureId: fixture.fixtureId,
  }));
});
function parse(raw: Rec, ctx: ParseContext): InfrastructureScene | null {
  if (raw.kind === 'capacity-map') return CAPACITY_MAP_SPEC.parse(raw, ctx);
  if (raw.kind === 'operating-lineage') return OPERATING_LINEAGE_SPEC.parse(raw, ctx);
  throw new Error('Missing concrete infrastructure specification');
}
function cues(scene: InfrastructureScene): SceneCue[] {
  return scene.kind === 'capacity-map'
    ? CAPACITY_MAP_SPEC.cues(scene)
    : OPERATING_LINEAGE_SPEC.cues(scene);
}

describe('concrete infrastructure planner specifications before Step 21 registration', () => {
  it('offers two grammars/ten actual presets with source-backed examples and original families', () => {
    expect(INFRASTRUCTURE_SOURCE_FIXTURES).toHaveLength(10);
    expect(CAPACITY_MAP_SPEC.schema).toContain(
      'stages:[{identity:BusinessIdentity,quantity:InfrastructureQuantity}] (2–6)',
    );
    expect(new Set(INFRASTRUCTURE_SOURCE_FIXTURES.map((fixture) => fixture.raw.preset)).size).toBe(
      10,
    );
    for (const spec of specs) {
      expect(['data', 'process']).toContain(spec.family);
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.layouts).toEqual(['stack', 'stack-flipped', 'takeover', 'pip', 'over']);
      expect(spec.schema).toContain('subjectId');
      expect(spec.schema).not.toContain('subjectIds');
      expect(spec.schema).toContain('factEvidence');
      expect(spec.limits).toContain('8 entities/12 edges/4 holds/4 pages');
      expect(spec.limits).toContain('>=0.8s');
      expect(spec.limits).toContain('>=1.5s');
      expect(spec.schema.length).toBeLessThan(25000);
      const raw: unknown = JSON.parse(spec.schema.split('\n')[0]);
      const fixture = INFRASTRUCTURE_SOURCE_FIXTURES.find(
        (candidate) => candidate.raw.kind === spec.kind,
      );
      if (!isRec(raw) || !fixture) throw new Error('Missing actual infrastructure source example');
      const ctx = infrastructureSourceContext(fixture);
      expect(parse(raw, ctx), ctx.issues.join('; ')).not.toBeNull();
      expect(ctx.issues).toEqual([]);
    }
  });
  it.each(cases)('$fixtureId:$mode retains source facts and neutral cues without mutating input', ({
    fixture,
    mode,
  }) => {
    const input: InfrastructureSourceFixture = {
      ...fixture,
      raw: { ...fixture.raw, visualMode: mode },
    };
    const before = structuredClone(input);
    const ctx = infrastructureSourceContext(input);
    const scene = parse(input.raw, ctx);
    expect(scene, ctx.issues.join('; ')).not.toBeNull();
    expect(ctx.issues).toEqual([]);
    expect(input).toEqual(before);
    if (!scene) throw new Error('Missing accepted infrastructure scene');
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
      expect(['tick', 'flip']).toContain(cue.kind);
      expect(cue.gain).toBe(0.16);
      expect(Number.isFinite(cue.at)).toBe(true);
      expect(cue.at).toBeLessThan(scene.resolveAt);
    }
  });
  it.each(
    INFRASTRUCTURE_SOURCE_FIXTURES,
  )('$id accepts declared native layouts but no invented renderer fields', (fixture) => {
    const spec = specs.find((candidate) => candidate.kind === fixture.raw.kind);
    if (!spec) throw new Error('Missing infrastructure grammar');
    for (const layout of spec.layouts) {
      const ctx = infrastructureSourceContext(fixture);
      expect(
        parse({ ...fixture.raw, layout }, ctx),
        `${layout}: ${ctx.issues.join('; ')}`,
      ).not.toBeNull();
      expect(ctx.issues).toEqual([]);
    }
    for (const raw of [
      { ...fixture.raw, modelCode: 'automatic activation' },
      { ...fixture.raw, visualMode: 'webgl' },
      { ...fixture.raw, resolveWord: Number.NaN },
      { ...fixture.raw, layout: 'arbitrary' },
    ])
      expect(parse(raw, infrastructureSourceContext(fixture))).toBeNull();
  });
  it.each(
    INFRASTRUCTURE_SOURCE_FIXTURES,
  )('$id is discoverable from its actual source words', (fixture) => {
    const spec = specs.find((candidate) => candidate.kind === fixture.raw.kind);
    if (!spec) throw new Error('Missing infrastructure grammar');
    expect(
      spec.triggers.some((pattern) =>
        pattern.test(fixture.words.map((word) => word.text).join(' ')),
      ),
    ).toBe(true);
  });
  it('rejects a clay stage for evaluation snapshots instead of implying physical training or live drift', () => {
    const fixture = evaluationSourceFixture();
    expect(
      OPERATING_LINEAGE_SPEC.parse(
        { ...fixture.raw, visualMode: 'hybrid' },
        infrastructureSourceContext(fixture),
      ),
    ).toBeNull();
  });
  it.each([
    [CAPACITY_MAP_SPEC, 'We have enough workforce capacity and patients in a waiting room.'],
    [OPERATING_LINEAGE_SPEC, 'The archive contains a story about family lineage.'],
  ])('does not force generic AI text or unrelated uses into infrastructure', (spec, text) => {
    expect(spec.triggers.some((pattern) => pattern.test(text))).toBe(false);
    expect(spec.triggers.some((pattern) => pattern.test('AI may change business someday.'))).toBe(
      false,
    );
    expect(spec.avoid.length).toBeGreaterThan(0);
  });
});
