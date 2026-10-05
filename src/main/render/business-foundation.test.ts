import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { Rec } from '../ai/explainer/kind-spec';
import { ALL_KIND_SPECS } from '../ai/explainer/kinds';
import { buildShortlist, SHORTLIST_LIMITS } from '../ai/explainer/shortlist';
import type { PlannerWord } from '../ai/explainer-scenes';
import {
  type PlannedExplainerScene,
  parseExplainerPlan,
  parseLongformSceneSpec,
  parsePlanWithDiagnostics,
  toSceneRelative,
} from '../ai/explainer-scenes';
import { AgentWorkflowScene as AgentWorkflowSceneView } from '../remotion/compositions/explainer/AgentWorkflowScene';
import { approvalGateSourceFixture } from '../remotion/compositions/explainer/business/authority/approval-fixture';
import { AUTHORITY_RAW_FIXTURES } from '../remotion/compositions/explainer/business/authority/fixtures';
import { AUTHORITY_SOURCE_NEGATIVES } from '../remotion/compositions/explainer/business/authority/negative-fixtures';
import { BusinessAuthoritySceneView } from '../remotion/compositions/explainer/business/authority/Scene';
import { BUSINESS_RECIPES } from '../remotion/compositions/explainer/business/catalog';
import { COMMERCIAL_SOURCE_FIXTURES } from '../remotion/compositions/explainer/business/commercial/fixtures';
import { CommercialSceneView } from '../remotion/compositions/explainer/business/commercial/Scene';
import { WORK_SOURCE_FIXTURES } from '../remotion/compositions/explainer/business/work/fixtures';
import { BusinessWorkSceneView } from '../remotion/compositions/explainer/business/work/Scene';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import { SceneBody } from '../remotion/compositions/explainer/SceneBody';
import {
  BUSINESS_SCENE_KINDS,
  collectSceneTimes,
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

interface SourceFixture {
  id: string;
  raw: Rec;
  words: PlannerWord[];
}
const fixtures: SourceFixture[] = [
  approvalGateSourceFixture('diagram'),
  approvalGateSourceFixture('hybrid'),
  ...WORK_SOURCE_FIXTURES.flatMap((fixture) => {
    const recipe = BUSINESS_RECIPES.find((item) => item.id === fixture.id);
    if (!recipe) throw new Error('missing frozen work recipe');
    return recipe.modes.map((visualMode) => ({
      id: fixture.id,
      raw: { ...fixture.raw, visualMode },
      words: fixture.words,
    }));
  }),
  ...AUTHORITY_RAW_FIXTURES.flatMap((fixture) => {
    const recipe = BUSINESS_RECIPES.find((item) => item.id === fixture.recipeId);
    if (!recipe) throw new Error('missing frozen authority recipe');
    return recipe.modes.map((visualMode) => ({
      id: fixture.recipeId,
      raw: { ...fixture.raw, visualMode },
      words: fixture.words,
    }));
  }),
  ...COMMERCIAL_SOURCE_FIXTURES.map((fixture) => ({
    id: fixture.id,
    raw: fixture.raw,
    words: fixture.words,
  })),
];
function parsed(fixture: SourceFixture): PlannedExplainerScene {
  const result = parsePlanWithDiagnostics(
    { scenes: [{ ...fixture.raw, layout: 'stack' }] },
    fixture.words,
    { minStart: 0, maxEnd: 90 },
  );
  expect(result.rejected).toEqual([]);
  expect(result.omitted).toEqual([]);
  expect(result.accepted).toHaveLength(1);
  return result.accepted[0];
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
function offset(original: PlannedExplainerScene): PlannedExplainerScene {
  return {
    ...original,
    startTime: original.startTime + 30,
    endTime: original.endTime + 30,
    scene: mapSceneTimes(original.scene, (at) => at + 30),
    cues: original.cues.map((cue) => ({ ...cue, at: cue.at + 30 })),
  };
}

describe('integrated business foundation production planning (no media proof)', () => {
  it('retains foundation grammars in all twenty-six finished kinds without raising planner limits', () => {
    expect(BUSINESS_SCENE_KINDS).toHaveLength(26);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(26);
    expect(fixtures).toHaveLength(50);
    expect(new Set(ALL_KIND_SPECS.map((spec) => spec.kind)).size).toBe(ALL_KIND_SPECS.length);
    for (const kind of BUSINESS_SCENE_KINDS) {
      expect(ALL_KIND_SPECS.filter((spec) => spec.kind === kind)).toHaveLength(1);
      expect(isCausalSceneKind(kind)).toBe(true);
    }
    expect(SHORTLIST_LIMITS.maxKinds).toBe(16);
    expect(SHORTLIST_LIMITS.maxProps).toBe(10);
  });
  it.each(
    fixtures,
  )('$id $raw.visualMode: raw words → shortlist → parser → concrete dispatch', (fixture) => {
    expect(buildShortlist(fixture.words).kinds.map((spec) => spec.kind)).toContain(
      fixture.raw.kind,
    );
    const plan = parsed(fixture);
    expect(plan).toEqual(parsed(fixture));
    const element = SceneBody({ scene: plan.scene });
    expect(isValidElement(element)).toBe(true);
    if (!isValidElement(element)) throw new Error('missing concrete business scene');
    const expected =
      plan.scene.kind === 'agent-workflow'
        ? AgentWorkflowSceneView
        : plan.scene.kind === 'business-blueprint' || plan.scene.kind === 'business-replication'
          ? CommercialSceneView
          : plan.scene.kind === 'task-map' ||
              plan.scene.kind === 'coordination-map' ||
              plan.scene.kind === 'work-redesign'
            ? BusinessWorkSceneView
            : BusinessAuthoritySceneView;
    expect(element.type).toBe(expected);
    expect(collectSceneTimes(plan.scene)).toHaveLength(5);
    expect(collectSceneTimes(plan.scene).at(-1)).toBeLessThanOrEqual(plan.endTime - 0.8);
    const emphasized = parseExplainerPlan(
      { scenes: [{ ...fixture.raw, layout: 'stack' }] },
      fixture.words,
      { minStart: 0, maxEnd: 90 },
      { emphasisTimes: [2, 4, 6, 8] },
    );
    expect(emphasized).toHaveLength(1);
    expect(emphasized[0].scene.pulses).toBeUndefined();
    expect(emphasized[0].scene.overlayStamp).toBeUndefined();
  });
  it.each(
    fixtures,
  )('$id $raw.visualMode: complete windows, once-only rebase and short/long planning', (fixture) => {
    const original = parsed(fixture),
      planned = offset(original),
      groups = groupPlannedScenes([planned]);
    const pieces = spliceExplainerScenes(
      [speaker(20, 30.6), speaker(30.6, 39.5), speaker(39.5, 55)],
      groups,
      20,
    );
    const piece = pieces.find((item) => item.group);
    if (!piece?.group) throw new Error('no protected short-form splice');
    expect(piece.segment.startTime).toBe(planned.startTime);
    expect(piece.segment.endTime).toBe(planned.endTime);
    const short = buildGroupRenderPlan(piece.group, piece.segment, deriveExplainerPalette());
    expect(short.props.aspect).toBe('9:16');
    expect(short.props.scenes[0].scene).toEqual(
      toSceneRelative(original.scene, original.startTime),
    );
    expect(short.cues).toEqual(expect.arrayContaining(planned.cues));
    expect(fitGroupsToSpeakerRanges(groups, [{ start: planned.startTime + 0.1, end: 55 }])).toEqual(
      [],
    );
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
    expect(long.props.scenes[0].scene).toEqual(toSceneRelative(original.scene, original.startTime));
    expect(long.props.visibleSec).toBeCloseTo(original.endTime - original.startTime);
    const registered = ALL_KIND_SPECS.find((entry) => entry.kind === fixture.raw.kind);
    if (!registered) throw new Error('missing registered source-first kind');
    const layout = registered.layouts?.some((value) => value === 'takeover') ? 'takeover' : 'over';
    expect(registered.layouts).toContain(layout);
    const spec = { ...fixture.raw, layout };
    const sourceFirst = parseLongformSceneSpec(spec, fixture.words, { clipStart: 0, clipEnd: 90 });
    expect(sourceFirst).not.toBeNull();
    if (!sourceFirst) throw new Error('source-first route rejected validated business source');
    expect(sourceFirst.layout).toBe(layout);
    expect(sourceFirst.startTime).toBe(original.startTime);
    expect(sourceFirst.endTime).toBe(original.endTime);
    expect(sourceFirst.scene).toEqual(original.scene);
    const sourceFirstGroups = groupPlannedScenes([sourceFirst]);
    const native = buildGroupRenderPlan(
      sourceFirstGroups[0],
      sourceFirstGroups[0],
      deriveExplainerPalette(),
      '16:9',
    );
    expect(native.props.scenes[0].scene).toEqual(
      toSceneRelative(original.scene, original.startTime),
    );
    expect(native.props.aspect).toBe('16:9');
  });
  it.each(
    fixtures,
  )('$id $raw.visualMode: the integrated parser rejects unsupported core data', (fixture) => {
    for (const patch of [
      { subject: 'Unstated subject' },
      fixture.raw.kind === 'agent-workflow'
        ? { visualMode: 'arbitrary' }
        : { arbitraryGeometry: 'not allowed' },
      { resolveWord: fixture.raw.checkWord },
    ]) {
      const result = parsePlanWithDiagnostics(
        { scenes: [{ ...fixture.raw, ...patch, layout: 'stack' }] },
        fixture.words,
        { minStart: 0, maxEnd: 90 },
      );
      expect(result.accepted).toEqual([]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].problems.length).toBeGreaterThan(0);
    }
  });
  it.each(
    AUTHORITY_SOURCE_NEGATIVES,
  )('$recipeId $name: source-specific negative remains rejected after registry routing', ({
    fixture,
  }) => {
    const result = parsePlanWithDiagnostics(
      { scenes: [{ ...fixture.raw, layout: 'stack' }] },
      fixture.words,
      { minStart: 0, maxEnd: 90 },
    );
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].problems.length).toBeGreaterThan(0);
  });
});
