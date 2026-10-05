import { describe, expect, it } from 'vitest';
import {
  BUSINESS_ALTERNATIVE_SOURCE_FIXTURES,
  type BusinessAlternativeSourceFixture,
  businessAlternativeFixture,
  businessAlternativeFixtureContext,
} from '../../remotion/compositions/explainer/business/decisions/alternative-fixtures';
import {
  businessAlternativeFacts,
  businessAlternativePages,
  businessAlternativeReadingFits,
} from '../../remotion/compositions/explainer/business/decisions/alternative-presentation';
import { parseBusinessAlternatives } from './business-futures-contract';
import { isRec, type Rec } from './kind-spec';
import { parsePossibleFutures } from './kinds-concept-perspective';

function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected test record');
  return value;
}
function input(fixture: BusinessAlternativeSourceFixture): Rec {
  return rec(fixture.raw.businessAlternatives);
}
function legacy(fixture: BusinessAlternativeSourceFixture) {
  const { businessAlternatives: _lens, visualMode: _mode, ...raw } = fixture.raw;
  const ctx = businessAlternativeFixtureContext(fixture);
  const scene = parsePossibleFutures(raw, ctx);
  if (!scene) throw new Error(`Fixture violates unchanged legacy truth: ${ctx.issues.join('; ')}`);
  return scene;
}
function parse(fixture: BusinessAlternativeSourceFixture) {
  const scene = legacy(fixture);
  const ctx = businessAlternativeFixtureContext(fixture);
  return { scene, ctx, lens: parseBusinessAlternatives(fixture.raw, ctx, scene) };
}
function records(fixture: BusinessAlternativeSourceFixture): Rec[] {
  const value = input(fixture).records;
  if (!Array.isArray(value)) throw new Error('Missing records');
  return value.map(rec);
}

describe('OP-75 additive source-bound v1 operating-design snapshots', () => {
  it.each(
    BUSINESS_ALTERNATIVE_SOURCE_FIXTURES,
  )('accepts complete $raw.visualMode source, preserving legacy clocks/facts', (fixture) => {
    const before = structuredClone(fixture);
    const { scene, ctx, lens } = parse(fixture);
    expect(lens, ctx.issues.join('; ')).not.toBeNull();
    if (!lens) throw new Error('Missing lens');
    expect(businessAlternativeReadingFits(scene, lens)).toBe(true);
    expect(lens.finalHoldSeconds).toBeGreaterThanOrEqual(0.8);
    expect(ctx.win.endTime - ctx.win.startTime).toBe(12);
    expect([
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
    ]).toEqual([0.3, 1.3, 2.7, 6.5, 10]);
    expect(scene.uncertainty).toBe('unresolved');
    expect(scene.outcome).toBe('Press line remains unresolved');
    expect(scene).not.toHaveProperty('visualMode');
    expect(scene).not.toHaveProperty('businessAlternatives');
    expect(fixture).toEqual(before);
    expect(
      businessAlternativePages(scene, lens).every((page) => page.end - page.start >= 1.5),
    ).toBe(true);
  });
  it('mode does not change qualifiers, source facts, clocks, identities or reading pages', () => {
    const diagram = parse(businessAlternativeFixture());
    const hybrid = parse(businessAlternativeFixture({ mode: 'hybrid' }));
    if (!diagram.lens || !hybrid.lens) throw new Error('Missing accepted source');
    expect(diagram.scene).toEqual(hybrid.scene);
    expect(businessAlternativeFacts(diagram.scene, diagram.lens)).toEqual(
      businessAlternativeFacts(hybrid.scene, hybrid.lens),
    );
    expect(businessAlternativePages(diagram.scene, diagram.lens)).toEqual(
      businessAlternativePages(hybrid.scene, hybrid.lens),
    );
    expect({ ...diagram.lens, visualMode: 'hybrid' }).toEqual(hybrid.lens);
  });
  it('only explicit diagram null-native is accepted, never inferred from preset/neighbor facts', () => {
    expect(parse(businessAlternativeFixture({ native: false })).lens).not.toBeNull();
    expect(parse(businessAlternativeFixture({ native: false, mode: 'hybrid' })).lens).toBeNull();
    const fixture = businessAlternativeFixture();
    delete input(fixture).native;
    expect(parse(fixture).lens).toBeNull();
    for (const assembly of ['A-01', 'branch', 'https://example.com/model', 3]) {
      const variant = businessAlternativeFixture();
      rec(input(variant).native).assembly = assembly;
      expect(parse(variant).lens).toBeNull();
    }
  });
  it.each([
    0,
    2,
    99,
    '1',
    null,
    undefined,
  ])('rejects incomplete/future DTO version %s', (version) => {
    const fixture = businessAlternativeFixture();
    input(fixture).version = version;
    expect(parse(fixture).lens).toBeNull();
  });
  it.each([
    'geometry',
    'style',
    'asset',
    'code',
    'url',
    'probability',
    'winner',
  ])('rejects unsupported %s at every DTO level', (key) => {
    for (const target of ['lens', 'baseline', 'identity', 'record', 'native', 'evidence', 'span']) {
      const fixture = businessAlternativeFixture();
      const lens = input(fixture);
      const base = rec(lens.baseline);
      const destinations = {
        lens,
        baseline: base,
        identity: rec(base.identity),
        record: records(fixture)[0],
        native: rec(lens.native),
        evidence: rec(lens.evidence),
        span: rec(base.source),
      };
      destinations[target as keyof typeof destinations][key] = 'https://example.com/arbitrary();';
      expect(parse(fixture).lens, `${target}:${key}`).toBeNull();
    }
  });
  it.each([
    'baselineId',
    'subjectId',
    'period',
    'revision',
    'alternativeId',
  ])('rejects record %s identity/basis swaps', (field) => {
    const fixture = businessAlternativeFixture();
    records(fixture)[1][field] = records(fixture)[1][field] === 'autumn' ? 'alpha' : 'other';
    expect(parse(fixture).lens).toBeNull();
  });
  it.each([
    'baselineId',
    'subjectId',
    'period',
    'revision',
  ])('requires independent native %s binding', (field) => {
    const fixture = businessAlternativeFixture();
    rec(input(fixture).native)[field] = 'other';
    expect(parse(fixture).lens).toBeNull();
  });
  it('rejects duplicate semantic IDs, labels, missing/extra records and unknown evidence states', () => {
    const mutations: ((fixture: BusinessAlternativeSourceFixture) => void)[] = [
      (f) => {
        rec(records(f)[1].identity).id = rec(records(f)[0].identity).id;
      },
      (f) => {
        rec(records(f)[1].identity).label = rec(records(f)[0].identity).label;
      },
      (f) => {
        rec(records(f)[0].identity).id = 'alternative-0';
      },
      (f) => {
        (input(f).records as unknown[]).pop();
      },
      (f) => {
        (input(f).records as unknown[]).push(structuredClone(records(f)[0]));
      },
      (f) => {
        rec(input(f).evidence).state = 'source-stated';
      },
      (f) => {
        rec(input(f).baseline).revision = 'autumn';
      },
      (f) => {
        rec(rec(input(f).baseline).subject).label = 'Current design';
      },
    ];
    for (const mutate of mutations) {
      const f = businessAlternativeFixture();
      mutate(f);
      expect(parse(f).lens).toBeNull();
    }
  });
  it.each([
    'not ',
    'may ',
    'might ',
    'could ',
    'never ',
  ])('rejects negative/modal native claims %s without adjacent-fact inference', (prefix) => {
    const fixture = businessAlternativeFixture({
      nativeClause: `Press line ${prefix}maintains illustrative operating-unit records of actual baseline Current design during autumn at revision alpha.`,
    });
    expect(parse(fixture).lens).toBeNull();
  });
  it.each([
    'baseline',
    'record',
    'native',
    'evidence',
  ])('rejects whole and cropped modal/negation/condition in %s evidence', (target) => {
    for (const prefix of ['Perhaps', 'Not', 'If supplies arrive,']) {
      const positive =
        target === 'baseline'
          ? 'Press line has actual baseline Current design during autumn at revision alpha.'
          : target === 'native'
            ? 'Press line maintains illustrative operating-unit records of actual baseline Current design during autumn at revision alpha.'
            : 'Press line compares illustrative operating-unit records from actual baseline Current design during autumn at revision alpha.';
      const fixture = businessAlternativeFixture(
        target === 'record'
          ? { recordClause: (slot, clause) => (slot === 0 ? `${prefix} ${clause}` : clause) }
          : { [`${target}Clause`]: `${prefix} ${positive}` },
      );
      if (prefix.startsWith('If')) fixture.raw.condition = 'If supplies arrive';
      const acceptedLegacy = legacy(fixture);
      const lens = input(fixture);
      const base = rec(lens.baseline);
      const holder =
        target === 'baseline'
          ? base
          : target === 'record'
            ? records(fixture)[0]
            : rec(lens[target]);
      expect(
        parseBusinessAlternatives(
          fixture.raw,
          businessAlternativeFixtureContext(fixture),
          acceptedLegacy,
        ),
      ).toBeNull();
      const crop = prefix.split(/\s+/u).length;
      const span = rec(holder.source);
      span.fromWord = Number(span.fromWord) + crop;
      if (target === 'baseline') {
        rec(rec(base.identity).source).fromWord = span.fromWord;
        rec(rec(base.subject).source).fromWord = span.fromWord;
      } else if (target === 'record') rec(rec(holder.identity).source).fromWord = span.fromWord;
      expect(
        parseBusinessAlternatives(
          fixture.raw,
          businessAlternativeFixtureContext(fixture),
          acceptedLegacy,
        ),
      ).toBeNull();
    }
  });
  it('requires each full local baseline/alternative/native clause, not mere nearby nouns', () => {
    const options = [
      { baselineClause: 'Press line reviews Current design, autumn and alpha.' },
      {
        nativeClause:
          'Press line discusses operating-unit records, actual baseline Current design, autumn and alpha.',
      },
      {
        evidenceClause:
          'Press line mentions illustrative operating-unit records, Current design, autumn and alpha.',
      },
      {
        recordClause: (_slot: number, clause: string) =>
          clause.replace(
            'for Press line from actual baseline',
            'for Current design from actual baseline',
          ),
      },
      {
        recordClause: (_slot: number, clause: string) =>
          clause.replace(
            'representing could have lower capacity',
            'representing has lower capacity',
          ),
      },
    ];
    for (const option of options) expect(parse(businessAlternativeFixture(option)).lens).toBeNull();
  });
  it('does not loosen original full-sentence production-system/modal/qualitative truth requirements', () => {
    for (const sentence of [
      'Press line has lower capacity.',
      'Press line could not have lower capacity.',
      'Another factory could have lower capacity.',
      'Press line has fifty percent probability of lower capacity.',
    ]) {
      const fixture = businessAlternativeFixture({
        alternativeClause: (slot, positive) => (slot === 0 ? sentence : positive),
      });
      const { businessAlternatives: _lens, visualMode: _mode, ...raw } = fixture.raw;
      expect(parsePossibleFutures(raw, businessAlternativeFixtureContext(fixture))).toBeNull();
    }
    const fixture = businessAlternativeFixture();
    fixture.raw.subject = 'Operating alternatives';
    const { businessAlternatives: _lens, visualMode: _mode, ...raw } = fixture.raw;
    expect(parsePossibleFutures(raw, businessAlternativeFixtureContext(fixture))).toBeNull();
  });
  it.each([
    2, 3, 4,
  ] as const)('rejects baseline/native moved to late phase %i despite complete positive clauses', (phase) => {
    expect(parse(businessAlternativeFixture({ nativePhase: phase })).lens).toBeNull();
    expect(parse(businessAlternativeFixture({ baselinePhase: phase })).lens).toBeNull();
  });
  it('rejects a selected final-phase replay even when an independent action-native clause is present', () => {
    const fixture = businessAlternativeFixture();
    const accepted = legacy(fixture);
    const source = rec(rec(input(fixture).native).source);
    const tokens = fixture.words
      .slice(Number(source.fromWord), Number(source.toWord) + 1)
      .map((word) => word.text);
    const resolveWord = Number(fixture.raw.resolveWord);
    const finalCount = fixture.words.length - resolveWord;
    fixture.words.slice(resolveWord).forEach((word, slot) => {
      word.start = 10 + (slot * 0.6) / finalCount;
      word.end = 10 + ((slot + 1) * 0.6) / finalCount;
    });
    const fromWord = fixture.words.length;
    fixture.words.push(
      ...tokens.map((text, slot) => ({
        text,
        start: 10.8 + (slot * 0.85) / tokens.length,
        end: 10.8 + ((slot + 1) * 0.85) / tokens.length,
      })),
    );
    source.fromWord = fromWord;
    source.toWord = fixture.words.length - 1;
    fixture.raw.endWord = fixture.words.length - 1;
    expect(legacy(fixture)).toEqual(accepted);
    expect(
      parseBusinessAlternatives(fixture.raw, businessAlternativeFixtureContext(fixture), accepted),
    ).toBeNull();
  });
  it('max source labels are accepted only when every 24px detail/native rail fits', () => {
    expect(
      parse(businessAlternativeFixture({ maxLabels: true, count: 2, mode: 'hybrid' })).lens,
    ).not.toBeNull();
    expect(
      parse(businessAlternativeFixture({ maxLabels: true, count: 3, mode: 'hybrid' })).lens,
    ).toBeNull();
  });
  it('fails closed on insufficient final hold/full reading time and unsupported legacy preset', () => {
    const fixture = businessAlternativeFixture();
    const scene = legacy(fixture);
    for (const endTime of [10.7, Number.NaN]) {
      const ctx = businessAlternativeFixtureContext(fixture);
      ctx.win.endTime = endTime;
      expect(parseBusinessAlternatives(fixture.raw, ctx, scene)).toBeNull();
    }
    expect(
      parseBusinessAlternatives(fixture.raw, businessAlternativeFixtureContext(fixture), {
        ...scene,
        checkAt: 8.5,
        responseAt: 8,
        resolveAt: 10,
      }),
    ).toBeNull();
    expect(
      parseBusinessAlternatives(fixture.raw, businessAlternativeFixtureContext(fixture), {
        ...scene,
        preset: 'forecast-range',
      }),
    ).toBeNull();
  });
});
