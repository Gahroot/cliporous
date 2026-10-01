import assert from 'node:assert/strict';
import { type PlannerWord, parseLongformSceneSpec } from '../../src/main/ai/explainer-scenes';
import { validateSceneFirstLongformPlan } from '../../src/main/ai/longform-scene-contract';
import { partitionLongformSections } from '../../src/main/ai/longform-sections';
import {
  isLongformSourceSpec,
  type LongformPresentation,
  type LongformScenePlacement,
  longformSceneId,
  longformSourceFingerprint,
  type SceneFirstLongformPlan,
} from '../../src/shared/longform-scenes';
import { offsetConceptWords } from './concept-e2e.fixture';
import { hybridFixtures } from './hybrid-e2e.fixture';

export const LONGFORM_FIXTURE_SECONDS = 42;

function speech(text: string, start: number, duration: number): PlannerWord[] {
  const tokens = text.split(' ');
  const step = duration / tokens.length;
  return tokens.map((text, index) => ({
    text,
    start: start + index * step,
    end: start + (index + 0.9) * step,
  }));
}

/** Local authored transcript, NOT an ASR claim about the synthetic tone track.
 * Existing clay/hybrid evidence and all nested word indices are preserved verbatim
 * except for a uniform source-global index/time offset. No AI or cooked canonical scene.
 */
export function longformScenesFixture(repetitions = 1) {
  assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 24);
  // Grounded rooms example from kinds-spatial.test.ts, retaining its five beat windows.
  const houseWords: PlannerWord[] = [];
  const houseRaw: Record<string, unknown> = {
    kind: 'house-cutaway',
    preset: 'rooms',
    label: 'house',
    subject: 'house',
    outcome: 'reveals its rooms',
    parts: ['kitchen', 'bedroom'],
    startWord: 0,
    layout: 'stack',
  };
  const phases = ['setup', 'action', 'response', 'check', 'resolve'];
  const times = [0, 1.8, 3.4, 5, 6.6, 8.4];
  [
    'The house contains several rooms.',
    'Lifting the roof reveals the kitchen and bedroom.',
    'The kitchen and bedroom are rooms inside the house.',
    'The house shows its interior.',
    'The house reveals its rooms.',
  ].forEach((text, index) => {
    houseRaw[`${phases[index]}Word`] = houseWords.length;
    houseWords.push(...speech(text, 9 + times[index], times[index + 1] - times[index]));
  });
  houseRaw.endWord = houseWords.length - 1;
  const attention = hybridFixtures().find(
    (fixture) => fixture.scene.kind === 'token-attention' && fixture.scene.visualMode === 'hybrid',
  );
  assert.ok(attention, 'Existing grounded attention hybrid is required');
  const words: PlannerWord[] = [];
  const decisions: {
    raw: Record<string, unknown>;
    presentation: LongformPresentation;
    label: string;
    omitted?: boolean;
  }[] = [];
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const offset = repetition * LONGFORM_FIXTURE_SECONDS;
    words.push(...speech('This local example keeps the original source.', offset + 0.1, 1.5));
    const append = (
      local: PlannerWord[],
      raw: Record<string, unknown>,
      presentation: LongformPresentation,
      label: string,
      omitted = false,
    ) => {
      const shifted = offsetConceptWords(raw, words.length) as Record<string, unknown>;
      words.push(
        ...local.map((word) => ({ ...word, start: word.start + offset, end: word.end + offset })),
      );
      decisions.push({ raw: shifted, presentation, label, ...(omitted ? { omitted } : {}) });
    };
    const checklist = speech(
      'Save the source then review the scene plan and finally export the approved result.',
      2.25,
      3.4,
    );
    append(
      checklist,
      {
        kind: 'checklist',
        startWord: 0,
        endWord: checklist.length - 1,
        layout: 'stack',
        items: [
          { label: 'Save the source', word: 0 },
          { label: 'Review the scene plan', word: 4 },
          { label: 'Export the approved result', word: 10 },
        ],
      },
      'speaker-side',
      'Save, review, export',
    );
    words.push(...speech('Now consider the house structure.', offset + 6.6, 1.5));
    append(houseWords, houseRaw, 'speaker-pip', 'House rooms');
    words.push(...speech('Next is an illustrative word relationship.', offset + 20.2, 1.8));
    append(
      attention.sourceWords.map((word) => ({
        ...word,
        start: word.start + 23,
        end: word.end + 23,
      })),
      attention.plannerInput,
      'full-frame',
      'Illustrative attention, not measured weights',
    );
    words.push(...speech('The last proposed scene remains omitted.', offset + 33.3, 1.5));
    const omitted = speech('The battery stores energy and powers the device.', 36.25, 3.2);
    append(
      omitted,
      {
        kind: 'hero',
        prop: 'battery',
        label: 'Battery energy',
        word: 1,
        startWord: 0,
        endWord: omitted.length - 1,
        layout: 'stack',
      },
      'speaker-side',
      'Omitted battery',
      true,
    );
    words.push(...speech('Return to the unmodified source.', offset + 40.1, 1.5));
  }
  const sourceDuration = LONGFORM_FIXTURE_SECONDS * repetitions;
  const windows = partitionLongformSections(words);
  const scenes: LongformScenePlacement[] = decisions.map(
    ({ raw, presentation, label, omitted }) => {
      const parsed = parseLongformSceneSpec(raw, words, { clipStart: 0, clipEnd: sourceDuration });
      assert.ok(parsed, `Grounded fixture must reconstruct: ${label}`);
      assert.ok(isLongformSourceSpec(raw));
      const startWord = raw.startWord as number;
      const endWord = raw.endWord as number;
      const owner = windows.find(
        (section) => startWord >= section.startWord && startWord <= section.endWord,
      );
      assert.ok(owner);
      const kind = raw.kind as string;
      return {
        id: longformSceneId(kind, startWord, endWord),
        kind,
        startWord,
        endWord,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        sectionId: owner.id,
        presentation,
        sourceSpec: raw,
        label,
        purpose: words
          .slice(startWord, endWord + 1)
          .map((word) => word.text)
          .join(' '),
        ...(omitted ? { omitted } : {}),
      };
    },
  );
  const plan: SceneFirstLongformPlan = {
    schemaVersion: 2,
    mode: 'scene-first',
    parserVersion: 1,
    sourceFingerprint: longformSourceFingerprint(words, sourceDuration),
    sourceDuration,
    generatedAt: 0,
    reasoning: 'Local grounded media proof; no AI generation.',
    blocks: [],
    phrases: [],
    cards: [],
    scenes,
    sections: windows.map(({ id, startWord, endWord, startTime, endTime }) => ({
      id,
      startWord,
      endWord,
      startTime,
      endTime,
      status: 'planned',
      diagnostics: [],
    })),
  };
  const saved: SceneFirstLongformPlan = JSON.parse(JSON.stringify(plan));
  assert.deepEqual(saved, plan);
  const validated = validateSceneFirstLongformPlan(saved, words, sourceDuration);
  assert.ok(validated.ok, validated.ok ? '' : validated.error);
  return {
    words,
    plan: saved,
    compiled: validated.value.scenes,
    repetitions,
    fixtureNames: ['authored-checklist', 'house-cutaway-rooms', attention.name, 'omitted-battery'],
  };
}
