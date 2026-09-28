import { describe, expect, it } from 'vitest';
import {
  EXPLAINER_SCENE_KINDS,
  mapSceneTimes,
  SCENE_CUE_KINDS,
} from '../../remotion/compositions/explainer/types';
import { type AnyKindSpec, makeParseContext, type PlannerWord, type Rec } from './kind-spec';
import { ALL_KIND_SPECS, getKindSpec } from './kinds';
import { DOMINO_STEP_SEC } from './kinds-3d-objects';

// 40 words, 0.5 s apart: word i starts at 10 + i * 0.5.
const words: PlannerWord[] = Array.from({ length: 40 }, (_, i) => ({
  text: `w${i}`,
  start: 10 + i * 0.5,
  end: 10 + i * 0.5 + 0.4,
}));
// Window: words 4..24 → 12.0 s .. 22.4 s (beats clamped to [12.3, 22.1]).
const WIN = { startWord: 4, endWord: 24, startTime: 12, endTime: 22.4 };
const ctx = () => makeParseContext(words, WIN);
const CUE_SET = new Set<string>(SCENE_CUE_KINDS);

function spec(kind: string): AnyKindSpec {
  const s = getKindSpec(kind);
  if (!s) throw new Error(`no spec for ${kind}`);
  return s;
}

function parse(kind: string, raw: Rec) {
  const s = spec(kind);
  const p = s.parse as (r: Rec, c: ReturnType<typeof ctx>) => unknown;
  return p({ kind, ...raw }, ctx());
}

/** One valid raw example per v3 kind (word indices inside the window). */
const VALID: Record<string, Rec> = {
  equation: {
    terms: [
      { text: 'Consistency', word: 6 },
      { text: 'Time', word: 9 },
    ],
    ops: ['times'],
    result: 'Results',
    resultWord: 13,
  },
  quadrant: {
    xLabel: 'Effort',
    yLabel: 'Impact',
    items: [
      { label: 'Quick wins', cell: 'tl', word: 7 },
      { label: 'Big bets', cell: 'tr', word: 11 },
    ],
    winner: 'tl',
    winnerWord: 15,
  },
  venn: {
    left: { label: 'Passion', word: 6 },
    right: { label: 'Demand', word: 9 },
    center: { label: 'Business', word: 14 },
  },
  definition: {
    term: 'ROI',
    tag: 'finance',
    meaning: 'What you get back for every dollar in',
    termWord: 6,
    meaningWord: 9,
  },
  study: {
    source: 'Harvard, 2019',
    finding: 'Writing goals down doubles follow-through',
    stat: '2×',
    sourceWord: 6,
    findingWord: 10,
  },
  pictogram: { total: 4, filled: 1, stat: '1 in 4', label: 'founders quit', fillWord: 8 },
  ranking: {
    title: 'Best channels',
    items: [
      { label: 'Email', rank: 3, word: 6 },
      { label: 'SEO', rank: 2, word: 9 },
      { label: 'Referrals', rank: 1, word: 13 },
    ],
  },
  receipt: {
    title: 'Monthly costs',
    lines: [
      { label: 'Rent', amount: '$2,000', word: 6 },
      { label: 'Ads', amount: '$500', word: 9 },
    ],
    total: { label: 'Total', amount: '$2,500' },
    totalWord: 13,
  },
  streak: { days: 30, label: 'Post every day', fillWord: 6, doneWord: 12, missDay: 12 },
  spectrum: {
    left: 'Lazy',
    right: 'Burnt out',
    from: 0.1,
    to: 0.5,
    markerLabel: 'You',
    showWord: 6,
    moveWord: 10,
  },
  quote: {
    text: 'Play long-term games',
    author: 'Naval',
    role: 'Investor',
    word: 6,
    authorWord: 11,
  },
  headline: { outlet: 'Breaking', headline: 'AI startup raises $1B', word: 7 },
  journey: {
    points: [
      { label: 'Broke', level: -2, word: 6 },
      { label: 'First sale', level: 0, word: 10 },
      { label: 'Exit', level: 2, word: 15 },
    ],
  },
  search: { query: 'how to start a podcast', typeWord: 6, results: ['Step one'], resultsWord: 14 },
  code: {
    title: 'terminal',
    lines: [
      { text: 'npm run build', tone: 'plain', word: 6 },
      { text: 'retries: 3', tone: 'add', word: 10 },
    ],
  },
  iceberg: {
    top: { label: 'The launch', word: 6 },
    below: [
      { label: '1,000 drafts', word: 12 },
      { label: 'Five years', word: 16 },
    ],
    diveWord: 9,
  },
  balance: {
    left: { label: 'Risk', word: 6 },
    right: { label: 'Reward', word: 9 },
    heavier: 'right',
    tipWord: 13,
  },
  podium: {
    places: [
      { label: 'Bronze', rank: 3, word: 6 },
      { label: 'Silver', rank: 2, word: 9 },
      { label: 'Gold', rank: 1, word: 13 },
    ],
  },
  compound: {
    title: '$500 a month',
    points: [
      { label: 'Y1', value: 6 },
      { label: 'Y10', value: 90 },
      { label: 'Y30', value: 1200 },
    ],
    callout: '$1.2M',
    growWord: 7,
  },
  dominoes: {
    tiles: [
      { label: 'Sleep', word: 6 },
      { label: 'Energy', word: 8 },
      { label: 'Focus', word: 10 },
    ],
    fallWord: 13,
  },
  stairs: {
    steps: [
      { label: 'Learn', word: 6 },
      { label: 'Build', word: 10 },
      { label: 'Scale', word: 14 },
    ],
  },
};

const V3_KINDS = Object.keys(VALID);

describe('kind registry', () => {
  it('registers a spec for every scene kind, exactly once', () => {
    const kinds = ALL_KIND_SPECS.map((s) => s.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect([...kinds].sort()).toEqual([...EXPLAINER_SCENE_KINDS].sort());
  });

  it('gives every spec a family, layouts and sane durations', () => {
    for (const s of ALL_KIND_SPECS) {
      expect(s.layouts.length, s.kind).toBeGreaterThan(0);
      expect(s.durationSec[0], s.kind).toBeLessThan(s.durationSec[1]);
      expect(s.family, s.kind).toBeTruthy();
      // Every non-general kind must be reachable by the shortlist.
      if (!s.general) expect(s.triggers.length, s.kind).toBeGreaterThan(0);
    }
  });
});

describe.each(V3_KINDS)('v3 kind %s', (kind) => {
  it('parses a valid example into beats inside the window, in order', () => {
    const scene = parse(kind, VALID[kind] ?? {}) as { kind: string } | null;
    expect(scene).not.toBeNull();
    expect(scene?.kind).toBe(kind);
    const times: number[] = [];
    mapSceneTimes(scene as never, (t) => {
      times.push(t);
      return t;
    });
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(WIN.startTime);
      expect(t).toBeLessThanOrEqual(WIN.endTime);
    }
  });

  it('emits only known cue kinds inside the scene', () => {
    const s = spec(kind);
    const scene = parse(kind, VALID[kind] ?? {});
    const cues = (s.cues as (x: unknown) => { kind: string; at: number }[])(scene);
    expect(cues.length).toBeGreaterThan(0);
    for (const c of cues) {
      expect(CUE_SET.has(c.kind), c.kind).toBe(true);
      expect(c.at).toBeGreaterThanOrEqual(WIN.startTime - 0.5);
      expect(c.at).toBeLessThanOrEqual(WIN.endTime + 1);
    }
  });

  it('rejects an empty object', () => {
    expect(parse(kind, {})).toBeNull();
  });
});

describe('v3 kind details', () => {
  it('equation normalises operator words and adds one op per gap', () => {
    const s = parse('equation', {
      ...VALID.equation,
      terms: [
        { text: 'A', word: 6 },
        { text: 'B', word: 8 },
        { text: 'C', word: 10 },
      ],
      ops: ['plus'],
    });
    expect(s).toMatchObject({ ops: ['+', '+'] });
  });

  it('quadrant drops a second item in the same cell', () => {
    const s = parse('quadrant', {
      ...VALID.quadrant,
      items: [
        { label: 'A', cell: 'tl', word: 7 },
        { label: 'B', cell: 'tl', word: 9 },
      ],
    });
    expect(s).toMatchObject({ items: [{ label: 'A', cell: 'tl' }] });
  });

  it('pictogram rejects more filled than total and records why', () => {
    const c = ctx();
    const p = spec('pictogram').parse as (r: Rec, x: typeof c) => unknown;
    expect(p({ ...VALID.pictogram, total: 4, filled: 9 }, c)).toBeNull();
    expect(c.issues.join(' ')).toMatch(/filled/);
  });

  it('ranking re-numbers ranks densely (1..n)', () => {
    const s = parse('ranking', {
      items: [
        { label: 'A', rank: 5, word: 6 },
        { label: 'B', rank: 2, word: 9 },
      ],
    });
    expect(s).toMatchObject({
      items: [
        { label: 'A', rank: 2 },
        { label: 'B', rank: 1 },
      ],
    });
  });

  it('journey rejects a flat line', () => {
    expect(
      parse('journey', {
        points: [
          { label: 'a', level: 1, word: 6 },
          { label: 'b', level: 1, word: 8 },
          { label: 'c', level: 1, word: 10 },
        ],
      }),
    ).toBeNull();
  });

  it('iceberg reveals hidden layers only after the dive', () => {
    const s = parse('iceberg', {
      ...VALID.iceberg,
      below: [{ label: 'Early', word: 5 }],
      diveWord: 12,
    }) as { diveAt: number; below: { at: number }[] } | null;
    expect(s).not.toBeNull();
    expect(s?.below[0]?.at).toBeGreaterThan(s?.diveAt ?? 0);
  });

  it('dominoes leave time for the whole chain to fall', () => {
    const s = parse('dominoes', { ...VALID.dominoes, fallWord: 24 }) as {
      fallAt: number;
      tiles: unknown[];
    } | null;
    expect(s).not.toBeNull();
    const chainEnd = (s?.fallAt ?? 0) + ((s?.tiles.length ?? 0) - 1) * DOMINO_STEP_SEC;
    expect(chainEnd).toBeLessThanOrEqual(WIN.endTime);
  });

  it('records a readable issue for an over-long label', () => {
    const c = ctx();
    const p = spec('venn').parse as (r: Rec, x: typeof c) => unknown;
    p(
      {
        left: { label: 'x'.repeat(40), word: 6 },
        right: { label: 'b', word: 9 },
        center: { label: 'c', word: 14 },
      },
      c,
    );
    expect(c.issues[0]).toMatch(/40 chars \(max 14\)/);
  });

  it('records an issue for a word outside the window', () => {
    const c = ctx();
    const p = spec('headline').parse as (r: Rec, x: typeof c) => unknown;
    expect(p({ outlet: 'News', headline: 'Hi', word: 30 }, c)).toBeNull();
    expect(c.issues[0]).toMatch(/word 30 is outside/);
  });
});
