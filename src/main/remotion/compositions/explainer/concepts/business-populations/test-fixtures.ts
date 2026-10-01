import { readFileSync } from 'node:fs';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import {
  parseCustomerCohort,
  parseInventoryDemand,
  parsePopulationDistribution,
} from '../../../../../ai/explainer/kinds-concept-business-populations';
import { conceptFixtureWords } from '../fixture-words';
import type { BusinessPopulationsScene } from './types';

export interface PopulationFixture {
  name: string;
  sourceText: string;
  durationSec: number;
  plannerInput: Rec;
  scene: BusinessPopulationsScene;
  samples: { name: string; frame: number }[];
  storyboard: { beat: string; word: number; at: number; action: string }[];
  sourceBeats: { at: number; text: string; storyboard: string }[];
  cases: {
    name: string;
    layout: string;
    aspect: string;
    palette: { text: string; bgOuter: string };
  }[];
}
export const populationFixtures: PopulationFixture[] = JSON.parse(
  readFileSync('scripts/explainer-stills/fixtures/concept-business-populations.json', 'utf8'),
);
export function fixtureContext(fixture: PopulationFixture, sourceText = fixture.sourceText) {
  const words = conceptFixtureWords(sourceText, fixture.durationSec);
  return makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: fixture.durationSec,
  });
}
export function parsePopulationFixture(
  fixture: PopulationFixture,
  raw: Rec = fixture.plannerInput,
  sourceText = fixture.sourceText,
) {
  const ctx = fixtureContext(fixture, sourceText);
  const parse =
    raw.kind === 'population-distribution'
      ? parsePopulationDistribution
      : raw.kind === 'customer-cohort'
        ? parseCustomerCohort
        : parseInventoryDemand;
  return { scene: parse(raw, ctx), ctx };
}
