import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ContextWindowScene,
  TECHNOLOGY_WORD_FIELDS,
} from '../../remotion/compositions/explainer/technology/types';
import { makeParseContext, type PlannerWord, type Rec } from './kind-spec';
import { CONTEXT_WINDOW_SPEC } from './kinds-context-window';

interface Fixture {
  name: string;
  sourceText: string;
  wordStepSec: number;
  durationSec: number;
  raw: Rec & { startWord: number; endWord: number };
  scene: ContextWindowScene;
  cases: { name: string; layout: string; aspect: string }[];
  covers: { category: string; id: string }[];
  samples: { name: string; frame: number }[];
}
const fixtures: Fixture[] = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/technology-context-window.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const [overflow, summary, retrieval] = fixtures;
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

function source(fixture: Fixture, offset = 0) {
  const words = fixture.sourceText.split(/\s+/).map((text, i) => ({
    text,
    start: round(offset + i * fixture.wordStepSec),
    end: round(offset + (i + 0.9) * fixture.wordStepSec),
  }));
  const win = {
    startWord: fixture.raw.startWord,
    endWord: fixture.raw.endWord,
    startTime: offset,
    endTime: offset + fixture.durationSec,
  };
  return { words, win, ctx: makeParseContext(words, win) };
}

/** Reindex changed narration without accidentally failing on stale indices or crowded beats. */
function narrated(
  fixture: Fixture,
  changes: Record<number, string> = {},
  patch: Rec = {},
  prefix = '',
) {
  const sentences = fixture.sourceText.match(/[^.!?]+[.!?]/g)?.map((text) => text.trim());
  if (!sentences || sentences.length !== 5) throw new Error('fixture needs five narrated phases');
  const words: PlannerWord[] = [];
  const raw: Rec = { ...fixture.raw, ...patch };
  const offset = prefix ? 1.2 : 0;
  if (prefix) {
    const tokens = prefix.split(/\s+/);
    for (const [index, text] of tokens.entries()) {
      words.push({ text, start: index / tokens.length, end: (index + 0.9) / tokens.length });
    }
  }
  const beats = [
    0,
    fixture.scene.actionAt,
    fixture.scene.responseAt,
    fixture.scene.checkAt,
    fixture.scene.resolveAt,
    fixture.durationSec,
  ];
  for (const [phase, sentence] of sentences.entries()) {
    const tokens = (changes[phase] ?? sentence).split(/\s+/);
    raw[TECHNOLOGY_WORD_FIELDS[phase]] = words.length;
    const step = (beats[phase + 1] - beats[phase]) / tokens.length;
    for (const [i, text] of tokens.entries()) {
      words.push({
        text,
        start: round(offset + beats[phase] + i * step),
        end: round(offset + beats[phase] + (i + 0.9) * step),
      });
    }
  }
  raw.endWord = words.length - 1;
  const ctx = makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: offset + fixture.durationSec,
  });
  return { raw, ctx, scene: CONTEXT_WINDOW_SPEC.parse(raw, ctx) };
}

describe('context-window actual fixture parser contract', () => {
  it.each(
    fixtures,
  )('parses $name directly from its timed narration and exact raw metadata', (fixture) => {
    const { words, ctx } = source(fixture);
    expect(fixture.raw.endWord).toBe(words.length - 1);
    expect(CONTEXT_WINDOW_SPEC.parse(fixture.raw, ctx), ctx.issues.join('; ')).toEqual(
      fixture.scene,
    );
    expect(ctx.issues).toEqual([]);
    expect(fixture.name).toBe(`context-window-${fixture.scene.preset}`);
    expect(fixture.durationSec).toBeGreaterThanOrEqual(5);
    expect(fixture.durationSec).toBeLessThanOrEqual(12);
    expect(fixture.durationSec - fixture.scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    expect(fixture.covers).toEqual(
      expect.arrayContaining([
        { category: 'kind', id: 'context-window' },
        { category: 'technology', id: `context-window/${fixture.scene.preset}` },
      ]),
    );
    expect(fixture.cases).toEqual(
      expect.arrayContaining([
        { name: 'vertical-stack', layout: 'stack', aspect: '9:16' },
        { name: 'landscape-over', layout: 'over', aspect: '16:9' },
      ]),
    );
    const frames = fixture.samples.map((sample) => sample.frame);
    for (const beat of [fixture.scene.responseAt, fixture.scene.checkAt]) {
      const contact = Math.round(beat * 30);
      expect(frames).toEqual(expect.arrayContaining([contact - 1, contact, contact + 1]));
    }
    expect(fixture.samples.filter((sample) => sample.name.startsWith('final-hold')).length).toBe(2);
    for (const frame of frames) expect(frame).toBeLessThan(fixture.durationSec * 30);
  });

  it.each(fixtures)('preserves nonzero absolute source timestamps: $name', (fixture) => {
    const { ctx } = source(fixture, 20);
    const scene = CONTEXT_WINDOW_SPEC.parse(fixture.raw, ctx);
    expect(scene, ctx.issues.join('; ')).toEqual({
      ...fixture.scene,
      setupAt: round(fixture.scene.setupAt + 20),
      actionAt: round(fixture.scene.actionAt + 20),
      responseAt: round(fixture.scene.responseAt + 20),
      checkAt: round(fixture.scene.checkAt + 20),
      resolveAt: round(fixture.scene.resolveAt + 20),
    });
  });

  it.each(fixtures)('emits only sparse existing contact cues: $name', (fixture) => {
    const { ctx } = source(fixture);
    const scene = CONTEXT_WINDOW_SPEC.parse(fixture.raw, ctx);
    expect(scene).not.toBeNull();
    if (!scene) throw new Error(ctx.issues.join('; '));
    expect(CONTEXT_WINDOW_SPEC.cues(scene)).toEqual([
      { kind: 'slide', at: fixture.scene.responseAt, gain: 0.22 },
      { kind: 'tick', at: fixture.scene.checkAt, gain: 0.25 },
    ]);
  });

  it.each([
    'stack',
    'stack-flipped',
    'takeover',
    'over',
  ])('accepts only authored technology layout %s', (layout) => {
    const { ctx } = source(overflow);
    expect(CONTEXT_WINDOW_SPEC.parse({ ...overflow.raw, layout }, ctx)).not.toBeNull();
  });

  it.each([
    { preset: 'compression' },
    { layout: 'pip' },
    { layout: 'grid' },
    { label: 'invented claim' },
    { label: 'x'.repeat(33) },
    { subject: 'new magic context' },
    { outcome: 'All context is remembered' },
    { detailLabel: 'newest detail' },
    { detailLabel: 'oldest detail outside now' },
    { memoryLabel: 'a non-existent archive' },
    { memoryLabel: 'x'.repeat(23) },
    { summaryLabel: 'working window' },
    { condition: 'If it works' },
  ])('rejects invalid source labels, branch fields or layout: %j', (patch) => {
    const { ctx } = source(overflow);
    expect(CONTEXT_WINDOW_SPEC.parse({ ...overflow.raw, ...patch }, ctx)).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });

  it.each([
    { summaryLabel: undefined },
    { summaryLabel: 'invented summary' },
    { summaryLabel: 'x'.repeat(23) },
    { subject: 'Brief summary' },
  ])('requires source-backed summary identity only on summarisation: %j', (patch) => {
    const { ctx } = source(summary);
    expect(CONTEXT_WINDOW_SPEC.parse({ ...summary.raw, ...patch }, ctx)).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });

  it.each(
    TECHNOLOGY_WORD_FIELDS,
  )('requires an explicit finite integer %s in the scene', (field) => {
    for (const value of [undefined, -1, 999, 1.5, '3', Number.NaN, Number.POSITIVE_INFINITY]) {
      const { ctx } = source(overflow);
      expect(CONTEXT_WINDOW_SPEC.parse({ ...overflow.raw, [field]: value }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects reversed/compressed source beats, non-finite times, invalid duration and short final hold', () => {
    for (const patch of [
      { responseWord: 4 },
      { responseWord: 5 },
      { responseWord: 6 },
      { resolveWord: 18 },
    ]) {
      const { ctx } = source(overflow);
      expect(CONTEXT_WINDOW_SPEC.parse({ ...overflow.raw, ...patch }, ctx)).toBeNull();
    }
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1, 99]) {
      const { words, win } = source(overflow);
      words[11].start = invalid;
      expect(CONTEXT_WINDOW_SPEC.parse(overflow.raw, makeParseContext(words, win))).toBeNull();
    }
    for (const endTime of [
      4.9,
      12.1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      overflow.scene.resolveAt + 0.79,
    ]) {
      const { words, win } = source(overflow);
      expect(
        CONTEXT_WINDOW_SPEC.parse(overflow.raw, makeParseContext(words, { ...win, endTime })),
      ).toBeNull();
    }
    const { words, win } = source(overflow);
    words[7].end = Number.NaN;
    expect(CONTEXT_WINDOW_SPEC.parse(overflow.raw, makeParseContext(words, win))).toBeNull();
  });
});

describe('context-window relationships, not buzzwords', () => {
  it.each([
    [overflow, 0, 'The working window is not full.'],
    [overflow, 1, 'New context never enters the working window.'],
    [overflow, 1, 'New context mentions the working window.'],
    [overflow, 2, 'The oldest detail does not leave the working window.'],
    [overflow, 2, 'The oldest detail leaves the archive.'],
    [overflow, 3, 'Stored data is deleted from the archive.'],
    [overflow, 4, 'Stored data remains in the archive is a false claim.'],
    [summary, 0, 'Detailed context mentions the working window.'],
    [summary, 1, 'Brief summary might replace detailed context in the working window.'],
    [summary, 1, 'Brief summary describes detailed context in the working window.'],
    [summary, 2, 'Brief summary keeps key points but omits no detail.'],
    [summary, 2, 'Brief summary keeps key points.'],
    [summary, 2, 'Brief summary keeps all detail.'],
    [summary, 4, 'Brief summary never omits some detail.'],
    [retrieval, 0, 'A question mentions earlier context.'],
    [retrieval, 1, 'Retrieval selects an irrelevant budget note from stored notes in the archive.'],
    [retrieval, 1, 'Retrieval mentions a relevant budget note from stored notes in the archive.'],
    [retrieval, 1, 'Retrieval selects a relevant budget note from stored notes in the window.'],
    [retrieval, 2, 'Retrieval never brings budget note back into the working window.'],
    [retrieval, 2, 'Retrieval brings a different note back into the working window.'],
    [retrieval, 3, 'Stored notes do not remain in the archive.'],
    [retrieval, 4, 'Budget note is not back in the window.'],
    [retrieval, 4, 'Budget note is back in the window is only a hope.'],
  ] satisfies [
    Fixture,
    number,
    string,
  ][])('rejects unsupported phase %s / %s / %s', (fixture, phase, sentence) => {
    const { scene, ctx } = narrated(fixture, { [phase]: sentence });
    expect(scene).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });

  it.each([
    'The archive deletes stored data.',
    'Stored data is erased.',
    'The working window is unlimited.',
    'Brief summary is lossless.',
    'Brief summary preserves all detail.',
    'Brief summary preserves all details.',
    'All details are retained.',
    'No detail is lost.',
    'No details are lost.',
    'Brief summary does not omit any detail.',
    'Brief summary does not omit any details.',
    'Retrieval recalls everything.',
    'Retrieval restores all context.',
    'Retrieval restores all memories.',
    'The archive is not empty, yet stored data is deleted.',
  ])('rejects contradictory harmful claims even beside valid relationships: %s', (claim) => {
    const { scene, ctx } = narrated(summary, { 3: `Stored notes remain in the archive. ${claim}` });
    expect(scene).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });

  it('does not launder an outcome quoted from a negated clause', () => {
    const { scene, ctx } = narrated(overflow, {
      4: 'It is not true that Stored data remains in the archive.',
    });
    expect(scene).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });

  it('accepts an earlier failed attempt and a local anti-deletion explanation', () => {
    const { scene, ctx } = narrated(
      overflow,
      { 3: 'Stored data stays in the separate archive and is not deleted.' },
      {},
      'Earlier retrieval failed.',
    );
    expect(scene, ctx.issues.join('; ')).not.toBeNull();
  });

  it('does not mistake a negated lossless claim for a promise of lossless compression', () => {
    const { scene, ctx } = narrated(summary, {
      3: 'Stored notes remain in the archive. Brief summary is not lossless.',
    });
    expect(scene, ctx.issues.join('; ')).not.toBeNull();
  });

  it('requires the complete exact source condition and retains it visibly', () => {
    const changes = { 0: 'If the archive is available, the working window is full.' };
    expect(narrated(overflow, changes).scene).toBeNull();
    expect(narrated(overflow, changes, { condition: 'If the archive' }).scene).toBeNull();
    expect(
      narrated(overflow, changes, { condition: 'If the archive is unavailable' }).scene,
    ).toBeNull();
    const { scene, ctx } = narrated(overflow, changes, {
      condition: 'If the archive is available',
    });
    expect(scene, ctx.issues.join('; ')).toMatchObject({
      condition: 'If the archive is available',
    });
    expect(
      narrated(
        overflow,
        { ...changes, 3: 'If storage works, stored data stays in the separate archive.' },
        { condition: 'If the archive is available' },
      ).scene,
    ).toBeNull();
  });
});
