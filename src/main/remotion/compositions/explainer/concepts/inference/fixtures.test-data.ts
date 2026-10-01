import { readFileSync } from 'node:fs';
import { isRec, makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { CONCEPT_INFERENCE_SPECS } from '../../../../../ai/explainer/kinds-concept-inference';
import { conceptFixtureWords } from '../fixture-words';
import type { InferenceScene } from './types';

export interface InferenceFixture {
  name: string;
  sourceText: string;
  durationSec: number;
  plannerInput: Rec;
  scene: Rec;
  storyboard: Rec[];
  samples: Rec[];
  cases: Rec[];
}
const data: unknown = JSON.parse(
  readFileSync('scripts/explainer-stills/fixtures/concept-inference.json', 'utf8'),
);
if (!Array.isArray(data)) throw new Error('expected inference fixture array');
export const inferenceFixtures: InferenceFixture[] = data.map((value: unknown) => {
  if (
    !isRec(value) ||
    typeof value.name !== 'string' ||
    typeof value.sourceText !== 'string' ||
    typeof value.durationSec !== 'number' ||
    !isRec(value.plannerInput) ||
    !isRec(value.scene) ||
    !Array.isArray(value.storyboard) ||
    !value.storyboard.every(isRec) ||
    !Array.isArray(value.samples) ||
    !value.samples.every(isRec) ||
    !Array.isArray(value.cases) ||
    !value.cases.every(isRec)
  )
    throw new Error('malformed inference fixture');
  return {
    name: value.name,
    sourceText: value.sourceText,
    durationSec: value.durationSec,
    plannerInput: value.plannerInput,
    scene: value.scene,
    storyboard: value.storyboard,
    samples: value.samples,
    cases: value.cases,
  };
});

export function fixtureContext(
  fixture: InferenceFixture,
  sourceText = fixture.sourceText,
  offset = 0,
) {
  const words = conceptFixtureWords(sourceText, fixture.durationSec).map((word) => ({
    ...word,
    start: offset + word.start,
    end: offset + word.end,
  }));
  return makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: offset,
    endTime: offset + fixture.durationSec,
  });
}

export function parseFixture(
  fixture: InferenceFixture,
  raw: Rec = fixture.plannerInput,
  sourceText = fixture.sourceText,
) {
  const ctx = fixtureContext(fixture, sourceText);
  const spec = CONCEPT_INFERENCE_SPECS.find((item) => item.kind === raw.kind);
  return { scene: spec?.parse(raw, ctx) ?? null, ctx };
}

export function fixtureScene(fixture: InferenceFixture): InferenceScene {
  const { scene, ctx } = parseFixture(fixture);
  if (!scene) throw new Error(`${fixture.name}: ${ctx.issues.join('; ')}`);
  return scene;
}
