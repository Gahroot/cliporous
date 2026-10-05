import { parsePlanWithDiagnostics, toSceneRelative } from '../../src/main/ai/explainer-scenes';
import { validateSceneFirstLongformPlan } from '../../src/main/ai/longform-scene-contract';
import { BUSINESS_SEQUENCE_FIXTURES } from '../../src/main/ai/storyboards/business-sequences';
import { compileStoryboardSpec } from '../../src/main/ai/storyboards/compiler';
import { savedBoardFixture } from '../../src/main/ai/storyboards/fixtures';
import { BUSINESS_RECIPES } from '../../src/main/remotion/compositions/explainer/business/catalog';
import { businessSourceFixtures } from '../../src/main/remotion/compositions/explainer/business/source-fixtures';
import { stageCanvasFor } from '../../src/main/remotion/compositions/explainer/types';
import { buildLongformSceneTimeline } from '../../src/main/render/longform-scene-timeline';
import { assertBusinessFixtures, businessCases } from './business-manifest.mjs';
import {
  CONTRAST_PALETTE,
  criticalFrames,
  sceneBeats,
  verificationPlan,
} from './fixture-manifest.mjs';
import { digest } from './harness-runtime.mjs';

export interface BusinessNativeFixture {
  name: string;
  scene: import('../../src/main/remotion/compositions/explainer/types').ExplainerScene;
  durationSec: number;
  samples: { name: string; frame: number }[];
  cases: ReturnType<typeof businessCases>;
  expectations: Record<string, unknown>;
  source: {
    raw: import('../../src/main/ai/explainer/kind-spec').Rec;
    words: import('../../src/main/ai/explainer/kind-spec').PlannerWord[];
  };
  covers: { category: string; id: string }[];
}

export function createBusinessFixtures(): BusinessNativeFixture[] {
  const fixtures = businessSourceFixtures().map((source) => {
    const parsed = parsePlanWithDiagnostics(
      { scenes: [{ ...source.raw, layout: 'stack' }] },
      source.words,
      { minStart: 0, maxEnd: 90 },
    );
    if (parsed.rejected.length || parsed.omitted.length || parsed.accepted.length !== 1)
      throw new Error(`${source.fixtureId}: source parsing failed`);
    const plan = parsed.accepted[0];
    const recipe = BUSINESS_RECIPES.find((r) => r.id === source.id);
    if (!recipe?.modes.includes(source.visualMode))
      throw new Error(`${source.id}: missing catalog mode`);
    const scene = toSceneRelative(plan.scene, plan.startTime);
    const durationSec = plan.endTime - plan.startTime;
    const cases = businessCases(CONTRAST_PALETTE);
    const samples = [{ name: 'setup', frame: 0 }];
    for (const layout of new Set(cases.map((c) => c.layout))) {
      const native = parsePlanWithDiagnostics(
        { scenes: [{ ...source.raw, layout }] },
        source.words,
        { minStart: 0, maxEnd: 90 },
      );
      if (
        native.rejected.length ||
        native.omitted.length ||
        native.accepted.length !== 1 ||
        native.accepted[0].startTime !== plan.startTime ||
        native.accepted[0].endTime !== plan.endTime
      )
        throw new Error(`${source.fixtureId}: unsupported native layout ${layout}`);
    }
    return {
      name: source.fixtureId,
      scene,
      durationSec,
      samples,
      cases,
      expectations: {
        evidenceType: 'declaration-not-execution',
        recipeId: recipe.id,
        visualMode: source.visualMode,
        expectedWebGLCanvases: source.visualMode === 'diagram' ? 0 : 1,
        sourceWindow: { start: plan.startTime, end: plan.endTime },
        words: source.words
          .filter((w) => w.start >= plan.startTime && w.end <= plan.endTime)
          .map((w) => ({ ...w, start: w.start - plan.startTime, end: w.end - plan.startTime })),
        contextWords: source.words,
        beats: sceneBeats(scene, durationSec),
        criticalFrames: criticalFrames({ scene, durationSec, samples }),
        cases: cases.map((c) => ({
          ...c,
          ...stageCanvasFor(c.layout, c.aspect),
          fps: 30,
          frames: Math.round(durationSec * 30),
        })),
      },
      source: { raw: source.raw, words: source.words },
      covers: [
        { category: 'recipe', id: recipe.id },
        ...recipe.treatments.map((id) => ({ category: 'motion', id })),
        ...(source.visualMode === 'hybrid'
          ? recipe.assets.map((id) => ({ category: 'asset', id }))
          : []),
      ],
    };
  });
  assertBusinessFixtures(fixtures);
  verificationPlan(fixtures, { matrix: false, scope: 'business' });
  return fixtures;
}

export interface BusinessSequenceExpectation {
  id: string;
  approvedSourceSha256: string;
  spec: import('../../src/shared/storyboards').StoryboardSourceSpec;
  words: import('../../src/shared/types').WordTimestamp[];
  sourceFingerprint: string;
  previewFrames: number;
  exportFrames: number;
  sourceDuration: number;
  startTime: number;
  endTime: number;
}

export function createBusinessSequenceExpectations(): BusinessSequenceExpectation[] {
  return BUSINESS_SEQUENCE_FIXTURES.map((fixture) => {
    const compiled = compileStoryboardSpec(fixture.spec, fixture.words, {
      clipStart: 0,
      clipEnd: fixture.duration,
    });
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
    const saved = { ...savedBoardFixture(fixture), parserVersion: 3 };
    const checked = validateSceneFirstLongformPlan(
      JSON.parse(JSON.stringify(saved)),
      fixture.words,
      fixture.duration,
    );
    if (!checked.ok) throw new Error(checked.error);
    const segment = buildLongformSceneTimeline(
      checked.value.plan,
      checked.value.scenes,
    ).segments.find((s) => s.kind === 'scene');
    if (!segment || segment.kind !== 'scene') throw new Error('Missing saved sequence scene');
    return {
      id: fixture.id,
      approvedSourceSha256: digest(fixture.spec),
      spec: fixture.spec,
      words: fixture.words,
      sourceFingerprint: saved.sourceFingerprint,
      previewFrames: segment.endFrame - segment.startFrame,
      exportFrames: Math.round(fixture.duration * 30),
      sourceDuration: fixture.duration,
      startTime: saved.scenes[0].startTime,
      endTime: saved.scenes[0].endTime,
    };
  });
}
