import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { buildShortlist } from '../ai/explainer/shortlist';
import {
  type PlannedExplainerScene,
  parseExplainerPlan,
  parseLongformSceneSpec,
  parsePlanWithDiagnostics,
  toSceneRelative,
} from '../ai/explainer-scenes';
import { AgentWorkflowScene } from '../remotion/compositions/explainer/AgentWorkflowScene';
import { BusinessAuthoritySceneView } from '../remotion/compositions/explainer/business/authority/Scene';
import { CapitalSceneView } from '../remotion/compositions/explainer/business/capital/Scene';
import { BUSINESS_RECIPES } from '../remotion/compositions/explainer/business/catalog';
import { CommercialSceneView } from '../remotion/compositions/explainer/business/commercial/Scene';
import { BusinessAlternativeSceneView } from '../remotion/compositions/explainer/business/decisions/alternative-Scene';
import { DecisionsSceneView } from '../remotion/compositions/explainer/business/decisions/Scene';
import { EconomicsSceneView } from '../remotion/compositions/explainer/business/economics/Scene';
import { FundsSceneView } from '../remotion/compositions/explainer/business/funds/Scene';
import { InfrastructureSceneView } from '../remotion/compositions/explainer/business/infrastructure/Scene';
import { MarketsSceneView } from '../remotion/compositions/explainer/business/markets/Scene';
import { OrganizationSceneView } from '../remotion/compositions/explainer/business/organization/Scene';
import {
  type BusinessSourceFixture,
  businessSourceFixture,
  businessSourceFixtures,
} from '../remotion/compositions/explainer/business/source-fixtures';
import { BusinessWorkSceneView } from '../remotion/compositions/explainer/business/work/Scene';
import { PortfolioExposureScene } from '../remotion/compositions/explainer/finance/PortfolioExposureScene';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import { SceneBody } from '../remotion/compositions/explainer/SceneBody';
import {
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

const sources = businessSourceFixtures();
function parse(source: BusinessSourceFixture): PlannedExplainerScene {
  const result = parsePlanWithDiagnostics(
    { scenes: [{ ...source.raw, layout: 'stack' }] },
    source.words,
    { minStart: 0, maxEnd: 90 },
  );
  expect(result.rejected).toEqual([]);
  expect(result.omitted).toEqual([]);
  expect(result.accepted).toHaveLength(1);
  return result.accepted[0];
}
function facts(scene: ExplainerScene): unknown {
  if (scene.kind === 'possible-futures' && scene.businessAlternatives) {
    const { visualMode: _mode, ...lens } = scene.businessAlternatives;
    return { ...scene, businessAlternatives: lens };
  }
  if ('visualMode' in scene) {
    const { visualMode: _mode, ...rest } = scene;
    return rest;
  }
  return scene;
}
function expectedView(kind: ExplainerScene['kind']): unknown {
  switch (kind) {
    case 'task-map':
    case 'coordination-map':
    case 'work-redesign':
      return BusinessWorkSceneView;
    case 'delegation-scope':
    case 'authority-handoff':
    case 'constraint-check':
      return BusinessAuthoritySceneView;
    case 'business-blueprint':
    case 'business-replication':
      return CommercialSceneView;
    case 'organization-map':
    case 'system-reconciliation':
      return OrganizationSceneView;
    case 'operating-cost':
    case 'scale-economics':
    case 'value-capture':
      return EconomicsSceneView;
    case 'market-dependency':
    case 'procurement-commitment':
      return MarketsSceneView;
    case 'fund-lifecycle':
    case 'distribution-waterfall':
    case 'fund-liquidity':
      return FundsSceneView;
    case 'economic-rights':
    case 'capital-structure':
    case 'investment-outcomes':
      return CapitalSceneView;
    case 'capacity-map':
    case 'operating-lineage':
      return InfrastructureSceneView;
    case 'staged-decision':
    case 'measurement-frame':
    case 'uncertainty-album':
      return DecisionsSceneView;
    case 'agent-workflow':
      return AgentWorkflowScene;
    case 'portfolio-exposure':
      return PortfolioExposureScene;
    case 'possible-futures':
      return BusinessAlternativeSceneView;
    default:
      throw new Error(`No promised business recipe dispatcher for ${kind}`);
  }
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
function shifted(plan: PlannedExplainerScene): PlannedExplainerScene {
  return {
    ...plan,
    startTime: plan.startTime + 30,
    endTime: plan.endTime + 30,
    scene: mapSceneTimes(plan.scene, (at) => at + 30),
    cues: plan.cues.map((cue) => ({ ...cue, at: cue.at + 30 })),
  };
}

describe('complete eighty-recipe production library (real planning, not native media proof)', () => {
  it('has executed source cases for every declared recipe and presentation', () => {
    expect(new Set(sources.map((source) => source.id)).size).toBe(80);
    expect(sources).toHaveLength(152);
    expect(new Set(sources.map((source) => source.fixtureId)).size).toBe(152);
  });
  it.each(
    BUSINESS_RECIPES,
  )('$id: source identities/facts/clocks/qualifiers are identical across admissible presentations', (recipe) => {
    const parsed = recipe.modes.map((mode) => {
      const source = businessSourceFixture(recipe.id, mode);
      if (!source) throw new Error('Missing declared source');
      return { source, plan: parse(source) };
    });
    for (const entry of parsed) {
      expect(entry.source.words).toEqual(parsed[0].source.words);
      expect(facts(entry.plan.scene)).toEqual(facts(parsed[0].plan.scene));
      expect(entry.plan.cues).toEqual(parsed[0].plan.cues);
    }
  });
  it.each(
    sources,
  )('$fixtureId: actual shortlist/parser/concrete dispatch and no automatic extras', (source) => {
    const plan = parse(source);
    expect(buildShortlist(source.words).kinds.map((kind) => kind.kind)).toContain(plan.scene.kind);
    expect(isCausalSceneKind(plan.scene.kind)).toBe(true);
    expect(collectSceneTimes(plan.scene)).toHaveLength(5);
    expect(collectSceneTimes(plan.scene).at(-1)).toBeLessThanOrEqual(plan.endTime - 0.8);
    const view = SceneBody({ scene: plan.scene });
    if (!isValidElement(view)) throw new Error('Missing promised renderer');
    expect(view.type).toBe(expectedView(plan.scene.kind));
    const emphasized = parseExplainerPlan(
      { scenes: [{ ...source.raw, layout: 'stack' }] },
      source.words,
      { minStart: 0, maxEnd: 90 },
      { emphasisTimes: [2, 4, 6, 8] },
    );
    expect(emphasized).toHaveLength(1);
    expect(emphasized[0].scene.pulses).toBeUndefined();
    expect(emphasized[0].scene.overlayStamp).toBeUndefined();
  });
  it.each(
    sources,
  )('$fixtureId: source money/dates/IDs/five clocks survive once-only rebase and short/both long routes', (source) => {
    const original = parse(source),
      plan = shifted(original),
      groups = groupPlannedScenes([plan]);
    const pieces = spliceExplainerScenes(
      [speaker(20, 30.6), speaker(30.6, 39.5), speaker(39.5, 55)],
      groups,
      20,
    );
    const piece = pieces.find((item) => item.group);
    if (!piece?.group) throw new Error('Missing whole-interval splice');
    expect(piece.segment.startTime).toBe(plan.startTime);
    expect(piece.segment.endTime).toBe(plan.endTime);
    const short = buildGroupRenderPlan(piece.group, piece.segment, deriveExplainerPalette());
    expect(short.props.aspect).toBe('9:16');
    expect(short.props.scenes[0].scene).toEqual(
      toSceneRelative(original.scene, original.startTime),
    );
    expect(short.cues).toEqual(expect.arrayContaining(plan.cues));
    expect(
      fitGroupsToSpeakerRanges(groups, [{ start: plan.startTime + 0.1, end: plan.endTime }]),
    ).toEqual([]);
    expect(
      fitGroupsToSpeakerRanges(groups, [{ start: plan.startTime, end: plan.endTime - 0.1 }]),
    ).toEqual([]);
    const fitted = fitGroupsToSpeakerRanges(groups, [{ start: 20, end: 55 }]);
    expect(fitted).toHaveLength(1);
    const long = buildGroupRenderPlan(fitted[0], fitted[0], deriveExplainerPalette(), '16:9');
    expect(long.props.aspect).toBe('16:9');
    expect(long.props.scenes[0].scene).toEqual(short.props.scenes[0].scene);
    const saved = parseLongformSceneSpec({ ...source.raw, layout: 'over' }, source.words, {
      clipStart: 0,
      clipEnd: 90,
    });
    expect(saved?.scene).toEqual(original.scene);
    expect(saved?.cues).toEqual(original.cues);
    expect(saved?.layout).toBe('over');
  });
  it.each(
    sources,
  )('$fixtureId: oversized/nonfinite/unknown/malformed facts and cropped protected windows fail closed', (source) => {
    for (const patch of [
      { arbitraryGeometry: { vertices: [1, 2, 3] } },
      { subject: 'x'.repeat(20000) },
      { setupWord: Number.NaN },
      { resolveWord: Infinity },
      { setupWord: source.raw.actionWord },
    ]) {
      const result = parsePlanWithDiagnostics(
        { scenes: [{ ...source.raw, ...patch, layout: 'stack' }] },
        source.words,
        { minStart: 0, maxEnd: 90 },
      );
      expect(result.accepted).toEqual([]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].problems.length).toBeGreaterThan(0);
    }
    expect(
      parsePlanWithDiagnostics({ scenes: [{ ...source.raw, layout: 'stack' }] }, source.words, {
        minStart: 2,
        maxEnd: 5,
      }).accepted,
    ).toEqual([]);
    expect(
      parseLongformSceneSpec({ ...source.raw, layout: 'over' }, source.words, {
        clipStart: 2,
        clipEnd: 5,
      }),
    ).toBeNull();
  });
});
