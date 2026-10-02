import {
  isSceneFirstPlanEnvelope,
  type LongformScenePlacement,
  longformSceneId,
  longformSourceFingerprint,
  type SceneFirstLongformPlan,
  sceneFirstPlanProblem,
  scheduleLongformScenes,
  validLongformWords,
} from '../../shared/longform-scenes';
import type { WordTimestamp } from '../../shared/types';
import type { SceneCue } from '../remotion/compositions/explainer/types';
import type { StoryBoardSpec } from '../remotion/compositions/storyboard/types';
import { type PlannedExplainerScene, parseLongformSceneSpec } from './explainer-scenes';
import { storyboardPolicyProblem } from './storyboards/arbitration';
import { compileStoryboardSpec } from './storyboards/compiler';

export type CompiledLongformScene =
  | { kind: 'explainer'; placement: LongformScenePlacement; planned: PlannedExplainerScene }
  | {
      kind: 'storyboard';
      placement: LongformScenePlacement;
      board: StoryBoardSpec;
      cues: SceneCue[];
    };

export type ValidatedLongformScenes =
  | { ok: true; value: { plan: SceneFirstLongformPlan; scenes: CompiledLongformScene[] } }
  | { ok: false; error: string };

/** Rebuild the approved allowlisted source specification, never regenerate editorial choices. */
export function validateSceneFirstLongformPlan(
  input: unknown,
  words: WordTimestamp[],
  duration: number,
): ValidatedLongformScenes {
  if (!isSceneFirstPlanEnvelope(input)) {
    return { ok: false, error: sceneFirstPlanProblem(input) ?? 'Invalid scene-first plan.' };
  }
  if (!validLongformWords(words, duration))
    return { ok: false, error: 'Invalid source transcript or duration.' };
  if (
    Math.abs(input.sourceDuration - duration) > 0.001 ||
    input.sourceFingerprint !== longformSourceFingerprint(words, duration)
  ) {
    return {
      ok: false,
      error:
        'This plan belongs to a different transcript or source duration. Regenerate a new draft before exporting.',
    };
  }
  for (const section of input.sections) {
    const start = words[section.startWord];
    const end = words[section.endWord];
    if (
      !start ||
      !end ||
      section.startTime > start.start + 0.001 ||
      section.endTime < end.end - 0.001
    ) {
      return {
        ok: false,
        error: `Planning section ${section.id} no longer matches the source words.`,
      };
    }
  }
  const boardProblem = storyboardPolicyProblem(input.scenes, duration);
  if (boardProblem) return { ok: false, error: boardProblem };
  const schedule = scheduleLongformScenes(input.scenes, duration);
  if (schedule.rejected.length > 0) {
    return {
      ok: false,
      error: `Approved scene ${schedule.rejected[0]?.id} has a conflicting or invalid time window. Review the plan before exporting.`,
    };
  }
  const compiled: CompiledLongformScene[] = [];
  for (const placement of input.scenes) {
    if (!words[placement.startWord] || !words[placement.endWord]) {
      return { ok: false, error: `Scene ${placement.id} refers to missing source words.` };
    }
    const section = input.sections.find((s) => s.id === placement.sectionId);
    if (
      !section ||
      placement.id !== longformSceneId(placement.kind, placement.startWord, placement.endWord) ||
      placement.startWord < section.startWord ||
      placement.startWord > section.endWord
    ) {
      return {
        ok: false,
        error: `Scene ${placement.id} no longer matches its section or source identity.`,
      };
    }
    if (placement.kind === 'storyboard') {
      if (input.parserVersion !== 2 || placement.presentation !== 'full-frame')
        return { ok: false, error: 'Storyboards require parser 2 and full-frame presentation.' };
      const result = compileStoryboardSpec(placement.sourceSpec, words, {
        clipStart: 0,
        clipEnd: duration,
        section,
        sourceId: placement.id,
      });
      if (!result.ok)
        return {
          ok: false,
          error: `Storyboard ${placement.id}: ${result.diagnostics.map((d) => `${d.code}: ${d.message}`).join('; ')}`,
        };
      const { board, cues, startTime, endTime } = result.value;
      if (
        Math.abs(startTime - placement.startTime) > 0.001 ||
        Math.abs(endTime - placement.endTime) > 0.001
      )
        return {
          ok: false,
          error: `Storyboard ${placement.id} no longer matches its approved timing.`,
        };
      if (!placement.omitted) compiled.push({ kind: 'storyboard', placement, board, cues });
      continue;
    }
    const parsed = parseLongformSceneSpec(placement.sourceSpec, words, {
      clipStart: 0,
      clipEnd: duration,
    });
    if (!parsed || parsed.scene.kind !== placement.kind) {
      return {
        ok: false,
        error: `Scene ${placement.id} is not a valid source-grounded explanation. Regenerate it before exporting.`,
      };
    }
    if (
      Math.abs(parsed.startTime - placement.startTime) > 0.001 ||
      Math.abs(parsed.endTime - placement.endTime) > 0.001
    ) {
      return {
        ok: false,
        error: `Scene ${placement.id} no longer matches its approved timing. Review a new draft before exporting.`,
      };
    }
    if (!placement.omitted) compiled.push({ kind: 'explainer', placement, planned: parsed });
  }
  compiled.sort(
    (a, b) =>
      a.placement.startTime - b.placement.startTime || a.placement.id.localeCompare(b.placement.id),
  );
  return { ok: true, value: { plan: input, scenes: compiled } };
}
