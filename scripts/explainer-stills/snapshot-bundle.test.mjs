import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { bundleDigest } from './harness-runtime.mjs';
import { snapshotBundle } from './snapshot-bundle.mjs';

function setup(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'concept-snapshot-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  mkdirSync(source);
  writeFileSync(path.join(source, 'index.html'), '<script src="bundle.js"></script>');
  writeFileSync(path.join(source, 'bundle.js'), 'window.fixture = 1;');
  return { root, source, destination: path.join(root, 'snapshot') };
}

test('snapshot preserves real bundle bytes when another build later replaces the shared input', (t) => {
  const { source, destination } = setup(t);
  const original = bundleDigest(source);
  const result = snapshotBundle(source, destination);
  assert.equal(result.sha256, original);
  assert.equal(bundleDigest(result.path), original);
  writeFileSync(path.join(source, 'bundle.js'), 'window.fixture = 2;');
  assert.notEqual(bundleDigest(source), original);
  assert.equal(bundleDigest(result.path), original);
  assert.equal(readFileSync(path.join(result.path, 'bundle.js'), 'utf8'), 'window.fixture = 1;');
});

test('snapshot refuses an occupied output without changing its data', (t) => {
  const { source, destination } = setup(t);
  mkdirSync(destination);
  writeFileSync(path.join(destination, 'keep.txt'), 'preserve');
  assert.throws(() => snapshotBundle(source, destination), /not empty/);
  assert.equal(readFileSync(path.join(destination, 'keep.txt'), 'utf8'), 'preserve');
});

test('snapshot rejects a missing local bundle instead of downloading or creating one', (t) => {
  const { root, destination } = setup(t);
  assert.throws(() => snapshotBundle(path.join(root, 'missing'), destination), /index.html/);
});
