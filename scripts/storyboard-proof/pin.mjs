#!/usr/bin/env node
/** Snapshot an ALREADY BUILT production bundle; no build, browser, assets fetch or AI. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { snapshotBundle } from '../explainer-stills/snapshot-bundle.mjs';
import { bundleEvidence, localPath, PIN_SUFFIX, sourceEvidence } from './gates.mjs';

export function pinProductionBundle(bundle) {
  localPath(bundle);
  const source = sourceEvidence();
  const evidence = bundleEvidence(bundle);
  const snapshot = snapshotBundle(bundle);
  const copied = bundleEvidence(snapshot.path);
  assert.equal(copied.sha256, evidence.sha256, 'Build changed during pin');
  assert.equal(sourceEvidence().sha256, source.sha256, 'Production source changed during pin');
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    invocation: [process.execPath, ...process.argv.slice(1)],
    source,
    bundle: copied,
    snapshot,
  };
  writeFileSync(`${snapshot.path}${PIN_SUFFIX}`, `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: 'wx',
  });
  return {
    bundle: snapshot.path,
    manifest: `${snapshot.path}${PIN_SUFFIX}`,
    sha256: copied.sha256,
    sourceSha256: source.sha256,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--bundle')
      throw new Error(
        'Usage: node scripts/storyboard-proof/pin.mjs --bundle <already-built production bundle>',
      );
    console.log(JSON.stringify(pinProductionBundle(args[1]), null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
