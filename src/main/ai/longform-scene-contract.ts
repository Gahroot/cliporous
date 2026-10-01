import {
  isSceneFirstPlanEnvelope,
  type LongformScenePlacement,
  longformSourceFingerprint,
  type SceneFirstLongformPlan,
  sceneFirstPlanProblem,
  scheduleLongformScenes,
  validLongformWords,
} from '../../shared/longform-scenes';
import type { WordTimestamp } from '../../shared/types';
import { type PlannedExplainerScene, parseLongformSceneSpec } from './explainer-scenes';

export interface CompiledLongformScene {
  placement: LongformScenePlacement;
  planned: PlannedExplainerScene;
}

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
    if (!placement.omitted) compiled.push({ placement, planned: parsed });
  }
  compiled.sort(
    (a, b) =>
      a.placement.startTime - b.placement.startTime || a.placement.id.localeCompare(b.placement.id),
  );
  return { ok: true, value: { plan: input, scenes: compiled } };
}
