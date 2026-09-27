import { describe, expect, it } from 'vitest';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import { makeParseContext, type PlannerWord, type SceneWindow } from './kind-spec';
import {
  beforeAfterSpec,
  chartCalloutAt,
  chartSpec,
  chatSpec,
  DATA_KIND_SPECS,
  loopSpec,
  networkSpec,
} from './kinds-data';

// 30 words, one every 0.5s starting at 10s → word i starts at 10 + i*0.5.
const WORDS: PlannerWord[] = Array.from({ length: 30 }, (_, i) => ({
  text: `w${i}`,
  start: 10 + i * 0.5,
  end: 10 + i * 0.5 + 0.4,
}));
// Window: words 2..20 → 11s..20.4s (beats clamped to [11.3, 20.1]).
const WIN: SceneWindow = { startWord: 2, endWord: 20, startTime: 11, endTime: 20.4 };
const ctx = makeParseContext(WORDS, WIN);
const wordAt = (i: number): number => 10 + i * 0.5;
const CUE_KINDS: ReadonlySet<string> = new Set(SCENE_CUE_KINDS);

function expectSaneCues(cues: { kind: string; at: number; gain?: number }[]): void {
  expect(cues.length).toBeGreaterThan(0);
  for (const c of cues) {
    expect(CUE_KINDS.has(c.kind)).toBe(true);
    expect(Number.isFinite(c.at)).toBe(true);
    if (c.gain !== undefined) expect(c.gain).toBeGreaterThan(0);
    if (c.gain !== undefined) expect(c.gain).toBeLessThanOrEqual(1);
  }
  expect(cues.filter((c) => c.kind === 'thump').length).toBeLessThanOrEqual(1);
}

describe('DATA_KIND_SPECS', () => {
  it('registers exactly the five data kinds', () => {
    expect(DATA_KIND_SPECS.map((s) => s.kind)).toEqual([
      'before-after',
      'chart',
      'chat',
      'network',
      'loop',
    ]);
    for (const s of DATA_KIND_SPECS) {
      expect(s.layouts.length).toBeGreaterThan(0);
      expect(s.schema).toContain(`"kind":"${s.kind}"`);
    }
  });
});

describe('before-after spec', () => {
  const raw = {
    before: { title: 'Old way', points: ['Cold calls', 'Spreadsheets'] },
    after: { title: 'New way', points: ['AI follow-up'] },
    beforeWord: 4,
    wipeWord: 10,
  };

  it('parses and converts word indices to seconds', () => {
    const s = beforeAfterSpec.parse(raw, ctx);
    expect(s).toEqual({
      kind: 'before-after',
      before: raw.before,
      after: raw.after,
      beforeAt: wordAt(4),
      wipeAt: wordAt(10),
    });
  });

  it('keeps the wipe at least 0.8s after the before beat', () => {
    const s = beforeAfterSpec.parse({ ...raw, beforeWord: 8, wipeWord: 6 }, ctx);
    expect(s?.wipeAt).toBeCloseTo(wordAt(8) + 0.8);
  });

  it('rejects out-of-window words, long labels and bad point lists', () => {
    expect(beforeAfterSpec.parse({ ...raw, wipeWord: 25 }, ctx)).toBeNull();
    expect(beforeAfterSpec.parse({ ...raw, beforeWord: 1 }, ctx)).toBeNull();
    expect(
      beforeAfterSpec.parse({ ...raw, before: { title: 'x'.repeat(17), points: ['a'] } }, ctx),
    ).toBeNull();
    expect(
      beforeAfterSpec.parse({ ...raw, after: { title: 'New', points: ['y'.repeat(25)] } }, ctx),
    ).toBeNull();
    expect(beforeAfterSpec.parse({ ...raw, after: { title: 'New', points: [] } }, ctx)).toBeNull();
  });

  it('caps points at 3 and emits slide + whoosh', () => {
    const s = beforeAfterSpec.parse(
      { ...raw, before: { title: 'Old', points: ['a', 'b', 'c', 'd'] } },
      ctx,
    );
    expect(s?.before.points).toEqual(['a', 'b', 'c']);
    if (!s) throw new Error('parse failed');
    const cues = beforeAfterSpec.cues(s);
    expectSaneCues(cues);
    expect(cues.map((c) => c.kind)).toEqual(['slide', 'whoosh']);
    expect(cues[1]?.at).toBe(s.wipeAt);
  });
});

describe('chart spec', () => {
  const raw = {
    style: 'line',
    trend: 'up',
    title: 'Revenue',
    points: [
      { label: 'Jan', value: 10 },
      { label: 'Feb', value: 20 },
      { label: 'Mar', value: 45 },
    ],
    callout: '+350%',
    growWord: 6,
  };

  it('parses a valid chart', () => {
    const s = chartSpec.parse(raw, ctx);
    expect(s).toEqual({
      kind: 'chart',
      style: 'line',
      trend: 'up',
      title: 'Revenue',
      points: raw.points,
      callout: '+350%',
      growAt: wordAt(6),
    });
  });

  it('defaults style and infers trend from the data', () => {
    const s = chartSpec.parse(
      {
        ...raw,
        style: 'pie',
        trend: 'sideways',
        points: [...raw.points].reverse(),
        callout: null,
      },
      ctx,
    );
    expect(s?.style).toBe('bars');
    expect(s?.trend).toBe('down');
    expect(s && 'callout' in s).toBe(false);
  });

  it('rejects bad values, labels, counts and windows', () => {
    const pts = (v: unknown) => ({ ...raw, points: [...raw.points, { label: 'Apr', value: v }] });
    expect(chartSpec.parse(pts(-1), ctx)).toBeNull();
    expect(chartSpec.parse(pts(Number.NaN), ctx)).toBeNull();
    expect(chartSpec.parse(pts(Number.POSITIVE_INFINITY), ctx)).toBeNull();
    expect(chartSpec.parse(pts('5'), ctx)).toBeNull();
    expect(chartSpec.parse({ ...raw, points: raw.points.slice(0, 2) }, ctx)).toBeNull();
    expect(
      chartSpec.parse({ ...raw, points: raw.points.map((p) => ({ ...p, value: 0 })) }, ctx),
    ).toBeNull();
    expect(
      chartSpec.parse({ ...raw, points: [{ label: 'January', value: 1 }, ...raw.points] }, ctx),
    ).toBeNull();
    expect(chartSpec.parse({ ...raw, title: 'x'.repeat(23) }, ctx)).toBeNull();
    expect(chartSpec.parse({ ...raw, callout: '+1234567%' }, ctx)).toBeNull();
    expect(chartSpec.parse({ ...raw, growWord: 21 }, ctx)).toBeNull();
  });

  it('caps at 6 points', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ label: `Q${i}`, value: i + 1 }));
    expect(chartSpec.parse({ ...raw, points: many }, ctx)?.points).toHaveLength(6);
  });

  it('emits rise + pop on the callout', () => {
    const s = chartSpec.parse(raw, ctx);
    if (!s) throw new Error('parse failed');
    const cues = chartSpec.cues(s);
    expectSaneCues(cues);
    expect(cues).toEqual([
      { kind: 'rise', at: s.growAt, gain: 0.6 },
      { kind: 'pop', at: chartCalloutAt(s.growAt, 3), gain: 0.8 },
    ]);
    const noCallout = chartSpec.parse({ ...raw, callout: null }, ctx);
    if (!noCallout) throw new Error('parse failed');
    expect(chartSpec.cues(noCallout).map((c) => c.kind)).toEqual(['rise']);
  });
});

describe('chat spec', () => {
  const raw = {
    medium: 'sms',
    from: 'Sarah',
    messages: [
      { text: 'Are you free Tuesday?', side: 'them', word: 5 },
      { text: 'Yes! Booked.', side: 'me', word: 9 },
    ],
  };

  it('parses messages with beat times', () => {
    expect(chatSpec.parse(raw, ctx)).toEqual({
      kind: 'chat',
      medium: 'sms',
      from: 'Sarah',
      messages: [
        { text: 'Are you free Tuesday?', side: 'them', at: wordAt(5) },
        { text: 'Yes! Booked.', side: 'me', at: wordAt(9) },
      ],
    });
  });

  it('forces monotonic beats and defaults medium/side', () => {
    const s = chatSpec.parse(
      {
        medium: 'fax',
        from: 'Bob',
        messages: [
          { text: 'a', side: '??', word: 12 },
          { text: 'b', side: 'me', word: 6 },
        ],
      },
      ctx,
    );
    expect(s?.medium).toBe('sms');
    expect(s?.messages[0]?.side).toBe('them');
    expect(s?.messages.map((m) => m.at)).toEqual([wordAt(12), wordAt(12)]);
  });

  it('drops out-of-window / over-long messages and rejects when none remain', () => {
    const s = chatSpec.parse(
      {
        ...raw,
        messages: [...raw.messages, { text: 'x'.repeat(61), side: 'me', word: 12 }],
      },
      ctx,
    );
    expect(s?.messages).toHaveLength(2);
    expect(
      chatSpec.parse({ ...raw, messages: [{ text: 'hi', side: 'me', word: 22 }] }, ctx),
    ).toBeNull();
    expect(chatSpec.parse({ ...raw, from: 'x'.repeat(19) }, ctx)).toBeNull();
  });

  it('emits a soft pop per message', () => {
    const s = chatSpec.parse({ ...raw, medium: 'email' }, ctx);
    if (!s) throw new Error('parse failed');
    expect(s.medium).toBe('email');
    const cues = chatSpec.cues(s);
    expectSaneCues(cues);
    expect(cues).toEqual(s.messages.map((m) => ({ kind: 'pop', at: m.at, gain: 0.6 })));
  });
});

describe('network spec', () => {
  const raw = {
    hub: 'You',
    nodes: [
      { label: 'Sales', icon: 'Users', word: 4 },
      { label: 'CRM', icon: 'Database', word: 6 },
      { label: 'Ads', icon: 'NotAnIcon', word: 8 },
    ],
    connectAllWord: 14,
  };

  it('parses nodes, hub and connectAll', () => {
    const s = networkSpec.parse(raw, ctx);
    expect(s?.hub).toBe('You');
    expect(s?.nodes.map((n) => n.at)).toEqual([wordAt(4), wordAt(6), wordAt(8)]);
    expect(s?.nodes[2]?.icon).toBe('Circle');
    expect(s?.connectAllAt).toBe(wordAt(14));
  });

  it('keeps connectAll after the last node and handles optional fields', () => {
    const s = networkSpec.parse({ ...raw, connectAllWord: 5 }, ctx);
    expect(s?.connectAllAt).toBeCloseTo(wordAt(8) + 0.4);
    const bare = networkSpec.parse({ ...raw, hub: null, connectAllWord: null }, ctx);
    expect(bare && 'hub' in bare).toBe(false);
    expect(bare && 'connectAllAt' in bare).toBe(false);
  });

  it('rejects too few nodes, long labels and bad windows', () => {
    expect(networkSpec.parse({ ...raw, nodes: raw.nodes.slice(0, 2) }, ctx)).toBeNull();
    expect(networkSpec.parse({ ...raw, hub: 'x'.repeat(13) }, ctx)).toBeNull();
    expect(networkSpec.parse({ ...raw, connectAllWord: 29 }, ctx)).toBeNull();
    const longNode = { ...raw, nodes: [{ label: 'x'.repeat(15), word: 3 }, ...raw.nodes.slice(1)] };
    expect(networkSpec.parse(longNode, ctx)).toBeNull();
  });

  it('emits a tick per node + whoosh on connect', () => {
    const s = networkSpec.parse(raw, ctx);
    if (!s) throw new Error('parse failed');
    const cues = networkSpec.cues(s);
    expectSaneCues(cues);
    expect(cues.map((c) => c.kind)).toEqual(['tick', 'tick', 'tick', 'whoosh']);
  });
});

describe('loop spec', () => {
  const raw = {
    stages: [
      { label: 'Cue', word: 3 },
      { label: 'Routine', word: 6 },
      { label: 'Reward', word: 9 },
    ],
    center: 'Habit',
    spinWord: 15,
  };

  it('parses stages, centre and spin', () => {
    expect(loopSpec.parse(raw, ctx)).toEqual({
      kind: 'loop',
      stages: [
        { label: 'Cue', at: wordAt(3) },
        { label: 'Routine', at: wordAt(6) },
        { label: 'Reward', at: wordAt(9) },
      ],
      center: 'Habit',
      spinAt: wordAt(15),
    });
  });

  it('clamps beats into the window safe zone and keeps spin after stages', () => {
    const s = loopSpec.parse(
      {
        ...raw,
        stages: [
          { label: 'A', word: 2 },
          { label: 'B', word: 20 },
        ],
        spinWord: 20,
      },
      ctx,
    );
    expect(s?.stages[0]?.at).toBeCloseTo(11.3);
    expect(s?.stages[1]?.at).toBeCloseTo(wordAt(20));
    // spin wants lastStage + 0.3 but is clamped to the window's last safe beat.
    expect(s?.spinAt).toBeCloseTo(20.1);
    const early = loopSpec.parse({ ...raw, spinWord: 4 }, ctx);
    expect(early?.spinAt).toBeCloseTo(wordAt(9) + 0.3);
  });

  it('rejects invalid input', () => {
    expect(loopSpec.parse({ ...raw, spinWord: null }, ctx)).toBeNull();
    expect(loopSpec.parse({ ...raw, spinWord: 1.5 }, ctx)).toBeNull();
    expect(loopSpec.parse({ ...raw, center: 'x'.repeat(13) }, ctx)).toBeNull();
    expect(loopSpec.parse({ ...raw, stages: [{ label: 'Only', word: 3 }] }, ctx)).toBeNull();
    expect(
      loopSpec.parse({ ...raw, stages: [{ label: 'x'.repeat(15), word: 3 }, raw.stages[1]] }, ctx),
    ).toBeNull();
  });

  it('emits a tick per stage + whoosh at spin', () => {
    const s = loopSpec.parse(raw, ctx);
    if (!s) throw new Error('parse failed');
    const cues = loopSpec.cues(s);
    expectSaneCues(cues);
    expect(cues.map((c) => c.kind)).toEqual(['tick', 'tick', 'tick', 'whoosh']);
    expect(cues[3]?.at).toBe(s.spinAt);
  });
});
