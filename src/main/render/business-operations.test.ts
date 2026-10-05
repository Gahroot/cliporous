import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { PlannerWord, Rec } from '../ai/explainer/kind-spec';
import { ALL_KIND_SPECS } from '../ai/explainer/kinds';
import { buildShortlist, SHORTLIST_LIMITS } from '../ai/explainer/shortlist';
import {
  type PlannedExplainerScene,
  parseExplainerPlan,
  parseLongformSceneSpec,
  parsePlanWithDiagnostics,
  toSceneRelative,
} from '../ai/explainer-scenes';
import { BUSINESS_RECIPES } from '../remotion/compositions/explainer/business/catalog';
import { ECONOMICS_SOURCE_FIXTURES } from '../remotion/compositions/explainer/business/economics/fixtures';
import { EconomicsSceneView } from '../remotion/compositions/explainer/business/economics/Scene';
import {
  MARKETS_ADDITIONAL_SOURCE_FIXTURES,
  MARKETS_SOURCE_FIXTURES,
} from '../remotion/compositions/explainer/business/markets/fixtures';
import { MarketsSceneView } from '../remotion/compositions/explainer/business/markets/Scene';
import {
  ORGANIZATION_RESOURCE_FIXTURES,
  ORGANIZATION_SOURCE_FIXTURES,
} from '../remotion/compositions/explainer/business/organization/fixtures';
import { OrganizationSceneView } from '../remotion/compositions/explainer/business/organization/Scene';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import { SceneBody } from '../remotion/compositions/explainer/SceneBody';
import {
  BUSINESS_SCENE_KINDS,
  collectSceneTimes,
  type ExplainerScene,
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
interface ProductionCase extends SourceFixture {
  name: string;
}
const primary: readonly SourceFixture[] = [
  ...ORGANIZATION_SOURCE_FIXTURES,
  ...ECONOMICS_SOURCE_FIXTURES,
  ...MARKETS_SOURCE_FIXTURES,
];
const sources: readonly SourceFixture[] = [
  ...primary,
  ...ORGANIZATION_RESOURCE_FIXTURES.map((resource) => resource.fixture),
  ...MARKETS_ADDITIONAL_SOURCE_FIXTURES,
];
const cases = sources.flatMap((fixture) => {
  const recipe = BUSINESS_RECIPES.find((item) => item.id === fixture.id);
  if (!recipe) throw new Error(`Missing frozen recipe ${fixture.id}`);
  return recipe.modes.map(
    (visualMode): ProductionCase => ({
      ...fixture,
      raw: { ...fixture.raw, visualMode },
      name: `${fixture.id}:${sources.indexOf(fixture)}:${visualMode}`,
    }),
  );
});
const kinds = [
  'organization-map',
  'system-reconciliation',
  'operating-cost',
  'scale-economics',
  'value-capture',
  'market-dependency',
  'procurement-commitment',
] as const;

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
function semanticFacts(scene: ExplainerScene): unknown {
  if ('visualMode' in scene) {
    const { visualMode: _mode, ...facts } = scene;
    return facts;
  }
  return scene;
}
function shifted(plan: PlannedExplainerScene): PlannedExplainerScene {
  return {
    ...plan,
    startTime: plan.startTime + 30,
    endTime: plan.endTime + 30,
    scene: mapSceneTimes(plan.scene, (at) => at + 30),
    cues: plan.cues.map((cue) => ({ ...cue, at: cue.at + 30 })),
  };
}

describe('organization/economics/markets real production planning (no native media proof)', () => {
  it('registers all seven concrete grammars once, with complete-window protection and old caps', () => {
    expect(primary).toHaveLength(23);
    expect(new Set(primary.map((fixture) => fixture.id)).size).toBe(23);
    expect(new Set(ALL_KIND_SPECS.map((spec) => spec.kind)).size).toBe(ALL_KIND_SPECS.length);
    for (const kind of kinds) {
      expect(BUSINESS_SCENE_KINDS).toContain(kind);
      expect(ALL_KIND_SPECS.filter((spec) => spec.kind === kind)).toHaveLength(1);
      expect(isCausalSceneKind(kind)).toBe(true);
    }
    expect(SHORTLIST_LIMITS.maxKinds).toBe(16);
    expect(SHORTLIST_LIMITS.maxProps).toBe(10);
  });

  it.each(
    cases,
  )('$name: raw source → actual shortlist/parser/dispatch, with no automatic extras', (fixture) => {
    expect(buildShortlist(fixture.words).kinds.map((spec) => spec.kind)).toContain(
      fixture.raw.kind,
    );
    const original = parsed(fixture);
    expect(parsed(fixture)).toEqual(original);
    const element = SceneBody({ scene: original.scene });
    if (!isValidElement(element)) throw new Error('Missing concrete business view');
    switch (original.scene.kind) {
      case 'organization-map':
      case 'system-reconciliation':
        expect(element.type).toBe(OrganizationSceneView);
        break;
      case 'operating-cost':
      case 'scale-economics':
      case 'value-capture':
        expect(element.type).toBe(EconomicsSceneView);
        break;
      case 'market-dependency':
      case 'procurement-commitment':
        expect(element.type).toBe(MarketsSceneView);
        break;
      default:
        throw new Error('Unexpected wave-B grammar');
    }
    expect(collectSceneTimes(original.scene)).toHaveLength(5);
    expect(collectSceneTimes(original.scene).at(-1)).toBeLessThanOrEqual(original.endTime - 0.8);
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
    cases,
  )('$name: unchanged facts, protected short/long windows and once-only rebasing', (fixture) => {
    const original = parsed(fixture);
    const plan = shifted(original);
    const groups = groupPlannedScenes([plan]);
    const pieces = spliceExplainerScenes(
      [speaker(20, 30.6), speaker(30.6, 39.5), speaker(39.5, 55)],
      groups,
      20,
    );
    const piece = pieces.find((item) => item.group);
    if (!piece?.group) throw new Error('Missing complete short-form splice');
    expect(piece.segment.startTime).toBe(plan.startTime);
    expect(piece.segment.endTime).toBe(plan.endTime);
    const short = buildGroupRenderPlan(piece.group, piece.segment, deriveExplainerPalette());
    expect(short.props.aspect).toBe('9:16');
    expect(short.props.scenes[0].scene).toEqual(
      toSceneRelative(original.scene, original.startTime),
    );
    expect(short.cues).toEqual(expect.arrayContaining(plan.cues));
    expect(fitGroupsToSpeakerRanges(groups, [{ start: plan.startTime + 0.1, end: 55 }])).toEqual(
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
    const registered = ALL_KIND_SPECS.find((spec) => spec.kind === fixture.raw.kind);
    if (!registered) throw new Error('Missing registered grammar');
    for (const layout of ['over', 'takeover'] as const) {
      expect(registered.layouts).toContain(layout);
      const spec = { ...fixture.raw, layout };
      const sourceFirst = parseLongformSceneSpec(spec, fixture.words, {
        clipStart: 0,
        clipEnd: 90,
      });
      expect(sourceFirst).not.toBeNull();
      if (!sourceFirst) throw new Error('Saved source-first route rejected valid business facts');
      expect(sourceFirst.layout).toBe(layout);
      expect(sourceFirst.startTime).toBe(original.startTime);
      expect(sourceFirst.endTime).toBe(original.endTime);
      expect(sourceFirst.scene).toEqual(original.scene);
      const sourceGroups = groupPlannedScenes([sourceFirst]);
      const native = buildGroupRenderPlan(
        sourceGroups[0],
        sourceGroups[0],
        deriveExplainerPalette(),
        '16:9',
      );
      expect(native.props.aspect).toBe('16:9');
      expect(native.props.scenes[0].scene).toEqual(
        toSceneRelative(original.scene, original.startTime),
      );
    }
  });

  it.each(
    primary,
  )('$id: declared diagram/hybrid modes keep identical source meaning', (fixture) => {
    const recipe = BUSINESS_RECIPES.find((item) => item.id === fixture.id);
    if (!recipe) throw new Error('Missing frozen recipe');
    const plans = recipe.modes.map((visualMode) =>
      parsed({ ...fixture, raw: { ...fixture.raw, visualMode } }),
    );
    const facts = semanticFacts(plans[0].scene);
    for (const plan of plans) expect(semanticFacts(plan.scene)).toEqual(facts);
  });
});
