import {
  isLongformPresentation,
  isLongformSourceSpec,
  isSceneFirstLongformPlan,
  LONGFORM_SCENE_LIMITS,
  type LongformGenerationRequest,
  type LongformPlanningProgress,
  type LongformPlanningSection,
  type LongformScenePlacement,
  longformSceneId,
  longformSourceFingerprint,
  type SceneFirstLongformPlan,
  sceneFirstPlanProblem,
  scheduleLongformScenes,
  validLongformWords,
} from '@shared/longform-scenes';
import { DEFAULT_STORYBOARD_STYLE, isStoryboardStyle } from '../../shared/storyboards';
import { LONGFORM_PLANNER_PROFILE } from './explainer/planner-profiles';
import { clipIdentity, summarizeUsage, type UsageRecord } from './explainer/recent-usage';
import { parseLongformSceneSpec, planExplainerEditPlan } from './explainer-scenes';
import { validateSceneFirstLongformPlan } from './longform-scene-contract';
import {
  LONGFORM_SECTION_POLICY,
  type LongformSection,
  partitionLongformSections,
} from './longform-sections';
import { arbitrateStoryboards, storyboardPolicyProblem } from './storyboards/arbitration';
import { planStoryboardSection } from './storyboards/planner';

export type SceneFirstLongformGenerationOptions = LongformGenerationRequest & {
  signal?: AbortSignal;
  onProgress?: (progress: LongformPlanningProgress) => void;
};

function note(section: LongformPlanningSection, message: string): void {
  if (section.diagnostics.length < 100) section.diagnostics.push(message.slice(0, 1_000));
}

/** Same outward 30fps quantization as the shared scheduler; never round a story inward. */
function overlaps(a: LongformScenePlacement, b: LongformScenePlacement): boolean {
  return (
    Math.floor(a.startTime * 30 + 1e-6) < Math.ceil(b.endTime * 30 - 1e-6) &&
    Math.floor(b.startTime * 30 + 1e-6) < Math.ceil(a.endTime * 30 - 1e-6)
  );
}

/**
 * Persist source decisions, not render props. Sections share full-source parse bounds;
 * only their prompts/shortlists are local. No legacy pacing or filler generator runs here.
 */
export async function generateSceneFirstLongformPlan(
  options: SceneFirstLongformGenerationOptions,
): Promise<SceneFirstLongformPlan> {
  const { words, videoDuration, signal } = options;
  signal?.throwIfAborted();
  if (!validLongformWords(words, videoDuration))
    throw new Error('Invalid long-form source transcript.');
  if (options.mode === 'legacy') throw new Error('Use the legacy generator for legacy plans.');
  if (options.storyboardStyle !== undefined && !isStoryboardStyle(options.storyboardStyle))
    throw new Error('Invalid storyboard style.');
  const sourceFingerprint = longformSourceFingerprint(words, videoDuration);
  const windows = partitionLongformSections(words);
  if (windows.length > LONGFORM_SCENE_LIMITS.maxSections)
    throw new Error('Too many long-form planning sections.');
  const byId = new Map(windows.map((section) => [section.id, section]));
  const previous =
    options.previousPlan && isSceneFirstLongformPlan(options.previousPlan)
      ? options.previousPlan
      : undefined;
  if (options.previousPlan?.mode === 'scene-first' && !previous)
    throw new Error('Unsupported previous scene plan version.');
  if (previous) {
    const problem = sceneFirstPlanProblem(previous);
    if (problem) throw new Error(problem);
    if (
      previous.sourceFingerprint !== sourceFingerprint ||
      previous.sourceDuration !== videoDuration
    )
      throw new Error('Previous scene plan belongs to a different source transcript.');
    if (
      previous.sections.length !== windows.length ||
      previous.sections.some((section) => {
        const expected = byId.get(section.id);
        return (
          !expected ||
          section.startWord !== expected.startWord ||
          section.endWord !== expected.endWord ||
          section.startTime !== expected.startTime ||
          section.endTime !== expected.endTime
        );
      })
    )
      throw new Error('Previous planning sections are stale; regenerate without preservation.');
    // One authoritative dispatcher, including omitted boards and historical parser-1 scenes.
    const validation = validateSceneFirstLongformPlan(previous, words, videoDuration);
    if (!validation.ok) throw new Error(validation.error);
    for (const scene of previous.scenes) {
      const owner = byId.get(scene.sectionId);
      if (
        !owner ||
        scene.endWord > (scene.kind === 'storyboard' ? owner.endWord : owner.contextEndWord)
      )
        throw new Error('A previous scene cannot be reconstructed from this source.');
    }
  }
  if (!previous && (options.sectionIds !== undefined || options.preservedSceneIds?.length))
    throw new Error(
      'Section retry and scene preservation require a matching previous scene-first plan.',
    );
  const attempted = new Set(options.sectionIds ?? windows.map((section) => section.id));
  if ([...attempted].some((id) => !byId.has(id)))
    throw new Error('Unknown planning section requested.');
  const preserved = new Set(options.preservedSceneIds ?? []);
  const previousSceneIds = new Set(previous?.scenes.map((scene) => scene.id));
  if ([...preserved].some((id) => !previousSceneIds.has(id)))
    throw new Error('Unknown preserved scene requested.');

  if (previous && !attempted.size) return structuredClone(previous);
  const storyboardStyle =
    options.storyboardStyle ?? previous?.storyboardStyle ?? DEFAULT_STORYBOARD_STYLE;
  const priorSections = new Map(previous?.sections.map((section) => [section.id, section]));
  const sections = windows.map(
    ({ id, startWord, endWord, startTime, endTime }): LongformPlanningSection => {
      const prior = priorSections.get(id);
      return !attempted.has(id) && prior
        ? { ...prior, diagnostics: [...prior.diagnostics] }
        : { id, startWord, endWord, startTime, endTime, status: 'empty', diagnostics: [] };
    },
  );
  const sectionResults = new Map(sections.map((section) => [section.id, section]));
  const retained = (previous?.scenes ?? [])
    .filter((scene) => !attempted.has(scene.sectionId) || preserved.has(scene.id) || scene.omitted)
    .map((scene) => structuredClone(scene));
  const proposals: LongformScenePlacement[] = [];
  let recent: UsageRecord[] = [];
  let completed = 0;
  let successes = 0;

  const planSection = async (section: LongformSection): Promise<LongformScenePlacement[]> => {
    const output = sectionResults.get(section.id);
    if (!output) throw new Error('Missing planning section.');
    const started = Date.now();
    try {
      signal?.throwIfAborted();
      const result = await planExplainerEditPlan(
        options.apiKey,
        words,
        { minStart: 0, maxEnd: videoDuration },
        {
          profile: LONGFORM_PLANNER_PROFILE,
          aspect: '16:9',
          longformSection: { ...section, feedback: options.feedback },
          signal,
          recentUse: recent,
          onDiagnostic: (event) => {
            if (['rejected', 'removed', 'repaired', 'fallback'].includes(event.action))
              note(
                output,
                `${event.phase ?? 'draft'}:${event.reason}${event.index === undefined ? '' : `:${event.index}`}`,
              );
          },
        },
      );
      signal?.throwIfAborted();
      if (!result.ok) {
        output.status = 'failed';
        note(output, 'generation-failed');
        return [];
      }
      const placements: LongformScenePlacement[] = [];
      for (const raw of result.value.sourceSpecs ?? []) {
        if (
          !isLongformSourceSpec(raw) ||
          typeof raw.kind !== 'string' ||
          typeof raw.startWord !== 'number' ||
          typeof raw.endWord !== 'number' ||
          raw.startWord < section.startWord ||
          raw.startWord > section.endWord ||
          raw.endWord > section.contextEndWord
        ) {
          note(output, 'source-spec-rejected');
          continue;
        }
        // Deliberately identical bounds/API to saved-plan validation, not section-time bounds.
        const parsed = parseLongformSceneSpec(raw, words, { clipStart: 0, clipEnd: videoDuration });
        if (!parsed) {
          note(output, 'source-spec-reconstruction-failed');
          continue;
        }
        const excerpt = words
          .slice(raw.startWord, raw.endWord + 1)
          .map((word) => word.text)
          .join(' ');
        if (raw.presentation !== undefined && !isLongformPresentation(raw.presentation)) {
          note(output, 'invalid-presentation');
          continue;
        }
        placements.push({
          id: longformSceneId(raw.kind, raw.startWord, raw.endWord),
          kind: raw.kind,
          startWord: raw.startWord,
          endWord: raw.endWord,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          sectionId: section.id,
          presentation: isLongformPresentation(raw.presentation)
            ? raw.presentation
            : 'speaker-side',
          sourceSpec: structuredClone(raw),
          label: excerpt.slice(0, 160),
          purpose: `Explain the source passage: ${excerpt}`.slice(0, 1_000),
        });
      }
      if (!placements.length && result.value.scenes.length) {
        output.status = 'failed';
        note(output, 'all-source-specs-rejected');
        return [];
      }
      // Sequential within this section: ordinary + storyboard requests together never exceed TWO.
      const proposal = await planStoryboardSection({
        apiKey: options.apiKey,
        words,
        duration: videoDuration,
        section,
        style: storyboardStyle,
        feedback: options.feedback,
        signal,
      });
      signal?.throwIfAborted();
      const diagnostics = proposal.ok ? proposal.value.diagnostics : proposal.diagnostics;
      for (const diagnostic of diagnostics)
        note(output, `storyboard:${diagnostic.code}:${diagnostic.message}`);
      if (!proposal.ok) {
        note(output, 'storyboard-generation-failed');
        // A valid ordinary proposal remains usable, including on regeneration.
        // Without one, do not erase an old explanation or claim empty success on failure.
        if (!placements.length) {
          output.status = 'failed';
          return [];
        }
      } else if (proposal.value.board) {
        const board = proposal.value.board;
        const raw = board.sourceSpec;
        if (!isLongformSourceSpec(raw))
          throw new Error('Storyboard exceeds saved source envelope.');
        placements.push({
          id: longformSceneId('storyboard', raw.startWord, raw.endWord),
          kind: 'storyboard',
          startWord: raw.startWord,
          endWord: raw.endWord,
          startTime: board.startTime,
          endTime: board.endTime,
          sectionId: section.id,
          presentation: 'full-frame',
          sourceSpec: structuredClone(raw),
          label: raw.subject.text,
          purpose: `Explain the source passage: ${raw.subject.text}`,
        });
      }
      output.status = placements.length ? 'planned' : 'empty';
      successes++;
      return placements;
    } catch {
      signal?.throwIfAborted();
      output.status = 'failed';
      // Provider exceptions may contain prompt text or credentials. Persist only authored codes.
      note(output, 'provider-failed');
      return [];
    } finally {
      note(output, `elapsed-ms:${Math.max(0, Date.now() - started)}`);
    }
  };

  // Fixed batches make history and output independent of which provider call finishes first.
  // Partners see the same prior history; only completed earlier batches enter the next prompt.
  for (let offset = 0; offset < windows.length; offset += LONGFORM_SECTION_POLICY.concurrency) {
    signal?.throwIfAborted();
    const batch = windows.slice(offset, offset + LONGFORM_SECTION_POLICY.concurrency);
    const results = await Promise.all(
      batch.map((section) => (attempted.has(section.id) ? planSection(section) : [])),
    );
    signal?.throwIfAborted();
    for (let index = 0; index < batch.length; index++) {
      const section = batch[index];
      const output = sectionResults.get(section.id);
      if (!output) throw new Error('Missing planning section.');
      if (attempted.has(section.id)) {
        if (output.status === 'failed') {
          // Failure cannot erase last-known decisions, even when they weren't explicitly pinned.
          const existing = new Set(retained.map((scene) => scene.id));
          retained.push(
            ...(previous?.scenes ?? [])
              .filter((scene) => scene.sectionId === section.id && !existing.has(scene.id))
              .map((scene) => structuredClone(scene)),
          );
        } else proposals.push(...results[index]);
        completed++;
        options.onProgress?.({
          requestId: options.requestId,
          window: completed,
          total: attempted.size,
          sectionId: section.id,
          outcome: output.status,
        });
      }
      const usageScenes = [
        ...retained.filter((scene) => scene.sectionId === section.id && !scene.omitted),
        ...results[index],
      ];
      const compiled = usageScenes.flatMap((scene) => {
        if (scene.kind === 'storyboard') return [];
        const parsed = parseLongformSceneSpec(scene.sourceSpec, words, {
          clipStart: 0,
          clipEnd: videoDuration,
        });
        return parsed ? [parsed] : [];
      });
      recent = [
        ...recent,
        {
          clipHash: clipIdentity(sourceFingerprint, section.startTime, section.endTime),
          order: offset + index,
          choices: summarizeUsage(compiled),
        },
      ].slice(-LONGFORM_SECTION_POLICY.recentSections);
    }
  }
  signal?.throwIfAborted();
  if (attempted.size && successes === 0)
    throw new Error(
      'Every attempted long-form section failed. The previous plan was not replaced.',
    );
  if (scheduleLongformScenes(retained, videoDuration).rejected.length)
    throw new Error('Preserved scene windows conflict; review the previous plan before retrying.');
  const occupiedIds = new Set(retained.map((scene) => scene.id));
  const candidates: LongformScenePlacement[] = [];
  for (const scene of proposals) {
    const section = sectionResults.get(scene.sectionId);
    if (!section) throw new Error('Missing planning section.');
    if (occupiedIds.has(scene.id)) {
      note(section, `duplicate-or-preserved:${scene.id}`);
      continue;
    }
    if (retained.some((other) => overlaps(scene, other))) {
      note(section, `preserved-window-conflict:${scene.id}`);
      continue;
    }
    occupiedIds.add(scene.id);
    candidates.push(scene);
  }
  const protectedProblem = storyboardPolicyProblem(retained, videoDuration);
  if (protectedProblem) throw new Error(protectedProblem);
  const scheduled = scheduleLongformScenes(
    candidates.filter((s) => s.kind !== 'storyboard'),
    videoDuration,
  );
  for (const rejection of scheduled.rejected) {
    const scene = candidates.find((candidate) => candidate.id === rejection.id);
    const section = scene && sectionResults.get(scene.sectionId);
    if (section) note(section, `schedule-rejected:${rejection.id}:${rejection.reason}`);
  }
  const arbitration = arbitrateStoryboards({
    ordinary: scheduled.scenes,
    proposals: candidates.filter((s) => s.kind === 'storyboard'),
    protectedScenes: retained,
    duration: videoDuration,
  });
  for (const diagnostic of arbitration.diagnostics) {
    const candidate = candidates.find((s) => s.id === diagnostic.sourceId);
    const section = candidate && sectionResults.get(candidate.sectionId);
    if (section)
      note(section, `storyboard:${diagnostic.code}:${diagnostic.sourceId}:${diagnostic.message}`);
  }
  for (const replacement of arbitration.replacements) {
    const section = sectionResults.get(replacement.sectionId);
    if (section) note(section, `storyboard-replaced:${replacement.boardId}:${replacement.sceneId}`);
  }
  const scenes = arbitration.scenes;
  if (scenes.length > LONGFORM_SCENE_LIMITS.maxScenes)
    throw new Error('Too many scene placements.');
  for (const section of sections) {
    if (attempted.has(section.id) && section.status !== 'failed')
      section.status = scenes.some((scene) => scene.sectionId === section.id) ? 'planned' : 'empty';
  }
  const failed = sections.filter((section) => section.status === 'failed').length;
  return {
    schemaVersion: 2,
    mode: 'scene-first',
    parserVersion: 2,
    storyboardStyle,
    sourceFingerprint,
    sourceDuration: videoDuration,
    scenes,
    sections,
    blocks: [],
    phrases: [],
    cards: [],
    reasoning: `${scenes.length} source-grounded explanations; ${failed} failed sections. Speaker video remains in all other intervals.`,
    generatedAt: Date.now(),
  };
}
