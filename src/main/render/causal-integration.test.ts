import { describe, expect, it } from 'vitest';
import type { PlannedExplainerScene } from '../ai/explainer-scenes';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import {
  CAUSAL_SCENE_KINDS,
  type ExplainerScene,
  mapSceneTimes,
  stageCanvasFor,
} from '../remotion/compositions/explainer/types';
import { fitGroupsToSpeakerRanges } from './explainer-longform';
import {
  buildGroupRenderPlan,
  groupPlannedScenes,
  spliceExplainerScenes,
} from './explainer-scenes';
import type { ResolvedSegment } from './segment-render';

const bodies: ExplainerScene[] = [
  {
    kind: 'bottleneck',
    label: 'Approval gate',
    tokenCount: 4,
    feedAt: 0.6,
    queueAt: 1.3,
    openAt: 2.2,
    clearAt: 4.4,
  },
  { kind: 'momentum', label: 'Momentum', pushAt: 0.6, repeatAt: 1.5, engageAt: 3, coastAt: 4.5 },
  { kind: 'leverage', label: 'Leverage', effortAt: 0.6, pivotAt: 1.5, liftAt: 3, holdAt: 4.5 },
  {
    kind: 'resource-leak',
    label: 'Retained water',
    inflowAt: 0.6,
    leakAt: 1.5,
    sealAt: 3,
    retainAt: 4.5,
  },
  {
    kind: 'feedback-control',
    label: 'Target pressure',
    exceedAt: 0.6,
    senseAt: 1.5,
    correctAt: 3,
    settleAt: 4.5,
  },
  {
    kind: 'keystone',
    label: 'Keystone',
    supportsAt: 0.6,
    blocksAt: 1.5,
    lockAt: 3,
    withdrawAt: 4.5,
  },
  {
    kind: 'switchyard',
    route: 'right',
    label: 'Review',
    leftLabel: 'Archive',
    rightLabel: 'Review',
    approachAt: 0.6,
    seatAt: 1.5,
    commitAt: 3,
    arriveAt: 4.5,
  },
  {
    kind: 'synchronization',
    label: 'Shared rhythm',
    disagreeAt: 0.6,
    rhythmAt: 1.5,
    alignAt: 3,
    transferAt: 4.5,
  },
  {
    kind: 'relay',
    preset: 'unlock',
    label: 'Unlock the door',
    sourceAt: 0.6,
    transferAt: 1.5,
    receiveAt: 3,
    outcomeAt: 4.5,
  },
  {
    kind: 'exploded-view',
    template: 'mechanism',
    target: 'gear',
    label: 'Mechanism',
    detailLabel: 'Gear',
    assembleAt: 0.6,
    separateAt: 1.5,
    explainAt: 3,
    returnAt: 4.5,
  },
];

function planned(scene: ExplainerScene, startTime = 20): PlannedExplainerScene {
  return {
    startTime,
    endTime: startTime + 6,
    layout: 'stack',
    chained: false,
    transition: 'fade',
    scene: mapSceneTimes(scene, (t) => t + startTime),
    cues: [{ kind: 'tick', at: startTime + 3, gain: 0.4 }],
  };
}

function speaker(startTime: number, endTime: number): ResolvedSegment {
  return {
    archetype: 'talking-head',
    startTime,
    endTime,
    zoom: { style: 'none', intensity: 0 },
    transitionIn: 'cut',
  };
}

function beats(scene: ExplainerScene): number[] {
  const found: number[] = [];
  mapSceneTimes(scene, (time) => {
    found.push(time);
    return time;
  });
  return found;
}

describe('causal scenes through the production short-form and landscape glue', () => {
  it('covers exactly every authored causal kind', () => {
    expect(bodies.map((scene) => scene.kind).sort()).toEqual([...CAUSAL_SCENE_KINDS].sort());
  });

  it.each(
    bodies,
  )('$kind preserves beats, captions layout and source cues in both aspect paths', (body) => {
    const groups = groupPlannedScenes([planned(body)]);
    const pieces = spliceExplainerScenes([speaker(18, 30)], groups, 20);
    const piece = pieces.find((p) => p.group);
    if (!piece?.group) throw new Error('Expected a renderable scene window');
    expect(piece.segment).toMatchObject({ startTime: 20, endTime: 26, explainerLayout: 'stack' });

    const portrait = buildGroupRenderPlan(piece.group, piece.segment, deriveExplainerPalette());
    const rebased = portrait.props.scenes[0]?.scene;
    if (!rebased) throw new Error('Missing portrait scene');
    beats(rebased).forEach((time, i) => {
      expect(time).toBeCloseTo(beats(body)[i], 10);
    });
    expect(portrait.props.visibleSec).toBe(6);
    expect(portrait.cues).toContainEqual({ kind: 'tick', at: 23, gain: 0.4 });
    expect(stageCanvasFor(portrait.props.layout, '9:16')).toEqual({
      width: 1080,
      height: 960,
      transparent: false,
    });

    expect(fitGroupsToSpeakerRanges(groups, [{ start: 20, end: 25 }])).toEqual([]);
    const landscape = fitGroupsToSpeakerRanges(groups, [{ start: 18, end: 30 }]);
    expect(landscape).toHaveLength(1);
    const group = landscape[0];
    if (!group) throw new Error('Missing landscape group');
    const wide = buildGroupRenderPlan(group, group, deriveExplainerPalette(), '16:9');
    expect(wide.props.layout).toBe('over');
    expect(wide.props.aspect).toBe('16:9');
    expect(stageCanvasFor(wide.props.layout, '16:9')).toEqual({
      width: 1920,
      height: 1080,
      transparent: true,
    });
    const wideBody = wide.props.scenes[0]?.scene;
    expect(wideBody).toEqual(rebased);
    expect(wide.cues).toEqual(portrait.cues);
    expect(beats(groups[0].scenes[0].scene)[0]).toBeCloseTo(beats(body)[0] + 20, 10);
  });

  it('does not bridge removed source footage or truncate a mechanism to fit it', () => {
    const first = bodies[0];
    if (!first) throw new Error('Missing causal fixture');
    const groups = groupPlannedScenes([planned(first)]);
    const pieces = spliceExplainerScenes([speaker(18, 22), speaker(23, 30)], groups, 20);
    expect(pieces.every((piece) => !piece.group)).toBe(true);
  });

  it('chains without advancing the second scene clock into the transition', () => {
    const first = bodies[0];
    const second = bodies[1];
    if (!first || !second) throw new Error('Missing causal fixtures');
    const groups = groupPlannedScenes([planned(first), { ...planned(second, 26), chained: true }]);
    expect(groups).toHaveLength(1);
    const group = groups[0];
    if (!group) throw new Error('Missing chain');
    const plan = buildGroupRenderPlan(group, group, deriveExplainerPalette());
    expect(plan.props.transitions).toEqual([{ kind: 'fade', durationInFrames: 14 }]);
    expect(plan.props.scenes[0]?.durationInFrames).toBe(194);
    const secondBody = plan.props.scenes[1]?.scene;
    if (!secondBody) throw new Error('Missing second scene');
    beats(secondBody).forEach((time, i) => {
      expect(time).toBeCloseTo(beats(second)[i], 10);
    });
  });
});
