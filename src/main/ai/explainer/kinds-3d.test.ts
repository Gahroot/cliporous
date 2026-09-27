import { describe, expect, it } from 'vitest';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import { makeParseContext, type PlannerWord } from './kind-spec';
import {
  COIN_LAND_SEC,
  funnelSpec,
  heroSpec,
  LOCK_CLICK_SEC,
  mythFactSpec,
  THREE_D_KIND_SPECS,
} from './kinds-3d';

// 40 words, 0.5 s apart: word i starts at 10 + i * 0.5.
const words: PlannerWord[] = Array.from({ length: 40 }, (_, i) => ({
  text: `w${i}`,
  start: 10 + i * 0.5,
  end: 10 + i * 0.5 + 0.4,
}));
// Window: words 4..24 → 12.0 s .. 22.4 s (beats clamped to [12.3, 22.1]).
const ctx = makeParseContext(words, { startWord: 4, endWord: 24, startTime: 12, endTime: 22.4 });
const CUE_SET = new Set<string>(SCENE_CUE_KINDS);

describe('THREE_D_KIND_SPECS', () => {
  it('registers exactly myth-fact, funnel, hero', () => {
    expect(THREE_D_KIND_SPECS.map((s) => s.kind)).toEqual(['myth-fact', 'funnel', 'hero']);
  });
});

describe('mythFactSpec', () => {
  it('parses and converts word indices to seconds', () => {
    const s = mythFactSpec.parse(
      { myth: 'You need more ads', fact: 'You need better offers', mythWord: 6, flipWord: 12 },
      ctx,
    );
    expect(s).toEqual({
      kind: 'myth-fact',
      myth: 'You need more ads',
      fact: 'You need better offers',
      mythAt: 13,
      flipAt: 16,
    });
  });

  it('pushes the flip at least 1 s after the myth (monotonic beats)', () => {
    const s = mythFactSpec.parse({ myth: 'a', fact: 'b', mythWord: 10, flipWord: 8 }, ctx);
    expect(s?.flipAt).toBeCloseTo(16);
    expect(s && s.flipAt > s.mythAt).toBe(true);
  });

  it('rejects out-of-window indices, over-long text and missing fields', () => {
    expect(mythFactSpec.parse({ myth: 'a', fact: 'b', mythWord: 2, flipWord: 12 }, ctx)).toBeNull();
    expect(mythFactSpec.parse({ myth: 'a', fact: 'b', mythWord: 6, flipWord: 30 }, ctx)).toBeNull();
    expect(
      mythFactSpec.parse({ myth: 'x'.repeat(49), fact: 'b', mythWord: 6, flipWord: 12 }, ctx),
    ).toBeNull();
    expect(
      mythFactSpec.parse({ myth: 'a', fact: 'y'.repeat(49), mythWord: 6, flipWord: 12 }, ctx),
    ).toBeNull();
    expect(mythFactSpec.parse({ myth: 'a', mythWord: 6, flipWord: 12 }, ctx)).toBeNull();
  });

  it('rejects when there is no room to read the myth before the flip', () => {
    // Myth on the last word: flip is clamped to lastBeat → gap too small.
    expect(
      mythFactSpec.parse({ myth: 'a', fact: 'b', mythWord: 24, flipWord: 24 }, ctx),
    ).toBeNull();
  });

  it('cues: slide on the myth, flip then a soft thump on the flip', () => {
    const cues = mythFactSpec.cues({
      kind: 'myth-fact',
      myth: 'a',
      fact: 'b',
      mythAt: 1,
      flipAt: 3,
    });
    expect(cues.map((c) => c.kind)).toEqual(['slide', 'flip', 'thump']);
    const thump = cues.find((c) => c.kind === 'thump');
    expect(thump?.gain).toBe(0.6);
    expect(thump && thump.at >= 3).toBe(true);
  });
});

describe('funnelSpec', () => {
  const stages = [
    { label: 'Leads', word: 5 },
    { label: 'Calls', word: 9 },
    { label: 'Deals', word: 13 },
  ];

  it('parses stages + result with seconds', () => {
    const s = funnelSpec.parse({ stages, result: '12 clients', resultWord: 18 }, ctx);
    expect(s).toEqual({
      kind: 'funnel',
      stages: [
        { label: 'Leads', at: 12.5 },
        { label: 'Calls', at: 14.5 },
        { label: 'Deals', at: 16.5 },
      ],
      result: '12 clients',
      resultAt: 19,
    });
  });

  it('makes stage beats monotonic and keeps the result after the last stage', () => {
    const s = funnelSpec.parse(
      {
        stages: [
          { label: 'A', word: 12 },
          { label: 'B', word: 8 },
        ],
        result: 'R',
        resultWord: 6,
      },
      ctx,
    );
    expect(s?.stages.map((x) => x.at)).toEqual([16, 16]);
    expect(s?.resultAt).toBeCloseTo(16.5);
  });

  it('accepts a null result, drops a result without a valid word', () => {
    expect(funnelSpec.parse({ stages, result: null, resultWord: null }, ctx)).not.toHaveProperty(
      'result',
    );
    expect(funnelSpec.parse({ stages, result: 'R', resultWord: 99 }, ctx)).not.toHaveProperty(
      'result',
    );
  });

  it('rejects too few stages, over-long labels and over-long results', () => {
    expect(funnelSpec.parse({ stages: stages.slice(0, 1) }, ctx)).toBeNull();
    expect(
      funnelSpec.parse({ stages: [{ label: 'x'.repeat(15), word: 5 }, stages[1]] }, ctx),
    ).toBeNull();
    expect(funnelSpec.parse({ stages, result: 'r'.repeat(17), resultWord: 18 }, ctx)).toBeNull();
    // Out-of-window stage words are skipped → too few stages left.
    expect(
      funnelSpec.parse(
        {
          stages: [
            { label: 'A', word: 1 },
            { label: 'B', word: 30 },
            { label: 'C', word: 6 },
          ],
        },
        ctx,
      ),
    ).toBeNull();
  });

  it('keeps at most 4 stages', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ label: `S${i}`, word: 5 + i }));
    expect(funnelSpec.parse({ stages: many }, ctx)?.stages).toHaveLength(4);
  });

  it('cues: a tick per stage, a pop on the result', () => {
    const cues = funnelSpec.cues({
      kind: 'funnel',
      stages: [
        { label: 'A', at: 1 },
        { label: 'B', at: 2 },
      ],
      result: 'R',
      resultAt: 3,
    });
    expect(cues.map((c) => [c.kind, c.at])).toEqual([
      ['tick', 1],
      ['tick', 2],
      ['pop', 3],
    ]);
  });
});

describe('heroSpec', () => {
  it('parses a known prop', () => {
    expect(heroSpec.parse({ prop: 'rocket', label: 'Launch day', word: 10 }, ctx)).toEqual({
      kind: 'hero',
      prop: 'rocket',
      label: 'Launch day',
      at: 15,
    });
  });

  it('rejects unknown props, long labels and out-of-window words', () => {
    expect(heroSpec.parse({ prop: 'banana', label: 'x', word: 10 }, ctx)).toBeNull();
    expect(heroSpec.parse({ prop: 'lock', label: 'x'.repeat(19), word: 10 }, ctx)).toBeNull();
    expect(heroSpec.parse({ prop: 'lock', label: 'Safe', word: 3 }, ctx)).toBeNull();
  });

  it('clamps the beat inside the window safe zone', () => {
    expect(heroSpec.parse({ prop: 'phone', label: 'Call', word: 4 }, ctx)?.at).toBeCloseTo(12.3);
  });

  it('cues: whoosh on appear, pop for coins, soft thump for the lock click', () => {
    const base = { kind: 'hero' as const, label: 'x', at: 2 };
    expect(heroSpec.cues({ ...base, prop: 'lightbulb' })).toEqual([
      { kind: 'whoosh', at: 2, gain: 0.6 },
    ]);
    expect(heroSpec.cues({ ...base, prop: 'coins' })[1]).toMatchObject({
      kind: 'pop',
      at: 2 + COIN_LAND_SEC,
    });
    expect(heroSpec.cues({ ...base, prop: 'lock' })[1]).toEqual({
      kind: 'thump',
      at: 2 + LOCK_CLICK_SEC,
      gain: 0.5,
    });
  });
});

describe('cues are sane for every kind', () => {
  it('uses known cue kinds, non-negative times, gains in 0..1, at most one thump', () => {
    const scenes = [
      mythFactSpec.cues({ kind: 'myth-fact', myth: 'a', fact: 'b', mythAt: 0.1, flipAt: 2 }),
      funnelSpec.cues({ kind: 'funnel', stages: [{ label: 'A', at: 0.3 }] }),
      ...(['lightbulb', 'rocket', 'coins', 'phone', 'laptop', 'lock'] as const).map((prop) =>
        heroSpec.cues({ kind: 'hero', prop, label: 'x', at: 1 }),
      ),
    ];
    for (const cues of scenes) {
      expect(cues.filter((c) => c.kind === 'thump').length).toBeLessThanOrEqual(1);
      for (const c of cues) {
        expect(CUE_SET.has(c.kind)).toBe(true);
        expect(c.at).toBeGreaterThanOrEqual(0);
        if (c.gain !== undefined) expect(c.gain).toBeGreaterThan(0);
        if (c.gain !== undefined) expect(c.gain).toBeLessThanOrEqual(1);
      }
    }
  });
});
