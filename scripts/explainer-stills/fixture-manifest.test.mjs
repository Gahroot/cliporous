import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIXTURE_MANIFEST, fixtureCoverage } from './fixture-manifest.mjs';

test('approved deliverables remain exact and unique', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(FIXTURE_MANIFEST).map(([key, ids]) => [key, ids.length])),
    {
      prop: 28,
      treatment: 10,
      kind: 10,
      relay: 6,
    },
  );
  for (const ids of Object.values(FIXTURE_MANIFEST)) assert.equal(new Set(ids).size, ids.length);
});

test('coverage reports omissions honestly and sorts fixture names', () => {
  const report = fixtureCoverage([
    { name: 'z', covers: [{ category: 'prop', id: 'flywheel' }] },
    { name: 'a', covers: [{ category: 'prop', id: 'flywheel' }] },
  ]);
  assert.deepEqual(report[0], { category: 'prop', id: 'flywheel', fixtures: ['a', 'z'] });
  assert.equal(report.filter((row) => row.fixtures.length === 0).length, 53);
  for (const [category, id] of [
    ['prop', '../x'],
    ['constructor', 'x'],
  ]) {
    assert.throws(
      () => fixtureCoverage([{ name: 'bad', covers: [{ category, id }] }]),
      /bad: unknown coverage/,
    );
  }
});
