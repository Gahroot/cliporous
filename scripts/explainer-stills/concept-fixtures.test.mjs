import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FIXTURE_MANIFEST, verificationPlan } from './fixture-manifest.mjs';
import { normalizeFixtures } from './fixture-schema.mjs';

const packs = [
  ['information', 7],
  ['inference', 6],
  ['business-operations', 8],
  ['business-populations', 8],
  ['perspective', 6],
  ['adaptive', 7],
];

const fixtures = packs.flatMap(([pack, count]) => {
  const rows = JSON.parse(
    readFileSync(new URL(`./fixtures/concept-${pack}.json`, import.meta.url), 'utf8'),
  );
  assert.equal(rows.length, count, `${pack}: frozen preset coverage`);
  return normalizeFixtures(rows);
});

const beatFields = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'];

test('42 concept presets cover 18 kinds with source, raw planner input and complete storyboards', () => {
  assert.equal(fixtures.length, 42);
  assert.equal(new Set(fixtures.map((fx) => fx.scene.kind)).size, 18);
  const ids = fixtures.map((fx) => `${fx.scene.kind}/${fx.scene.preset}`);
  assert.equal(new Set(ids).size, 42);
  for (const fx of fixtures) {
    assert.ok(FIXTURE_MANIFEST.explanation.includes(`${fx.scene.kind}/${fx.scene.preset}`));
    assert.ok(fx.covers.some((entry) => entry.category === 'kind' && entry.id === fx.scene.kind));
    assert.ok(
      fx.covers.some(
        (entry) =>
          entry.category === 'explanation' && entry.id === `${fx.scene.kind}/${fx.scene.preset}`,
      ),
    );
    assert.equal(typeof fx.sourceText, 'string', fx.name);
    assert.ok(fx.sourceText.trim().split(/\s+/).length >= 10, fx.name);
    assert.equal(fx.plannerInput.kind, fx.scene.kind, fx.name);
    assert.equal(fx.plannerInput.preset, fx.scene.preset, fx.name);
    assert.equal(fx.plannerInput.startWord, 0, fx.name);
    assert.equal(fx.plannerInput.endWord, fx.sourceText.trim().split(/\s+/).length - 1, fx.name);
    assert.ok(fx.durationSec >= 5 && fx.durationSec <= 12, fx.name);
    assert.ok(fx.samples.length >= 5, fx.name);
    assert.equal(
      new Set(fx.samples.map((sample) => sample.frame)).size,
      fx.samples.length,
      fx.name,
    );
    const storyboard = fx.storyboard ?? fx.sourceBeats;
    assert.ok(Array.isArray(storyboard) && storyboard.length >= 5, `${fx.name}: storyboards`);
    for (const beat of storyboard) {
      const description =
        typeof beat === 'string'
          ? beat
          : (beat.visual ?? beat.action ?? beat.description ?? beat.storyboard);
      assert.ok(
        typeof description === 'string' && description.trim().length >= 12,
        `${fx.name}: authored visual beat`,
      );
    }
    for (const field of ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord']) {
      const word = fx.plannerInput[field];
      assert.ok(
        Number.isInteger(word) && word >= 0 && word <= fx.plannerInput.endWord,
        `${fx.name}: ${field}`,
      );
    }
    const times = beatFields.map((field) => fx.scene[field]);
    for (const [index, time] of times.entries()) {
      assert.ok(Number.isFinite(time) && time >= 0 && time <= fx.durationSec, fx.name);
      if (index > 0) assert.ok(time - times[index - 1] >= 0.35, fx.name);
    }
    assert.ok(fx.scene.resolveAt <= fx.durationSec - 0.8, `${fx.name}: final hold`);
  }
});

test('every concept fixture expands to both native aspect ratios with contrast and critical frames', () => {
  const plans = verificationPlan(fixtures);
  for (const fx of fixtures) {
    const cases = plans.filter((entry) => entry.fixtureName === fx.name);
    assert.ok(
      cases.some(
        (entry) => entry.inputProps.layout === 'stack' && entry.inputProps.aspect === '9:16',
      ),
    );
    assert.ok(
      cases.some(
        (entry) =>
          entry.inputProps.layout === 'over' &&
          entry.inputProps.aspect === '16:9' &&
          entry.inputProps.palette,
      ),
    );
    for (const entry of cases) {
      assert.ok(
        entry.samples.some((sample) => sample.frame === 0),
        fx.name,
      );
      assert.ok(
        entry.samples.some((sample) => sample.frame === entry.composition.durationInFrames - 1),
        fx.name,
      );
      assert.ok(
        entry.samples.every(
          (sample) => sample.frame >= 0 && sample.frame < entry.composition.durationInFrames,
        ),
        fx.name,
      );
    }
  }
});
