import { describe, expect, it } from 'vitest';
import { mapSceneTimes } from '../../remotion/compositions/explainer/types';
import {
  buildExplainerPrompt,
  parseExplainerPlan,
  parsePlanWithRejections,
} from '../explainer-scenes';
import type { PlannerWord, Rec } from './kind-spec';
import { getKindSpec } from './kinds';

const words: PlannerWord[] =
  'Orders pile up behind the approval gate until we open it and clear the waiting queue today'
    .split(' ')
    .map((text, i) => ({ text, start: 10 + i * 0.4, end: 10 + i * 0.4 + 0.3 }));
const bounds = { minStart: 0, maxEnd: 60 };
const candidate: Rec = {
  kind: 'bottleneck',
  startWord: 0,
  endWord: words.length - 1,
  label: 'Approval gate',
  feedWord: 0,
  queueWord: 3,
  openWord: 9,
  clearWord: 12,
};

function plan(patch: Rec = {}, source = words, limits = bounds) {
  return parseExplainerPlan({ scenes: [{ ...candidate, ...patch }] }, source, limits);
}

function rejected(patch: Rec = {}, source = words, limits = bounds) {
  expect(plan(patch, source, limits)).toEqual([]);
  const failures = parsePlanWithRejections(
    { scenes: [{ ...candidate, ...patch }] },
    source,
    limits,
  );
  expect(failures).toHaveLength(1);
  expect(failures[0].problems.length).toBeGreaterThan(0);
  expect(failures[0].problems.length).toBeLessThanOrEqual(4);
  return failures[0].problems.join(' ');
}

function withTimes(times: readonly number[]): PlannerWord[] {
  const indexes = [0, 3, 9, 12];
  return words.map((word, i) => {
    const n = indexes.indexOf(i);
    return n < 0 ? { ...word } : { ...word, start: times[n], end: times[n] + 0.3 };
  });
}

describe('multipart bottleneck through the production planner parser', () => {
  it.each([
    undefined,
    4,
    6,
    8,
  ])('parses tokenCount %s with absolute beats and three quiet cues', (tokenCount) => {
    const result = plan({ tokenCount });
    expect(result).toHaveLength(1);
    const p = result[0];
    expect(p.scene).toEqual({
      kind: 'bottleneck',
      label: 'Approval gate',
      tokenCount: tokenCount ?? 6,
      feedAt: 10.05, // Normal first-beat safe clamp from source 10.
      queueAt: 11.2,
      openAt: 13.6,
      clearAt: 14.8,
    });
    expect(p.cues).toEqual([
      { kind: 'slide', at: 10.05, gain: 0.4 },
      { kind: 'tick', at: 13.6, gain: 0.6 },
      { kind: 'pop', at: 14.8, gain: 0.6 },
    ]);
    const rebased = mapSceneTimes(p.scene, (t) => t - p.startTime);
    expect(rebased.kind).toBe('bottleneck');
    if (rebased.kind !== 'bottleneck') throw new Error('wrong kind');
    expect(rebased.feedAt).toBeCloseTo(0.3);
    expect(rebased.queueAt).toBeCloseTo(1.45);
    expect(rebased.openAt).toBeCloseTo(3.85);
    expect(rebased.clearAt).toBeCloseTo(5.05);
    expect(rebased.tokenCount).toBe(tokenCount ?? 6);
    expect(p.scene).not.toEqual(rebased);
  });

  it.each([
    ['-50%', '50%'],
    ['50%', '50'],
    ['-$50', '$50'],
  ])('does not change a spoken signed amount or unit: %s to %s', (spoken, label) => {
    const source = words.map((word, index) => (index === 5 ? { ...word, text: spoken } : word));
    expect(rejected({ label }, source)).toContain('label must quote');
    expect(plan({ label: spoken }, source)).toHaveLength(1);
  });

  it('accepts exact phase minima and exactly half a second of final hold', () => {
    const source = withTimes([10, 10.5, 11, 11.8]).map((w, i) => {
      if (i === 0) return { ...w, start: 9.25 };
      if (i === 1) return { ...w, start: 10.05 };
      return w;
    });
    expect(plan({ feedWord: 1 }, source, { minStart: 0, maxEnd: 12.3 })).toHaveLength(1);
  });

  it.each(['stack', 'stack-flipped', 'over'])('permits layout %s', (layout) => {
    expect(plan({ layout })[0].layout).toBe(layout);
  });

  it('uses the registry for layout fallback, prompt rules and object family', () => {
    expect(plan({ layout: 'takeover' })[0].layout).toBe('stack');
    expect(getKindSpec('bottleneck')).toMatchObject({ family: 'object', durationSec: [3, 8] });
    const prompt = buildExplainerPrompt(words, bounds);
    expect(prompt).toContain('"kind":"bottleneck"');
    expect(prompt).toContain('openAt-0.3s');
    expect(prompt).toContain('openAt+0.05s');
    expect(prompt).toContain('0.45/0.5/0.8s');
  });

  it.each([
    { feedWord: undefined },
    { queueWord: null },
    { openWord: '9' },
    { clearWord: 12.5 },
    { feedWord: -1 },
    { clearWord: 100 },
    { openWord: Number.NaN },
    { openWord: Number.POSITIVE_INFINITY },
    { startWord: 1.5 },
    { endWord: 100 },
  ])('rejects missing or malformed source indexes: %j', (patch) => {
    expect(rejected(patch)).toMatch(/word|index|indices/i);
  });

  it.each([
    { feedWord: 3, queueWord: 0 },
    { queueWord: 9, openWord: 3 },
    { clearWord: 3 },
    { openWord: 3 },
  ])('rejects reversed or repeated source indexes: %j', (patch) => {
    expect(rejected(patch)).toContain('source index order');
  });

  it.each([
    0,
    5,
    7,
    10,
    6.5,
    '6',
    null,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects unsupported tokenCount %s rather than coercing it', (tokenCount) => {
    expect(rejected({ tokenCount })).toContain('tokenCount');
  });

  it.each([
    '',
    'x'.repeat(27),
    'Gate opens 10x faster',
    'Revenue doubles',
    'proval gate',
  ])('rejects ungrounded or invalid labels: %s', (label) => {
    expect(rejected({ label })).toContain('label');
  });

  it('normalizes label whitespace, punctuation and case but requires this window', () => {
    expect(plan({ label: 'Approval' })).toHaveLength(1);
    expect(plan({ label: '  APPROVAL—\tgate!  ' })[0].scene).toMatchObject({
      label: 'APPROVAL— gate!',
    });
    const source = [{ text: 'Profit', start: 0, end: 0.3 }, ...words];
    expect(
      rejected(
        {
          startWord: 1,
          endWord: 17,
          feedWord: 1,
          queueWord: 4,
          openWord: 10,
          clearWord: 13,
          label: 'Profit',
        },
        source,
      ),
    ).toContain('scene window');
  });

  it.each([
    [10, 10.49, 11.5, 12.5], // First clamp makes feed → queue too short.
    [10, 11, 11.49, 12.5],
    [10, 11, 12, 12.79],
    [10, 11, 10.9, 13], // Ordered indexes but reversed source timestamps.
    [10, 11, 11, 13],
  ])('rejects compressed/reversed source times %j', (...times) => {
    expect(rejected({}, withTimes(times))).toMatch(/compressed|strictly increase/);
  });

  it('rejects a late clear instead of clamping it into the last frame', () => {
    expect(rejected({}, withTimes([10, 11, 13, 16.6]))).toContain('final hold');
    expect(rejected({}, words, { minStart: 0, maxEnd: 15 })).toContain('final hold');
  });

  it('enforces the 3..8 second scene window', () => {
    expect(rejected({}, withTimes([10, 10.5, 11, 11.8]), { minStart: 0, maxEnd: 12.35 })).toContain(
      '3..8s',
    );
    const long = words.map((w, i) => (i === words.length - 1 ? { ...w, end: 19 } : w));
    expect(rejected({}, long)).toContain('3..8s');
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects nonfinite source times %s, including non-beat and boundary words', (bad) => {
    for (const i of [0, 3, 7, words.length - 1]) {
      for (const field of ['start', 'end'] as const) {
        const source = words.map((w, n) => (n === i ? { ...w, [field]: bad } : w));
        expect(rejected({}, source)).toMatch(/finite|valid indices/);
      }
    }
  });
});
