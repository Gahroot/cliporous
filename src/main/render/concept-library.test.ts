import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isRec, type PlannerWord } from '../ai/explainer/kind-spec';
import { ALL_KIND_SPECS, getKindSpec } from '../ai/explainer/kinds';
import { buildShortlist, SHORTLIST_LIMITS } from '../ai/explainer/shortlist';
import {
  EXPLAINER_LIMITS,
  type PlannedExplainerScene,
  parseExplainerPlan,
  parsePlanWithDiagnostics,
} from '../ai/explainer-scenes';
import {
  CONCEPT_FIXTURE_PADDING,
  conceptFixtureWords,
} from '../remotion/compositions/explainer/concepts/fixture-words';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import {
  CONCEPT_SCENE_KINDS,
  collectSceneTimes,
  EXPLAINER_SCENE_KINDS,
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

interface ConceptFixture {
  name: string;
  kind: string;
  preset: string;
  sourceText: string;
  durationSec: number;
  scene: Record<string, unknown>;
  plannerInput: Record<string, unknown>;
}

const PACKS = [
  'information',
  'inference',
  'business-operations',
  'business-populations',
  'perspective',
  'adaptive',
] as const;

function loadFixtures(): ConceptFixture[] {
  return PACKS.flatMap((pack) => {
    const data: unknown = JSON.parse(
      readFileSync(
        new URL(`../../../scripts/explainer-stills/fixtures/concept-${pack}.json`, import.meta.url),
        'utf8',
      ),
    );
    if (!Array.isArray(data)) throw new Error(`Expected fixture array for ${pack}`);
    return data.map((input: unknown): ConceptFixture => {
      if (
        !isRec(input) ||
        typeof input.name !== 'string' ||
        typeof input.sourceText !== 'string' ||
        typeof input.durationSec !== 'number' ||
        !Number.isFinite(input.durationSec) ||
        input.durationSec < 5 ||
        input.durationSec > 12 ||
        !isRec(input.scene) ||
        typeof input.scene.kind !== 'string' ||
        typeof input.scene.preset !== 'string' ||
        !isRec(input.plannerInput)
      ) {
        throw new Error(`Invalid concept fixture or missing plannerInput in ${pack}`);
      }
      return {
        name: input.name,
        kind: input.scene.kind,
        preset: input.scene.preset,
        sourceText: input.sourceText,
        durationSec: input.durationSec,
        scene: input.scene,
        plannerInput: input.plannerInput,
      };
    });
  });
}

const fixtures = loadFixtures();

function wordsFor(fixture: ConceptFixture): PlannerWord[] {
  return conceptFixtureWords(fixture.sourceText, fixture.durationSec);
}

function parseFixture(fixture: ConceptFixture): PlannedExplainerScene {
  const result = parsePlanWithDiagnostics(
    { scenes: [fixture.plannerInput] },
    wordsFor(fixture),
    // This authored window sits inside a longer clip; preserve the production coverage budget.
    { minStart: 0, maxEnd: 60 },
  );
  expect(result.rejected, fixture.name).toEqual([]);
  expect(result.omitted, fixture.name).toEqual([]);
  expect(result.accepted, fixture.name).toHaveLength(1);
  const planned = result.accepted[0];
  if (!planned) throw new Error(`Parser dropped ${fixture.name}`);
  return planned;
}

function offsetPlan(planned: PlannedExplainerScene, offset: number): PlannedExplainerScene {
  return {
    ...planned,
    scene: mapSceneTimes(planned.scene, (time) => time + offset),
    startTime: planned.startTime + offset,
    endTime: planned.endTime + offset,
    cues: planned.cues.map((cue) => ({ ...cue, at: cue.at + offset })),
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

function roundedTimes(scene: ExplainerScene): ExplainerScene {
  // Production toSceneRelative deliberately preserves millisecond precision.
  return mapSceneTimes(scene, (time) => Math.round(time * 1000) / 1000);
}

describe('complete concept explanation library', () => {
  it('has exactly 18 registered kinds and 42 distinct authored presets', () => {
    expect(CONCEPT_FIXTURE_PADDING.leadInSec).toBe(EXPLAINER_LIMITS.leadInSec);
    expect(CONCEPT_FIXTURE_PADDING.tailSec).toBe(EXPLAINER_LIMITS.tailSec);
    expect(CONCEPT_SCENE_KINDS).toHaveLength(18);
    expect(fixtures).toHaveLength(42);
    expect(new Set(fixtures.map(({ kind, preset }) => `${kind}/${preset}`)).size).toBe(42);
    expect(new Set(fixtures.map(({ kind }) => kind))).toEqual(new Set(CONCEPT_SCENE_KINDS));
    for (const kind of CONCEPT_SCENE_KINDS) {
      expect(EXPLAINER_SCENE_KINDS.filter((entry) => entry === kind)).toHaveLength(1);
      expect(ALL_KIND_SPECS.filter((spec) => spec.kind === kind)).toHaveLength(1);
      expect(isCausalSceneKind(kind)).toBe(true);
    }
    expect(SHORTLIST_LIMITS.maxKinds).toBe(16);
    expect(SHORTLIST_LIMITS.maxProps).toBe(10);
  });

  it.each(
    fixtures,
  )('$name is offered from ordinary source wording without enlarging menus', (fx) => {
    const shortlist = buildShortlist(wordsFor(fx));
    expect(shortlist.kinds.map((spec) => spec.kind)).toContain(fx.kind);
    expect(shortlist.scores[fx.kind]).toBeGreaterThan(0);
    expect(shortlist.kinds.length).toBeLessThanOrEqual(16);
    expect(shortlist.heroProps.length).toBeLessThanOrEqual(10);
  });

  it.each(
    fixtures,
  )('$name renders the actual accepted model payload, not a different fixture', (fx) => {
    const planned = parseFixture(fx);
    expect(planned.scene).toEqual(fx.scene);
    expect(planned.startTime).toBeCloseTo(0, 8);
    expect(planned.endTime).toBeCloseTo(fx.durationSec, 8);
    const times = collectSceneTimes(planned.scene);
    expect(times.length).toBeGreaterThanOrEqual(5);
    expect(
      times.every((time) => Number.isFinite(time) && time >= 0 && time <= fx.durationSec),
    ).toBe(true);
    expect(planned.cues.length).toBeGreaterThan(0);
    expect(planned.cues.every((cue) => cue.at >= 0 && cue.at <= fx.durationSec)).toBe(true);
    const emphasized = parseExplainerPlan(
      { scenes: [fx.plannerInput] },
      wordsFor(fx),
      { minStart: 0, maxEnd: 60 },
      { emphasisTimes: [1, 2, 3, 4] },
    );
    expect(emphasized[0]?.scene.pulses).toBeUndefined();
    expect(emphasized[0]?.scene.overlayStamp).toBeUndefined();
  });

  it.each(
    fixtures,
  )('$name survives rebasing and the real vertical splice without truncation', (fx) => {
    const original = parseFixture(fx);
    const planned = offsetPlan(original, 30);
    const groups = groupPlannedScenes([planned]);
    const pieces = spliceExplainerScenes(
      [speaker(20, 30.5), speaker(30.5, planned.endTime - 0.3), speaker(planned.endTime - 0.3, 50)],
      groups,
      20,
    );
    const piece = pieces.find((entry) => entry.group);
    if (!piece?.group) throw new Error(`No splice for ${fx.name}`);
    expect(piece.segment.startTime).toBe(planned.startTime);
    expect(piece.segment.endTime).toBe(planned.endTime);
    const rendered = buildGroupRenderPlan(piece.group, piece.segment, deriveExplainerPalette());
    expect(rendered.props.aspect).toBe('9:16');
    expect(rendered.props.visibleSec).toBeCloseTo(fx.durationSec, 8);
    expect(roundedTimes(rendered.props.scenes[0].scene)).toEqual(roundedTimes(original.scene));
    expect(rendered.cues).toEqual(expect.arrayContaining(planned.cues));
  });

  it.each(fixtures)('$name only enters a long-form speaker range if its full story fits', (fx) => {
    const original = parseFixture(fx);
    const planned = offsetPlan(original, 30);
    const groups = groupPlannedScenes([planned]);
    expect(fitGroupsToSpeakerRanges(groups, [{ start: 31, end: 50 }])).toEqual([]);
    const fitted = fitGroupsToSpeakerRanges(groups, [{ start: 29, end: 50 }]);
    expect(fitted).toHaveLength(1);
    const rendered = buildGroupRenderPlan(fitted[0], fitted[0], deriveExplainerPalette(), '16:9');
    expect(rendered.props.aspect).toBe('16:9');
    expect(rendered.props.layout).toBe('over');
    expect(roundedTimes(rendered.props.scenes[0].scene)).toEqual(roundedTimes(original.scene));
  });

  it('keeps mixed-family chained scenes and sound cues on their own local timelines', () => {
    const selected = ['semantic-sort', 'market-exchange', 'scale-hierarchy'].map((kind) => {
      const fixture = fixtures.find((entry) => entry.kind === kind);
      if (!fixture) throw new Error(`Missing mixed sequence kind ${kind}`);
      return parseFixture(fixture);
    });
    let offset = 30;
    const planned = selected.map((original, index) => {
      const entry = {
        ...offsetPlan(original, offset),
        chained: index > 0,
        transition: 'fade' as const,
      };
      offset = entry.endTime;
      return entry;
    });
    const groups = groupPlannedScenes(planned);
    expect(groups).toHaveLength(1);
    const rendered = buildGroupRenderPlan(groups[0], groups[0], deriveExplainerPalette());
    expect(rendered.props.scenes).toHaveLength(3);
    expect(rendered.props.transitions).toHaveLength(2);
    expect(rendered.props.scenes.map(({ scene }) => roundedTimes(scene))).toEqual(
      selected.map(({ scene }) => roundedTimes(scene)),
    );
    for (const entry of selected) expect(getKindSpec(entry.scene.kind)).toBeDefined();
  });
});
