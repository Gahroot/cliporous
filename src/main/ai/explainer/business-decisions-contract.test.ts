import { describe, expect, it } from 'vitest';
import {
  DECISIONS_ACCEPTED_VARIANTS,
  DECISIONS_SOURCE_FIXTURES,
  type DecisionsSourceFixture,
  decisionsSourceContext,
  makeDecisionsFixture,
} from '../../remotion/compositions/explainer/business/decisions/fixtures';
import type { DecisionsScene } from '../../remotion/compositions/explainer/business/decisions/types';
import type { BusinessWordSpan } from '../../remotion/compositions/explainer/business/types';
import {
  parseMeasurementFrameScene,
  parseStagedDecisionScene,
  parseUncertaintyAlbumScene,
} from './business-decisions-contract';
import { isRec, type Rec } from './kind-spec';

function parseDecisionsFixture(f: DecisionsSourceFixture, raw: Rec = f.raw): DecisionsScene | null {
  const ctx = decisionsSourceContext(f);
  return raw.kind === 'staged-decision'
    ? parseStagedDecisionScene(raw, ctx)
    : raw.kind === 'measurement-frame'
      ? parseMeasurementFrameScene(raw, ctx)
      : parseUncertaintyAlbumScene(raw, ctx);
}
const fixtures = [...DECISIONS_SOURCE_FIXTURES, ...DECISIONS_ACCEPTED_VARIANTS];
function object(value: unknown): Rec {
  if (!isRec(value)) throw Error('expected fixture record');
  return value;
}
function span(value: unknown): BusinessWordSpan {
  const raw = object(value);
  if (typeof raw.fromWord !== 'number' || typeof raw.toWord !== 'number') throw Error('span');
  return { fromWord: raw.fromWord, toWord: raw.toWord };
}
function factSource(f: DecisionsSourceFixture): BusinessWordSpan {
  const raw = f.raw;
  return span(
    f.id === 'OP-73'
      ? object(raw.commitmentFact).source
      : f.id === 'OP-76'
        ? object(raw.observed).source
        : f.id === 'OP-77'
          ? object(object((raw.frames as unknown[])[0]).quantity).source
          : f.id === 'OP-78'
            ? object(object(raw.surviving).quantity).source
            : object(object((raw.alternatives as unknown[])[0]).fact).source,
  );
}
function corrupt(
  f: DecisionsSourceFixture,
  source: BusinessWordSpan,
  target: string,
  replacement: string,
): DecisionsSourceFixture {
  const index = f.words.findIndex(
    (word, i) => i >= source.fromWord && i <= source.toWord && word.text === target,
  );
  if (index < 0) throw Error(`Missing ${target}`);
  return {
    ...f,
    words: f.words.map((word, i) => (i === index ? { ...word, text: replacement } : word)),
  };
}
const attacks = [
  'Not Owner',
  'Owner may',
  'Owner might',
  'Other',
  'If ignored, Owner',
  'Owner allegedly',
  'Owner? Owner',
  'Owner never',
  'Owner unrelated',
];
describe('decisions source contracts', () => {
  it.each(fixtures)('$fixtureId accepts authored source and modes without mutating raw', (f) => {
    const before = structuredClone(f);
    for (const mode of f.raw.modelSource === null ? ['diagram'] : ['diagram', 'hybrid']) {
      const ctx = decisionsSourceContext(f),
        raw: Rec = { ...f.raw, visualMode: mode };
      const scene =
        raw.kind === 'staged-decision'
          ? parseStagedDecisionScene(raw, ctx)
          : raw.kind === 'measurement-frame'
            ? parseMeasurementFrameScene(raw, ctx)
            : parseUncertaintyAlbumScene(raw, ctx);
      expect(scene, ctx.issues.join('; ')).not.toBeNull();
      expect(Object.isFrozen(scene)).toBe(true);
    }
    expect(f).toEqual(before);
  });
  it.each(fixtures)('$fixtureId accepts diagram/null but rejects unsupported hybrid/null', (f) => {
    expect(
      parseDecisionsFixture(f, { ...f.raw, visualMode: 'diagram', modelSource: null }),
    ).not.toBeNull();
    expect(
      parseDecisionsFixture(f, { ...f.raw, visualMode: 'hybrid', modelSource: null }),
    ).toBeNull();
  });
  it.each(
    fixtures,
  )('$fixtureId rejects nonfinite, deep, oversized, closed-key, beat and source attacks', (f) => {
    const deep: Rec = {};
    let next = deep;
    for (let i = 0; i < 20; i++) {
      next.child = {};
      next = next.child as Rec;
    }
    for (const extra of [
      { extra: 1 },
      { extra: NaN },
      { extra: Infinity },
      { extra: deep },
      { extra: Array(1000).fill(1) },
      { extra: 'x'.repeat(10000) },
      { period: 'July' },
      { subject: 'Other' },
      { setupWord: 99999 },
      { resolveWord: f.raw.checkWord },
      { visualMode: 'webgl' },
      { outcome: 'Approved action' },
    ])
      expect(parseDecisionsFixture(f, { ...f.raw, ...extra })).toBeNull();
  });
  it.each(
    DECISIONS_SOURCE_FIXTURES.flatMap((f) => attacks.map((attack) => ({ f, attack }))),
  )('$f.id rejects complete local modal/negation/actor substitution: $attack', ({ f, attack }) => {
    expect(parseDecisionsFixture(corrupt(f, factSource(f), 'Owner', attack))).toBeNull();
  });
  it.each(
    DECISIONS_SOURCE_FIXTURES.filter((f) => f.id !== 'OP-77').flatMap((f) =>
      attacks.map((attack) => ({ f, attack })),
    ),
  )('$f.id independently rejects native modal/negation/actor substitution: $attack', ({
    f,
    attack,
  }) => {
    const native = object((f.raw.modelSource as unknown[])[0]);
    expect(parseDecisionsFixture(corrupt(f, span(native.source), 'Owner', attack))).toBeNull();
  });
  it.each(
    DECISIONS_SOURCE_FIXTURES,
  )('$id rejects a cropped clause, wrong literal period, adjacent assertion and invented quantity', (f) => {
    const source = factSource(f);
    const period = f.words
      .slice(source.fromWord, source.toWord + 1)
      .some((word) => word.text === 'June.')
      ? 'June.'
      : 'June';
    expect(
      parseDecisionsFixture(corrupt(f, source, period, period.replace('June', 'July'))),
    ).toBeNull();
    const tail = f.words[source.toWord].text;
    expect(
      parseDecisionsFixture(corrupt(f, source, tail, `${tail} Owner approves everything.`)),
    ).toBeNull();
    const changed = {
      ...f,
      words: f.words.map((word, i) =>
        i === source.fromWord - 1 ? { ...word, text: 'Not' } : word,
      ),
    };
    expect(parseDecisionsFixture(changed)).toBeNull();
  });
  it.each(
    DECISIONS_SOURCE_FIXTURES.filter((f) => f.id !== 'OP-77'),
  )('$id rejects replayed native fields, opaque missing bindings and render directives', (f) => {
    for (const key of ['source', 'asset', 'identityId']) {
      const raw = structuredClone(f.raw),
        native = object((raw.modelSource as unknown[])[0]);
      delete native[key];
      expect(parseDecisionsFixture(f, raw)).toBeNull();
    }
    const raw = structuredClone(f.raw),
      native = object((raw.modelSource as unknown[])[0]);
    native.source = factSource(f);
    expect(parseDecisionsFixture(f, raw)).toBeNull();
    native.source = object((f.raw.modelSource as unknown[])[0]).source;
    native.geometry = 'external';
    expect(parseDecisionsFixture(f, raw)).toBeNull();
  });
  it.each([
    'subjectId',
    'unit',
    'period',
    'population',
    'denominator',
  ])('OP-76 rejects a mismatched comparison basis: %s', (key) => {
    const f = DECISIONS_SOURCE_FIXTURES[1],
      raw = structuredClone(f.raw),
      basis = object(object(raw.observed).basis);
    basis[key] =
      key === 'denominator'
        ? 11
        : key === 'subjectId'
          ? 'other'
          : key === 'unit'
            ? 'workers'
            : key === 'period'
              ? 'July'
              : 'people';
    expect(parseDecisionsFixture(f, raw)).toBeNull();
  });
  it.each([
    -1,
    0.1,
    NaN,
    Infinity,
    1_000_000_001,
    '6',
    null,
  ])('OP-76 rejects unsupported known quantity: %s', (value) => {
    const f = DECISIONS_SOURCE_FIXTURES[1],
      raw = structuredClone(f.raw);
    object(raw.observed).value = value;
    expect(parseDecisionsFixture(f, raw)).toBeNull();
  });
  it.each([
    'unknown',
    'negative',
    'pending',
    'conditional',
  ])('preserves %s source and rejects upgrading it to observed', (state) => {
    const f = fixtures.find((f) => f.fixtureId === `OP-76:planned:${state}`);
    if (!f) throw Error('fixture');
    const raw = structuredClone(f.raw);
    object(raw.observed).state = 'observed';
    object(raw.observed).value = 6;
    expect(parseDecisionsFixture(f, raw)).toBeNull();
    if (state === 'conditional') {
      const noCondition = structuredClone(f.raw);
      delete noCondition.condition;
      expect(parseDecisionsFixture(f, noCondition)).toBeNull();
    }
  });
  it.each([
    'setup',
    'action',
    'response',
    'check',
  ] as const)('actual native meaning must be in setup/action, not replayed in %s', (placement) => {
    const native =
        'Owner illustrates an operating desk for inspecting Intake planned and observed throughput during June.',
      basis = 'Owner names Intake throughput basis in tasks during June per 10 cases.',
      planned = 'Owner planned Intake throughput of 8 tasks during June per 10 cases.',
      observed = 'Owner observed Intake throughput of 6 tasks during June per 10 cases.';
    const paragraphs: [string, string, string, string, string] = [
      'Owner introduces Intake during June.',
      'Owner inspects source frames during June.',
      `${basis} ${planned}`,
      observed,
      'Observation stays separate from plan.',
    ];
    const index = { setup: 0, action: 1, response: 2, check: 3 }[placement];
    paragraphs[index] =
      placement === 'setup' ? `${native} ${paragraphs[index]}` : `${paragraphs[index]} ${native}`;
    const f = makeDecisionsFixture(
      'OP-76',
      'measurement-frame',
      'planned-observed',
      paragraphs,
      (s) => ({
        task: s.identity('intake', 'Intake', basis),
        planned: s.quantity('planned', 8, 'Intake throughput', planned),
        observed: s.quantity('observed', 6, 'Intake throughput', observed),
        modelSource: [s.native('A-04', 'owner', native)],
      }),
    );
    const scene = parseDecisionsFixture(f, { ...f.raw, visualMode: 'hybrid' });
    if (placement === 'setup' || placement === 'action') expect(scene).not.toBeNull();
    else expect(scene).toBeNull();
  });
  it('OP-73 cannot upgrade commitments to cash or approvals, or borrow another native clause', () => {
    const f = DECISIONS_SOURCE_FIXTURES[0];
    for (const extra of [
      { contributed: true },
      { approved: true },
      { accepted: 1 },
      { money: 100 },
    ]) {
      const raw = structuredClone(f.raw);
      Object.assign(object(raw.commitmentFact), extra);
      expect(parseDecisionsFixture(f, raw)).toBeNull();
    }
    const raw = structuredClone(f.raw);
    object(raw.actionFact).state = 'source-stated';
    expect(parseDecisionsFixture(f, raw)).toBeNull();
    const n = raw.modelSource as Rec[];
    n[1].source = n[0].source;
    expect(parseDecisionsFixture(f, raw)).toBeNull();
  });
  it.each([
    -1,
    0.5,
    NaN,
    Infinity,
    1_000_001,
    '1',
  ])('OP-79 rejects invalid exact probability: %s', (value) => {
    const f = fixtures.find((f) => f.fixtureId === 'OP-79:distribution');
    if (!f) throw Error('fixture');
    const raw = structuredClone(f.raw);
    object(object((raw.alternatives as unknown[])[0]).probability).numerator = value;
    expect(parseDecisionsFixture(f, raw)).toBeNull();
  });
  it('OP-79 never invents a qualitative distribution, a winner or an incomplete alternative set', () => {
    const f = DECISIONS_SOURCE_FIXTURES[4];
    for (const extra of [
      { winner: 'east' },
      { selected: 'east' },
      { probability: 0.6 },
      { telemetry: 1 },
    ])
      expect(parseDecisionsFixture(f, { ...f.raw, ...extra })).toBeNull();
    for (const length of [0, 1, 5, 9])
      expect(
        parseDecisionsFixture(f, {
          ...f.raw,
          alternatives: Array.from({ length }, () => object((f.raw.alternatives as unknown[])[0])),
        }),
      ).toBeNull();
    const raw = structuredClone(f.raw);
    object((raw.alternatives as unknown[])[0]).probability = {
      numerator: 1,
      denominator: 2,
      source: factSource(f),
    };
    expect(parseDecisionsFixture(f, raw)).toBeNull();
  });
  it('rejects accessor, cyclic, sparse and polluted non-JSON inputs without invoking them', () => {
    const f = DECISIONS_SOURCE_FIXTURES[1];
    let called = false;
    const getter = { ...f.raw };
    Object.defineProperty(getter, 'extra', {
      get() {
        called = true;
        return 1;
      },
      enumerable: true,
    });
    expect(parseDecisionsFixture(f, getter)).toBeNull();
    expect(called).toBe(false);
    const cyclic = { ...f.raw };
    cyclic.extra = cyclic;
    expect(parseDecisionsFixture(f, cyclic)).toBeNull();
    expect(parseDecisionsFixture(f, { ...f.raw, extra: Array(4) })).toBeNull();
    expect(parseDecisionsFixture(f, { ...f.raw, extra: new Date() })).toBeNull();
  });
  it('OP-77 hybrid independently binds actor/populations/bases and never invents adoption', () => {
    const f = fixtures.find((entry) => entry.fixtureId === 'OP-77:hybrid');
    if (!f) throw Error('fixture');
    expect(parseDecisionsFixture(f)).not.toBeNull();
    for (const change of [
      'actor',
      'population',
      'denominator',
      'configured',
      'invented',
      'source',
    ]) {
      const raw = structuredClone(f.raw);
      const native = (raw.modelSource as Rec[])[0];
      const q = (raw.frames as Rec[])[0].quantity as Rec;
      if (change === 'actor') native.identityId = 'frame-firms';
      if (change === 'population') (q.basis as Rec).population = 'workers';
      if (change === 'denominator') (q.basis as Rec).denominator = 40;
      if (change === 'configured') q.state = 'configured';
      if (change === 'invented') q.value = 9;
      if (change === 'source') native.source = q.source;
      expect(parseDecisionsFixture(f, raw), change).toBeNull();
    }
    for (const replacement of attacks) {
      const changed = {
        ...f,
        words: f.words.map((word) => ({
          ...word,
          text: word.text === 'illustrates' ? `${replacement} illustrates` : word.text,
        })),
      };
      expect(parseDecisionsFixture(changed)).toBeNull();
    }
  });
  it('OP-77 rejects unsupported hybrid and missing/mixed frames', () => {
    const f = fixtures.find((f) => f.id === 'OP-77');
    if (!f) throw Error('fixture');
    expect(parseDecisionsFixture(f, { ...f.raw, visualMode: 'hybrid' })).toBeNull();
    const raw = structuredClone(f.raw);
    const frames = raw.frames as Rec[];
    frames[0].frame = 'workers';
    expect(parseDecisionsFixture(f, raw)).toBeNull();
  });
  it('rejects swapped quantity/identity/version/accounting/probability/native clauses', () => {
    for (const f of fixtures) {
      const raw = structuredClone(f.raw);
      if (f.id === 'OP-73') {
        (raw.commitment as Rec).version = 'v2';
      }
      if (f.id === 'OP-76') {
        (raw.observed as Rec).value = 8;
      }
      if (f.id === 'OP-77') {
        ((raw.frames as Rec[])[0].quantity as Rec).value = 99;
      }
      if (f.id === 'OP-78') {
        ((raw.attrition as Rec).quantity as Rec).value = 5;
      }
      if (f.id === 'OP-79') {
        ((raw.alternatives as Rec[])[0].entry as Rec).version = 'v9';
      }
      expect(parseDecisionsFixture(f, raw)).toBeNull();
    }
  });
  it.each(
    fixtures.filter((f) => f.id !== 'OP-77'),
  )('$fixtureId rejects native identity and source swaps independently', (f) => {
    const raw = structuredClone(f.raw),
      native = raw.modelSource as Rec[];
    native[0].identityId = 'other';
    expect(parseDecisionsFixture(f, raw)).toBeNull();
    native[0].identityId = (f.raw.modelSource as Rec[])[0].identityId;
    native[0].source = (raw.owner as Rec).source;
    expect(parseDecisionsFixture(f, raw)).toBeNull();
  });
});
