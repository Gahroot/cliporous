import { describe, expect, it } from 'vitest';
import {
  BUSINESS_EXPLANATION_SOURCE_VERSION,
  isBusinessExplanationSourceEnvelope,
} from '../../../shared/business-explanation-source';
import {
  compactBusinessSourceChoices,
  expandBusinessSourceChoices,
} from '../../../shared/business-source-choices';
import { STORYBOARD_LIMITS, storyboardSourceInputBudget } from '../../../shared/storyboards';
import {
  type BusinessSourceFixture,
  businessSourceFixtures,
} from '../../remotion/compositions/explainer/business/source-fixtures';
import { parseLongformSceneSpec } from '../explainer-scenes';
import { parseBusinessExplanationSource } from './business-adapters';

const fixtures = businessSourceFixtures();
const context = { clipStart: 0, clipEnd: 90, sourceId: 'compact-source-test' };
const sample = fixtures.find(
  (fixture) => fixture.id === 'OP-01' && fixture.visualMode === 'diagram',
);
if (!sample) throw new Error('Missing actual OP-01 diagram source');
const fixture = sample;

function compact(input: unknown) {
  const result = compactBusinessSourceChoices(input);
  if (!result.ok) throw new Error(result.message);
  return result.choices;
}
function envelope(source: BusinessSourceFixture, sourceVersion: 1 | 2) {
  return {
    sourceVersion,
    recipe: source.id,
    sourceChoices: sourceVersion === 1 ? structuredClone(source.raw) : compact(source.raw),
    identityLinks: [],
  };
}
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reverseKeys(child)]),
    );
  return value;
}
function rejectChoices(sourceChoices: unknown) {
  const input = { ...envelope(fixture, 2), sourceChoices };
  expect(parseBusinessExplanationSource(input, fixture.words, context).ok).toBe(false);
}

// The raw fixtures are the authored source payloads, not cooked scenes or parser mocks.
describe('passive compact business source choices', () => {
  it('covers all 152 actual modes / 80 recipes without relaxing the JSON boundary', () => {
    expect(fixtures).toHaveLength(152);
    expect(new Set(fixtures.map((source) => source.id)).size).toBe(80);
    expect(BUSINESS_EXPLANATION_SOURCE_VERSION).toBe(2);
    expect(STORYBOARD_LIMITS).toMatchObject({
      maxSpecDepth: 8,
      maxSpecBytes: 24_576,
      maxSpecNodes: 1_500,
    });
  });

  it.each(fixtures)('$fixtureId preserves every raw fact, word index and quantity', (source) => {
    const before = structuredClone(source);
    const choices = compact(source.raw);
    const encodedBefore = structuredClone(choices);
    const expanded = expandBusinessSourceChoices(choices);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) throw new Error(expanded.message);
    expect(expanded.choices).toStrictEqual(source.raw);
    expect(choices).toStrictEqual(encodedBefore);
    expect(source).toStrictEqual(before);
    // Canonical traversal must not depend on any object's insertion order.
    expect(JSON.stringify(compact(reverseKeys(source.raw)))).toBe(JSON.stringify(choices));
    expect(JSON.stringify(compact(source.raw))).toBe(JSON.stringify(choices));
  });

  it.each(fixtures)('$fixtureId reconstructs native v1 and compact v2 identically', (source) => {
    const native = envelope(source, 1);
    const encoded = envelope(source, 2);
    const before = structuredClone({ native, encoded, words: source.words, context });
    expect(isBusinessExplanationSourceEnvelope(native)).toBe(true);
    expect(isBusinessExplanationSourceEnvelope(encoded)).toBe(true);
    const v1 = parseBusinessExplanationSource(native, source.words, context);
    const v2 = parseBusinessExplanationSource(encoded, source.words, context);
    expect(v1.ok, JSON.stringify(v1)).toBe(true);
    expect(v2.ok, JSON.stringify(v2)).toBe(true);
    if (!v1.ok || !v2.ok) throw new Error('Actual fixture reconstruction failed');
    // Full planned equality includes source clocks, beat clocks, cues and quantities.
    expect(v2.value.planned).toStrictEqual(v1.value.planned);
    expect(v2.value.planned).toStrictEqual(
      parseLongformSceneSpec(source.raw, source.words, context),
    );
    expect(v2.value.identities).toStrictEqual(v1.value.identities);
    expect(v2.value.recipe).toStrictEqual(v1.value.recipe);
    // DTO versions remain persistence metadata, not a rewritten scene/source version.
    expect(v1.value.source).toStrictEqual(native);
    expect(v2.value.source).toStrictEqual(encoded);
    expect({ native, encoded, words: source.words, context }).toStrictEqual(before);
  });

  it.each(fixtures)('$fixtureId fits as a whole specVersion 2 explanation panel', (source) => {
    const last = source.words.length - 1;
    const title = { text: source.words[0].text, startWord: 0, endWord: 0 };
    const spec = {
      kind: 'storyboard',
      specVersion: 2,
      startWord: 0,
      endWord: last,
      subject: title,
      panels: [
        {
          kind: 'explanation',
          id: 'business',
          startWord: 0,
          endWord: last,
          revealWord: 0,
          moveWord: 0,
          title,
          explanation: envelope(source, 2),
        },
      ],
    };
    const before = structuredClone(spec);
    expect(storyboardSourceInputBudget(spec)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(spec), 'utf8')).toBeLessThanOrEqual(24_576);
    expect(spec).toStrictEqual(before);
  });

  it('keeps real independently validated identity links equal across DTO versions', () => {
    const native = envelope(fixture, 1);
    const parsed = parseBusinessExplanationSource(native, fixture.words, context);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
    expect(parsed.value.identities.length).toBeGreaterThan(0);
    const links = parsed.value.identities.slice(0, 8).map((entry, index) => ({
      localId: entry.identity.id,
      sharedId: `shared${index}`,
      role: entry.roles[0],
      startWord: entry.identity.source.fromWord,
      endWord: entry.identity.source.toWord,
    }));
    const v1 = parseBusinessExplanationSource(
      { ...native, identityLinks: links },
      fixture.words,
      context,
    );
    const v2 = parseBusinessExplanationSource(
      { ...envelope(fixture, 2), identityLinks: links },
      fixture.words,
      context,
    );
    expect(v1.ok).toBe(true);
    expect(v2.ok).toBe(true);
    if (!v1.ok || !v2.ok) throw new Error('Linked source reconstruction failed');
    expect(v2.value.identities).toStrictEqual(v1.value.identities);
    expect(v2.value.identities.map((entry) => entry.link).filter(Boolean)).toStrictEqual(links);
  });

  it('sorts ordinary keys and encodes only bounded identity/span/scalar records', () => {
    const raw = {
      z: true,
      subject: { id: 'ada', label: 'Ada', source: { fromWord: 1, toWord: 2 } },
      evidence: { fromWord: 3, toWord: 4 },
      basis: { unit: 'hours', subjectId: 'ada', source: { fromWord: 1, toWord: 2 } },
      amount: { minorUnits: 123, currency: 'USD' },
      money: { minorUnits: 456, currency: 'USD' },
      a: false,
    };
    const encoded = compact(raw);
    expect(encoded).toStrictEqual({
      a: false,
      amountValueCurrency: 'USD',
      amountValueMinorUnits: 123,
      basisValueSourceSpanFromWord: 1,
      basisValueSourceSpanToWord: 2,
      basisValueSubjectId: 'ada',
      basisValueUnit: 'hours',
      evidenceSpanFromWord: 3,
      evidenceSpanToWord: 4,
      moneyValueCurrency: 'USD',
      moneyValueMinorUnits: 456,
      subjectChoiceId: 'ada',
      subjectChoiceLabel: 'Ada',
      subjectChoiceFromWord: 1,
      subjectChoiceToWord: 2,
      z: true,
    });
    expect(Object.keys(encoded)[0]).toBe('a');
    expect(Object.keys(encoded).at(-1)).toBe('z');
    expect(expandBusinessSourceChoices(encoded)).toStrictEqual({ ok: true, choices: raw });
  });
});

describe('compact choices fail closed before concrete source authorization', () => {
  it('rejects getters without invoking them, cycles, nonfinite values and functions', () => {
    let reads = 0;
    const getter = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: () => {
        reads++;
        return 1;
      },
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const invalid of [
      getter,
      cyclic,
      { value: NaN },
      { value: Infinity },
      { value: -Infinity },
      { unknown: () => 1 },
      { value: undefined },
      { value: 1n },
    ]) {
      expect(compactBusinessSourceChoices(invalid).ok).toBe(false);
      expect(expandBusinessSourceChoices(invalid).ok).toBe(false);
      rejectChoices(invalid);
    }
    expect(reads).toBe(0);
  });

  it('rejects oversize strings, depth, nodes and bytes at the unchanged boundary', () => {
    const depth: Record<string, unknown> = {};
    let tail = depth;
    for (let i = 0; i < 9; i++) {
      tail.child = {};
      tail = tail.child as Record<string, unknown>;
    }
    const nodes = { rows: Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => 0)) };
    const bytes = {
      rows: Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => 'x'.repeat(80))),
    };
    expect(Buffer.byteLength(JSON.stringify(bytes))).toBeGreaterThan(24_576);
    for (const invalid of [{ value: 'x'.repeat(97) }, depth, nodes, bytes]) {
      expect(storyboardSourceInputBudget(invalid)).toBe(false);
      expect(compactBusinessSourceChoices(invalid).ok).toBe(false);
      expect(expandBusinessSourceChoices(invalid).ok).toBe(false);
      rejectChoices(invalid);
    }
  });

  it.each([
    {
      person: { id: 'ada', label: 'Ada', source: { fromWord: 0, toWord: 1 } },
      personChoiceId: 'collision',
    },
    { evidence: { fromWord: 0, toWord: 1 }, evidenceSpanFromWord: 0 },
    { amount: { currency: 'USD', minorUnits: 1 }, amountValueCurrency: 'EUR' },
    { basis: { unit: 'hours' }, basisValueUnit: 'days' },
    { money: { currency: 'USD', minorUnits: 1 }, moneyValueMinorUnits: 2 },
  ])('rejects generated field collisions: %j', (invalid) => {
    expect(compactBusinessSourceChoices(invalid).ok).toBe(false);
    expect(expandBusinessSourceChoices(invalid).ok).toBe(false);
    rejectChoices({ ...compact(fixture.raw), ...invalid });
  });

  it.each([
    { proofSpanFromWord: -1, proofSpanToWord: 1 },
    { proofSpanFromWord: 2, proofSpanToWord: 1 },
    { proofSpanFromWord: 0.5, proofSpanToWord: 1 },
    { proofSpanFromWord: 0, proofSpanToWord: 250_000 },
    { proofSpanFromWord: 0 },
    { personChoiceId: 'ada' },
    { personChoiceId: 'ada', personChoiceFromWord: 0, personChoiceToWord: 1 },
    { personChoiceLabel: 'Ada', personChoiceFromWord: 0, personChoiceToWord: 1 },
    {
      personChoiceId: 'ada',
      personChoiceLabel: 'Ada',
      personChoiceFromWord: 2,
      personChoiceToWord: 1,
    },
    { basisValueInvented: 1 },
    { amountValueProfit: 1 },
    { moneyValueGeometry: 1 },
    { basisValueUnit: { code: 'opaque' } },
  ])('rejects malformed/incomplete selectors and unknown scalar fields: %j', (invalid) => {
    rejectChoices({ ...compact(fixture.raw), ...invalid });
    expect(expandBusinessSourceChoices(invalid).ok).toBe(false);
  });

  it.each([
    'subject.name',
    '../subject',
    'subject[0]',
    'constructor',
    'prototype',
    '__proto__',
    'a'.repeat(42),
  ])('rejects unsafe selector prefix %s, not arbitrary property paths', (prefix) => {
    const invalid = {
      [`${prefix}ChoiceId`]: 'ada',
      [`${prefix}ChoiceLabel`]: 'Ada',
      [`${prefix}ChoiceFromWord`]: 0,
      [`${prefix}ChoiceToWord`]: 1,
    };
    expect(expandBusinessSourceChoices(invalid).ok).toBe(false);
    rejectChoices({ ...compact(fixture.raw), ...invalid });
  });

  it.each(['constructor', 'prototype', '__proto__'])('rejects native prototype field %s', (key) => {
    const invalid = JSON.parse(`{"${key}":{}}`);
    expect(compactBusinessSourceChoices(invalid).ok).toBe(false);
    expect(expandBusinessSourceChoices(invalid).ok).toBe(false);
    rejectChoices(invalid);
  });

  it.each([
    ['geometry', { vertices: [1, 2, 3] }],
    ['code', 'run()'],
    ['scene', { kind: 'task-map' }],
    ['connectFrom', 'ada'],
    ['setupAt', 1],
    ['cues', []],
    ['url', 'https://example.com'],
    ['note', 'file:///tmp/model'],
    ['note', 'data:text/html,opaque'],
    ['note', 'javascript:run()'],
    ['note', '<svg/>'],
  ])('expansion cannot authorize opaque render/graph field %s', (key, value) => {
    const choices = { ...compact(fixture.raw), [key as string]: value };
    expect(expandBusinessSourceChoices(choices).ok).toBe(true);
    expect(
      parseBusinessExplanationSource(
        { ...envelope(fixture, 2), sourceChoices: choices },
        fixture.words,
        context,
      ),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'unsupported' }] });
  });

  it('real native parser still rejects invented facts and out-of-transcript evidence after expansion', () => {
    const choices = compact(fixture.raw);
    const evidence = choices.factEvidence as Record<string, unknown>;
    expect(evidence.sourceSpanFromWord).toBeTypeOf('number');
    for (const patch of [
      { sourceSpanFromWord: 100_000, sourceSpanToWord: 100_001 },
      { label: 'Invented guaranteed profit' },
    ]) {
      const invalid = { ...choices, factEvidence: { ...evidence, ...patch } };
      expect(expandBusinessSourceChoices(invalid).ok).toBe(true);
      expect(
        parseBusinessExplanationSource(
          { ...envelope(fixture, 2), sourceChoices: invalid },
          fixture.words,
          context,
        ),
      ).toMatchObject({ ok: false, diagnostics: [{ code: 'evidence' }] });
    }
  });

  it.each([
    3,
    99,
    0,
    -1,
    2.1,
    '2',
    null,
  ])('rejects future/unsupported sourceVersion %s unchanged', (sourceVersion) => {
    const input = { ...envelope(fixture, 2), sourceVersion };
    const before = structuredClone(input);
    expect(parseBusinessExplanationSource(input, fixture.words, context)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'version' }],
    });
    expect(input).toStrictEqual(before);
  });
});
