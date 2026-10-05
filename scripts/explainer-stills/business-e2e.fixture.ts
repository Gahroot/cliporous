import assert from 'node:assert/strict';
import type { PlannerWord, Rec } from '../../src/main/ai/explainer/kind-spec';
import { parsePlanWithDiagnostics } from '../../src/main/ai/explainer-scenes';
import { businessSourceFixtures } from '../../src/main/remotion/compositions/explainer/business/source-fixtures';
import { offsetConceptWords } from './concept-e2e.fixture';

/** Real authored source choices, not precompiled renderer scenes. */
export function businessChainFixture() {
  const fixtures = businessSourceFixtures();
  assert.equal(new Set(fixtures.map((f) => f.id)).size, 80);
  const examples = fixtures.map((fixture) => {
    const parsed = parsePlanWithDiagnostics(
      { scenes: [{ ...fixture.raw, layout: 'stack' }] },
      fixture.words,
      { minStart: 0, maxEnd: 90 },
    );
    assert.deepEqual(parsed.rejected, [], fixture.fixtureId);
    assert.deepEqual(parsed.omitted, [], fixture.fixtureId);
    assert.equal(parsed.accepted.length, 1, fixture.fixtureId);
    return { fixture, planned: parsed.accepted[0] };
  });
  const ids = ['OP-01', 'OP-09', 'OP-17', 'OP-33', 'OP-49', 'OP-65', 'OP-73'];
  const words: PlannerWord[] = [];
  const scenes: Rec[] = [];
  const keys: string[] = [];
  for (const [i, id] of ids.entries()) {
    const example = examples.find(
      (e) => e.fixture.id === id && e.fixture.visualMode === (i % 2 ? 'diagram' : 'hybrid'),
    );
    assert.ok(example, `Missing business chain source ${id}`);
    const start = 2 + i * 24;
    const shifted = offsetConceptWords(example.fixture.raw, words.length);
    assert.ok(shifted && typeof shifted === 'object' && !Array.isArray(shifted));
    words.push(
      ...example.fixture.words.map((word) => ({
        ...word,
        start: word.start + start,
        end: word.end + start,
      })),
    );
    scenes.push({ ...shifted, layout: 'stack' });
    keys.push(example.fixture.fixtureId);
  }
  return { examples, raw: { scenes }, words, bounds: { minStart: 0, maxEnd: 170 }, keys };
}
