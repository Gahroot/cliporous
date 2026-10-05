import type { Archetype } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';
import type { PlannedExplainerScene, PlannerEditPlan } from '../ai/explainer-scenes';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import type { ExplainerLayout, ExplainerScene } from '../remotion/compositions/explainer/types';
import {
  buildGroupRenderPlan,
  groupPlannedScenes,
  prepareExplainerTimeline,
  type SceneGroup,
  spliceExplainerScenes,
} from './explainer-scenes';
import type { ResolvedSegment } from './segment-render';

function seg(
  archetype: Archetype,
  startTime: number,
  endTime: number,
  extra: Partial<ResolvedSegment> = {},
): ResolvedSegment {
  return {
    startTime,
    endTime,
    archetype,
    zoom: { style: 'drift', intensity: 1.1 },
    transitionIn: 'crossfade',
    ...extra,
  };
}

const STAMP: ExplainerScene = { kind: 'stamp', icon: 'Ban', word: 'NEVER', stampAt: 14 };

function planned(
  startTime: number,
  endTime: number,
  extra: Partial<PlannedExplainerScene> = {},
): PlannedExplainerScene {
  return {
    startTime,
    endTime,
    scene: STAMP,
    layout: 'stack',
    chained: false,
    transition: 'grow',
    cues: [],
    ...extra,
  };
}

function group(startTime: number, endTime: number, layout: ExplainerLayout = 'stack'): SceneGroup {
  return { startTime, endTime, layout, scenes: [planned(startTime, endTime, { layout })] };
}

function shape(pieces: ReturnType<typeof spliceExplainerScenes>): string[] {
  return pieces.map(
    (p) =>
      `${p.group ? 'SCENE' : p.segment.archetype} ${p.segment.startTime}-${p.segment.endTime} ${p.segment.transitionIn}`,
  );
}

describe('spliceExplainerScenes', () => {
  it('diagnoses grouping and every window removed by timeline admission', () => {
    const observe = vi.fn();
    const groups = groupPlannedScenes(
      [planned(14, 18), planned(18, 22, { chained: true })],
      observe,
    );
    expect(observe).toHaveBeenCalledWith({
      stage: 'group',
      action: 'accepted',
      reason: 'shared-stage',
      index: 0,
      count: 2,
    });
    spliceExplainerScenes(
      [seg('talking-head', 10, 16), seg('talking-head', 19, 30)],
      groups,
      12,
      observe,
    );
    expect(observe).toHaveBeenCalledWith({
      stage: 'splice',
      action: 'removed',
      reason: 'source-gap',
      index: 0,
      count: 2,
    });
  });
  it('cuts a scene out of the middle of one segment and hard-cuts back', () => {
    const out = spliceExplainerScenes([seg('talking-head', 10, 30)], [group(14, 20, 'pip')], 12);
    expect(shape(out)).toEqual([
      'talking-head 10-14 crossfade',
      'SCENE 14-20 hard-cut',
      'talking-head 20-30 hard-cut',
    ]);
    const scene = out[1];
    expect(scene?.segment.archetype).toBe('split-image');
    expect(scene?.segment.explainerLayout).toBe('pip');
    expect(scene?.segment.zoom).toEqual({ style: 'none', intensity: 1 });
  });

  it('spans segment boundaries, replaces b-roll, and snaps edges to nearby boundaries', () => {
    const out = spliceExplainerScenes(
      [
        seg('talking-head', 10, 14.3),
        seg('split-image', 14.3, 18, { videoPath: '/tmp/broll.mp4' }),
        seg('tight-punch', 18, 25),
      ],
      [group(14, 21.6)],
      12,
    );
    expect(shape(out)).toEqual([
      'talking-head 10-14.3 crossfade',
      'SCENE 14.3-21.6 hard-cut',
      'tight-punch 21.6-25 hard-cut',
    ]);
    expect(out[1]?.segment.videoPath).toBeUndefined();
  });

  it('keeps a causal setup and settled hold when nearby boundaries would cut them off', () => {
    const scene: ExplainerScene = {
      kind: 'bottleneck',
      label: 'Orders pass through',
      tokenCount: 4,
      feedAt: 14.1,
      queueAt: 15,
      openAt: 17,
      clearAt: 19.5,
    };
    const causal = {
      ...group(14, 20),
      scenes: [planned(14, 20, { scene })],
    };
    const pieces = spliceExplainerScenes(
      [
        seg('talking-head', 10, 14.3),
        seg('talking-head', 14.3, 19.6),
        seg('talking-head', 19.6, 25),
      ],
      [causal],
      12,
    );
    const piece = pieces.find((p) => p.group);
    expect(piece?.segment.startTime).toBe(14);
    expect(piece?.segment.endTime).toBe(20);
    if (!piece?.group) throw new Error('Expected causal scene');
    const rendered = buildGroupRenderPlan(piece.group, piece.segment, deriveExplainerPalette());
    const body = rendered.props.scenes[0]?.scene;
    if (body?.kind !== 'bottleneck') throw new Error('Expected bottleneck');
    expect(body.feedAt).toBeCloseTo(0.1, 10);
    expect(body.clearAt).toBe(5.5);
    expect(rendered.props.visibleSec).toBe(6);
  });

  it('never snaps a scene start before the protected opening', () => {
    const out = spliceExplainerScenes(
      [seg('talking-head', 10, 12.2), seg('talking-head', 12.2, 30)],
      [group(12.5, 18)],
      12.5,
    );
    expect(shape(out)).toEqual([
      'talking-head 10-12.2 crossfade',
      'talking-head 12.2-12.5 crossfade',
      'SCENE 12.5-18 hard-cut',
      'talking-head 18-30 hard-cut',
    ]);
  });

  it('drops windows that cross a gap in the source timeline or overlap', () => {
    const segments = [seg('talking-head', 10, 16), seg('talking-head', 40, 50)];
    expect(shape(spliceExplainerScenes(segments, [group(13, 42.5)], 12))).toEqual([
      'talking-head 10-16 crossfade',
      'talking-head 40-50 crossfade',
    ]);

    const overlapping = spliceExplainerScenes(
      [seg('talking-head', 10, 40)],
      [group(14, 20), group(19, 25), group(27, 31)],
      12,
    );
    expect(overlapping.filter((p) => p.group).map((p) => p.segment.startTime)).toEqual([14, 27]);
  });

  it('returns the input unchanged when nothing is planned', () => {
    const segments = [seg('talking-head', 10, 20)];
    expect(spliceExplainerScenes(segments, [], 12).map((p) => p.segment)).toEqual(segments);
  });
});

describe('prepareExplainerTimeline', () => {
  it('does not re-chain useful scenes across a removed statement, even inside chain tolerance', () => {
    const first = planned(14, 18);
    const statement = planned(18, 18.02, {
      chained: true,
      scene: { kind: 'statement', words: [{ text: 'Repeated speech', at: 18 }] },
    });
    const last = planned(18.02, 22, {
      chained: true,
      scene: {
        kind: 'stack',
        layers: [
          { label: 'Tools', at: 19 },
          { label: 'Workflow', at: 20 },
        ],
      },
    });
    const plan: PlannerEditPlan = { scenes: [first, statement, last], quotes: [] };
    const segments = [seg('talking-head', 10, 30)];
    const before = structuredClone({ plan, segments });
    const observe = vi.fn();
    const timeline = prepareExplainerTimeline(
      segments,
      plan,
      { minStart: 12, maxEnd: 30 },
      observe,
    );
    expect(shape(timeline.pieces)).toEqual([
      'talking-head 10-14 crossfade',
      'SCENE 14-18 hard-cut',
      'talking-head 18-18.02 hard-cut',
      'SCENE 18.02-22 hard-cut',
      'talking-head 22-30 hard-cut',
    ]);
    const groups = timeline.pieces.flatMap((p) => (p.group ? [p.group] : []));
    expect(groups.map((g) => g.scenes)).toEqual([[first], [{ ...last, chained: false }]]);
    expect(groups[0].scenes[0]).toBe(first);
    expect(groups[1].scenes[0].scene).toBe(last.scene);
    expect(timeline.captionWindows).toEqual([
      { startTime: 4, endTime: 8, layout: 'stack' },
      { startTime: 8.02, endTime: 12, layout: 'stack' },
    ]);
    expect(observe).toHaveBeenCalledWith({
      stage: 'splice',
      action: 'removed',
      reason: 'short-form-redundant-text',
      index: 1,
      count: 1,
    });
    expect({ plan, segments }).toEqual(before);
  });
});

describe('groupPlannedScenes', () => {
  it('merges chained scenes on the same layout into one group', () => {
    const groups = groupPlannedScenes([
      planned(10, 14),
      planned(14, 19, { chained: true }),
      planned(22, 26),
      planned(26, 30, { chained: true, layout: 'over' }),
    ]);
    expect(groups.map((g) => [g.startTime, g.endTime, g.scenes.length])).toEqual([
      [10, 19, 2],
      [22, 26, 1],
      [26, 30, 1],
    ]);
  });
});

describe('buildGroupRenderPlan', () => {
  const palette = deriveExplainerPalette();

  it('rebases beats per scene and keeps each scene starting on its own window', () => {
    const first = planned(10, 14, {
      scene: { kind: 'stamp', icon: 'Ban', word: 'NEVER', stampAt: 11 },
      cues: [{ kind: 'thump', at: 11.1 }],
    });
    const second = planned(14, 20, {
      chained: true,
      transition: 'slide',
      scene: {
        kind: 'stack',
        layers: [
          { label: 'Tools', at: 15 },
          { label: 'Workflow', at: 16 },
        ],
      },
      cues: [{ kind: 'tick', at: 15.25 }],
    });
    const plan = buildGroupRenderPlan(
      { startTime: 10, endTime: 20, layout: 'stack', scenes: [first, second] },
      { startTime: 10, endTime: 20 },
      palette,
    );
    const [a, b] = plan.props.scenes;
    expect(a?.scene).toMatchObject({ kind: 'stamp', stampAt: 1 });
    expect(b?.scene).toMatchObject({ kind: 'stack', layers: [{ at: 1 }, { at: 2 }] });
    // Scene 2 starts at frame (14-10)*30 = 120: scene 1 spans 120 + the transition overlap.
    const tr = plan.props.transitions[0];
    expect(tr?.kind).toBe('slide');
    expect(a?.durationInFrames).toBe(120 + (tr?.durationInFrames ?? 0));
    expect(plan.props.visibleSec).toBe(10);
    // Cues kept in absolute time, plus the stage entrance whoosh.
    expect(plan.cues.map((c) => c.kind)).toEqual(['whoosh', 'thump', 'tick']);
  });

  it('uses the layout canvas', () => {
    const plan = buildGroupRenderPlan(
      group(10, 14, 'over'),
      { startTime: 10, endTime: 14 },
      palette,
    );
    expect(plan.props.layout).toBe('over');
    expect(plan.props.palette).toBe(palette);
  });
});
