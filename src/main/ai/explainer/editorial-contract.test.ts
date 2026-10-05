import { describe, expect, it } from 'vitest';
import type {
  ExplainerSceneBody,
  HeroScene,
  NumberScene,
} from '../../remotion/compositions/explainer/types';
import {
  buildReviewPrompt,
  chainPreservesFirstAction,
  parseExplainerPlan,
  parsePlanWithDiagnostics,
  sceneCues,
  toSceneRelative,
} from '../explainer-scenes';
import {
  editorialPrompt,
  numberSourceSupports,
  parseEditorialFields,
  parseStampFinish,
  stampSupported,
  suppressEditorialExtras,
} from './editorial-contract';
import { makeParseContext, type PlannerWord, type Rec } from './kind-spec';

function words(text: string, start = 10): PlannerWord[] {
  return text
    .split(/\s+/)
    .map((text, i) => ({ text, start: start + i * 0.5, end: start + i * 0.5 + 0.45 }));
}
function context(text: string) {
  const source = words(text);
  const last = source.at(-1);
  if (!last) throw new Error('Expected a nonempty source fixture');
  return makeParseContext(source, {
    startWord: 0,
    endWord: source.length - 1,
    startTime: 9.75,
    endTime: last.end + 0.35,
  });
}
const hero: HeroScene = { kind: 'hero', prop: 'lock', label: 'privacy', at: 10.5 };
const number: NumberScene = {
  kind: 'number',
  value: 12.5,
  decimals: 1,
  suffix: '%',
  label: 'conversion',
  countAt: 10.3,
  landAt: 12,
};
const bounds = { minStart: 0, maxEnd: 100 };
const heroRaw: Rec = {
  kind: 'hero',
  prop: 'lock',
  label: 'privacy',
  word: 1,
  startWord: 0,
  endWord: 10,
  layout: 'stack',
};
const source = words(
  'Keep privacy safe and reveal privacy only when people understand the context clearly',
);

it('omits malformed optional values with diagnostics while preserving the legacy core', () => {
  for (const labelTreatment of [
    'redaction',
    {},
    { kind: 'random', revealWord: 4 },
    { kind: 'redaction', revealWord: 4, hiddenText: 'fake fact' },
  ]) {
    const parsed = parsePlanWithDiagnostics(
      { scenes: [{ ...heroRaw, labelTreatment }] },
      source,
      bounds,
    );
    expect(parsed.accepted).toHaveLength(1);
    const [accepted] = parsed.accepted;
    const [omitted] = parsed.omitted;
    if (!accepted || !omitted) throw new Error('Expected retained core and optional diagnostics');
    expect(accepted.scene).toMatchObject({ kind: 'hero', label: 'privacy' });
    expect(accepted.scene).not.toHaveProperty('labelTreatment');
    expect(parsed.rejected).toEqual([]);
    expect(omitted.problems.join(' ')).toContain('labelTreatment');
    const review = buildReviewPrompt(
      source,
      [heroRaw],
      bounds,
      '9:16',
      [],
      undefined,
      parsed.omitted,
    );
    expect(review).toContain('cores were RETAINED');
    expect(review).toContain('optional');
  }
});

it('converts boundary word indexes to seconds and rebases optional beats', () => {
  const raw = { ...heroRaw, labelTreatment: { kind: 'redaction', revealWord: 4 } };
  const parsed = parseExplainerPlan({ scenes: [raw] }, source, bounds);
  expect(parsed).toHaveLength(1);
  const [planned] = parsed;
  if (!planned) throw new Error('Expected a parsed label treatment');
  expect(planned.scene).toMatchObject({ labelTreatment: { kind: 'redaction', revealAt: 12 } });
  expect(toSceneRelative(planned.scene, 10)).toMatchObject({ labelTreatment: { revealAt: 2 } });
  expect(JSON.stringify(planned.scene)).not.toContain('revealWord');
});

it('rejects late reveal, new hidden text, out-of-range target and unknown timing fields without changing core', () => {
  const ctx = context('Keep privacy safe and reveal only the exact source words now');
  for (const labelTreatment of [
    { kind: 'peel-back', revealWord: 10 },
    { kind: 'redaction', revealWord: 5, targetIndex: 99 },
    { kind: 'redaction', revealAt: 12 },
    { kind: 'redaction', revealWord: 5, replacement: 'approved' },
  ]) {
    expect(parseEditorialFields({ labelTreatment }, hero, ctx)).toEqual({});
  }
  expect(ctx.issues.length).toBeGreaterThan(0);
});

describe('grounding and polarity', () => {
  it.each([
    'We are not verified by anyone yet',
    'They claim certified but offer no evidence',
    'It might be proven one day',
    'The result is not approved',
  ])('rejects unsupported evidence in %s', (text) => {
    const verdict = text.match(/verified|certified|proven|approved/)?.[0];
    if (!verdict) throw new Error('Expected an evidence word in the adversarial fixture');
    expect(stampSupported(verdict.toUpperCase(), context(text))).toBe(false);
  });
  it('accepts a source-supported verdict but not an unknown finish', () => {
    const ctx = context('The verdict is STOP and that is all we said today');
    expect(parseStampFinish('letterpress', 'STOP', ctx)).toBe('letterpress');
    expect(parseStampFinish('hologram', 'STOP', ctx)).toBeUndefined();
    expect(parseStampFinish('embossed', 'VERIFIED', ctx)).toBeUndefined();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });
  it.each([
    'We did not reach 12.5% conversion today',
    'The conversion was -12.5% this time',
    'The conversion was 112.5% this time',
    'The conversion was $12.5 this time',
  ])('does not fabricate a positive percent from %s', (text) => {
    expect(numberSourceSupports(number, context(text))).toBe(false);
  });
  it('grounds decimal, currency, sign and units as one quantity', () => {
    expect(numberSourceSupports(number, context('We reached 12.5% conversion today'))).toBe(true);
    expect(
      numberSourceSupports(
        { ...number, prefix: '-' },
        context('We reached -12.5% conversion today'),
      ),
    ).toBe(true);
    expect(
      numberSourceSupports(
        { ...number, prefix: '+' },
        context('We reached -12.5% conversion today'),
      ),
    ).toBe(false);
    expect(
      numberSourceSupports(
        { ...number, value: 12, decimals: 0, suffix: 'hours', prefix: '$' },
        context('The 12 hours cost 50 dollars today'),
      ),
    ).toBe(false);
  });
  it('drops a false core stamp claim but keeps a valid core with an invalid optional finish', () => {
    const raw = {
      kind: 'stamp',
      icon: 'Check',
      word: 'VERIFIED',
      stampWord: 4,
      startWord: 0,
      endWord: 10,
      finish: 'letterpress',
    };
    const unsupported = words('This is not verified and cannot be presented as such to people');
    expect(parsePlanWithDiagnostics({ scenes: [raw] }, unsupported, bounds).rejected).toHaveLength(
      1,
    );
    const valid = { ...raw, word: 'STOP', finish: 'unknown' };
    const result = parsePlanWithDiagnostics(
      { scenes: [valid] },
      words('The spoken verdict is STOP and nothing else is implied here today'),
      bounds,
    );
    expect(result.accepted).toHaveLength(1);
    const [accepted] = result.accepted;
    if (!accepted) throw new Error('Expected the valid legacy stamp core');
    expect(accepted.scene).not.toHaveProperty('finish');
    expect(result.omitted.length).toBeGreaterThan(0);
  });
  it('does not put invented evidence on an otherwise valid overlay host', () => {
    const result = parsePlanWithDiagnostics(
      { scenes: [{ ...heroRaw, laterStamp: { text: 'CERTIFIED', word: 5, finish: 'embossed' } }] },
      source,
      bounds,
    );
    expect(result.accepted).toHaveLength(1);
    const [accepted] = result.accepted;
    const [omitted] = result.omitted;
    if (!accepted || !omitted) throw new Error('Expected retained host and false-stamp diagnostic');
    expect(accepted.scene).not.toHaveProperty('overlayStamp');
    expect(omitted.problems.join(' ')).toContain('evidence');
  });
});

it('allows one source-semantic word treatment, not arbitrary verbs or stacked primaries', () => {
  const ctx = context('Compress the idea and keep the source word fully legible after motion');
  const body: ExplainerSceneBody = { kind: 'statement', words: [{ text: 'Compress', at: 10.3 }] };
  const fields = parseEditorialFields(
    {
      labelTreatment: { kind: 'redaction', targetIndex: 0, revealWord: 3 },
      semanticText: { kind: 'compress', targetIndex: 0, word: 3 },
    },
    body,
    ctx,
  );
  expect(fields).toHaveProperty('labelTreatment');
  expect(fields).not.toHaveProperty('semanticText');
  expect(
    parseEditorialFields(
      { semanticText: { kind: 'separate', targetIndex: 0, word: 3 } },
      body,
      ctx,
    ),
  ).toEqual({});
  expect(
    suppressEditorialExtras(
      { ...body, ...fields },
      {
        overlayStamp: { word: 'YES', at: 12 },
        annotation: { kind: 'circle', at: 12 },
        pulses: [{ at: 12, strength: 'pulse' }],
      },
      ctx,
    ),
  ).toEqual({});
});

it('enforces nonadjacency and prevents automatic emphasis from bypassing the primary budget', () => {
  const many = words(Array.from({ length: 70 }, () => 'privacy').join(' '), 0);
  const first = {
    ...heroRaw,
    startWord: 4,
    endWord: 12,
    word: 5,
    labelTreatment: { kind: 'redaction', revealWord: 7 },
  };
  const second = {
    kind: 'statement',
    startWord: 18,
    endWord: 26,
    layout: 'stack',
    words: [{ text: 'privacy', word: 19 }],
    labelTreatment: { kind: 'peel-back', targetIndex: 0, revealWord: 21 },
  };
  const planned = parseExplainerPlan(
    { scenes: [first, second] },
    many,
    { minStart: 0, maxEnd: 35 },
    { aspect: '16:9', profile: 'content-led-codex-v1', emphasisTimes: [4.5, 11.5] },
  );
  expect(planned).toHaveLength(2);
  const [firstPlanned, secondPlanned] = planned;
  if (!firstPlanned || !secondPlanned) throw new Error('Expected both adjacent scene cores');
  expect(firstPlanned.scene).toHaveProperty('labelTreatment');
  expect(secondPlanned.scene).not.toHaveProperty('labelTreatment');
  expect(planned.every((p) => !p.scene.pulses?.length)).toBe(true);
});

it('grounds authored detail targets and measurement units; rejects arbitrary coordinates and fabricated dimensions', () => {
  const ctx = context(
    'We assemble the gear then separate it the gear is 12 mm wide now and then reassemble everything carefully',
  );
  const body: ExplainerSceneBody = {
    kind: 'exploded-view',
    template: 'mechanism',
    target: 'gear',
    label: 'gear',
    detailLabel: 'gear',
    assembleAt: 10.3,
    separateAt: 11,
    explainAt: 12,
    returnAt: 17,
  };
  const detail = { kind: 'measurement', target: 'gear', label: '12 mm', word: 10 };
  expect(parseEditorialFields({ detail }, body, ctx)).toEqual({
    detail: { kind: 'measurement', target: 'gear', label: '12 mm', at: 15 },
  });
  for (const bad of [
    { ...detail, target: 'shaft' },
    { ...detail, label: '120 mm' },
    { ...detail, label: 'gear' },
    { ...detail, x: 900 },
    { ...detail, word: 18 },
  ]) {
    expect(parseEditorialFields({ detail: bad }, body, ctx)).toEqual({});
  }
  expect(suppressEditorialExtras(body, { dimAt: 14, bursts: [{ at: 14 }] }, ctx)).toEqual({});
  expect(chainPreservesFirstAction(body, 10.4)).toBe(false);
  expect(chainPreservesFirstAction(body, 10.2)).toBe(true);
  expect(chainPreservesFirstAction(hero, 999)).toBe(true);
});

it('keeps prompt docs conditional and cues synchronized to a single physical contact', () => {
  expect(editorialPrompt(['checklist'])).toBe('');
  expect(editorialPrompt(['number'])).toContain('odometer');
  expect(editorialPrompt(['number'])).not.toContain('redaction');
  const cues = sceneCues({
    scene: { kind: 'stamp', icon: 'Check', word: 'STOP', stampAt: 2, finish: 'letterpress' },
    chained: false,
  });
  expect(cues).toEqual([{ kind: 'thump', at: 2.12, gain: 0.65 }]);
});
