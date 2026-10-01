import { describe, expect, it } from 'vitest';
import { groupPlannedScenes } from '../../render/explainer-scenes';
import type { PlanningEvent } from './planning-diagnostics';
import { applyVarietyRules, type VarietyScene } from './variety';

const BOUNDS = { minStart: 3, maxEnd: 103 };
function s(startTime: number, endTime: number, extra: Partial<VarietyScene> = {}): VarietyScene {
  return {
    startTime,
    endTime,
    kind: 'stamp',
    layout: 'stack',
    layouts: ['stack', 'over', 'takeover'],
    chained: false,
    ...extra,
  };
}
function run<T extends VarietyScene>(scenes: readonly T[], bounds = BOUNDS) {
  const events: PlanningEvent[] = [];
  const out = applyVarietyRules(scenes, bounds, (event) => events.push(event), 'content-led');
  return { out, events };
}
const event = (action: 'removed' | 'repaired', reason: string, index: number) =>
  expect.objectContaining({ stage: 'policy', action, reason, index });

describe('content-led variety policy', () => {
  it('retains three touching stacked explanations filling the window as one layout run', () => {
    const scenes = [s(3, 9), s(9, 15), s(15, 21)];
    const before = structuredClone(scenes);
    const { out, events } = run(scenes, { minStart: 3, maxEnd: 21 });
    expect(out.map((scene) => [scene.layout, scene.chained])).toEqual([
      ['stack', false],
      ['stack', true],
      ['stack', true],
    ]);
    const groups = groupPlannedScenes(
      out.map((scene) => ({
        ...scene,
        scene: {
          kind: 'stamp' as const,
          word: 'Explain',
          icon: 'Ban',
          stampAt: scene.startTime + 1,
        },
        transition: 'grow' as const,
        cues: [],
      })),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].scenes).toHaveLength(3);
    expect(groups[0]).toMatchObject({ startTime: 3, endTime: 21, layout: 'stack' });
    expect(events).toEqual([
      event('repaired', 'content-led-chain-connected', 1),
      event('repaired', 'content-led-chain-connected', 2),
    ]);
    expect(scenes).toEqual(before);
  });

  it('allows distinct presets of one kind without motif quotas or mandatory gaps', () => {
    const scenes = ['unlock', 'nurture', 'power-insight', 'unlock'].map((preset, index) => ({
      ...s(3 + index * 4.1, 7 + index * 4.1, { kind: 'relay', family: 'causal' }),
      preset,
    }));
    expect(run(scenes).out).toEqual(scenes);
    expect(run(scenes).events).toEqual([]);
  });

  it('keeps necessary kinds and families instead of rotating layouts for novelty', () => {
    const scenes = [
      s(3, 7, { kind: 'versus', family: 'compare' }),
      s(8, 12, { kind: 'myth-fact', family: 'compare' }),
      s(13, 17, { kind: 'balance', family: 'compare' }),
      s(18, 22, { kind: 'checklist', family: 'list' }),
    ];
    expect(run(scenes).out).toEqual(scenes);
  });

  it.each([
    [Number.NaN, 8],
    [3, Number.POSITIVE_INFINITY],
    [-1, 3],
    [2, 6],
    [100, 104],
    [7, 3],
    [3, 3],
    [3, 4.99],
    [3, 17.01],
  ])('rejects unsafe/unreadable windows %s..%s without trimming', (start, end) => {
    const { out, events } = run([s(start, end)]);
    expect(out).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ stage: 'policy', action: 'removed', index: 0 });
    expect(events[0].reason).toMatch(/^content-led-(invalid-window|scene-duration)$/);
  });

  it.each([
    { minStart: Number.NaN, maxEnd: 103 },
    { minStart: 3, maxEnd: Number.POSITIVE_INFINITY },
    { minStart: -1, maxEnd: 103 },
    { minStart: 10, maxEnd: 3 },
  ])('rejects invalid bounds without inventing a window', (bounds) => {
    const { out, events } = run([s(3, 7)], bounds);
    expect(out).toEqual([]);
    expect(events).toEqual([event('removed', 'content-led-invalid-bounds', 0)]);
  });

  it.each([false, true])('rejects even tiny overlaps regardless of chained=%s', (chained) => {
    const { out, events } = run([s(6.9999, 11, { chained }), s(3, 7)]);
    expect(out).toEqual([s(3, 7)]);
    expect(events).toEqual([event('removed', 'overlap', 0)]);
  });

  it('accepts inclusive readability limits and bounds', () => {
    expect(run([s(3, 5), s(5, 19)], { minStart: 3, maxEnd: 19 }).out).toHaveLength(2);
  });

  it('caps retained scenes at twelve without motif quotas and reports each overflow', () => {
    const scenes = Array.from({ length: 14 }, (_, index) => s(3 + index * 2, 5 + index * 2));
    const { out, events } = run(scenes);
    expect(out).toHaveLength(12);
    expect(events.filter((e) => e.action === 'removed')).toEqual([
      event('removed', 'content-led-scene-limit', 12),
      event('removed', 'content-led-scene-limit', 13),
    ]);
  });

  it('keeps source windows and protected beats intact, including unsnappable chains', () => {
    const scenes = [
      s(3, 7),
      {
        ...s(7.1, 15, { kind: 'relay', chained: true }),
        beats: { setupAt: 7.1, finalHoldAt: 14.9 },
      },
    ];
    const before = structuredClone(scenes);
    const { out, events } = run(scenes);
    expect(out).toEqual([scenes[0], { ...scenes[1], chained: false }]);
    expect(events).toEqual([event('repaired', 'chain-gap', 1)]);
    expect(scenes).toEqual(before);
    expect(run([s(2.9, 7, { kind: 'relay' })]).out).toEqual([]);
  });

  it('honors supported layouts, keeping incompatible touching scenes as separate runs', () => {
    const { out, events } = run([
      s(3, 7, { layout: 'pip', layouts: ['stack'] }),
      s(7, 11, { layout: 'over', layouts: ['over'], chained: true }),
      s(11, 15, { layouts: [] }),
    ]);
    expect(out.map((scene) => [scene.layout, scene.chained])).toEqual([
      ['stack', false],
      ['over', false],
    ]);
    expect(events).toEqual([
      event('repaired', 'layout-not-allowed', 0),
      event('repaired', 'chain-layout-incompatible', 1),
      event('removed', 'content-led-no-supported-layout', 2),
    ]);
  });

  it('demotes long and frequent takeovers, without limiting speaker-visible coverage', () => {
    const { out, events } = run([
      s(3, 6.5, { layout: 'takeover' }),
      s(6.5, 10, { layout: 'takeover', chained: true }),
      s(10, 21),
      s(21, 24.5, { layout: 'takeover' }),
      s(24.5, 38.5, { layout: 'takeover' }),
      s(38.5, 52.5),
      s(52.5, 66.5),
      s(66.5, 80.5),
      s(80.5, 94.5),
      s(94.5, 103),
    ]);
    expect(out).toHaveLength(10);
    expect(
      out.filter((scene) => scene.layout === 'takeover').map((scene) => scene.startTime),
    ).toEqual([3, 21]);
    expect(out.reduce((sum, scene) => sum + scene.endTime - scene.startTime, 0)).toBe(100);
    expect(events).toContainEqual(event('repaired', 'content-led-takeover-frequency', 1));
    expect(events).toContainEqual(event('repaired', 'content-led-takeover-duration', 4));
  });

  it.each([
    ['takeover', 'pip'],
    ['takeover'],
  ] as const)('budgets only takeovers, demoting or dropping: %s', (...layouts) => {
    const supported = layouts as VarietyScene['layouts'];
    const { out, events } = run(
      [s(3, 6, { layout: 'takeover' }), s(21, 24, { layout: 'takeover', layouts: supported })],
      { minStart: 3, maxEnd: 24 },
    );
    const canDemote = supported.includes('pip');
    expect(out).toHaveLength(canDemote ? 2 : 1);
    if (canDemote) expect(out[1].layout).toBe('pip');
    expect(events).toEqual([
      event(canDemote ? 'repaired' : 'removed', 'content-led-takeover-coverage', 1),
    ]);
  });

  it.each([
    {
      scenes: [s(3, 7, { layout: 'takeover', layouts: ['takeover'] })],
      reason: 'content-led-takeover-duration',
      index: 0,
    },
    {
      scenes: [
        s(3, 6, { layout: 'takeover' }),
        s(7, 10, { layout: 'takeover', layouts: ['takeover'], chained: true }),
      ],
      reason: 'content-led-takeover-frequency',
      index: 1,
    },
  ])('drops a takeover with no supported visible alternative: $reason', ({
    scenes,
    reason,
    index,
  }) => {
    const { out, events } = run(scenes);
    expect(out).toHaveLength(scenes.length - 1);
    expect(events).toContainEqual(event('removed', reason, index));
  });

  it('preserves exact baseline outputs and diagnostic control behavior by default', () => {
    const scenes = [s(3, 7), s(7, 11), s(12, 16), s(18, 22, { kind: 'chart' })];
    const implicit: PlanningEvent[] = [];
    const explicit: PlanningEvent[] = [];
    const out = applyVarietyRules(scenes, BOUNDS, (e) => implicit.push(e));
    expect(applyVarietyRules(scenes, BOUNDS, (e) => explicit.push(e), 'baseline')).toEqual(out);
    expect(out).toEqual([scenes[0], { ...scenes[3], layout: 'over' }]);
    expect(explicit).toEqual(implicit);
    expect(implicit).toEqual([
      event('removed', 'baseline-gap', 1),
      event('removed', 'baseline-kind-repeat', 2),
      event('repaired', 'baseline-layout-repeat', 3),
    ]);
  });
});
