import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isRec, type PlannerWord, type Rec } from '../../src/main/ai/explainer/kind-spec';
import {
  type PlannedExplainerScene,
  parsePlanWithDiagnostics,
} from '../../src/main/ai/explainer-scenes';
import { HYBRID_SCENE_KINDS } from '../../src/main/remotion/compositions/explainer/types';
import { offsetConceptWords } from './concept-e2e.fixture';

export interface HybridFixture {
  name: string;
  sourceText: string;
  sourceWords: PlannerWord[];
  plannerInput: Rec;
  scene: Rec;
  durationSec: number;
}
export function hybridFixtures(): HybridFixture[] {
  const packs = [
    ['detroit-landmarks', 18],
    ['hybrid-finance', 12],
    ['hybrid-business', 4],
    ['hybrid-ai', 8],
  ] as const;
  const fixtures = packs.flatMap(([pack, count]) => {
    const text = readFileSync(new URL(`./fixtures/${pack}.json`, import.meta.url), 'utf8');
    assert.ok(text.length < 2_000_000, 'Bounded fixture file required');
    const raw: unknown = JSON.parse(text);
    assert.ok(Array.isArray(raw));
    assert.equal(raw.length, count, `Incomplete ${pack}`);
    return raw.map((row: unknown): HybridFixture => {
      assert.ok(
        isRec(row) &&
          typeof row.name === 'string' &&
          typeof row.sourceText === 'string' &&
          typeof row.durationSec === 'number' &&
          row.durationSec >= 5 &&
          row.durationSec <= 12 &&
          isRec(row.plannerInput) &&
          isRec(row.scene) &&
          Array.isArray(row.sourceWords) &&
          row.sourceWords.length <= 300,
      );
      const sourceWords = row.sourceWords.map((word: unknown): PlannerWord => {
        assert.ok(
          isRec(word) &&
            typeof word.text === 'string' &&
            typeof word.start === 'number' &&
            typeof word.end === 'number' &&
            Number.isFinite(word.start) &&
            Number.isFinite(word.end) &&
            word.start < word.end,
        );
        return { text: word.text, start: word.start, end: word.end };
      });
      assert.equal(sourceWords.map((word) => word.text).join(' '), row.sourceText);
      return {
        name: row.name,
        sourceText: row.sourceText,
        durationSec: row.durationSec,
        plannerInput: row.plannerInput,
        scene: row.scene,
        sourceWords,
      };
    });
  });
  assert.equal(new Set(fixtures.map((f) => f.name)).size, 42);
  assert.equal(
    new Set(fixtures.map((f) => `${f.scene.kind}/${f.scene.preset}/${f.scene.visualMode}`)).size,
    30,
  );
  assert.deepEqual(
    [...new Set(fixtures.map((f) => f.scene.kind))].sort(),
    [...HYBRID_SCENE_KINDS].sort(),
  );
  return fixtures;
}
export function parseHybridFixture(fixture: HybridFixture): PlannedExplainerScene {
  const parsed = parsePlanWithDiagnostics({ scenes: [fixture.plannerInput] }, fixture.sourceWords, {
    minStart: 0,
    maxEnd: 90,
  });
  assert.deepEqual(parsed.rejected, [], fixture.name);
  assert.deepEqual(parsed.omitted, [], fixture.name);
  assert.equal(parsed.accepted.length, 1, fixture.name);
  const scene = parsed.accepted[0];
  assert.deepEqual(
    scene.scene,
    fixture.scene,
    `${fixture.name}: renderer fixture must match real accepted payload`,
  );
  assert.ok(Math.abs(scene.startTime) < 1e-7);
  assert.ok(Math.abs(scene.endTime - fixture.durationSec) < 1e-7);
  return scene;
}

/** 130s local synthetic transcript, seven 10s stories and genuine speaker-only gaps; 53.85% coverage. */
export function hybridChainFixture(fixtures: HybridFixture[]) {
  const kinds = [
    'detroit-place',
    'fund-flow',
    'cash-timing',
    'ownership-change',
    'token-attention',
    'portfolio-exposure',
    'inference-tradeoff',
  ];
  const starts = [2, 23, 33, 54, 75, 96, 117];
  const words: PlannerWord[] = [];
  const scenes: Rec[] = [];
  const keys: string[] = [];
  for (const [i, kind] of kinds.entries()) {
    const fixture = fixtures.find(
      (f) =>
        f.scene.kind === kind &&
        f.scene.visualMode === (i % 2 === 0 ? 'hybrid' : 'diagram') &&
        (kind !== 'detroit-place' || f.scene.preset === 'city-portrait'),
    );
    assert.ok(fixture, `Missing ${kind}`);
    const previousEnd = words.at(-1)?.end ?? 0;
    if (starts[i] - previousEnd > 2) {
      const gapText =
        'This is a locally generated test source with authored educational examples and a speaker only gap.';
      const gapWords = gapText.split(' ');
      const step = (starts[i] - previousEnd - 0.5) / gapWords.length;
      gapWords.forEach((text, j) => {
        words.push({
          text,
          start: previousEnd + 0.1 + j * step,
          end: previousEnd + 0.1 + (j + 0.8) * step,
        });
      });
    }
    const shifted = offsetConceptWords(fixture.plannerInput, words.length);
    assert.ok(isRec(shifted));
    words.push(
      ...fixture.sourceWords.map((word) => ({
        ...word,
        start: word.start + starts[i],
        end: word.end + starts[i],
      })),
    );
    scenes.push({
      ...shifted,
      layout: 'stack',
      continues: i === 2,
      ...(i === 2 ? { transition: 'fade' } : {}),
    });
    keys.push(`${fixture.scene.kind}/${fixture.scene.preset}`);
  }
  return { raw: { scenes }, words, bounds: { minStart: 0, maxEnd: 130 }, keys };
}
