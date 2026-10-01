import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { continuityPlan } from './render-clay-continuity.mjs';

function fixtures() {
  return JSON.parse(
    readFileSync(new URL('./fixtures/clay-continuity.json', import.meta.url), 'utf8'),
  );
}

test('real sequence holds preserve timing, palette and house identity at every transition', () => {
  const rows = fixtures();
  const plan = continuityPlan(rows);
  const total = rows.reduce((sum, row) => sum + Math.round(row.durationSec * 30), 0);
  assert.equal(plan.durationInFrames, total + 9);
  assert.equal(plan.inputProps.transitions.length, rows.length - 1);
  assert.equal(plan.inputProps.visibleSec, total / 30);
  assert.deepEqual(plan.inputProps.palette, rows[0].palette);
  assert.deepEqual(
    plan.inputProps.scenes.map(({ scene }) => scene),
    rows.map(({ scene }) => scene),
  );
  assert.equal(
    plan.inputProps.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0) -
      plan.inputProps.transitions.reduce((sum, transition) => sum + transition.durationInFrames, 0),
    plan.durationInFrames,
  );
  assert(
    plan.frames.every(
      (frame) => Number.isInteger(frame) && frame >= 0 && frame < plan.durationInFrames,
    ),
  );
  assert.equal(plan.mediaRange[1] - plan.mediaRange[0] + 1, 60);
});

test('sequence proof rejects identity changes, invalid beats and unreadable holds', () => {
  for (const mutate of [
    (rows) => {
      rows[1].scene.subject = 'a different property';
    },
    (rows) => {
      rows[1].scene.kind = 'agent-budget';
    },
    (rows) => {
      rows[1].scene.actionAt = Number.NaN;
    },
    (rows) => {
      rows[1].scene.actionAt = rows[1].scene.responseAt + 1;
    },
    (rows) => {
      rows[1].scene.resolveAt = rows[1].durationSec - 0.2;
    },
    (rows) => {
      rows[1].durationSec = 13;
    },
  ]) {
    const rows = fixtures();
    mutate(rows);
    assert.throws(() => continuityPlan(rows));
  }
  assert.throws(() => continuityPlan(fixtures().slice(0, 1)), /two to five/);
});
