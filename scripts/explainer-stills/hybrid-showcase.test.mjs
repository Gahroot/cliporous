import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { hybridSequencePlan, parseHybridShowcaseArgs } from './render-hybrid-showcase.mjs';

const rows = () =>
  JSON.parse(readFileSync(new URL('./fixtures/hybrid-showcase.json', import.meta.url), 'utf8'));

test('both complete reels use real sequence timing, bounded transitions and production dimensions', () => {
  for (const aspect of ['9:16', '16:9']) {
    const fixtures = rows(),
      plan = hybridSequencePlan(fixtures, aspect);
    assert.equal(plan.durationInFrames, 2109);
    assert.deepEqual([plan.width, plan.height], aspect === '9:16' ? [1080, 1920] : [1920, 1080]);
    assert.equal(
      plan.inputProps.scenes.reduce((n, s) => n + s.durationInFrames, 0) -
        plan.inputProps.transitions.reduce((n, t) => n + t.durationInFrames, 0),
      plan.durationInFrames,
    );
    assert.deepEqual(
      plan.inputProps.scenes.map((s) => s.scene),
      fixtures.map((f) => f.scene),
    );
    assert.deepEqual(
      plan.inputProps.transitions,
      Array.from({ length: 6 }, () => ({ kind: 'fade', durationInFrames: 1 })),
    );
    for (let chapter = 1; chapter < 7; chapter++) {
      assert.ok(plan.frames.includes(chapter * 300));
      assert.ok(plan.frames.includes(chapter * 300 + 1));
    }
    assert.equal(plan.checks.length, 7);
    assert.ok(plan.frames.every((frame) => frame >= 0 && frame < plan.durationInFrames));
  }
});
test('reel refuses invalid input and remote/unknown CLI options', () => {
  for (const mutation of [
    (r) => {
      r[0].scene.kind = 'arbitrary';
    },
    (r) => {
      r[0].scene.visualMode = 'url';
    },
    (r) => {
      r[0].scene.actionAt = NaN;
    },
    (r) => {
      r[0].scene.resolveAt = 9.8;
    },
    (r) => {
      r[0].durationSec = 25;
    },
  ]) {
    const fixtures = rows();
    mutation(fixtures);
    assert.throws(() => hybridSequencePlan(fixtures, '9:16'));
  }
  assert.throws(() => hybridSequencePlan(rows(), 'square'));
  assert.throws(() => parseHybridShowcaseArgs(['--bundle', 'https://remote.invalid']));
  assert.throws(() => parseHybridShowcaseArgs(['--out', '']));
  assert.throws(() => parseHybridShowcaseArgs(['--download']));
});
