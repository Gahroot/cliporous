import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { allHybridFixtures } from '../ai/explainer/hybrid-test-fixtures';
import { ALL_KIND_SPECS } from '../ai/explainer/kinds';
import { buildShortlist, SHORTLIST_LIMITS } from '../ai/explainer/shortlist';
import {
  type PlannedExplainerScene,
  parseExplainerPlan,
  parsePlanWithDiagnostics,
  toSceneRelative,
} from '../ai/explainer-scenes';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import { SceneBody } from '../remotion/compositions/explainer/SceneBody';
import {
  collectSceneTimes,
  HYBRID_SCENE_KINDS,
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

const fixtures = allHybridFixtures();
function speaker(startTime: number, endTime: number): ResolvedSegment {
  return {
    startTime,
    endTime,
    archetype: 'talking-head',
    transitionIn: 'hard-cut',
    zoom: { style: 'none', intensity: 1 },
  };
}
function offsetPlan(original: PlannedExplainerScene): PlannedExplainerScene {
  return {
    ...original,
    startTime: original.startTime + 30,
    endTime: original.endTime + 30,
    scene: mapSceneTimes(original.scene, (at) => at + 30),
    cues: original.cues.map((cue) => ({ ...cue, at: cue.at + 30 })),
  };
}
function parsedFixture(f: (typeof fixtures)[number]['fixture']): PlannedExplainerScene {
  const result = parsePlanWithDiagnostics({ scenes: [{ ...f.raw, layout: 'stack' }] }, f.words, {
    minStart: 0,
    maxEnd: 90,
  });
  expect(result.rejected).toEqual([]);
  expect(result.omitted).toEqual([]);
  expect(result.accepted).toHaveLength(1);
  return result.accepted[0];
}
describe('production-reachable hybrid library', () => {
  it('registers seven complete kinds, fifteen presets, both modes and every enabled landmark', () => {
    expect(HYBRID_SCENE_KINDS).toHaveLength(7);
    expect(fixtures).toHaveLength(42);
    expect(
      new Set(fixtures.map(({ fixture: f }) => `${f.raw.kind}/${f.raw.preset}/${f.raw.visualMode}`))
        .size,
    ).toBe(30);
    for (const kind of HYBRID_SCENE_KINDS) {
      expect(ALL_KIND_SPECS.filter((spec) => spec.kind === kind)).toHaveLength(1);
      expect(isCausalSceneKind(kind)).toBe(true);
    }
    expect(SHORTLIST_LIMITS.maxKinds).toBe(16);
    expect(SHORTLIST_LIMITS.maxProps).toBe(10);
  });
  for (const { name, fixture: f } of fixtures) {
    it(`${name}: source → shortlist → parser → concrete dispatch`, () => {
      expect(f.words.map((word) => word.text).join(' ')).toBe(f.sourceText);
      expect(buildShortlist(f.words).kinds.map((spec) => spec.kind)).toContain(f.raw.kind);
      const original = parsedFixture(f);
      expect(original).toEqual(parsedFixture(f));
      const element = SceneBody({ scene: original.scene });
      expect(isValidElement(element)).toBe(true);
      expect(collectSceneTimes(original.scene)).toHaveLength(5);
      expect(original.cues.length).toBeGreaterThan(0);
      expect(collectSceneTimes(original.scene).at(-1)).toBeLessThanOrEqual(original.endTime - 0.8);
      const emphasized = parseExplainerPlan(
        { scenes: [{ ...f.raw, layout: 'stack' }] },
        f.words,
        { minStart: 0, maxEnd: 90 },
        { emphasisTimes: [2, 4, 6, 8] },
      );
      expect(emphasized[0]?.scene.pulses).toBeUndefined();
      expect(emphasized[0]?.scene.overlayStamp).toBeUndefined();
    });
    it(`${name}: full windows through both production plans and rebasing`, () => {
      const original = parsedFixture(f),
        planned = offsetPlan(original),
        groups = groupPlannedScenes([planned]);
      const pieces = spliceExplainerScenes(
        [speaker(20, 30.6), speaker(30.6, 39.5), speaker(39.5, 55)],
        groups,
        20,
      );
      const piece = pieces.find((piece) => piece.group);
      if (!piece?.group) throw new Error('No full-window short-form splice');
      expect(piece.segment.startTime).toBe(planned.startTime);
      expect(piece.segment.endTime).toBe(planned.endTime);
      const short = buildGroupRenderPlan(piece.group, piece.segment, deriveExplainerPalette());
      expect(short.props.aspect).toBe('9:16');
      expect(short.props.scenes[0].scene).toEqual(
        toSceneRelative(original.scene, original.startTime),
      );
      expect(short.cues).toEqual(expect.arrayContaining(planned.cues));
      expect(fitGroupsToSpeakerRanges(groups, [{ start: 31, end: 55 }])).toEqual([]);
      expect(
        fitGroupsToSpeakerRanges(groups, [
          { start: 29, end: 34 },
          { start: 35, end: 55 },
        ]),
      ).toEqual([]);
      const fitted = fitGroupsToSpeakerRanges(groups, [{ start: 29, end: 55 }]);
      expect(fitted).toHaveLength(1);
      const long = buildGroupRenderPlan(fitted[0], fitted[0], deriveExplainerPalette(), '16:9');
      expect(long.props.layout).toBe('over');
      expect(long.props.scenes[0].scene).toEqual(
        toSceneRelative(original.scene, original.startTime),
      );
      expect(long.props.visibleSec).toBeCloseTo(original.endTime - original.startTime);
    });
  }
  it('switching presentation cannot change validated meaning or timing', () => {
    for (const { fixture: f } of fixtures.filter(
      ({ fixture }) => fixture.raw.visualMode === 'diagram',
    )) {
      const diagram = parsedFixture(f).scene;
      const hybrid = parsedFixture({ ...f, raw: { ...f.raw, visualMode: 'hybrid' } }).scene;
      expect({ ...diagram, visualMode: 'hybrid' }).toEqual(hybrid);
    }
  });
});
