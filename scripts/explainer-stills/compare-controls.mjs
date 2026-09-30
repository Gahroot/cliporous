#!/usr/bin/env node
/** Re-run render.mjs regression-controls.json against the rebuilt bundle, then compare reports. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { outputDirectory } from './harness-runtime.mjs';
import { compareStillReports } from './verification-evidence.mjs';

try {
  const { values } = parseArgs({
    options: { before: { type: 'string' }, after: { type: 'string' }, out: { type: 'string' } },
  });
  if (!values.before || !values.after)
    throw new Error(
      'compare-controls.mjs --before baseline/report.json --after rebuilt/report.json [--out fresh-directory]',
    );
  const before = JSON.parse(readFileSync(values.before, 'utf8'));
  const after = JSON.parse(readFileSync(values.after, 'utf8'));
  const comparison = compareStillReports(before, after);
  const report = {
    schemaVersion: 1,
    status: comparison.equal ? 'identical-matching-control-stills' : 'different-or-incomplete',
    before: {
      path: path.resolve(values.before),
      bundle: before.bundle,
      environment: before.environment,
      rendererConfiguration: before.rendererConfiguration,
      rendererConfigurationHash: before.rendererConfigurationHash,
    },
    after: {
      path: path.resolve(values.after),
      bundle: after.bundle,
      environment: after.environment,
      rendererConfiguration: after.rendererConfiguration,
      rendererConfigurationHash: after.rendererConfigurationHash,
    },
    ...comparison,
  };
  const out = outputDirectory(values.out, 'batchclip-control-comparison-');
  const output = path.join(out, 'report.json');
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `${report.status}: ${comparison.checks.filter((r) => r.equal).length}/${comparison.checks.length} matching input/frame PNGs`,
  );
  console.log(`Report: ${output}`);
  if (!comparison.equal) process.exitCode = 1;
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
