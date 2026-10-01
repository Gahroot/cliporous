#!/usr/bin/env node
/** Audit the explicit manifest. A `covers` declaration alone NEVER satisfies --complete. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fixtureCoverage, REQUIRED_TARGET_COUNT, verificationPlan } from './fixture-manifest.mjs';
import { bundleDigest, localBundle, outputDirectory } from './harness-runtime.mjs';
import { executionCoverage } from './verification-evidence.mjs';
import { loadFixtures } from './verification-options.mjs';

try {
  const { values } = parseArgs({
    options: {
      complete: { type: 'boolean', default: false },
      report: { type: 'string', multiple: true, default: [] },
      bundle: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      `coverage.mjs [--complete] [--report report.json ... --bundle out/remotion] [--out fresh-directory]\nWithout reports this audits declarations only; --complete requires all critical frames for all ${REQUIRED_TARGET_COUNT} targets.`,
    );
  } else {
    if (values.report.length && !values.bundle)
      throw new Error(
        '--report requires --bundle to pin execution to the actual bundle being audited',
      );
    const { fixtures, paths } = loadFixtures();
    const declaredFixtures = fixtures.filter((f) => f.covers?.length);
    const declarations = fixtureCoverage(declaredFixtures);
    const plan = declaredFixtures.length ? verificationPlan(declaredFixtures) : [];
    const bundle = values.bundle
      ? { path: localBundle(values.bundle), sha256: bundleDigest(localBundle(values.bundle)) }
      : null;
    const reports = values.report.map((file) => ({
      path: path.resolve(file),
      data: JSON.parse(readFileSync(file, 'utf8')),
    }));
    const rejectedReports = reports.filter(
      (r) => r.data.bundle?.sha256 !== bundle?.sha256 || r.data.status !== 'passed',
    );
    const acceptedReports = reports.filter((r) => !rejectedReports.includes(r));
    const targets = executionCoverage(
      plan,
      acceptedReports.map((r) => r.data),
    );
    const summary = {
      required: targets.length,
      declared: declarations.filter((d) => d.fixtures.length).length,
      criticalFramesExecuted: targets.filter((t) => t.criticalFramesExecuted).length,
      missingDeclarations: targets.filter((t) => !t.declared).map((t) => `${t.category}:${t.id}`),
      incompleteTargets: targets
        .filter((t) => !t.criticalFramesExecuted)
        .map((t) => `${t.category}:${t.id}`),
    };
    const complete =
      summary.required === REQUIRED_TARGET_COUNT &&
      summary.criticalFramesExecuted === REQUIRED_TARGET_COUNT &&
      rejectedReports.length === 0;
    const result = {
      schemaVersion: 1,
      status: complete ? 'complete-critical-frame-execution' : 'incomplete',
      summary,
      bundle,
      fixtureFiles: paths,
      acceptedReports: acceptedReports.map((r) => r.path),
      rejectedReports: rejectedReports.map((r) => ({
        path: r.path,
        status: r.data.status,
        bundle: r.data.bundle,
        reason: 'Only successful reports with the exact requested bundle SHA256 count',
      })),
      targets,
      limits: [
        'Finite declared beat-boundary PNG coverage, not all-frame pose finiteness or visual/semantic approval.',
        'This audit does not certify determinism, alpha, full-motion, audio, costs, or source/build correspondence; inspect those report checks separately.',
        'Each required artifact is re-read, native PNG dimensions checked, and its SHA256 compared. Missing/stale artifacts do not count.',
      ],
    };
    const out = outputDirectory(values.out, 'batchclip-coverage-');
    const output = path.join(out, 'report.json');
    writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Report: ${output}`);
    if (values.complete && !complete) process.exitCode = 1;
  }
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
