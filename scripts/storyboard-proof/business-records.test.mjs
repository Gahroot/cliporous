import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateBusinessRecords } from './business-records.mjs';
import { resourceComparisonPlan } from './resource-controls.mjs';
import { parseArgs } from './verify.mjs';

test('no unit, failed, partial or cancelled evidence is accepted', () => {
  for (const status of ['running', 'failed', 'cancelled'])
    assert.throws(
      () => validateBusinessRecords([], '/tmp', { mode: 'media', status }),
      /Failed\/partial/,
    );
  assert.throws(
    () => validateBusinessRecords([], '/tmp', { mode: 'unit', status: 'passed' }),
    /Unit markers/,
  );
  assert.throws(
    () => validateBusinessRecords([], '/tmp', { mode: 'media', status: 'passed' }),
    /Incomplete/,
  );
});
test('report input and artifact paths fail closed before interpreting media', () => {
  const out = mkdtempSync(join(tmpdir(), 'business-record-boundary-'));
  try {
    const entry = {
      id: 'S-01',
      style: 'ink',
      palette: 'proof-custom-light',
      approvedSourcePath: out,
      approvedSourceFileSha256: '0'.repeat(64),
    };
    assert.throws(
      () =>
        validateBusinessRecords(Array(160).fill(entry), out, { mode: 'media', status: 'passed' }),
      /escapes/,
    );
    entry.approvedSourcePath = 'https://example.invalid/file';
    assert.throws(() =>
      validateBusinessRecords(Array(160).fill(entry), out, { mode: 'media', status: 'passed' }),
    );
    entry.approvedSourcePath = `${out}\0bad`;
    assert.throws(() =>
      validateBusinessRecords(Array(160).fill(entry), out, { mode: 'media', status: 'passed' }),
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
test('resource plan is unexecuted and has five serial matched fresh-worker cycles', () => {
  const plan = resourceComparisonPlan();
  assert.equal(plan.executed, false);
  assert.equal(plan.jobs.length, 5);
  for (const jobs of plan.jobs) {
    assert.equal(jobs.length, 8);
    for (const control of plan.controls)
      assert.deepEqual(
        jobs.filter((j) => j.control === control).map((j) => j.phase),
        ['cold', 'warm'],
      );
  }
  assert.equal(parseArgs(['--resource-plan']).resourcePlan, true);
  assert.equal(parseArgs(['--unit', '--scope', 'business']).scope, 'business');
  assert.throws(() => parseArgs(['--unit', '--resource-cycle', '1']), /native media/);
  for (const value of ['0', '6', 'NaN', '--bundle'])
    assert.throws(() => parseArgs(['--resource-cycle', value]));
});
