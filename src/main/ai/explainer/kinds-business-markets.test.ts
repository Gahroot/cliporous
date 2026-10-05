import { describe, expect, it } from 'vitest';
import {
  MARKETS_ADDITIONAL_SOURCE_FIXTURES,
  MARKETS_RECIPE_IDS,
  MARKETS_SOURCE_FIXTURES,
  MARKETS_SOURCE_NEGATIVES,
  marketsSourceContext,
} from '../../remotion/compositions/explainer/business/markets/fixtures';
import { MARKETS_LIMITS } from '../../remotion/compositions/explainer/business/markets/types';
import {
  parseMarketDependencyScene,
  parseProcurementCommitmentScene,
} from './business-markets-contract';
import type { KindFamily, Rec } from './kind-spec';
import { MARKET_DEPENDENCY_SPEC, PROCUREMENT_COMMITMENT_SPEC } from './kinds-business-markets';
import { SHORTLIST_LIMITS } from './shortlist';

const specs = [MARKET_DEPENDENCY_SPEC, PROCUREMENT_COMMITMENT_SPEC] as const;
const all = [...MARKETS_SOURCE_FIXTURES, ...MARKETS_ADDITIONAL_SOURCE_FIXTURES];
const modes = all.flatMap((fixture) =>
  (fixture.id === 'OP-44' ? (['diagram'] as const) : (['diagram', 'hybrid'] as const)).map(
    (mode) => ({ fixture, mode, name: `${fixture.fixtureId}:${mode}` }),
  ),
);
function specFor(raw: Rec) {
  return raw.kind === 'procurement-commitment'
    ? PROCUREMENT_COMMITMENT_SPEC
    : MARKET_DEPENDENCY_SPEC;
}
function schemaFor(id: string) {
  for (const spec of specs) {
    const prefix = `${id}: `;
    const line = spec.schema.split('\n').find((candidate) => candidate.startsWith(prefix));
    if (line) return { raw: JSON.parse(line.slice(prefix.length)) as Rec, spec };
  }
  throw new Error(`Missing accepted source schema ${id}`);
}
function matches(raw: Rec, source: string) {
  return specFor(raw).triggers.some((trigger) =>
    new RegExp(trigger.source, trigger.flags).test(source),
  );
}

describe('markets two local concrete grammars (no root registry casts)', () => {
  it('uses concrete parsers and only existing closed families/caps', () => {
    expect(MARKET_DEPENDENCY_SPEC.parse).toBe(parseMarketDependencyScene);
    expect(PROCUREMENT_COMMITMENT_SPEC.parse).toBe(parseProcurementCommitmentScene);
    const families = [
      'list',
      'compare',
      'words',
      'data',
      'framework',
      'story',
      'process',
      'object',
    ] as const satisfies readonly KindFamily[];
    const complete: Exclude<KindFamily, (typeof families)[number]> extends never ? true : false =
      true;
    expect(complete).toBe(true);
    expect(families).toHaveLength(8);
    expect(specs.map((s) => s.family)).toEqual(['framework', 'process']);
    expect(SHORTLIST_LIMITS).toEqual({
      maxKinds: 16,
      minKinds: 10,
      maxProps: 10,
      minProps: 5,
      maxHitsPerTrigger: 3,
    });
    expect(MARKETS_LIMITS).toEqual({ entities: 8, edges: 12, holds: 4, meshes: 180 });
    for (const spec of specs) {
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.layouts).toEqual(['stack', 'stack-flipped', 'takeover', 'pip', 'over']);
      expect(spec).not.toHaveProperty('general');
      expect(spec).not.toHaveProperty('nodes');
      expect(spec.limits).toContain('>=1.5s');
      expect(spec.limits).toContain('>=0.8s');
      expect(spec.limits).toContain('complete resolve clause');
    }
    expect(PROCUREMENT_COMMITMENT_SPEC.limits).toContain('Money{currency,minorUnits}');
    expect(PROCUREMENT_COMMITMENT_SPEC.limits).not.toContain('Money{currency,minor}');
    expect(PROCUREMENT_COMMITMENT_SPEC.limits).toContain('payment.state=paid');
    expect(PROCUREMENT_COMMITMENT_SPEC.limits).toContain('authority.state=granted');
  });
  it('has exactly nine primary schemas, not invented examples or missing OP-24', () => {
    expect(
      specs.flatMap((s) => s.schema.split('\n').map((line) => line.slice(0, line.indexOf(':')))),
    ).toEqual(MARKETS_RECIPE_IDS.filter((id) => id !== 'OP-47').concat(['OP-47']));
  });
  it.each(
    MARKETS_SOURCE_FIXTURES,
  )('$id schema is the ACTUAL accepted raw source JSON in all declared modes', (fixture) => {
    const { spec, raw } = schemaFor(fixture.id);
    const expected = Object.fromEntries(
      Object.entries(fixture.raw).filter(
        ([key]) => !['startWord', 'endWord', 'layout'].includes(key),
      ),
    );
    expect(raw).toEqual(expected);
    for (const mode of fixture.id === 'OP-44'
      ? (['diagram'] as const)
      : (['diagram', 'hybrid'] as const)) {
      const input: Rec = {
        ...raw,
        visualMode: mode,
        startWord: fixture.raw.startWord,
        endWord: fixture.raw.endWord,
        layout: fixture.raw.layout,
      };
      const ctx = marketsSourceContext(fixture);
      const scene = spec.parse(input, ctx);
      expect(scene, ctx.issues.join('; ')).not.toBeNull();
      expect(ctx.issues).toEqual([]);
      const referenceCtx = marketsSourceContext(fixture);
      const reference = specFor(fixture.raw).parse(
        { ...fixture.raw, visualMode: mode },
        referenceCtx,
      );
      expect(scene).toEqual(reference);
    }
  });
  it.each(
    modes,
  )('$name uses the real parser, keeps source states, and emits five neutral source-indexed cues', ({
    fixture,
    mode,
  }) => {
    const raw: Rec = { ...fixture.raw, visualMode: mode };
    const ctx = marketsSourceContext(fixture);
    const spec = specFor(raw);
    const scene = spec.parse(raw, ctx);
    if (!scene) throw new Error(ctx.issues.join('; '));
    expect(ctx.issues).toEqual([]);
    const cues =
      scene.kind === 'procurement-commitment'
        ? PROCUREMENT_COMMITMENT_SPEC.cues(scene)
        : MARKET_DEPENDENCY_SPEC.cues(scene);
    expect(cues.map((cue) => cue.at)).toEqual([
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
    ]);
    expect(cues.map((cue) => cue.kind)).toEqual(['flip', 'slide', 'tick', 'tick', 'tick']);
    expect(
      cues.every(
        (cue) =>
          Number.isFinite(cue.at) &&
          typeof cue.gain === 'number' &&
          cue.gain > 0 &&
          cue.gain <= 0.25,
      ),
    ).toBe(true);
    expect(cues).toEqual(
      scene.kind === 'procurement-commitment'
        ? PROCUREMENT_COMMITMENT_SPEC.cues(scene)
        : MARKET_DEPENDENCY_SPEC.cues(scene),
    );
  });
  it.each(
    MARKETS_SOURCE_NEGATIVES,
  )('$recipeId/$name still rejects source-specific unsupported promotion through its local spec', ({
    fixture,
  }) => {
    const ctx = marketsSourceContext(fixture);
    expect(specFor(fixture.raw).parse(fixture.raw, ctx)).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });
  it('OP-44 hybrid is rejected rather than silently remapped or mounting a model', () => {
    const fixture = MARKETS_SOURCE_FIXTURES.find((f) => f.id === 'OP-44');
    if (!fixture) throw new Error('Missing OP-44');
    const ctx = marketsSourceContext(fixture);
    expect(MARKET_DEPENDENCY_SPEC.parse({ ...fixture.raw, visualMode: 'hybrid' }, ctx)).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });
  it.each(
    MARKETS_SOURCE_FIXTURES,
  )('$id has a specific trigger in its own actual source words', (fixture) => {
    expect(matches(fixture.raw, fixture.words.map((word) => word.text).join(' '))).toBe(true);
  });
  it.each([
    ['OP-24', 'Different customer groups use named distribution channels.'],
    ['OP-41', 'Buyers cannot reach the named repair service.'],
    ['OP-42', 'Provider migration has unmet migration constraints.'],
    ['OP-43', 'Buyer-seller matching remains pending.'],
    ['OP-44', 'A conditional network benefit is claimed only if both attend.'],
    ['OP-45', 'Differentiated offerings share the same comparison subject.'],
    ['OP-46', 'A supplier is not a distribution channel.'],
    ['OP-47', 'The procurement request has a conditional quote and payment remains pending.'],
    ['OP-48', 'Complementary specialists retain named complementary capabilities.'],
  ])('%s has bounded specific shortlist cues: %s', (id, source) => {
    const fixture = MARKETS_SOURCE_FIXTURES.find((f) => f.id === id);
    if (!fixture) throw new Error(`Missing ${id}`);
    expect(matches(fixture.raw, source)).toBe(true);
  });
  it.each([
    'Change the television channel tonight.',
    'The stock market will rise tomorrow.',
    'A neural network has many connections.',
    'Upgrade your software to version two.',
    'Everyone received a participation trophy.',
    'There is a quote from an author on this page.',
    'I accepted the invitation to a party.',
    'Permission to access a website is needed.',
    'The door provides access to the garden.',
    'Share your basic support password.',
    'The supplier has a very large office.',
    'The design is beautiful and the build is tall.',
  ])('does not shortlist generic false friend: %s', (source) => {
    for (const spec of specs)
      expect(
        spec.triggers.some((trigger) => new RegExp(trigger.source, trigger.flags).test(source)),
      ).toBe(false);
  });
});
