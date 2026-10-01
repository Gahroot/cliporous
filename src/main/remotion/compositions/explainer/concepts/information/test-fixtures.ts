import { readFileSync, writeFileSync } from 'node:fs';
import { isRec, makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { CONCEPT_INFORMATION_SPECS } from '../../../../../ai/explainer/kinds-concept-information';
import { conceptFixtureWords } from '../fixture-words';
import type { InformationScene } from './types';

export interface InformationFixture {
  name: string;
  sourceText: string;
  durationSec: number;
  plannerInput: Rec;
  scene: Rec;
  samples: { name: string; frame: number }[];
  storyboard: { beat: string; word: number; at: number; description: string }[];
}

const data: unknown = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../../scripts/explainer-stills/fixtures/concept-information.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
if (!Array.isArray(data)) throw new Error('Information fixtures must be an array');
export const informationFixtures: InformationFixture[] = data.map((value: unknown) => {
  if (
    !isRec(value) ||
    typeof value.name !== 'string' ||
    typeof value.sourceText !== 'string' ||
    typeof value.durationSec !== 'number' ||
    !isRec(value.plannerInput) ||
    !isRec(value.scene) ||
    !Array.isArray(value.samples) ||
    !Array.isArray(value.storyboard)
  )
    throw new Error('Invalid information fixture');
  const samples = value.samples.map((sample: unknown) => {
    if (!isRec(sample) || typeof sample.name !== 'string' || typeof sample.frame !== 'number')
      throw new Error('Invalid information sample');
    return { name: sample.name, frame: sample.frame };
  });
  const storyboard = value.storyboard.map((step: unknown) => {
    if (
      !isRec(step) ||
      typeof step.beat !== 'string' ||
      typeof step.word !== 'number' ||
      typeof step.at !== 'number' ||
      typeof step.description !== 'string'
    )
      throw new Error('Invalid information storyboard step');
    return { beat: step.beat, word: step.word, at: step.at, description: step.description };
  });
  return {
    name: value.name,
    sourceText: value.sourceText,
    durationSec: value.durationSec,
    plannerInput: value.plannerInput,
    scene: value.scene,
    samples,
    storyboard,
  };
});

export function informationWords(fixture: InformationFixture, source = fixture.sourceText) {
  return conceptFixtureWords(source, fixture.durationSec);
}

export function informationContext(fixture: InformationFixture, source = fixture.sourceText) {
  const words = informationWords(fixture, source);
  return makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: fixture.durationSec,
  });
}

export function informationBody(fixture: InformationFixture) {
  const spec = CONCEPT_INFORMATION_SPECS.find((entry) => entry.kind === fixture.plannerInput.kind);
  if (!spec) throw new Error(`Missing information spec: ${fixture.name}`);
  const ctx = informationContext(fixture);
  const body = spec.parse(fixture.plannerInput, ctx);
  if (!body) throw new Error(`${fixture.name}: ${ctx.issues.join('; ')}`);
  return body;
}

/** Explicit opt-in fixture authoring; normal tests never write files. */
export function refreshInformationFixture(
  fixture: InformationFixture,
  scene: InformationScene,
): void {
  const path = new URL(
    '../../../../../../../scripts/explainer-stills/fixtures/concept-information.json',
    import.meta.url,
  );
  const input: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(input) || !input.every(isRec))
    throw new Error('Invalid information fixture file');
  const entry = input.find((value) => value.name === fixture.name);
  if (!entry) throw new Error('Missing fixture');
  const times = [
    scene.setupAt + 0.2,
    (scene.actionAt + scene.responseAt) / 2,
    scene.responseAt + 0.25,
    scene.checkAt + 0.25,
    scene.resolveAt + 0.5,
  ];
  const names = ['orientation', 'primary-change', 'relationship', 'comparison', 'final-hold'];
  const beats = ['setup', 'action', 'response', 'check', 'resolve'] as const;
  const authored = entry.storyboard;
  if (!Array.isArray(authored) || !authored.every(isRec))
    throw new Error('Missing authored information storyboard');
  const storyboard = beats.map((beat) => {
    const step = authored.find((value) => value.beat === beat);
    const word = fixture.plannerInput[`${beat}Word`];
    if (!step || typeof step.description !== 'string' || typeof word !== 'number')
      throw new Error(`Missing authored ${beat} storyboard step`);
    return { beat, word, at: scene[`${beat}At`], description: step.description };
  });
  entry.scene = scene;
  entry.storyboard = storyboard;
  entry.samples = times.map((time, index) => ({
    name: names[index],
    frame: Math.round(time * 30),
  }));
  writeFileSync(path, `${JSON.stringify(input, null, 2)}\n`);
  fixture.scene = { ...scene };
  fixture.storyboard = storyboard;
}
