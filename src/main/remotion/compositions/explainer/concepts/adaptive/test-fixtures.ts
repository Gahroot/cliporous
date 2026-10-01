import { readFileSync } from 'node:fs';
import { isRec, makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { conceptFixtureWords } from '../fixture-words';
import type { AdaptiveScene } from './types';

export const ADAPTIVE_PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
export type AdaptivePhase = (typeof ADAPTIVE_PHASES)[number];
export interface AdaptiveFixture {
  name: string;
  durationSec: number;
  sourceText: string;
  plannerInput: Rec;
  scene: AdaptiveScene;
  cases: { layout: string; aspect: string; palette?: { text: string } }[];
  palette: { text: string };
  samples: { name: string; frame: number }[];
  storyboard: { beat: AdaptivePhase; word: number; at: number; description: string }[];
  covers: { category: string; id: string }[];
}
export const adaptiveFixtures: AdaptiveFixture[] = JSON.parse(
  readFileSync('scripts/explainer-stills/fixtures/concept-adaptive.json', 'utf8'),
);

export function adaptiveFixture(preset: AdaptiveScene['preset']): AdaptiveFixture {
  const result = adaptiveFixtures.find((fixture) => fixture.scene.preset === preset);
  if (!result) throw new Error(`Missing adaptive fixture ${preset}`);
  return structuredClone(result);
}
export function adaptiveFixtureContext(fixture: AdaptiveFixture) {
  const words = conceptFixtureWords(fixture.sourceText, fixture.durationSec);
  return makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: fixture.durationSec,
  });
}

/** Re-index all evidence when replacing source clauses: negative tests use the real parser. */
export function rewriteAdaptive(
  fixture: AdaptiveFixture,
  changes: Partial<Record<AdaptivePhase, string>>,
): AdaptiveFixture {
  const result = structuredClone(fixture);
  const old = fixture.sourceText.split(/\s+/);
  const raw = result.plannerInput;
  const clauses = ADAPTIVE_PHASES.map((phase, index) => {
    const from = fixture.plannerInput[`${phase}Word`];
    const next = ADAPTIVE_PHASES[index + 1];
    const to = next ? fixture.plannerInput[`${next}Word`] : old.length;
    if (typeof from !== 'number' || typeof to !== 'number') throw new Error('Missing source beat');
    return changes[phase] ?? old.slice(from, to).join(' ');
  });
  const starts: number[] = [];
  let count = 0;
  for (const [index, clause] of clauses.entries()) {
    starts.push(count);
    raw[`${ADAPTIVE_PHASES[index]}Word`] = count;
    count += clause.split(/\s+/).length;
  }
  const evidence = (phase: number) => ({
    fromWord: starts[phase],
    toWord: (starts[phase + 1] ?? count) - 1,
  });
  if (Array.isArray(raw.relationships)) {
    raw.relationships = raw.relationships.map((entry, index) =>
      isRec(entry) ? { ...entry, word: starts[index + 1], evidence: evidence(index + 1) } : entry,
    );
  }
  const fields =
    fixture.scene.kind === 'robot-perception'
      ? ['observation', 'recognition', 'response']
      : fixture.scene.kind === 'modular-machine'
        ? ['arrangement', 'compatibility', 'operation']
        : [];
  fields.forEach((field, index) => {
    raw[field] = evidence(index + 1);
  });
  raw.endWord = count - 1;
  result.sourceText = clauses.join(' ');
  return result;
}
