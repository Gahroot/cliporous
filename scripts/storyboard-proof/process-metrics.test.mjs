import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { startProcessMetrics } from './process-metrics.mjs';

const row = (pid, parent, createdAt) => ({
  pid,
  parent,
  createdAt,
  name: 'fixture.exe',
  workingSetBytes: 100,
});
test('records live descendants and settled cleanup without inspecting unrelated processes', async () => {
  const out = mkdtempSync(join(tmpdir(), 'storyboard-process-test-'));
  let index = 0;
  try {
    const observe = startProcessMetrics(1, out, async () =>
      index++ === 0 ? [row(1, 0, 'root'), row(2, 1, 'child'), row(3, 2, 'grandchild')] : [],
    );
    const report = await observe.stop();
    assert.equal(report.status, 'measured');
    assert.equal(report.peakChildCount, 2);
    assert.equal(report.peakWorkingSetBytes, 200);
    assert.equal(report.settled.childCount, 0);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
test('does not mistake a reused PID and its new children for owned processes', async () => {
  const out = mkdtempSync(join(tmpdir(), 'storyboard-process-test-'));
  let index = 0;
  try {
    const observe = startProcessMetrics(1, out, async () =>
      index++ === 0
        ? [row(1, 0, 'root'), row(2, 1, 'original')]
        : [row(2, 9, 'unrelated-new-process'), row(3, 2, 'unrelated-child')],
    );
    const report = await observe.stop();
    assert.equal(report.peakChildCount, 1);
    assert.equal(report.settled.childCount, 0);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
test('reports unavailable observation rather than inventing zero children', async () => {
  const out = mkdtempSync(join(tmpdir(), 'storyboard-process-test-'));
  try {
    const observe = startProcessMetrics(1, out, async () => {
      throw new Error('Observation unavailable');
    });
    const report = await observe.stop();
    assert.equal(report.status, 'partial');
    assert.equal(report.settled, null);
    assert.equal(report.errors.length, 2);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
