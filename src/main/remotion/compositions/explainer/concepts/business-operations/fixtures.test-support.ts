import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { conceptFixtureWords } from '../fixture-words';
import type { BusinessOperationsScene } from './types';

interface BusinessFixture {
  name: string;
  sourceText: string;
  durationSec: number;
  sourceBeats: { at: number; text: string; storyboard: string }[];
  plannerInput: Rec;
  scene: BusinessOperationsScene;
  samples: { name: string; frame: number }[];
  cases: { name: string; layout: string; aspect: string }[];
}

export const businessFixtures: BusinessFixture[] = JSON.parse(
  readFileSync(
    resolve('scripts/explainer-stills/fixtures/concept-business-operations.json'),
    'utf8',
  ),
);

export function fixtureContext(fixture: BusinessFixture, sourceText = fixture.sourceText) {
  const words = conceptFixtureWords(sourceText, fixture.durationSec);
  return makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: fixture.durationSec,
  });
}
