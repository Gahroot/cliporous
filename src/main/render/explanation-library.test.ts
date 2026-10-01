import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getKindSpec } from '../ai/explainer/kinds';
import type { PlannedExplainerScene } from '../ai/explainer-scenes';
import {
  COGNITION_KINDS,
  type CognitionScene,
} from '../remotion/compositions/explainer/cognition/types';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import { SPATIAL_KINDS, type SpatialScene } from '../remotion/compositions/explainer/spatial/types';
import {
  collectSceneTimes,
  EXPLAINER_SCENE_KINDS,
  isCausalSceneKind,
  mapSceneTimes,
} from '../remotion/compositions/explainer/types';
import { fitGroupsToSpeakerRanges } from './explainer-longform';
import {
  buildGroupRenderPlan,
  groupPlannedScenes,
  spliceExplainerScenes,
} from './explainer-scenes';
import type { ResolvedSegment } from './segment-render';

type Fixture = { name: string; durationSec: number; scene: SpatialScene | CognitionScene };

const fixtures = ['clay-spatial.json', 'clay-cognition.json'].flatMap(
  (file) =>
    JSON.parse(
      readFileSync(
        new URL(`../../../scripts/explainer-stills/fixtures/${file}`, import.meta.url),
        'utf8',
      ),
    ) as Fixture[],
);

function planFixture(fixture: Fixture, offset = 30): PlannedExplainerScene {
  const scene = mapSceneTimes(fixture.scene, (time) => time + offset);
  const spec = getKindSpec(scene.kind);
  if (!spec) throw new Error(`Missing scene spec: ${scene.kind}`);
  return {
    scene,
    startTime: offset,
    endTime: offset + fixture.durationSec,
    layout: 'stack',
    chained: false,
    transition: 'fade',
    cues: spec.cues(scene),
  };
}

function speaker(startTime: number, endTime: number): ResolvedSegment {
  return {
    startTime,
    endTime,
    archetype: 'talking-head',
    transitionIn: 'hard-cut',
    zoom: { style: 'none', intensity: 1 },
  };
}

describe('clay explanation render integration', () => {
  it('registers all fourteen new kinds exactly once and protects their authored windows', () => {
    const kinds = [...SPATIAL_KINDS, ...COGNITION_KINDS];
    expect(kinds).toHaveLength(14);
    expect(new Set(kinds).size).toBe(14);
    for (const kind of kinds) {
      expect(EXPLAINER_SCENE_KINDS.filter((candidate) => candidate === kind)).toHaveLength(1);
      expect(isCausalSceneKind(kind)).toBe(true);
      expect(getKindSpec(kind)?.kind).toBe(kind);
      expect(fixtures.some((fixture) => fixture.scene.kind === kind)).toBe(true);
    }
  });

  it.each(
    fixtures,
  )('$name retains beats and source cues through the vertical render path', (fixture) => {
    const planned = planFixture(fixture);
    const groups = groupPlannedScenes([planned]);
    const pieces = spliceExplainerScenes(
      [speaker(20, 30.5), speaker(30.5, planned.endTime - 0.3), speaker(planned.endTime - 0.3, 50)],
      groups,
      20,
    );
    const piece = pieces.find((entry) => entry.group);
    if (!piece?.group) throw new Error(`Missing rendered scene: ${fixture.name}`);
    expect(piece.segment.startTime).toBe(planned.startTime);
    expect(piece.segment.endTime).toBe(planned.endTime);
    const rendered = buildGroupRenderPlan(piece.group, piece.segment, deriveExplainerPalette());
    expect(rendered.props.scenes[0]?.scene).toEqual(fixture.scene);
    expect(rendered.props.aspect).toBe('9:16');
    expect(rendered.props.visibleSec).toBeCloseTo(fixture.durationSec, 10);
    expect(collectSceneTimes(rendered.props.scenes[0].scene)).toHaveLength(5);
    expect(planned.cues.length).toBeGreaterThan(0);
    expect(rendered.cues).toEqual(expect.arrayContaining(planned.cues));
    expect(
      rendered.cues.every((cue) => cue.at >= planned.startTime && cue.at <= planned.endTime),
    ).toBe(true);
  });

  it.each(
    fixtures,
  )('$name works in long-form without crossing a speaker-range boundary', (fixture) => {
    const planned = planFixture(fixture);
    const groups = groupPlannedScenes([planned]);
    expect(fitGroupsToSpeakerRanges(groups, [{ start: 31, end: 50 }])).toEqual([]);
    const fitted = fitGroupsToSpeakerRanges(groups, [{ start: 29, end: 50 }]);
    expect(fitted).toHaveLength(1);
    expect(fitted[0].layout).toBe('over');
    const rendered = buildGroupRenderPlan(fitted[0], fitted[0], deriveExplainerPalette(), '16:9');
    expect(rendered.props.aspect).toBe('16:9');
    expect(rendered.props.layout).toBe('over');
    expect(rendered.props.scenes[0]?.scene).toEqual(fixture.scene);
  });

  it('carries the same house subject through a real chained sequence without losing beat timing', () => {
    const house = fixtures.find((fixture) => fixture.scene.kind === 'house-cutaway');
    const neighborhood = fixtures.find((fixture) => fixture.scene.kind === 'neighborhood');
    if (!house || !neighborhood) throw new Error('Missing continuity fixtures');
    const first = planFixture(house);
    const second = planFixture(neighborhood, first.endTime);
    second.scene = { ...second.scene, subject: first.scene.subject };
    second.chained = true;
    const groups = groupPlannedScenes([first, second]);
    expect(groups).toHaveLength(1);
    const rendered = buildGroupRenderPlan(groups[0], groups[0], deriveExplainerPalette());
    expect(rendered.props.scenes).toHaveLength(2);
    expect(rendered.props.transitions).toHaveLength(1);
    expect(
      rendered.props.scenes.map(({ scene }) => ('subject' in scene ? scene.subject : null)),
    ).toEqual([first.scene.subject, first.scene.subject]);
    expect(rendered.props.scenes.map(({ scene }) => collectSceneTimes(scene))).toEqual([
      collectSceneTimes(house.scene),
      collectSceneTimes(neighborhood.scene),
    ]);
  });
});
