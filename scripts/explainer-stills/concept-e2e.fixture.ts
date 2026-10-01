import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRec, type Rec } from '../../src/main/ai/explainer/kind-spec';
import {
  EXPLAINER_LIMITS,
  type PlannedExplainerScene,
  type PlannerWord,
  parseExplainerPlan,
  parsePlanWithDiagnostics,
} from '../../src/main/ai/explainer-scenes';
import { ADAPTIVE_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/adaptive/types';
import { BUSINESS_OPERATIONS_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/business-operations/types';
import { BUSINESS_POPULATIONS_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/business-populations/types';
import {
  CONCEPT_FIXTURE_PADDING,
  conceptFixtureWords,
} from '../../src/main/remotion/compositions/explainer/concepts/fixture-words';
import { INFERENCE_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/inference/types';
import { INFORMATION_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/information/types';
import { PERSPECTIVE_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/perspective/types';
import { CONCEPT_PACKS, ROOT } from './verify-systems-e2e.mjs';

const catalogs: Record<string, Record<string, readonly string[]>> = {
  information: INFORMATION_PRESETS,
  inference: INFERENCE_PRESETS,
  'business-operations': BUSINESS_OPERATIONS_PRESETS,
  'business-populations': BUSINESS_POPULATIONS_PRESETS,
  perspective: PERSPECTIVE_PRESETS,
  adaptive: ADAPTIVE_PRESETS,
};
const counts = [7, 6, 8, 8, 6, 7];

export interface ConceptFixture {
  pack: string;
  name: string;
  sourceText: string;
  durationSec: number;
  scene: Rec & { kind: string; preset: string };
  plannerInput: Rec;
}

/** Fail closed while packs are being authored: no partial catalog can produce a passing report. */
export function conceptFixtures(): ConceptFixture[] {
  const paths = CONCEPT_PACKS.map((pack) =>
    join(ROOT, `scripts/explainer-stills/fixtures/concept-${pack}.json`),
  );
  const missing = paths.filter((file) => !existsSync(file));
  assert.equal(missing.length, 0, `Concept fixtures incomplete: ${missing.join(', ')}`);
  return CONCEPT_PACKS.flatMap((pack, packIndex) => {
    const inputs: unknown = JSON.parse(readFileSync(paths[packIndex], 'utf8'));
    assert.ok(Array.isArray(inputs), `${pack}: expected a fixture array`);
    assert.equal(inputs.length, counts[packIndex], `${pack}: incomplete frozen preset catalog`);
    const fixtures = inputs.map((input: unknown): ConceptFixture => {
      assert.ok(isRec(input), `${pack}: invalid fixture`);
      assert.ok(typeof input.name === 'string' && input.name.trim(), `${pack}: missing name`);
      assert.ok(
        typeof input.sourceText === 'string' && input.sourceText.trim(),
        `${input.name}: missing sourceText`,
      );
      assert.ok(
        typeof input.durationSec === 'number' &&
          Number.isFinite(input.durationSec) &&
          input.durationSec >= 5 &&
          input.durationSec <= 12,
        `${input.name}: expected a finite 5–12s window`,
      );
      const scene = input.scene;
      assert.ok(isRec(scene), `${input.name}: missing scene`);
      assert.ok(typeof scene.kind === 'string' && typeof scene.preset === 'string');
      assert.ok(isRec(input.plannerInput), `${input.name}: missing raw plannerInput`);
      assert.equal(input.plannerInput.kind, scene.kind, input.name);
      assert.equal(input.plannerInput.preset, scene.preset, input.name);
      return {
        pack,
        name: input.name,
        sourceText: input.sourceText,
        durationSec: input.durationSec,
        scene: { ...scene, kind: scene.kind, preset: scene.preset },
        plannerInput: input.plannerInput,
      };
    });
    const expected = Object.entries(catalogs[pack]).flatMap(([kind, presets]) =>
      presets.map((preset) => `${kind}/${preset}`),
    );
    assert.deepEqual(
      fixtures.map(({ scene }) => `${scene.kind}/${scene.preset}`).sort(),
      expected.sort(),
      `${pack}: missing, duplicate or unexpected authored preset`,
    );
    return fixtures;
  });
}

export function conceptWords(fixture: ConceptFixture): PlannerWord[] {
  assert.equal(CONCEPT_FIXTURE_PADDING.leadInSec, EXPLAINER_LIMITS.leadInSec);
  assert.equal(CONCEPT_FIXTURE_PADDING.tailSec, EXPLAINER_LIMITS.tailSec);
  return conceptFixtureWords(fixture.sourceText, fixture.durationSec);
}

/** Every fixture must survive the full production planner, including window/variety guards. */
export function parseConceptFixture(fixture: ConceptFixture): PlannedExplainerScene {
  const words = conceptWords(fixture);
  assert.equal(fixture.plannerInput.startWord, 0, fixture.name);
  assert.equal(fixture.plannerInput.endWord, words.length - 1, fixture.name);
  const raw = { scenes: [fixture.plannerInput] };
  const bounds = { minStart: 0, maxEnd: 60 };
  const planned = parseExplainerPlan(raw, words, bounds, {});
  const diagnostics = parsePlanWithDiagnostics(raw, words, bounds);
  assert.equal(planned.length, 1, `${fixture.name}: ${JSON.stringify(diagnostics)}`);
  assert.deepEqual(diagnostics.rejected, [], fixture.name);
  assert.deepEqual(diagnostics.omitted, [], fixture.name);
  // Fixture JSON may serialize beats to milliseconds. Compare only times at that precision;
  // every label, actor, quantity and relationship remains exact, and rendering uses the unrounded plan.
  const milliseconds = (scene: unknown): unknown =>
    JSON.parse(
      JSON.stringify(scene, (key, value: unknown) =>
        typeof value === 'number' && (key === 'at' || key.endsWith('At'))
          ? Math.round(value * 1000) / 1000
          : value,
      ),
    );
  assert.deepEqual(
    milliseconds(planned[0].scene),
    milliseconds(fixture.scene),
    `${fixture.name}: fixture differs from accepted raw payload`,
  );
  assert.equal(planned[0].startTime, 0, fixture.name);
  assert.ok(Math.abs(planned[0].endTime - fixture.durationSec) < 1e-8, fixture.name);
  return planned[0];
}

/** Only word-index fields move; amounts, item indices and business measurements must not. */
export function offsetConceptWords(value: unknown, offset: number): unknown {
  if (Array.isArray(value)) return value.map((entry) => offsetConceptWords(entry, offset));
  if (!isRec(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === 'number' && (key === 'word' || key.endsWith('Word'))
        ? entry + offset
        : offsetConceptWords(entry, offset),
    ]),
  );
}

/** Synthetic mixed-family transcript; real full-plan parser owns padding, chains and variety.
 * Each fixture already contains the planner's lead-in/tail; do not add or compress its beats. */
export function conceptChainFixture(fixtures: ConceptFixture[]) {
  const keys = [
    'token-choice/next-token',
    'market-exchange/direct-sale',
    'scale-hierarchy/chip-to-center',
  ];
  const words: PlannerWord[] = [];
  let cursor = 0;
  const scenes = keys.map((key, i) => {
    const fixture = fixtures.find(({ scene }) => `${scene.kind}/${scene.preset}` === key);
    assert.ok(fixture, `Missing representative concept fixture ${key}`);
    const shifted = offsetConceptWords(fixture.plannerInput, words.length);
    assert.ok(isRec(shifted));
    words.push(
      ...conceptWords(fixture).map((word) => ({
        ...word,
        start: word.start + cursor,
        end: word.end + cursor,
      })),
    );
    cursor += fixture.durationSec;
    return { ...shifted, layout: 'stack', continues: i > 0, transition: 'fade' };
  });
  return { raw: { scenes }, words, bounds: { minStart: 0, maxEnd: 60 }, keys };
}
