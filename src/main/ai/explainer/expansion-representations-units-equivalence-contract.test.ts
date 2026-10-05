import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionUnitsEquivalenceScene } from '../../remotion/compositions/explainer/expansion/representations/units-equivalence-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  compare,
  convertUnit,
  divide,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import type {
  ExpansionQuantity,
  ExpansionRational,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  EXPANSION_CONVERSION_PAIRS,
  parseExpansionEquivalence,
  parseExpansionUnitConversion,
} from './expansion-representations-units-equivalence-contract';
import { temporalSourceFixtures } from './expansion-temporal-fixtures';
import { makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/representations/units-equivalence.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const fixtures = temporalSourceFixtures(packet.stories);
const MODES = ['diagram', 'hybrid'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const ratio = (numerator: number, denominator = 1): ExpansionRational => ({
  numerator,
  denominator,
});
const amount = (numerator: number, denominator = 1) => ({
  kind: 'rational',
  value: ratio(numerator, denominator),
});
function parse(f: ExpansionSourceFixture, mode: string) {
  const ctx = makeParseContext([...f.words], f.window);
  const proposal = { ...f.proposal, visualMode: mode };
  const scene =
    f.id === '49'
      ? parseExpansionUnitConversion(proposal, ctx)
      : parseExpansionEquivalence(proposal, ctx);
  return { scene, ctx };
}
function positive(f: ExpansionSourceFixture): ExpansionUnitsEquivalenceScene {
  const before = structuredClone(f);
  const diagram = parse(f, 'diagram'),
    hybrid = parse(f, 'hybrid');
  expect(diagram.ctx.issues).toEqual([]);
  expect(hybrid.ctx.issues).toEqual([]);
  expect(diagram.scene).not.toBeNull();
  expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
  expect(f).toEqual(before);
  if (!diagram.scene) throw new Error('Expected a real source-grounded scene');
  return diagram.scene;
}
function negative(f: ExpansionSourceFixture) {
  for (const mode of MODES) {
    const before = structuredClone(f),
      result = parse(f, mode);
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.length).toBeGreaterThan(0);
    expect(f).toEqual(before);
  }
}
function fixture(identity: string): ExpansionSourceFixture {
  const f = fixtures.find((candidate) => candidate.proposal.identity === identity);
  if (!f) throw new Error(`Missing source identity ${identity}`);
  return f;
}
/** Additional authored boundaries use the same generic fixture materializer, not a new format. */
interface AuthoredEdit {
  path: (string | number)[];
  value?: unknown;
  remove?: boolean;
}
function authored(
  identity: string,
  edits: AuthoredEdit[],
  clauses: Record<string, string> = {},
): ExpansionSourceFixture {
  const raw = packet.stories.find(
    (candidate: { proposal: Rec }) => candidate.proposal.identity === identity,
  );
  const base = temporalSourceFixtures([
    { ...raw, negatives: [{ name: 'authored boundary', edits, clauses }] },
  ])[0];
  const changed = base.negatives[0];
  return { ...base, ...changed, proposal: changed.proposal, negatives: [] };
}
function quantities(scene: ExpansionUnitsEquivalenceScene): readonly ExpansionQuantity[] {
  return scene.storyId === '49' ? [scene.record.quantity] : scene.records.map((r) => r.quantity);
}
function stripBeats(scene: ExpansionUnitsEquivalenceScene) {
  return Object.fromEntries(
    Object.entries(scene).filter(([key]) => !TIMES.some((time) => time === key)),
  );
}

it('hydrates a version-1 representations packet with four independent positives and all 64 explicit negatives', () => {
  expect(packet.version).toBe(1);
  expect(packet.pack).toBe('representations');
  expect(fixtures).toHaveLength(4);
  expect(fixtures.reduce((sum, f) => sum + f.negatives.length, 0)).toBe(64);
  expect(fixture('Span').sourceText).not.toBe(fixture('Mass').sourceText);
  expect(fixture('Survey').sourceText).not.toBe(fixture('Census').sourceText);
  expect(expansionStory('49').allowedDerivations).toEqual(['unit-conversion']);
  expect(expansionStory('50').allowedDerivations).toEqual(['ratio']);
});
for (const f of fixtures) {
  describe(`${f.id}/${String(f.proposal.identity)}`, () => {
    it('preserves exact source/fact/status/identity/time parity in both modes with stable IDs', () => {
      const scene = positive(f);
      expect(positive(f)).toEqual(scene);
      expect(scene.identity).toBe(f.proposal.identity);
      expect(scene.population).toBe(f.proposal.population);
      expect(scene.period).toBe(f.proposal.period);
      expect(scene.actors.map((a) => [a.label, a.evidence])).toEqual(
        (f.proposal.actors as Rec[]).map((a) => [a.label, a.evidence]),
      );
      expect(scene.actors.map((a) => a.id)).toEqual(
        scene.actors.map((_, i) => expansionEntityId(f.id, i)),
      );
      const supplied = f.id === '49' ? [f.proposal.quantity] : (f.proposal.quantities as Rec[]);
      for (const [i, q] of quantities(scene).entries()) {
        expect(q).toMatchObject(supplied[i] as Rec);
        if ('amount' in q) expect(q.amount.notation).toBeTruthy();
      }
      const records = scene.storyId === '49' ? [scene.record] : scene.records;
      expect(records.map((r) => r.id)).toEqual(
        records.map((_, i) => `expansion-${f.id}-record-${i}`),
      );
      expect(
        records.every(
          (r) =>
            r.identity === scene.identity &&
            scene.actors.some((a) => a.id === r.actorId && a.label === r.quantity.actor),
        ),
      ).toBe(true);
      expect(scene.result.id).toBe(`expansion-${f.id}-result`);
      const speech = expansionFixtureSpeech(
        f.sourceText.split(/(?<=[.!?;])\s+/u),
        f.window.endTime - f.window.startTime,
      );
      expect(new Set(BEATS.map((b) => f.proposal[b])).size).toBe(5);
      for (const [i, beat] of BEATS.entries()) {
        expect(speech.spans.some((span) => span.fromWord === f.proposal[beat])).toBe(true);
        if (i) {
          expect(scene[TIMES[i]]).toBe(f.words[f.proposal[beat] as number].start);
          expect(scene[TIMES[i]] - scene[TIMES[i - 1]]).toBeGreaterThanOrEqual(1 - 1e-6);
        }
      }
      expect(f.window.endTime - f.window.startTime).toBeGreaterThanOrEqual(5);
      expect(f.window.endTime - f.window.startTime).toBeLessThanOrEqual(12);
      expect(f.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      expect(f.words[0].start - f.window.startTime).toBeCloseTo(0.25, 9);
      expect(f.window.endTime - f.words[f.words.length - 1].end).toBeCloseTo(0.35, 9);
      for (const [i, w] of f.words.entries()) {
        expect(Number.isFinite(w.start) && Number.isFinite(w.end)).toBe(true);
        expect(w.end).toBeGreaterThan(w.start);
        expect(w.start).toBeGreaterThanOrEqual(f.window.startTime);
        expect(w.end).toBeLessThanOrEqual(f.window.endTime);
        if (i) expect(w.start).toBeGreaterThanOrEqual(f.words[i - 1].end - 1e-7);
      }
    });
    it('shifts only source animation seconds, never represented domain measures, aggregation or ratios', () => {
      const original = positive(f);
      const shifted = positive({
        ...f,
        words: f.words.map((w) => ({ ...w, start: w.start + 123, end: w.end + 123 })),
        window: {
          ...f.window,
          startTime: f.window.startTime + 123,
          endTime: f.window.endTime + 123,
        },
      });
      expect(stripBeats(shifted)).toEqual(stripBeats(original));
      for (const time of TIMES) expect(shifted[time]).toBeCloseTo(original[time] + 123, 8);
    });
    for (const bad of f.negatives)
      for (const mode of MODES)
        it(`rejects ${bad.name} in ${mode}`, () => {
          const changed = { ...f, ...bad, proposal: bad.proposal };
          const proposed = changed.proposal.visualMode;
          const chosen = proposed === 'diagram' || proposed === 'hybrid' ? mode : String(proposed);
          const before = structuredClone(changed),
            result = parse(changed, chosen);
          expect(result.scene).toBeNull();
          expect(result.ctx.issues.length).toBeGreaterThan(0);
          expect(changed).toEqual(before);
        });
  });
}
it('converts exact metric and signed qualified mass values, retaining operands and all original basis fields', () => {
  for (const [identity, expected] of [
    ['Span', ratio(150)],
    ['Mass', ratio(-250)],
  ] as const) {
    const scene = positive(fixture(identity));
    if (scene.storyId !== '49' || scene.result.state !== 'derived')
      throw new Error('Expected exact conversion');
    expect(scene.result.values).toEqual([{ state: 'derived', value: expected }]);
    expect(scene.result.operation).toBe('unit-conversion');
    expect(scene.result.operand).toEqual(scene.record.quantity);
    expect(scene.result.originalBasis).toEqual(scene.record.quantity.basis);
    expect(scene.result.basis).toEqual({
      ...scene.record.quantity.basis,
      unit: scene.conversion.toUnit,
    });
    expect(scene.result.sourceState).toBe(scene.record.quantity.state);
    if (identity === 'Mass')
      expect(scene.record.quantity).toMatchObject({
        state: 'simulated',
        qualifier: 'simulated sample',
      });
  }
});
it('equivalent views retain the same supplied identities, quantities and exact ratios with explicit aggregation', () => {
  for (const [identity, expected, selected, displayed] of [
    ['Survey', ratio(1, 5), 2, 20],
    ['Census', ratio(6, 25), 6, 75],
  ] as const) {
    const scene = positive(fixture(identity));
    if (scene.storyId !== '50' || scene.result.state !== 'derived')
      throw new Error('Expected ratio');
    expect(scene.result.ratio).toEqual(expected);
    expect(scene.result.operands).toEqual(scene.records.map((r) => r.quantity));
    expect(scene.result.sourceStates).toEqual(scene.records.map((r) => r.quantity.state));
    expect(scene.views.reduce((sum, v) => sum + (v.marks ?? 0), 0)).toBe(displayed);
    expect(displayed).toBeLessThanOrEqual(100);
    for (const [i, view] of scene.views.entries()) {
      expect(view.id).toBe(`expansion-50-view-${i}`);
      expect(view.quantityIds).toEqual(scene.records.map((r) => r.id));
      expect(view.ratio).toEqual(expected);
      expect(view.unitsPerMark).toEqual(scene.aggregation.unitsPerMark);
      expect(view.selectedMarks).toBe(selected);
      expect(view).not.toHaveProperty('members');
    }
  }
});
it('every explicit conversion pair agrees with the common exact conversion helper, including time and energy', () => {
  for (const [fromUnit, toUnit] of EXPANSION_CONVERSION_PAIRS) {
    const f = authored(
      'Span',
      [
        { path: ['quantity', 'basis', 'unit'], value: fromUnit },
        { path: ['conversion', 'fromUnit'], value: fromUnit },
        { path: ['conversion', 'toUnit'], value: toUnit },
      ],
      {
        1: `Ada Span is 1.5 ${fromUnit} during May among Harbor with denominator 12.`,
        2: `Ada requests Span conversion from ${fromUnit} to ${toUnit} for Harbor during May.`,
      },
    );
    const scene = positive(f),
      expected = convertUnit(ratio(3, 2), fromUnit, toUnit);
    if (scene.storyId !== '49' || scene.result.state !== 'derived' || !expected.ok)
      throw new Error('Expected allowed exact conversion');
    expect(scene.result.values[0].value).toEqual(expected.value);
  }
});
it('source-stated zero converts to zero without replacing absence, and zero selected count yields an exact zero ratio', () => {
  const conversion = positive(
    authored('Span', [{ path: ['quantity', 'amount'], value: amount(0) }], {
      1: 'Ada Span is 0 metres during May among Harbor with denominator 12.',
    }),
  );
  if (conversion.storyId !== '49' || conversion.result.state !== 'derived')
    throw new Error('Expected explicit zero');
  expect(conversion.result.values[0].value).toEqual(ratio(0));
  const views = positive(
    authored('Survey', [{ path: ['quantities', 0, 'amount'], value: amount(0) }], {
      1: 'Ada Survey selected is 0 count during May among Harbor with denominator 200.',
    }),
  );
  if (views.storyId !== '50' || views.result.state !== 'derived')
    throw new Error('Expected explicit zero selected count');
  expect(views.result.ratio).toEqual(ratio(0));
  expect(views.views.every((v) => v.selectedMarks === 0)).toBe(true);
});
it('accepts exactly 100 displayed aggregate marks but invents no population members', () => {
  const scene = positive(
    authored(
      'Survey',
      [
        { path: ['aggregation', 'marks'], value: 50 },
        { path: ['aggregation', 'unitsPerMark'], value: ratio(4) },
      ],
      {
        3: 'Ada states Survey views are set and area with 50 marks each representing 4 count for Harbor during May.',
      },
    ),
  );
  if (scene.storyId !== '50') throw new Error('Expected views');
  expect(scene.views.reduce((sum, v) => sum + (v.marks ?? 0), 0)).toBe(100);
  expect(scene.views.every((v) => v.selectedMarks === 10)).toBe(true);
});
for (const state of [
  'known',
  'conditional',
  'simulated',
  'illustrative',
  'unknown',
  'missing',
  'disputed',
] as const)
  it(`retains distinct conversion status ${state}, never inventing zero or a winner`, () => {
    const qualifier =
      state === 'simulated'
        ? 'simulated sample'
        : state === 'illustrative'
          ? 'illustrative example'
          : state;
    const quantity: Rec = { ...(fixture('Span').proposal.quantity as Rec), state };
    if (state === 'conditional') quantity.condition = 'If access opens';
    if (
      state === 'simulated' ||
      state === 'illustrative' ||
      state === 'unknown' ||
      state === 'missing' ||
      state === 'disputed'
    )
      quantity.qualifier = qualifier;
    if (state === 'unknown' || state === 'missing' || state === 'disputed') delete quantity.amount;
    if (state === 'disputed') quantity.alternatives = [amount(3, 2), amount(2)];
    const value =
      state === 'unknown' || state === 'missing'
        ? state
        : state === 'disputed'
          ? 'disputed between 1.5 and 2'
          : '1.5';
    let source = `Ada Span is ${value} metres during May among Harbor with denominator 12.`;
    if (state === 'conditional') source = `If access opens, ${source}`;
    if (state === 'simulated' || state === 'illustrative')
      source = `In this ${qualifier}, ${source}`;
    const edits: AuthoredEdit[] = Object.entries(quantity)
      .filter(([key]) => key !== 'evidence')
      .map(([key, value]) => ({ path: ['quantity', key], value }));
    if (state === 'unknown' || state === 'missing' || state === 'disputed')
      edits.push({ path: ['quantity', 'amount'], remove: true });
    const scene = positive(authored('Span', edits, { 1: source }));
    if (scene.storyId !== '49') throw new Error('Expected conversion');
    expect(scene.record.quantity.state).toBe(state);
    expect(scene.result.sourceState).toBe(state);
    if (state === 'unknown' || state === 'missing') {
      expect(scene.result.state).toBe(state);
      expect(scene.result).not.toHaveProperty('values');
      expect(scene.record.quantity).not.toHaveProperty('amount');
    } else {
      expect(scene.result.state).toBe('derived');
      if (scene.result.state === 'derived')
        expect(scene.result.values.map((v) => v.value)).toEqual(
          state === 'disputed' ? [ratio(150), ratio(200)] : [ratio(150)],
        );
    }
  });
for (const state of ['unknown', 'missing', 'disputed'] as const)
  it(`retains unresolved equivalence ${state} with no inferred ratio or marks`, () => {
    const raw = structuredClone(fixture('Survey').proposal.quantities as Rec[]),
      source: Record<string, string> = {};
    for (const [i, q] of raw.entries()) {
      q.state = state;
      q.qualifier = state;
      delete q.amount;
      if (state === 'disputed')
        q.alternatives = i === 0 ? [amount(40), amount(60)] : [amount(200), amount(300)];
      const value =
        state === 'disputed'
          ? i === 0
            ? 'disputed between 40 and 60'
            : 'disputed between 200 and 300'
          : state;
      source[String(i + 1)] =
        `Ada Survey ${i === 0 ? 'selected' : 'total'} is ${value} count during May among Harbor with denominator 200.`;
    }
    source['3'] =
      'Ada states Survey views are set and area with no resolved marks for Harbor during May.';
    const edits: { path: (string | number)[]; value?: unknown; remove?: boolean }[] = raw.flatMap(
      (q, i) =>
        Object.entries(q)
          .filter(([key]) => key !== 'evidence')
          .map(([key, value]) => ({ path: ['quantities', i, key], value })),
    );
    for (const i of [0, 1]) edits.push({ path: ['quantities', i, 'amount'], remove: true });
    edits.push(
      { path: ['aggregation', 'marks'], remove: true },
      { path: ['aggregation', 'unitsPerMark'], remove: true },
    );
    const scene = positive(authored('Survey', edits, source));
    if (scene.storyId !== '50') throw new Error('Expected views');
    expect(scene.result.state).toBe(state);
    expect(scene.result.sourceStates).toEqual([state, state]);
    expect(scene.result).not.toHaveProperty('ratio');
    for (const v of scene.views) {
      expect(v).not.toHaveProperty('marks');
      expect(v).not.toHaveProperty('selectedMarks');
      expect(v).not.toHaveProperty('ratio');
    }
  });
for (const state of ['simulated', 'illustrative'] as const)
  it(`equivalent views retain qualified ${state} operands without promoting them to facts`, () => {
    const qualifier = state === 'simulated' ? 'simulated sample' : 'illustrative example';
    const edits: AuthoredEdit[] = [];
    for (const i of [0, 1])
      edits.push(
        { path: ['quantities', i, 'state'], value: state },
        { path: ['quantities', i, 'qualifier'], value: qualifier },
      );
    const scene = positive(
      authored('Survey', edits, {
        1: `In this ${qualifier}, Ada Survey selected is 40 count during May among Harbor with denominator 200.`,
        2: `In this ${qualifier}, Ada Survey total is 200 count during May among Harbor with denominator 200.`,
      }),
    );
    if (scene.storyId !== '50' || scene.result.state !== 'derived')
      throw new Error('Expected qualified mathematical equivalence');
    expect(scene.result.sourceStates).toEqual([state, state]);
    expect(scene.result.ratio).toEqual(ratio(1, 5));
    for (const q of scene.result.operands) expect(q).toMatchObject({ state, qualifier });
    const unqualified = authored('Survey', edits, {
      1: `In this ${qualifier}, Ada Survey selected is 40 count during May among Harbor with denominator 200.`,
      2: `In this ${qualifier}, Ada Survey total is 200 count during May among Harbor with denominator 200.`,
    });
    delete (unqualified.proposal.quantities as Rec[])[0].qualifier;
    negative(unqualified);
  });
it('parser identities stay stable across source actor label edits', () => {
  const original = positive(fixture('Span'));
  const replacements = Object.fromEntries(
    fixture('Span')
      .sourceText.split(/(?<=[.!?;])\s+/u)
      .map((text, i) => [String(i), text.replace(/\bAda\b/g, 'Bea')]),
  );
  const changed = positive(
    authored(
      'Span',
      [
        { path: ['actors', 0, 'label'], value: 'Bea' },
        { path: ['subject'], value: 'Bea' },
        { path: ['quantity', 'actor'], value: 'Bea' },
        { path: ['conversion', 'actor'], value: 'Bea' },
        { path: ['result', 'actor'], value: 'Bea' },
      ],
      replacements,
    ),
  );
  if (original.storyId !== '49' || changed.storyId !== '49') throw new Error('Expected conversion');
  expect(changed.actors[0].id).toBe(original.actors[0].id);
  expect(changed.record.id).toBe(original.record.id);
  expect(changed.result.id).toBe(original.result.id);
  expect(changed.record.quantity.actor).toBe('Bea');
  expect(changed.result.state === 'derived' && changed.result.values).toEqual(
    original.result.state === 'derived' && original.result.values,
  );
});
it('derived ratios agree with exact division, not rounded floating point', () => {
  const scene = positive(fixture('Census'));
  if (scene.storyId !== '50' || scene.result.state !== 'derived') throw new Error('Expected ratio');
  expect(divide(ratio(72), ratio(300))).toEqual({ ok: true, value: scene.result.ratio });
  expect(compare(scene.result.ratio, ratio(24, 100))).toEqual({ ok: true, value: 0 });
});
for (const f of fixtures)
  it(`${String(f.proposal.identity)} rejects unsupported fields and malformed source timing`, () => {
    for (const [field, value] of Object.entries({
      id: 'caller',
      svg: '<svg/>',
      html: '<b/>',
      file: '/tmp/source',
      url: 'https://example.com',
      camera: {},
      geometry: [0, 0],
      evaluate: 'x=>x',
      treatment: 'time-loom',
    }))
      negative({ ...f, proposal: { ...f.proposal, [field]: value } });
    for (const value of [NaN, Infinity, -Infinity]) {
      const words = structuredClone([...f.words]);
      words[0].start = value;
      negative({ ...f, words });
    }
    const words = structuredClone([...f.words]);
    words[1].start = words[0].end - 0.000001;
    negative({ ...f, words });
    for (const endTime of [4.9, 12.1]) negative({ ...f, window: { ...f.window, endTime } });
  });
