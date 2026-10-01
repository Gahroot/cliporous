import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RetrievalGroundingScene } from '../../remotion/compositions/explainer/technology/types';
import { makeParseContext, type ParseContext, type PlannerWord, type Rec } from './kind-spec';
import { RETRIEVAL_GROUNDING_SPEC } from './kinds-retrieval-grounding';

interface Fixture {
  name: string;
  durationSec: number;
  scene: RetrievalGroundingScene;
  sourceText: string;
  raw: Rec;
  words: PlannerWord[];
  cases: { name: string; layout: string; aspect: string }[];
  covers: { category: string; id: string }[];
  samples: { name: string; frame: number }[];
}
const fixtures: Fixture[] = JSON.parse(
  readFileSync(
    resolve('scripts/explainer-stills/fixtures/technology-retrieval-grounding.json'),
    'utf8',
  ),
);
const fields = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'];
const [found, empty, two] = fixtures;

function parse(
  fixture: Fixture,
  patch: Rec = {},
  words = fixture.words,
  startTime = 0,
  endTime = fixture.durationSec,
): { scene: RetrievalGroundingScene | null; ctx: ParseContext } {
  const ctx = makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime,
    endTime,
  });
  return { scene: RETRIEVAL_GROUNDING_SPEC.parse({ ...fixture.raw, ...patch }, ctx), ctx };
}
function index(raw: Rec, field: string): number {
  const value = raw[field];
  if (typeof value !== 'number') throw new Error(`Missing ${field}`);
  return value;
}
// Retiming changed narration keeps failures semantic instead of accidentally invalidating beats.
function rewrite(fixture: Fixture, changes: Record<number, string>, patch: Rec = {}): Fixture {
  const words: PlannerWord[] = [];
  const raw = { ...fixture.raw, ...patch };
  const times = [0.3, 1.5, 3, 6.8, 8.4, 9.3];
  fields.forEach((field, n) => {
    const original = fixture.words
      .slice(index(fixture.raw, field), n === 4 ? undefined : index(fixture.raw, fields[n + 1]))
      .map((word) => word.text)
      .join(' ');
    const tokens = (changes[n] ?? original).split(' ');
    raw[field] = words.length;
    const step = (times[n + 1] - times[n]) / tokens.length;
    tokens.forEach((text, i) => {
      words.push({ text, start: times[n] + i * step, end: times[n] + (i + 0.9) * step });
    });
  });
  raw.endWord = words.length - 1;
  return { ...fixture, raw, words, sourceText: words.map((word) => word.text).join(' ') };
}
function rejected(fixture: Fixture, patch: Rec = {}): void {
  const result = parse(fixture, patch);
  expect(result.scene).toBeNull();
  expect(result.ctx.issues.length).toBeGreaterThan(0);
}

describe('retrieval-grounding real narrated fixtures', () => {
  it.each(
    fixtures,
  )('$name parses its actual metadata and retains only its selected sources', (fixture) => {
    expect(fixture.words.map((word) => word.text).join(' ')).toBe(fixture.sourceText);
    const { scene, ctx } = parse(fixture);
    expect(ctx.issues).toEqual([]);
    expect(scene).toEqual(fixture.scene);
    expect(scene?.sources.length).toBe(
      fixture.scene.preset === 'no-evidence' ? 0 : fixture.scene.preset === 'two-sources' ? 2 : 1,
    );
    expect(fixture.name).toBe(`retrieval-grounding-${fixture.scene.preset}`);
    expect(fixture.durationSec).toBeGreaterThanOrEqual(5);
    expect(fixture.durationSec).toBeLessThanOrEqual(12);
    expect(fixture.durationSec - fixture.scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    expect(fixture.cases).toEqual([
      { name: 'vertical-stack', layout: 'stack', aspect: '9:16' },
      { name: 'landscape-over', layout: 'over', aspect: '16:9' },
    ]);
    expect(fixture.covers).toContainEqual({
      category: 'technology',
      id: `retrieval-grounding/${fixture.scene.preset}`,
    });
    expect(fixture.covers).toContainEqual({ category: 'kind', id: 'retrieval-grounding' });
    for (const beat of [
      fixture.scene.actionAt,
      fixture.scene.responseAt,
      fixture.scene.checkAt,
      fixture.scene.resolveAt,
    ]) {
      for (const delta of [-1, 0, 1])
        expect(
          fixture.samples.some((sample) => sample.frame === Math.round(beat * 30) + delta),
        ).toBe(true);
    }
    for (const sample of fixture.samples)
      expect(sample.frame).toBeLessThan(fixture.durationSec * 30);
  });

  it('uses absolute source times and does not silently rebase', () => {
    const shifted = found.words.map((word) => ({
      ...word,
      start: word.start + 20,
      end: word.end + 20,
    }));
    const { scene } = parse(found, {}, shifted, 20, 20 + found.durationSec);
    expect(scene).toMatchObject({
      setupAt: 20.3,
      actionAt: 21.5,
      responseAt: 23,
      checkAt: 26.8,
      resolveAt: 28.4,
    });
  });

  it.each([
    { preset: 'invented' },
    { sources: [] },
    { sources: null },
    { sources: [null] },
    { sources: [{ label: 'Unknown guide', excerpt: 'Returns last thirty days' }] },
    { sources: [{ label: 'Returns guide', excerpt: 'Returns last ninety days' }] },
    { sources: [{ label: 'x'.repeat(23), excerpt: 'Returns last thirty days' }] },
    { sources: [{ label: 'Returns guide', excerpt: 'x'.repeat(41) }] },
    { label: 'x'.repeat(33) },
    { subject: 'x'.repeat(25) },
    { outcome: 'x'.repeat(41) },
    { outcome: 'Guaranteed correct' },
    { outcome: 'Returns question' },
    { setupWord: -1 },
    { actionWord: 1.5 },
    { responseWord: Number.NaN },
    { checkWord: 999 },
    { resolveWord: Number.POSITIVE_INFINITY },
    { resolveWord: 0 },
    { condition: 'If invented' },
  ])('rejects invalid copy/counts/indices %j', (patch) => rejected(found, patch));

  it('requires all five beats, finite narration, spaced phases and a static final hold', () => {
    for (const field of fields) rejected(found, { [field]: undefined });
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const words = found.words.map((word, n) =>
        n === index(found.raw, 'checkWord') ? { ...word, start: invalid } : word,
      );
      expect(parse(found, {}, words).scene).toBeNull();
    }
    for (const time of [2, 3.2]) {
      const words = found.words.map((word, n) =>
        n === index(found.raw, 'checkWord') ? { ...word, start: time } : word,
      );
      expect(parse(found, {}, words).scene).toBeNull();
    }
    for (const endTime of [4.9, 12.1, 8.9, Number.NaN])
      expect(parse(found, {}, found.words, 0, endTime).scene).toBeNull();
  });

  it.each([
    [1, 'The question mentions the documents.'],
    [1, 'The question does not search the documents.'],
    [1, 'The question might search the documents.'],
    [2, 'Returns guide mentions the excerpt Returns last thirty days.'],
    [2, 'Returns guide supplies the irrelevant excerpt Returns last thirty days.'],
    [2, 'Returns guide never supplies the relevant excerpt Returns last thirty days.'],
    [3, 'The answer does not use this selected excerpt.'],
    [3, 'The answer uses an invented excerpt.'],
    [4, 'The answer drops its source reference.'],
    [4, 'The answer retains its source reference but guarantees correctness.'],
  ] as const)('rejects noun-only, negated or unsupported relationships at phase %s', (phase, text) => {
    rejected(rewrite(found, { [phase]: text }));
  });

  it('binds both excerpts to distinct named sources, not mere transcript presence', () => {
    rejected(two, {
      sources: [...two.scene.sources]
        .reverse()
        .map((source, i) => ({ ...source, excerpt: two.scene.sources[i].excerpt })),
    });
    rejected(two, { sources: [two.scene.sources[0], two.scene.sources[0]] });
    rejected(two, { sources: [two.scene.sources[0]] });
    rejected(
      rewrite(two, {
        2: 'Returns guide supplies the relevant excerpt Returns last thirty days. Shipping guide merely mentions Return shipping is free.',
      }),
    );
    rejected(
      rewrite(two, {
        2: 'Returns guide supplies the relevant excerpt Returns last thirty days. Shipping guide supplies the unrelated excerpt Return shipping is free.',
      }),
    );
    rejected(
      rewrite(two, {
        2: 'Returns guide supplies the relevant excerpt Returns last thirty days. Shipping guide does not supply the relevant excerpt Return shipping is free.',
      }),
    );
    rejected(
      rewrite(
        two,
        {
          2: 'Returns guide supplies the relevant excerpt Returns last thirty days. Shipping guide supplies the relevant excerpt Office opens Monday.',
        },
        {
          sources: [
            two.scene.sources[0],
            { label: 'Shipping guide', excerpt: 'Office opens Monday' },
          ],
        },
      ),
    );
    rejected(rewrite(two, { 3: 'The answer uses this selected excerpt.' }));
    rejected(
      rewrite(
        two,
        { 4: 'The answer retains one source reference.' },
        { outcome: 'Answer retains one source reference' },
      ),
    );
  });

  it('keeps no-match empty and refuses either invented evidence or an affirmative report', () => {
    rejected(empty, { sources: found.scene.sources });
    rejected(rewrite(empty, { 2: 'The search finds relevant evidence.' }));
    rejected(rewrite(empty, { 2: 'The search might find no relevant evidence.' }));
    rejected(rewrite(empty, { 3: 'The answer workspace contains an answer.' }));
    rejected(
      rewrite(
        empty,
        { 4: 'The answer reports correct evidence.' },
        { outcome: 'Answer reports correct evidence' },
      ),
    );
    rejected(empty, { outcome: 'evidence' });
  });

  it('does not extract a positive statement from negation or a citation as a truth guarantee', () => {
    rejected(rewrite(found, { 4: 'The answer never retains its source reference.' }));
    rejected(
      rewrite(
        found,
        { 0: 'Returns question. Guaranteed correct.' },
        { label: 'Guaranteed correct' },
      ),
    );
    rejected(found, { outcome: 'reference' });
  });

  it('retains the exact condition and rejects omissions or truncated conditions', () => {
    const conditional = rewrite(found, { 0: 'If the documents match, Returns question.' });
    rejected(conditional);
    rejected(conditional, { condition: 'If the documents' });
    const parsed = parse(conditional, { condition: 'if the documents match' });
    expect(parsed.ctx.issues).toEqual([]);
    expect(parsed.scene?.condition).toBe('If the documents match');
  });

  it('localizes negation instead of discarding a later supported search or negative quoted fact', () => {
    expect(
      parse(rewrite(found, { 0: 'The earlier search failed. Returns question.' })).scene,
    ).not.toBeNull();
    const negativeFact = rewrite(
      found,
      { 2: 'Returns guide supplies the relevant excerpt Returns are not free.' },
      { sources: [{ label: 'Returns guide', excerpt: 'Returns are not free' }] },
    );
    expect(parse(negativeFact).scene?.sources[0].excerpt).toBe('Returns are not free');
  });
});
