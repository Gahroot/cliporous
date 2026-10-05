import assert from 'node:assert/strict';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { digest } from '../explainer-stills/harness-runtime.mjs';

/** Receipt checks only; media.ts must complete native probes and full decodes first. */
export function validateBusinessRecords(records, out, { mode, status }) {
  assert.equal(mode, 'media', 'Unit markers are never native evidence');
  assert.equal(status, 'passed', 'Failed/partial/cancelled jobs are never evidence');
  assert.ok(Array.isArray(records) && records.length === 160, 'Incomplete sequence matrix');
  const keys = new Set();
  const owned = (path, sha256) => {
    assert.ok(typeof path === 'string' && path.length <= 4096 && !/[\0\r\n]/u.test(path));
    assert.ok(isAbsolute(path));
    const rel = relative(realpathSync(out), realpathSync(path));
    assert.ok(
      rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel),
      'Artifact escapes owned output',
    );
    assert.ok(
      lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(),
      'Not a regular owned artifact',
    );
    assert.match(sha256, /^[a-f0-9]{64}$/u);
    const bytes = readFileSync(path);
    assert.equal(digest(bytes), sha256, 'Artifact hash changed');
    return bytes;
  };
  for (const entry of records) {
    assert.ok(entry && typeof entry === 'object');
    assert.match(entry.id, /^S-0[1-8]$/u);
    assert.ok(['ink', 'polish'].includes(entry.style));
    assert.ok(typeof entry.palette === 'string' && /^[a-z0-9-]{1,80}$/u.test(entry.palette));
    const key = `${entry.id}/${entry.style}/${entry.palette}`;
    assert.ok(!keys.has(key), 'Duplicate sequence appearance');
    keys.add(key);
    const sourceBytes = owned(entry.approvedSourcePath, entry.approvedSourceFileSha256);
    const source = JSON.parse(sourceBytes);
    assert.equal(
      sourceBytes.toString(),
      `${JSON.stringify(source, null, 2)}\n`,
      'Noncanonical source JSON',
    );
    assert.equal(entry.approvedSourceSha256, digest(source.spec));
    assert.equal(source.spec.specVersion, 2);
    assert.equal(entry.specVersion, 2);
    assert.equal(entry.parserVersion, 3);
    const plan = JSON.parse(owned(entry.savedPlanPath, entry.savedPlanSha256));
    assert.equal(plan.parserVersion, 3);
    assert.equal(plan.storyboardStyle, entry.style);
    assert.deepEqual(plan.scenes[0].sourceSpec, source.spec);
    assert.equal(plan.sourceDuration, source.duration);
    owned(entry.source.path, entry.source.sha256);
    assert.equal(entry.source.duration, source.duration);
    for (const [route, name] of [
      ['renderLongformScenePreview', 'preview'],
      ['renderSceneFirstLongform', 'export'],
    ]) {
      const artifact = entry[name];
      assert.equal(artifact.route, route);
      assert.equal(artifact.fullDecodeVerified, true);
      assert.ok(
        artifact.probe &&
          Number.isSafeInteger(artifact.expectedFrames) &&
          artifact.expectedFrames > 0,
      );
      assert.equal(
        artifact.expectedFrames,
        name === 'export'
          ? Math.round(source.duration * 30)
          : entry.previewWindow.endFrame - entry.previewWindow.startFrame,
      );
      const bytes = owned(artifact.path, artifact.sha256);
      assert.ok(
        bytes.length > 12 && bytes.subarray(4, 8).toString() === 'ftyp',
        'Unit marker is not MP4',
      );
    }
    assert.equal(entry.export.reconciliation.fallbacks.length, 0);
    assert.equal(entry.export.reconciliation.scenes.rendered, 1);
  }
  for (const id of Array.from({ length: 8 }, (_, i) => `S-0${i + 1}`))
    for (const style of ['ink', 'polish'])
      assert.equal(records.filter((r) => r.id === id && r.style === style).length, 10);
  return records;
}
