import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionReversibleExpiryScene } from '../../remotion/compositions/explainer/expansion/temporal/reversible-expiry-types';
import type { ExpansionQuantity } from '../../remotion/compositions/explainer/expansion/value-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionExpiry,
  parseExpansionReversible,
} from './expansion-temporal-reversible-expiry-contract';
import { isRec, makeParseContext, type Rec } from './kind-spec';

interface Fixture extends ExpansionSourceFixture {
  readonly name: string;
  readonly clauseIntervals: readonly (readonly [number, number])[];
  readonly paraphrases?: readonly Fixture[];
  readonly examples?: readonly Fixture[];
}
const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/temporal/reversible-expiry.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  stories: Fixture[];
};
const MODES = ['diagram', 'hybrid'] as const;
const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function object(raw: unknown): Rec {
  if (!isRec(raw)) throw new Error('Expected complete raw object');
  return raw;
}
function rows(raw: unknown): Rec[] {
  if (!Array.isArray(raw) || !raw.every(isRec)) throw new Error('Expected raw rows');
  return raw;
}
function fixture(id: '43' | '44'): Fixture {
  const value = packet.stories.find((f) => f.id === id);
  if (!value) throw new Error(`Missing fixture ${id}`);
  return value;
}
function parse(f: Pick<Fixture, 'id' | 'proposal' | 'words' | 'window'>) {
  const ctx = makeParseContext(f.words, f.window);
  const scene =
    f.id === '43'
      ? parseExpansionReversible(f.proposal, ctx)
      : parseExpansionExpiry(f.proposal, ctx);
  return { scene, ctx };
}
function positive(
  f: Pick<Fixture, 'id' | 'proposal' | 'words' | 'window'>,
): ExpansionReversibleExpiryScene {
  const before = structuredClone(f);
  const diagram = parse({ ...f, proposal: { ...f.proposal, visualMode: 'diagram' } });
  const hybrid = parse({ ...f, proposal: { ...f.proposal, visualMode: 'hybrid' } });
  expect(diagram.ctx.issues).toEqual([]);
  expect(hybrid.ctx.issues).toEqual([]);
  expect(diagram.scene).not.toBeNull();
  expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
  expect(parse({ ...f, proposal: structuredClone(f.proposal) }).scene).toEqual(diagram.scene);
  expect(f).toEqual(before);
  if (!diagram.scene) throw new Error('Expected valid scene');
  return diagram.scene;
}
function reject(f: Pick<Fixture, 'id' | 'proposal' | 'words' | 'window'>) {
  for (const visualMode of MODES) {
    const raw = {
      ...f.proposal,
      visualMode: MODES.some((mode) => mode === f.proposal.visualMode)
        ? visualMode
        : f.proposal.visualMode,
    };
    const result = parse({ ...f, proposal: raw });
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.length).toBeGreaterThan(0);
    expect(result.ctx.issues.length).toBeLessThanOrEqual(4);
  }
}
function clauses(f: Pick<Fixture, 'sourceText'>): string[] {
  return f.sourceText.split(/(?<=[.!?;])\s+/u);
}
/** Reuse the production fixture padding, then author pauses explicitly for dense clauses. */
function speech(texts: readonly string[], intervals: Fixture['clauseIntervals']) {
  const authored = expansionFixtureSpeech(texts, 10);
  for (const [i, span] of authored.spans.entries()) {
    const [start, end] = intervals[i];
    const count = span.toWord - span.fromWord + 1;
    for (let j = 0; j < count; j++) {
      const word = authored.words[span.fromWord + j];
      word.start = Math.round((start + (j * (end - start)) / count) * 1e9) / 1e9;
      word.end = Math.round((start + ((j + 1) * (end - start)) / count) * 1e9) / 1e9;
    }
  }
  return authored;
}
function rewrite(f: Fixture, texts: readonly string[]): Fixture {
  const previous = speech(clauses(f), f.clauseIntervals);
  const next = speech(texts, f.clauseIntervals);
  function rebase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rebase);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const index = previous.spans.findIndex(
        (s) => s.fromWord === value.fromWord && s.toWord === value.toWord,
      );
      if (!next.spans[index]) throw new Error('Only complete authored evidence is rebased');
      return { ...next.spans[index] };
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rebase(entry)]));
  }
  const proposal = object(rebase(f.proposal));
  proposal.endWord = next.window.endWord;
  PHASES.forEach((phase) => {
    const i = previous.spans.findIndex((s) => s.fromWord === f.proposal[`${phase}Word`]);
    proposal[`${phase}Word`] = next.spans[i].fromWord;
  });
  return { ...f, ...next, proposal };
}
function quantity(f: Fixture, index = 0): Rec {
  const record = rows(f.proposal.records)[index];
  return object(record[index === 0 ? 'representedDeadline' : 'representedEventTime']);
}
function supplied(scene: ExpansionReversibleExpiryScene): ExpansionQuantity[] {
  if (scene.storyId !== '44') return [];
  return scene.records.flatMap((r) =>
    r.type === 'deadline'
      ? [r.representedDeadline]
      : r.type === 'attempt'
        ? [r.representedEventTime]
        : [r.representedStart, r.representedEnd],
  );
}
function facts(scene: ExpansionReversibleExpiryScene): unknown {
  function omit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(omit);
    if (!isRec(value)) return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !['evidence', 'sourceSpans', 'visualMode', 'notation'].includes(key) &&
            !PHASES.some((p) => key === `${p}At`),
        )
        .map(([key, entry]) => [key, omit(entry)]),
    );
  }
  return omit(scene);
}

it('persists version1 temporal raw proposals with independent paraphrases and explicit unique negatives', () => {
  expect([packet.version, packet.pack]).toEqual([1, 'temporal']);
  expect(packet.stories.map((f) => f.id)).toEqual(['43', '44']);
  for (const f of packet.stories) {
    expect(f.paraphrases).toHaveLength(1);
    expect(f.paraphrases?.[0].sourceText).not.toBe(f.sourceText);
    expect(new Set(f.negatives.map((n) => n.name)).size).toBe(f.negatives.length);
    expect(expansionEntry(f.proposal.kind, f.proposal.preset)?.allowedDerivations).toEqual([]);
    expect(f.negatives.every((n) => isRec(n.proposal) && Object.keys(n.proposal).length > 15)).toBe(
      true,
    );
  }
});
for (const f of packet.stories) {
  describe(`story ${f.id}`, () => {
    for (const example of [f, ...(f.paraphrases ?? []), ...(f.examples ?? [])]) {
      it(`${example.name}: parses both modes with exact IDs, source clauses, qualification, beat times and supplied domain facts`, () => {
        const scene = positive(example);
        expect(scene.entities.map((e) => e.id)).toEqual(
          scene.entities.map((_, i) => expansionEntityId(f.id, i)),
        );
        expect(scene.records.map((r) => r.id)).toEqual(
          scene.records.map((_, i) => `expansion-${f.id}-record-${i}`),
        );
        expect(scene.relations.map((r) => r.id)).toEqual(
          scene.relations.map((_, i) => `expansion-${f.id}-relation-${i}`),
        );
        expect(scene.result.id).toBe(`expansion-${f.id}-result`);
        const authored = speech(clauses(example), example.clauseIntervals);
        expect(example.words).toEqual(authored.words);
        expect(example.window).toEqual(authored.window);
        expect(example.words[0].start - example.window.startTime).toBe(0.25);
        expect(example.window.endTime - example.words[example.words.length - 1].end).toBeCloseTo(
          0.35,
          9,
        );
        expect(new Set(Object.values(scene.sourceSpans).map((s) => s.fromWord)).size).toBe(5);
        PHASES.forEach((phase, i) => {
          expect(authored.spans).toContainEqual(scene.sourceSpans[phase]);
          const time = scene[`${phase}At`];
          expect(time).toBe(
            i === 0
              ? Math.max(0.3, example.words[Number(example.proposal[`${phase}Word`])].start)
              : example.words[Number(example.proposal[`${phase}Word`])].start,
          );
          if (i > 0) expect(time - scene[`${PHASES[i - 1]}At`]).toBeGreaterThanOrEqual(1);
        });
        expect(example.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
        for (const [i, w] of example.words.entries()) {
          expect(Number.isFinite(w.start) && Number.isFinite(w.end)).toBe(true);
          expect(w.end).toBeGreaterThan(w.start);
          if (i > 0) expect(w.start).toBeGreaterThanOrEqual(example.words[i - 1].end - 1e-7);
        }
        const rawLinks = rows(example.proposal.relations);
        scene.relations.forEach((r, i) => {
          expect(r.state).toBe(rawLinks[i].state);
          expect(r.evidence).toEqual(rawLinks[i].evidence);
          if (r.state === 'conditional')
            expect([r.status, r.condition]).toEqual([rawLinks[i].status, rawLinks[i].condition]);
        });
        expect(scene.result.state).toBe(object(example.proposal.result).state);
        expect(scene.result.evidence).toEqual(object(example.proposal.result).evidence);
        const rawQuantities = rows(example.proposal.records).flatMap((r) =>
          r.type === 'deadline'
            ? [object(r.representedDeadline)]
            : r.type === 'attempt'
              ? [object(r.representedEventTime)]
              : r.type === 'validity'
                ? [object(r.representedStart), object(r.representedEnd)]
                : [],
        );
        supplied(scene).forEach((q, i) => {
          expect([q.state, q.basis, q.evidence]).toEqual([
            rawQuantities[i].state,
            rawQuantities[i].basis,
            rawQuantities[i].evidence,
          ]);
          if ('amount' in q)
            expect(q.amount).toEqual({
              ...object(rawQuantities[i].amount),
              notation: q.amount.notation,
            });
        });
        if (example.name === 'paraphrase') expect(facts(scene)).toEqual(facts(positive(f)));
      });
    }
    for (const bad of f.negatives) {
      for (const mode of MODES)
        it(`rejects raw ${bad.name} in ${mode}`, () => {
          const proposal = {
            ...bad.proposal,
            visualMode: MODES.some((m) => m === bad.proposal.visualMode)
              ? mode
              : bad.proposal.visualMode,
          };
          const before = structuredClone(proposal);
          const result = parse({
            id: f.id,
            proposal,
            words: bad.words ?? f.words,
            window: bad.window ?? f.window,
          });
          expect(result.scene).toBeNull();
          expect(result.ctx.issues.length).toBeGreaterThan(0);
          expect(proposal).toEqual(before);
        });
    }
  });
}

for (const status of ['allowed', 'denied', 'unknown', 'conditional'] as const) {
  it(`retains ${status} expiry result even when attempted timing is later than the deadline`, () => {
    const f = fixture('44'),
      texts = clauses(f);
    texts[2] = texts[2].replace('12 hours', '24 hours');
    texts[4] = texts[4]
      .replace('denied', status === 'conditional' ? 'allowed' : status)
      .replace(/\.$/, status === 'conditional' ? ' if the supervisor signs.' : '.');
    const edited = rewrite(f, texts);
    object(quantity(edited, 1).amount).value = { numerator: 24, denominator: 1 };
    const result = object(edited.proposal.result);
    result.state = status;
    edited.proposal.outcome = status === 'conditional' ? 'allowed' : status;
    if (status === 'conditional')
      Object.assign(result, { status: 'allowed', condition: 'if the supervisor signs' });
    const scene = positive(edited);
    expect(scene.result.state).toBe(status);
    expect(scene.entities).toEqual(positive(f).entities);
    expect(scene.relations[0].state).toBe('unknown');
    expect(PHASES.map((p) => scene[`${p}At`])).toEqual(PHASES.map((p) => positive(f)[`${p}At`]));
    if (status === 'conditional') {
      delete result.condition;
      reject(edited);
    }
  });
}
for (const state of ['unknown', 'missing', 'disputed', 'conditional'] as const) {
  it(`keeps represented ${state} timing and qualification, never converting it to zero`, () => {
    const f = fixture('44'),
      texts = clauses(f);
    texts[2] = texts[2]
      .replace(
        '12 hours',
        state === 'conditional'
          ? '12 hours'
          : state === 'disputed'
            ? 'disputed between 12 and 13 hours'
            : `${state} hours`,
      )
      .replace(/\.$/, state === 'conditional' ? ' if the gate log arrives.' : '.');
    const edited = rewrite(f, texts),
      q = quantity(edited, 1);
    q.state = state;
    if (state === 'conditional') q.condition = 'if the gate log arrives';
    else {
      q.qualifier = state;
      delete q.amount;
      if (state === 'disputed')
        q.alternatives = [12, 13].map((numerator) => ({
          kind: 'rational',
          value: { numerator, denominator: 1 },
        }));
    }
    const parsed = supplied(positive(edited))[1];
    expect(parsed.state).toBe(state);
    expect('amount' in parsed).toBe(state === 'conditional');
    expect(positive(edited).result.state).toBe('denied');
  });
}
for (const status of ['denied', 'unknown'] as const) {
  it(`forward permission never implies ${status === 'unknown' ? 'known' : 'allowed'} reverse permission`, () => {
    const f = fixture('43'),
      texts = clauses(f);
    texts[2] =
      status === 'unknown'
        ? 'Mira transition of Hatch from Open to Latched is unknown for Workshop during Shift.'
        : 'Mira is denied to move Hatch from Open to Latched for Workshop during Shift.';
    const edited = rewrite(f, texts),
      reverse = rows(edited.proposal.relations)[1];
    reverse.state = status;
    delete reverse.status;
    delete reverse.condition;
    const scene = positive(edited);
    expect(scene.relations[0].state).toBe('conditional');
    expect(scene.relations[1].state).toBe(status);
    reverse.state = 'allowed';
    reject(edited);
  });
}
for (const id of ['43', '44'] as const) {
  it(`${id}: rejects actual functions and finite/positive/nonoverlap/window defects without execution`, () => {
    const f = fixture(id),
      proposal = structuredClone(f.proposal);
    proposal.label = () => {
      throw new Error('Do not execute untrusted input');
    };
    reject({ ...f, proposal });
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, f.words[2].start]) {
      const words = structuredClone(f.words);
      words[2].end = value;
      reject({ ...f, words });
    }
    const overlap = structuredClone(f.words);
    overlap[2].start = overlap[1].end - 2e-7;
    reject({ ...f, words: overlap });
    reject({ ...f, window: { ...f.window, startTime: 0.26 } });
    reject({ ...f, window: { ...f.window, endTime: 9.64 } });
  });
}

for (const id of ['43', '44'] as const) {
  for (const defect of ['gap', 'hold'] as const) {
    it(`${id}: rejects subminimum ${defect} even within the shared helper tolerance`, () => {
      const f = fixture(id);
      const intervals: [number, number][] = f.clauseIntervals.map(([start, end]) => [start, end]);
      if (defect === 'gap') {
        intervals[0][1] = 1.1;
        intervals[1][0] = 1.3 - 5e-7;
      } else intervals[4][0] = 9.2 + 5e-7;
      const edited = speech(clauses(f), intervals);
      reject({ ...f, words: edited.words });
    });
  }
}

it('rejects incompatible source-stated timing units rather than converting them', () => {
  const f = fixture('44'),
    texts = clauses(f);
  texts[2] = texts[2].replace('12 hours', '12 minutes');
  const edited = rewrite(f, texts);
  object(quantity(edited, 1).basis).unit = 'minute';
  reject(edited);
});

for (const status of ['known', 'conditional'] as const)
  it(`rejects reversed ${status} validity endpoints rather than evaluating permission`, () => {
    const v = fixture('44').examples?.[0];
    if (!v) throw new Error('Missing validity source');
    const texts = clauses(v);
    texts[1] = texts[1].replace('4 hours', '20 hours');
    if (status === 'conditional') {
      texts[1] = texts[1].replace(/\.$/, ' if the clock is verified.');
      texts[2] = texts[2].replace(/\.$/, ' if the clock is verified.');
    }
    const edited = rewrite(v, texts);
    if (status === 'conditional') {
      const record = rows(edited.proposal.records)[0];
      for (const key of ['representedStart', 'representedEnd'])
        Object.assign(object(record[key]), {
          state: 'conditional',
          condition: 'if the clock is verified',
        });
    }
    object(object(rows(edited.proposal.records)[0].representedStart).amount).value = {
      numerator: 20,
      denominator: 1,
    };
    reject(edited);
  });
