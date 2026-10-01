#!/usr/bin/env node
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bundleDigest, localBundle, outputDirectory } from './harness-runtime.mjs';

/** Own an immutable copy so another build cannot replace a running proof's inputs. */
export function snapshotBundle(source, requestedOutput) {
  const input = localBundle(source);
  const output = outputDirectory(requestedOutput);
  const before = bundleDigest(input);
  cpSync(input, output, { recursive: true, errorOnExist: true, force: false });
  const copied = bundleDigest(output);
  assert.equal(
    bundleDigest(input),
    before,
    'Source bundle changed during snapshot; retry after the build completes.',
  );
  assert.equal(copied, before, 'Snapshot bytes differ from the source; do not render this copy.');
  return { path: output, sha256: copied, source: input };
}

function main(args) {
  let bundle = 'out/remotion';
  let output;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag !== '--bundle' && flag !== '--out') throw new Error(`Unknown option: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} needs a local directory.`);
    if (flag === '--bundle') bundle = value;
    else output = value;
  }
  console.log(JSON.stringify(snapshotBundle(bundle, output)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
