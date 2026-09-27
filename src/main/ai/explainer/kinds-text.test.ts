import { describe, expect, it } from 'vitest';
import { SCENE_CUE_KINDS, type SceneCue } from '../../remotion/compositions/explainer/types';
import { makeParseContext, type PlannerWord, type SceneWindow } from './kind-spec';
import {
  notesSpec,
  numberSpec,
  questionSpec,
  statementSpec,
  TEXT_KIND_SPECS,
  timelineSpec,
} from './kinds-text';

// 60 words, 0.5 s apart: word i starts at 10 + i*0.5 s.
const WORDS: PlannerWord[] = Array.from({ length: 60 }, (_, i) => ({
  text: `w${i}`,
  start: 10 + i * 0.5,
  end: 10 + i * 0.5 + 0.4,
}));
const WIN: SceneWindow = { startWord: 10, endWord: 30, startTime: 15, endTime: 25.4 };
const ctx = makeParseContext(WORDS, WIN);
const t = (i: number): number => 10 + i * 0.5;

function saneCues(cues: SceneCue[]): void {
  expect(cues.length).toBeGreaterThan(0);
  for (const c of cues) {
    expect(SCENE_CUE_KINDS).toContain(c.kind);
    expect(Number.isFinite(c.at)).toBe(true);
    if (c.gain !== undefined) expect(c.gain).toBeGreaterThan(0);
  }
  expect(cues.filter((c) => c.kind === 'thump').length).toBeLessThanOrEqual(1);
}

describe('TEXT_KIND_SPECS', () => {
  it('registers exactly the five text kinds', () => {
    expect(TEXT_KIND_SPECS.map((s) => s.kind)).toEqual([
      'statement',
      'number',
      'timeline',
      'notes',
      'question',
    ]);
    for (const s of TEXT_KIND_SPECS) expect(s.layouts.length).toBeGreaterThan(0);
  });
});

describe('statement', () => {
  const raw = {
    words: [
      { text: 'Stop', word: 12 },
      { text: 'guessing', word: 13 },
    ],
    accentIndex: 1,
  };

  it('parses words with beat times from word indices', () => {
    expect(statementSpec.parse(raw, ctx)).toEqual({
      kind: 'statement',
      words: [
        { text: 'Stop', at: t(12) },
        { text: 'guessing', at: t(13) },
      ],
      accentIndex: 1,
    });
  });

  it('rejects out-of-window, over-long, multi-word and too many words', () => {
    expect(statementSpec.parse({ words: [{ text: 'Stop', word: 31 }] }, ctx)).toBeNull();
    expect(
      statementSpec.parse({ words: [{ text: 'Incomprehensibly', word: 12 }] }, ctx),
    ).toBeNull();
    expect(statementSpec.parse({ words: [{ text: 'Stop it', word: 12 }] }, ctx)).toBeNull();
    const four = ['a', 'b', 'c', 'd'].map((text, i) => ({ text, word: 12 + i }));
    expect(statementSpec.parse({ words: four }, ctx)).toBeNull();
    expect(statementSpec.parse({ words: [] }, ctx)).toBeNull();
  });

  it('forces monotonic beats and ignores a bad accent index', () => {
    const s = statementSpec.parse(
      {
        words: [
          { text: 'Ship', word: 15 },
          { text: 'it', word: 12 },
        ],
        accentIndex: 5,
      },
      ctx,
    );
    expect(s?.words.map((w) => w.at)).toEqual([t(15), t(15)]);
    expect(s?.accentIndex).toBeUndefined();
  });

  it('cues one thump on the accent word, else the last word', () => {
    const s = statementSpec.parse(raw, ctx);
    if (!s) throw new Error('parse failed');
    expect(statementSpec.cues(s)).toEqual([{ kind: 'thump', at: t(13) }]);
    expect(statementSpec.cues({ ...s, accentIndex: 0 })).toEqual([{ kind: 'thump', at: t(12) }]);
    const { accentIndex: _drop, ...noAccent } = s;
    expect(statementSpec.cues(noAccent)).toEqual([{ kind: 'thump', at: t(13) }]);
  });
});

describe('number', () => {
  const raw = {
    value: 40,
    prefix: '$',
    suffix: 'k',
    decimals: 0,
    label: 'more revenue',
    countWord: 12,
    landWord: 16,
  };

  it('parses value, affixes and count/land beats', () => {
    expect(numberSpec.parse(raw, ctx)).toEqual({
      kind: 'number',
      value: 40,
      prefix: '$',
      suffix: 'k',
      label: 'more revenue',
      countAt: t(12),
      landAt: t(16),
    });
  });

  it('keeps decimals and drops null affixes', () => {
    const s = numberSpec.parse({ ...raw, value: 2.5, prefix: null, suffix: 'x', decimals: 1 }, ctx);
    expect(s).toMatchObject({ value: 2.5, suffix: 'x', decimals: 1 });
    expect(s).not.toHaveProperty('prefix');
  });

  it('rejects invalid values, labels, affixes and windows', () => {
    for (const value of [0, -3, 1e9, 2e9, Number.NaN, Number.POSITIVE_INFINITY, '40']) {
      expect(numberSpec.parse({ ...raw, value }, ctx)).toBeNull();
    }
    expect(numberSpec.parse({ ...raw, value: 0.001, decimals: 0 }, ctx)).toBeNull();
    expect(numberSpec.parse({ ...raw, decimals: 3 }, ctx)).toBeNull();
    expect(numberSpec.parse({ ...raw, label: 'a much too long label here' }, ctx)).toBeNull();
    expect(numberSpec.parse({ ...raw, suffix: 'percent' }, ctx)).toBeNull();
    expect(numberSpec.parse({ ...raw, landWord: 31 }, ctx)).toBeNull();
    expect(numberSpec.parse({ ...raw, landWord: 5 }, ctx)).toBeNull();
  });

  it('keeps the count before the landing even when the words are swapped/equal', () => {
    const same = numberSpec.parse({ ...raw, countWord: 16, landWord: 16 }, ctx);
    expect(same?.landAt).toBe(t(16));
    expect((same?.landAt ?? 0) - (same?.countAt ?? 0)).toBeCloseTo(0.6);
    const swapped = numberSpec.parse({ ...raw, countWord: 18, landWord: 14 }, ctx);
    expect(swapped?.countAt).toBeLessThan(swapped?.landAt ?? 0);
    // Landing on the first word pushes the landing later, never before the window.
    const early = numberSpec.parse({ ...raw, countWord: 10, landWord: 10 }, ctx);
    expect(early?.countAt).toBeGreaterThanOrEqual(WIN.startTime);
    expect((early?.landAt ?? 0) - (early?.countAt ?? 0)).toBeCloseTo(0.6);
  });

  it('cues a rise on the count and a pop on the landing', () => {
    const s = numberSpec.parse(raw, ctx);
    if (!s) throw new Error('parse failed');
    const cues = numberSpec.cues(s);
    saneCues(cues);
    expect(cues.map((c) => c.kind)).toEqual(['rise', 'pop']);
    expect(cues[1]?.at).toBe(s.landAt);
  });
});

describe('timeline', () => {
  const raw = {
    steps: [
      { label: 'Discovery call', word: 12 },
      { label: 'Proposal', word: 16 },
      { label: 'Close', word: 20 },
    ],
  };

  it('parses 2-5 steps with beat times', () => {
    expect(timelineSpec.parse(raw, ctx)).toEqual({
      kind: 'timeline',
      steps: [
        { label: 'Discovery call', at: t(12) },
        { label: 'Proposal', at: t(16) },
        { label: 'Close', at: t(20) },
      ],
    });
  });

  it('rejects too few valid steps and over-long labels', () => {
    expect(timelineSpec.parse({ steps: [{ label: 'One', word: 12 }] }, ctx)).toBeNull();
    expect(
      timelineSpec.parse(
        {
          steps: [
            { label: 'A very long step label', word: 12 },
            { label: 'Out', word: 40 },
          ],
        },
        ctx,
      ),
    ).toBeNull();
  });

  it('caps at five steps and keeps beats monotonic', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ label: `S${i}`, word: 20 - i }));
    const s = timelineSpec.parse({ steps: many }, ctx);
    expect(s?.steps).toHaveLength(5);
    const ats = s?.steps.map((st) => st.at) ?? [];
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
  });

  it('cues one tick per dot', () => {
    const s = timelineSpec.parse(raw, ctx);
    if (!s) throw new Error('parse failed');
    const cues = timelineSpec.cues(s);
    saneCues(cues);
    expect(cues.map((c) => [c.kind, c.at])).toEqual(s.steps.map((st) => ['tick', st.at]));
  });
});

describe('notes', () => {
  const raw = {
    title: 'Human calls',
    badge: 'Human',
    lines: [
      { text: 'Qualify the lead', word: 12 },
      { text: 'Book the demo', word: 15 },
    ],
  };

  it('parses title, badge and timed lines', () => {
    expect(notesSpec.parse(raw, ctx)).toEqual({
      kind: 'notes',
      title: 'Human calls',
      badge: 'Human',
      lines: [
        { text: 'Qualify the lead', at: t(12) },
        { text: 'Book the demo', at: t(15) },
      ],
    });
  });

  it('treats a null badge as absent', () => {
    expect(notesSpec.parse({ ...raw, badge: null }, ctx)).not.toHaveProperty('badge');
  });

  it('rejects over-long title/badge/line and out-of-window lines', () => {
    expect(notesSpec.parse({ ...raw, title: 'A title that is far too long' }, ctx)).toBeNull();
    expect(notesSpec.parse({ ...raw, badge: 'Definitely human' }, ctx)).toBeNull();
    expect(
      notesSpec.parse(
        {
          ...raw,
          lines: [
            { text: 'This line is much too long to fit', word: 12 },
            { text: 'Book the demo', word: 15 },
          ],
        },
        ctx,
      ),
    ).toBeNull();
    expect(
      notesSpec.parse(
        {
          ...raw,
          lines: [
            { text: 'Qualify', word: 9 },
            { text: 'Book', word: 15 },
          ],
        },
        ctx,
      ),
    ).toBeNull();
  });

  it('cues a soft tick per line', () => {
    const s = notesSpec.parse(raw, ctx);
    if (!s) throw new Error('parse failed');
    const cues = notesSpec.cues(s);
    saneCues(cues);
    expect(cues).toHaveLength(2);
    for (const c of cues) {
      expect(c.kind).toBe('tick');
      expect(c.gain).toBeLessThan(1);
    }
  });
});

describe('question', () => {
  const raw = {
    question: 'Why do most funnels leak?',
    askWord: 12,
    answer: 'Nobody follows up',
    answerWord: 18,
  };

  it('parses question + answer beats', () => {
    expect(questionSpec.parse(raw, ctx)).toEqual({
      kind: 'question',
      question: 'Why do most funnels leak?',
      askAt: t(12),
      answer: 'Nobody follows up',
      answerAt: t(18),
    });
  });

  it('allows an unanswered question', () => {
    const s = questionSpec.parse({ ...raw, answer: null, answerWord: null }, ctx);
    expect(s).toEqual({ kind: 'question', question: raw.question, askAt: t(12) });
  });

  it('keeps the flip after the question', () => {
    const s = questionSpec.parse({ ...raw, answerWord: 11 }, ctx);
    expect(s?.answerAt).toBeCloseTo(t(12) + 0.8);
    // Question asked at the very end: no room for a flip, answer dropped.
    const late = questionSpec.parse({ ...raw, askWord: 30, answerWord: 30 }, ctx);
    expect(late).not.toHaveProperty('answer');
  });

  it('rejects over-long text and out-of-window asks', () => {
    expect(questionSpec.parse({ ...raw, question: 'x'.repeat(61) }, ctx)).toBeNull();
    expect(questionSpec.parse({ ...raw, answer: 'y'.repeat(41) }, ctx)).toBeNull();
    expect(questionSpec.parse({ ...raw, askWord: 31 }, ctx)).toBeNull();
  });

  it('cues a slide on ask and a flip on answer', () => {
    const s = questionSpec.parse(raw, ctx);
    if (!s) throw new Error('parse failed');
    const cues = questionSpec.cues(s);
    saneCues(cues);
    expect(cues.map((c) => [c.kind, c.at])).toEqual([
      ['slide', s.askAt],
      ['flip', s.answerAt],
    ]);
  });
});
