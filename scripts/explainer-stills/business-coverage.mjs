import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function requireCanonicalJson(file, data) {
  return readFileSync(file, 'utf8') === `${JSON.stringify(data, null, 2)}\n`;
}

import { bundleEvidence, sourceEvidence } from '../storyboard-proof/gates.mjs';
import {
  artifactPath,
  boundedJson,
  fileSha256,
  pngArtifact,
  probeArtifact,
} from './business-artifacts.mjs';
import { assertBusinessFixtures, BUSINESS_MANIFEST, businessCases } from './business-manifest.mjs';
import { CONTRAST_PALETTE, verificationPlan } from './fixture-manifest.mjs';
import { bundleDigest, digest, localBundle, ROOT } from './harness-runtime.mjs';
import { executionCoverage } from './verification-evidence.mjs';
import { loadFixtures } from './verification-options.mjs';

/** Reconstruct expectations through Vitest's existing TS/alias/test-setup path, never report declarations. */
export function freshBusinessExpectations() {
  const output = execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      'scripts/explainer-stills/vitest.business-fixtures.config.ts',
      'scripts/explainer-stills/business-fixtures.test.ts',
    ],
    {
      cwd: ROOT,
      env: { ...process.env, BUSINESS_WRITE_FIXTURES: '1', NO_COLOR: '1' },
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    },
  ).toString();
  const directory = output.match(/Business source fixtures: ([^\r\n]+)/)?.[1];
  assert(directory, 'Source fixture generator did not complete');
  const generated = boundedJson(path.join(directory, 'manifest.json'));
  return {
    ...loadFixtures(generated.fixtureFiles),
    sequences: generated.sequences,
    palettes: generated.palettes,
  };
}

export function businessExecutionCoverage(expected, reports, bundlePath) {
  const source = sourceEvidence();
  const bundle = bundleEvidence(bundlePath);
  for (const pack of [
    'work',
    'authority',
    'commercial',
    'organization',
    'economics',
    'markets',
    'funds',
    'capital',
    'infrastructure',
    'decisions',
  ]) {
    assert(
      Object.hasOwn(
        bundle.sources,
        `src/main/remotion/compositions/explainer/business/${pack}/Scene.tsx`,
      ),
      `Missing business production source-map: ${pack}`,
    );
  }
  return auditBusinessEvidence(expected, reports, { source, bundle });
}

export function assertBusinessExpectations(expected) {
  assertBusinessFixtures(expected.fixtures);
  assert.equal(expected.fixtures.length, 152, 'Missing declared modes');
  const cases = businessCases(CONTRAST_PALETTE);
  for (const f of expected.fixtures)
    assert.equal(digest(f.cases), digest(cases), 'Incomplete native layout/palette matrix');
  assert.deepEqual(
    expected.sequences.map((s) => s.id).sort(),
    BUSINESS_MANIFEST.sequence,
    'Missing sequence matrix',
  );
  assert(
    expected.palettes.length === 10 && new Set(expected.palettes).size === 10,
    'Missing complete producer palette matrix',
  );
  for (const s of expected.sequences) {
    assert(
      digest(s.spec) === s.approvedSourceSha256 && s.spec.specVersion === 2,
      'Invalid approved sequence source',
    );
    assert(
      Number.isSafeInteger(s.previewFrames) &&
        s.previewFrames > 0 &&
        s.previewFrames < s.exportFrames &&
        s.exportFrames === Math.round(s.sourceDuration * 30),
      'Invalid sequence frame windows',
    );
  }
}

export function sequenceSourceIdentity(row, directory, expected) {
  assert(row.parserVersion === 3 && row.specVersion === 2, 'Unsupported saved sequence version');
  const approved = artifactPath(row.approvedSourcePath, directory);
  assert.equal(
    fileSha256(approved),
    row.approvedSourceFileSha256,
    'Approved source file hash mismatch',
  );
  const raw = boundedJson(approved);
  assert.equal(requireCanonicalJson(approved, raw), true, 'Noncanonical approved source JSON');
  assert.equal(digest(raw.words), digest(expected.words), 'Approved words identity mismatch');
  assert.equal(raw.duration, expected.sourceDuration, 'Approved source duration mismatch');
  const spec = raw.spec;
  assert.equal(
    digest(spec),
    expected.approvedSourceSha256,
    'Approved source JSON identity mismatch',
  );
  const savedPath = artifactPath(row.savedPlanPath, directory);
  assert.equal(fileSha256(savedPath), row.savedPlanSha256, 'Saved plan file hash mismatch');
  const saved = boundedJson(savedPath);
  const plan = saved;
  assert(
    plan.schemaVersion === 2 && plan.parserVersion === 3 && plan.mode === 'scene-first',
    'Invalid saved plan',
  );
  assert.equal(
    plan.sourceFingerprint,
    expected.sourceFingerprint,
    'Saved source identity mismatch',
  );
  assert.equal(plan.sourceDuration, expected.sourceDuration, 'Saved source duration mismatch');
  assert.equal(plan.storyboardStyle, row.style, 'Saved style mismatch');
  assert(
    Array.isArray(plan.scenes) && plan.scenes.length === 1 && plan.scenes[0].kind === 'storyboard',
    'Missing saved sequence scene',
  );
  assert.equal(
    digest(plan.scenes[0].sourceSpec),
    expected.approvedSourceSha256,
    'Saved source spec mismatch',
  );
  assert.equal(plan.scenes[0].startTime, expected.startTime, 'Saved start time mismatch');
  assert.equal(plan.scenes[0].endTime, expected.endTime, 'Saved end time mismatch');
  assert.equal(row.source?.duration, expected.sourceDuration, 'Source media duration mismatch');
  assert(
    row.preview?.route === 'renderLongformScenePreview' &&
      row.export?.route === 'renderSceneFirstLongform',
    'Missing saved production routes',
  );
  assert(
    row.preview.fullDecodeVerified === true && row.export.fullDecodeVerified === true,
    'Missing full decode receipts',
  );
  assert(
    row.preview.expectedFrames === expected.previewFrames &&
      row.export.expectedFrames === expected.exportFrames,
    'Receipt frame window mismatch',
  );
  assert(
    row.previewWindow?.endFrame - row.previewWindow?.startFrame === expected.previewFrames,
    'Preview window mismatch',
  );
  assert(
    Array.isArray(row.export.reconciliation?.fallbacks) &&
      row.export.reconciliation.fallbacks.length === 0 &&
      row.export.reconciliation.scenes?.rendered === 1,
    'Export fallback or missing scene',
  );
  const preview = artifactPath(row.preview.path, directory);
  const exported = artifactPath(row.export.path, directory);
  const source = artifactPath(row.source.path, directory);
  assert(
    preview !== exported && preview !== source && exported !== source,
    'Copied source/preview/export artifact paths',
  );
  assert(
    row.preview.sha256 !== row.export.sha256 &&
      row.preview.sha256 !== row.source.sha256 &&
      row.export.sha256 !== row.source.sha256,
    'Copied source/preview/export bytes',
  );
  return { approved, savedPath, preview, exported, source };
}

export function validateSequenceSources(row, directory, expected) {
  sequenceSourceIdentity(row, directory, expected);
  return probeArtifact(row.source, directory, {
    width: 1920,
    height: 1080,
    frames: expected.exportFrames,
  });
}

/** Artifact-only core is separately testable; CLI obtains lineage from actual source/build gates. */
export function auditBusinessEvidence(expected, reports, { source, bundle }) {
  assertBusinessExpectations(expected);
  const plan = verificationPlan(expected.fixtures, { matrix: false, scope: 'business' });
  const validReports = [];
  const rejectedReports = [];
  for (const report of reports) {
    try {
      const data = report.data;
      assert(data.schemaVersion === 1 && data.status === 'passed', 'Non-executed report');
      assert(
        data.source?.sha256 === source.sha256 && data.bundle?.sha256 === bundle.sha256,
        'Stale source/bundle lineage',
      );
      assert(typeof data.bundle.path === 'string', 'Missing bundle path lineage');
      // Explainer and saved-plan proof own separate immutable copies of the same
      // production build. Different paths are valid only after rehashing the copy.
      if (data.bundle.path !== bundle.path)
        assert.equal(
          bundleDigest(localBundle(data.bundle.path)),
          bundle.sha256,
          'Bundle copy lineage mismatch',
        );
      assert(
        data.mode !== 'unit' &&
          !data.unit &&
          !data.unitOnly &&
          !data.dryRun &&
          data.evidenceType !== 'unit',
        'Unit markers are not execution',
      );
      assert(
        Array.isArray(data.entries ?? []) && (data.entries ?? []).length <= 100000,
        'Invalid entries',
      );
      assert(
        Array.isArray(data.businessSequences ?? []) && (data.businessSequences ?? []).length <= 256,
        'Invalid business sequences',
      );
      assert(
        (data.businessSequences ?? []).every(
          (r) =>
            r &&
            typeof r === 'object' &&
            BUSINESS_MANIFEST.sequence.includes(r.id) &&
            ['ink', 'polish'].includes(r.style) &&
            expected.palettes.includes(r.palette) &&
            /^[a-f0-9]{64}$/.test(r.approvedSourceSha256 ?? ''),
        ),
        'Invalid sequence identity',
      );
      const seenPaths = new Map();
      const entries = (data.entries ?? []).map((e) => {
        assert(e && typeof e === 'object', 'Invalid entry');
        if (!['still', 'media'].includes(e.operation) || e.control === true) return e;
        const p = plan.find((p) => p.inputHash === e.inputHash && p.id === e.planId);
        assert(
          p && digest(e.scene) === digest(p.inputProps.scene),
          'Unknown or copied input hash/scene',
        );
        assert(
          e.width === p.composition.width && e.height === p.composition.height && e.fps === 30,
          'Non-native entry dimensions/FPS',
        );
        assert(e.status === 'passed', 'Non-executed artifact entry');
        const output = artifactPath(e.output, path.dirname(report.path));
        const identity = `${e.inputHash}:${e.operation}:${e.frame ?? 'full'}`;
        assert(
          !seenPaths.has(output) || seenPaths.get(output) === identity,
          'Copied artifact path attributed to multiple inputs',
        );
        seenPaths.set(output, identity);
        if (e.operation === 'still') {
          assert(
            e.renderedFrames === 1 && p.samples.some((s) => s.frame === e.frame),
            'Invalid critical still frame',
          );
          pngArtifact(e, path.dirname(report.path), p.composition);
        }
        return { ...e, output };
      });
      validReports.push({ ...report, data: { ...data, entries } });
    } catch (error) {
      rejectedReports.push({ path: report.path, reason: error.message });
    }
  }
  const targets = executionCoverage(
    plan,
    validReports.map((r) => r.data),
    BUSINESS_MANIFEST,
  ).filter((t) => t.category !== 'sequence');
  const motion = plan.map((p) => {
    let proof = null;
    for (const r of validReports)
      for (const e of r.data.entries ?? []) {
        if (
          e.operation !== 'media' ||
          e.status !== 'passed' ||
          e.control ||
          e.inputHash !== p.inputHash ||
          e.fullMotion !== true ||
          e.requestedFrames !== p.composition.durationInFrames ||
          e.renderedFrames !== p.composition.durationInFrames ||
          digest(e.frameRange) !== digest([0, p.composition.durationInFrames - 1])
        )
          continue;
        try {
          proof = probeArtifact(e, path.dirname(r.path), {
            width: p.composition.width,
            height: p.composition.height,
            frames: p.composition.durationInFrames,
            alpha: true,
          });
        } catch {
          /* Invalid bytes never count. */
        }
      }
    return { id: p.id, fullMotionExecuted: !!proof, proof };
  });
  const sequences = expected.sequences.flatMap((s) =>
    ['ink', 'polish'].flatMap((style) =>
      expected.palettes.map((palette) => {
        let proof = null;
        for (const r of validReports)
          for (const row of r.data.businessSequences ?? []) {
            if (
              row.id !== s.id ||
              row.style !== style ||
              row.palette !== palette ||
              row.approvedSourceSha256 !== s.approvedSourceSha256
            )
              continue;
            try {
              const directory = path.dirname(r.path);
              const sourceProof = validateSequenceSources(row, directory, s);
              proof = {
                source: sourceProof,
                preview: probeArtifact(row.preview, directory, {
                  width: 1920,
                  height: 1080,
                  frames: s.previewFrames,
                }),
                export: probeArtifact(row.export, directory, {
                  width: 1920,
                  height: 1080,
                  frames: s.exportFrames,
                }),
              };
              assert(
                proof.preview.path !== proof.export.path,
                'Preview/export require distinct artifacts',
              );
            } catch {
              /* Declarations and unit markers cannot establish saved media. */
            }
          }
        return { id: s.id, style, palette, savedMediaExecuted: !!proof, proof };
      }),
    ),
  );
  return {
    schemaVersion: 1,
    scope: 'business',
    source,
    bundle,
    targets,
    motion,
    sequences,
    rejectedReports,
    complete:
      targets.length === 108 &&
      targets.every((t) => t.criticalFramesExecuted) &&
      motion.every((m) => m.fullMotionExecuted) &&
      sequences.length === 16 * expected.palettes.length &&
      sequences.every((s) => s.savedMediaExecuted) &&
      rejectedReports.length === 0,
    fixtureFiles: expected.paths,
    expectationsSha256: digest(plan),
  };
}
