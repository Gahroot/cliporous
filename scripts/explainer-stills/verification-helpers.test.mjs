import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stageCanvasFor } from '../../src/main/remotion/compositions/explainer/types.ts';
import {
  criticalFrames,
  REQUIRED_TARGET_COUNT,
  sceneBeats,
  targetMatchesScene,
  verificationPlan,
} from './fixture-manifest.mjs';
import {
  bundleDigest,
  cost,
  digest,
  localBundle,
  onBrowserDownload,
  outputDirectory,
  processTreeRss,
  ROOT,
  startReport,
  withDeadline,
} from './harness-runtime.mjs';
import {
  alphaStats,
  artifactValid,
  compareCosts,
  compareStillReports,
  executionCoverage,
  pngEvidence,
} from './verification-evidence.mjs';
import { parseVerificationArgs, shuffledSamples } from './verification-options.mjs';
import { movieRange, resolvedComposition, runVerification } from './verify-motion.mjs';

function temporary(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'batchclip-harness-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true })); // Only a directory this test created.
  return dir;
}
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=',
  'base64',
);
function artifact(t, overrides = {}) {
  const output = path.join(temporary(t), 'frame.png');
  writeFileSync(output, PNG);
  return {
    operation: 'still',
    output,
    status: 'passed',
    renderedFrames: 1,
    frame: 0,
    width: 1,
    height: 1,
    inputHash: digest('props'),
    ...pngEvidence(output, 1, 1),
    ...overrides,
  };
}
const fixture = () => ({
  name: 'flywheel',
  durationSec: 3,
  scene: { kind: 'hero', prop: 'flywheel', label: 'Momentum', at: 0.4 },
  samples: [
    { name: 'setup', frame: 0 },
    { name: 'result', frame: 75 },
  ],
  covers: [{ category: 'prop', id: 'flywheel' }],
});

test('critical samples are finite, unique, bounded, and include before/on/after nested beats', () => {
  const fx = {
    durationSec: 2,
    scene: {
      kind: 'statement',
      words: [{ text: 'Go', at: 0.5 }],
      labelTreatment: { kind: 'peel-back', revealAt: 1 },
    },
    samples: [],
  };
  const frames = criticalFrames(fx).map((s) => s.frame);
  assert.deepEqual(frames, [0, 14, 15, 16, 29, 30, 31, 59]);
  assert(frames.every(Number.isSafeInteger));
});

test('finite-time validation rejects non-time NaN too; never clamps invalid fixture beats', () => {
  for (const at of [-1, Infinity, NaN, 3, null, '0.4'])
    assert.throws(() => sceneBeats({ kind: 'hero', at }, 3), /finite/);
  assert.throws(() => sceneBeats({ kind: 'test', ratio: NaN, at: 0.4 }, 3), /non-finite/);
  assert.throws(() => sceneBeats({ kind: 'test', at: 0.4 }, NaN), /durationSec/);
  assert.throws(() => sceneBeats({ kind: 'test' }, 3), /no timed/);
});

test('hero catalog impact contributes its own critical triplet and rejects unsupported reverse actions', () => {
  const fx = fixture();
  const beats = sceneBeats(fx.scene, fx.durationSec);
  const impact = beats.find((b) => b.name === 'catalog-impact');
  assert(impact && impact.at > fx.scene.at);
  const frames = criticalFrames(fx).map((s) => s.frame);
  for (const delta of [-1, 0, 1]) assert(frames.includes(Math.round(impact.at * 30) + delta));
  assert.throws(() => sceneBeats({ ...fx.scene, prop: 'not-registered' }, 3), /missing catalog/);
  assert.throws(() => sceneBeats({ ...fx.scene, at: 2.9 }, 3), /final hold/);
});

test('verification matrix uses production stageCanvas and distinct input hashes; never mutates fixtures', () => {
  const fx = fixture();
  const before = structuredClone(fx);
  const plan = verificationPlan([fx]);
  assert.deepEqual(fx, before);
  assert(plan.some((p) => p.inputProps.layout === 'stack' && p.inputProps.aspect === '9:16'));
  assert(
    plan.some(
      (p) =>
        p.inputProps.layout === 'over' && p.inputProps.aspect === '16:9' && p.inputProps.palette,
    ),
  );
  for (const p of plan) {
    const canvas = stageCanvasFor(p.inputProps.layout, p.inputProps.aspect);
    assert.equal(p.composition.width, canvas.width);
    assert.equal(p.composition.height, canvas.height);
    assert.equal(p.transparent, canvas.transparent);
    assert.equal(p.inputHash, digest({ inputProps: p.inputProps, composition: p.composition }));
  }
  assert.equal(new Set(plan.map((p) => p.inputHash)).size, plan.length);
});

test('coverage declarations must match actual rendered fields, not labels or unused props', () => {
  assert.throws(
    () => verificationPlan([{ ...fixture(), covers: [{ category: 'prop', id: 'lever' }] }]),
    /does not match/,
  );
  assert(
    !targetMatchesScene(
      { category: 'treatment', id: 'letterpress' },
      { kind: 'hero', label: 'letterpress', finish: 'letterpress' },
    ),
  );
  assert(
    targetMatchesScene(
      { category: 'treatment', id: 'letterpress' },
      { kind: 'stamp', finish: 'letterpress' },
    ),
  );
  assert(
    targetMatchesScene(
      { category: 'treatment', id: 'mechanical-number' },
      { kind: 'number', presentation: 'odometer' },
    ),
  );
  assert(
    targetMatchesScene({ category: 'relay', id: 'unlock' }, { kind: 'relay', preset: 'unlock' }),
  );
  assert(
    !targetMatchesScene({ category: 'relay', id: 'unlock' }, { kind: 'relay', preset: 'nurture' }),
  );
});

test('coverage never upgrades declarations into executed evidence', () => {
  const targets = executionCoverage([]);
  assert.equal(targets.length, REQUIRED_TARGET_COUNT);
  assert(targets.every((row) => !row.criticalFramesExecuted));
});

test('executed coverage requires every case/frame, exact props hash and native dimensions', (t) => {
  const entry = artifact(t);
  const plan = {
    id: 'case',
    fixtureName: 'fx',
    covers: [{ category: 'prop', id: 'flywheel' }],
    inputHash: entry.inputHash,
    inputProps: { layout: 'stack', aspect: '9:16' },
    composition: { width: 1, height: 1 },
    samples: [{ frame: 0 }, { frame: 1 }],
  };
  const row = (entries, plans = [plan]) =>
    executionCoverage(plans, [{ entries }]).find((r) => r.id === 'flywheel');
  assert.deepEqual(row([entry]).cases[0].missingFrames, [1]);
  const second = { ...entry, frame: 1 };
  assert(row([entry, second]).criticalFramesExecuted);
  assert(!row([entry, { ...second, inputHash: digest('other') }]).criticalFramesExecuted);
  assert(
    !row([entry, second], [{ ...plan, composition: { width: 2, height: 1 } }])
      .criticalFramesExecuted,
  );
  assert(!row([entry, { ...second, status: 'failed' }]).criticalFramesExecuted);
  assert(
    !row([entry, second], [plan, { ...plan, id: 'second-case', inputHash: digest('new-case') }])
      .criticalFramesExecuted,
  );
});

test('PNG evidence rejects corrupt, truncated, resized, missing and hash-mismatched files', (t) => {
  const e = artifact(t);
  assert(artifactValid(e));
  assert(!artifactValid({ ...e, sha256: digest('wrong') }));
  assert(!artifactValid({ ...e, width: 2 }));
  assert(!artifactValid({ ...e, inputHash: undefined }));
  assert(!artifactValid({ ...e, renderedFrames: 0 }));
  writeFileSync(e.output, PNG.subarray(0, 24));
  assert.throws(() => pngEvidence(e.output, 1, 1), /complete PNG/);
  assert(!artifactValid(e));
  rmSync(e.output);
  assert(!artifactValid(e));
});

test('control comparison fails on missing/changed inputs, failed runs, and empty evidence', (t) => {
  const e = artifact(t);
  const before = { status: 'passed', entries: [e] };
  assert(compareStillReports(before, structuredClone(before)).equal);
  assert(!compareStillReports(before, { status: 'failed', entries: [e] }).equal);
  assert(
    !compareStillReports(before, {
      status: 'passed',
      entries: [{ ...e, inputHash: digest('changed') }],
    }).equal,
  );
  assert(!compareStillReports(before, { status: 'passed', entries: [] }).equal);
  assert(!compareStillReports({ status: 'passed', entries: [] }, before).equal);
});

test('alpha evidence distinguishes empty/opaque/invisible from transparent AND visible', () => {
  assert.throws(() => alphaStats(Buffer.alloc(0)), /Empty/);
  assert(!alphaStats(Buffer.from([255, 255])).hasTransparentAndVisible);
  assert(!alphaStats(Buffer.from([0, 0])).hasTransparentAndVisible);
  assert.deepEqual(alphaStats(Buffer.from([0, 127, 255])), {
    min: 0,
    max: 255,
    transparentPixels: 1,
    opaquePixels: 1,
    partialPixels: 1,
    hasTransparentAndVisible: true,
  });
});

test('numeric costs require matched successful real controls; zero/missing/partial/nonfinite evidence is not a ratio', () => {
  assert.deepEqual(cost(2000, 60), {
    elapsedMs: 2000,
    renderedFrames: 60,
    renderedSeconds: 2,
    msPerRenderedSecond: 1000,
  });
  assert.equal(cost(100, 0).msPerRenderedSecond, null);
  const base = {
    status: 'passed',
    width: 1080,
    height: 960,
    fps: 30,
    codec: 'prores-4444',
    renderedFrames: 6,
    requestedFrames: 6,
    paletteHash: digest('palette'),
    rendererConfigurationHash: digest('default-renderer-config'),
    msPerRenderedSecond: 2000,
    concurrency: 1,
  };
  assert.equal(compareCosts({ ...base, msPerRenderedSecond: 6000 }, base).ratio, 3);
  for (const override of [
    { height: 1920 },
    { status: 'failed' },
    { requestedFrames: 10 },
    { concurrency: 2 },
    { msPerRenderedSecond: NaN },
    { paletteHash: undefined },
    { rendererConfigurationHash: digest('software-raster-config') },
    { rendererConfigurationHash: undefined },
    { codec: undefined },
  ]) {
    assert.equal(compareCosts({ ...base, ...override }, base).ratio, null);
  }
});

test('RSS only sums current process and descendants, regardless of row order', () => {
  assert.equal(processTreeRss('30 20 3\n10 1 7\n20 10 11\n99 1 1000\nnoise', 10), 21 * 1024);
  assert.equal(processTreeRss('99 1 4', 10), null);
});

test('actual host report records finite scoped RSS and preserves failure reporting', async (t) => {
  const stats = startReport(temporary(t), 'rss-test');
  const failure = new Error('observed operation failed');
  try {
    assert(Number.isFinite(stats.report.rss.peakBytes));
    assert(stats.report.rss.peakBytes > 0);
    assert.equal(stats.report.rss.unavailable, null);
    assert.equal(stats.report.rss.samples, 1);
    assert.equal(
      stats.report.rss.scope,
      process.platform === 'win32'
        ? 'Node coordinator only; Chrome/FFmpeg descendants unmeasured on Windows'
        : 'node plus descendants; ps RSS sum sampled every 1000ms (shared pages may double count)',
    );
    await assert.rejects(
      stats.measure({ operation: 'deliberate-failure' }, async () => {
        throw failure;
      }),
      /observed operation failed/,
    );
  } finally {
    stats.finish(failure);
  }
  const saved = JSON.parse(readFileSync(stats.reportPath, 'utf8'));
  assert.equal(saved.status, 'failed');
  assert.equal(saved.entries[0].error, failure.message);
  assert.equal(saved.entries[0].errorStack, failure.stack);
  assert.deepEqual(saved.errors, [failure.message]);
  assert.deepEqual(saved.failure, { message: failure.message, stack: failure.stack });
  assert(Number.isFinite(saved.rss.peakBytes) && saved.rss.peakBytes > 0);
  assert(saved.rss.samples >= 3);
  assert.equal(saved.rss.unavailable, null);

  // The host-specific no-subprocess branch must not invent memory when its native read fails.
  if (process.platform === 'win32') {
    for (const value of [NaN, Infinity, 0, -1, new Error('native RSS unavailable')]) {
      const memory = t.mock.method(process, 'memoryUsage', () => {
        if (value instanceof Error) throw value;
        return { rss: value };
      });
      try {
        const unavailable = startReport(temporary(t), 'rss-unavailable-test');
        unavailable.finish();
        const report = JSON.parse(readFileSync(unavailable.reportPath, 'utf8'));
        assert.equal(report.rss.peakBytes, null);
        assert.equal(report.rss.samples, 0);
        assert.match(
          report.rss.unavailable,
          /RSS sample must be finite and positive|native RSS unavailable/,
        );
        assert.equal(report.status, 'no-evidence');
        assert.deepEqual(report.errors, []);
      } finally {
        memory.mock.restore();
      }
    }
  }
});

test('output safety refuses repository/symlink targets and existing data without deleting anything', (t) => {
  const dir = temporary(t);
  const sentinel = path.join(dir, 'keep.txt');
  writeFileSync(sentinel, 'untouched');
  assert.throws(() => outputDirectory(dir), /not empty/);
  assert.equal(readFileSync(sentinel, 'utf8'), 'untouched');
  assert.throws(() => outputDirectory(path.join(ROOT, 'new-verifier-output')), /outside/);
  const link = path.join(dir, 'repo-link');
  symlinkSync(ROOT, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => outputDirectory(path.join(link, 'unsafe')), /outside/);
  assert(!existsSync(path.join(ROOT, 'new-verifier-output')));
});

test('bundle identity changes with content; local prerequisites never download', (t) => {
  const dir = temporary(t);
  assert.throws(() => localBundle(dir), /index.html/);
  writeFileSync(path.join(dir, 'index.html'), 'one');
  assert.equal(localBundle(dir), dir);
  const first = bundleDigest(dir);
  writeFileSync(path.join(dir, 'index.html'), 'two');
  assert.notEqual(bundleDigest(dir), first);
  assert.throws(onBrowserDownload, /downloads are disabled/);
});

test('failed-run snapshots preserve successful and failed work, partial frames, stacks and totals', async (t) => {
  const stats = startReport(temporary(t), 'test');
  const failure = new Error('deliberate render failure');
  try {
    await stats.measure({ operation: 'complete' }, async (entry) => {
      entry.renderedFrames = 3;
      entry.output = 'kept';
    });
    await assert.rejects(
      stats.measure({ operation: 'partial' }, async (entry) => {
        entry.renderedFrames = 2;
        stats.save();
        const live = JSON.parse(readFileSync(stats.reportPath, 'utf8'));
        assert.equal(live.metrics.renderedFrames, 5);
        assert.equal(live.entries[1].status, 'running');
        throw failure;
      }),
      /deliberate/,
    );
  } finally {
    stats.finish(failure);
  }
  const saved = JSON.parse(readFileSync(stats.reportPath, 'utf8'));
  assert.equal(saved.status, 'failed');
  assert.equal(saved.metrics.renderedFrames, 5);
  assert.deepEqual(
    saved.entries.map((e) => e.status),
    ['passed', 'failed'],
  );
  assert.equal(saved.entries[0].output, 'kept');
  assert.match(saved.entries[1].errorStack, /deliberate/);
  assert.match(saved.failure.stack, /deliberate/);
  assert(saved.metrics.elapsedMs > 0);
  assert(saved.rss.samples > 0 || saved.rss.unavailable);
  assert(!existsSync(`${stats.reportPath}.tmp`));
});

test('no-op and dry-run reports are never passed; parallel failures retain every operation', async (t) => {
  for (const [meta, expected] of [
    [{}, 'no-evidence'],
    [{ execution: 'not-started' }, 'planned'],
  ]) {
    const stats = startReport(temporary(t), 'test', meta);
    stats.finish();
    assert.equal(JSON.parse(readFileSync(stats.reportPath, 'utf8')).status, expected);
  }
  const stats = startReport(temporary(t), 'test');
  try {
    await Promise.allSettled([
      stats.measure({ operation: 'a' }, async (entry) => {
        entry.renderedFrames = 1;
        throw new Error('a failed');
      }),
      stats.measure({ operation: 'b' }, async (entry) => {
        entry.renderedFrames = 2;
      }),
    ]);
  } finally {
    stats.finish();
  }
  const saved = JSON.parse(readFileSync(stats.reportPath, 'utf8'));
  assert.equal(saved.status, 'failed');
  assert.equal(saved.metrics.renderedFrames, 3);
  assert.equal(saved.entries.length, 2);
});

test('deadlines cancel only the operation, preserve normal rejection, and contain cancellation errors', async () => {
  let cancelled = 0;
  assert.equal(
    await withDeadline(
      async () => 7,
      () => cancelled++,
      100,
    ),
    7,
  );
  assert.equal(cancelled, 0);
  await assert.rejects(
    withDeadline(
      async () => {
        throw new Error('render failed');
      },
      () => cancelled++,
      100,
    ),
    /render failed/,
  );
  assert.equal(cancelled, 0);
  await assert.rejects(
    withDeadline(
      () => new Promise(() => {}),
      () => {
        cancelled++;
        throw new Error('cancel failed');
      },
      5,
    ),
    /exceeded/,
  );
  assert.equal(cancelled, 1);
});

test('control and intentional error props reach composition.props, not only getInputProps', () => {
  const selected = {
    id: 'ExplainerScene',
    props: { scene: { kind: 'hero', prop: 'flywheel' }, layout: 'stack' },
  };
  const dimensions = { width: 1920, height: 1080, fps: 30, durationInFrames: 90 };
  const control = { scene: { kind: 'hero', prop: 'gears' }, layout: 'over' };
  const composed = resolvedComposition(selected, dimensions, control);
  assert.deepEqual(composed.props, control);
  assert.equal(composed.width, 1920);
  assert.equal(selected.props.scene.prop, 'flywheel');
  assert.equal(resolvedComposition(selected, dimensions, { scene: null }).props.scene, null);
});

test('shared systems runner dry-run derives its audit scope without executing declarations', async (t) => {
  const bundle = temporary(t);
  const out = temporary(t);
  // A local marker is sufficient for planning; it must never be opened for rendering.
  writeFileSync(path.join(bundle, 'index.html'), 'planning only');
  await runVerification(
    [
      '--bundle',
      bundle,
      '--out',
      out,
      '--select',
      'technology:agent-workflow/tool-success',
      '--dry-run',
    ],
    'systems',
  );
  const report = JSON.parse(readFileSync(path.join(out, 'report.json'), 'utf8'));
  assert.equal(report.status, 'planned');
  assert.equal(report.metrics.renderedFrames, 0);
  assert.equal(report.cleanup.browserOpened, false);
  assert.equal(report.entries.length, 0);
  assert.equal(report.coverage.length, REQUIRED_TARGET_COUNT);
  assert(report.coverage.every((row) => !row.criticalFramesExecuted));
  assert.equal(
    report.coverageScope,
    `Selected fixture plans only. Run coverage.mjs against ALL fixture plans for a ${REQUIRED_TARGET_COUNT}-item audit.`,
  );
});

test('CLI rejects unbounded/ambiguous requests; shuffled samples and movie windows are deterministic', () => {
  assert.throws(() => parseVerificationArgs(['--all', '--controls']), /mutually/);
  for (const args of [
    ['--media-frames', '-1'],
    ['--media-frames', 'NaN'],
    ['--timeout-ms', '0'],
    ['--out', 'https://example.com'],
  ]) {
    assert.throws(() => parseVerificationArgs(args));
  }
  assert.equal(parseVerificationArgs([], 'systems')['media-frames'], 0);
  const samples = Array.from({ length: 10 }, (_, frame) => ({ frame: frame * 5 }));
  const before = structuredClone(samples);
  assert.deepEqual(shuffledSamples(samples), shuffledSamples(samples));
  assert.notDeepEqual(shuffledSamples(samples), samples);
  assert.deepEqual(samples, before);
  const p = { samples, composition: { durationInFrames: 90 } };
  assert.deepEqual(movieRange(p, 0), [0, 89]);
  assert.deepEqual(movieRange(p, 200), [0, 89]);
  const [start, end] = movieRange(p, 6);
  assert.equal(end - start + 1, 6);
  assert(start >= 0 && end < 90);
});
