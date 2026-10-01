import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CONCEPT_PACKS,
  currentBundleEvidence,
  parseE2EArgs,
  ROOT,
  runBounded,
} from './verify-systems-e2e.mjs';

const temporary = (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'batchclip-e2e-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('catalog flags are additive and opt-in, unit never requests renders, unknown flags fail', () => {
  assert.deepEqual(parseE2EArgs([]), {
    mode: 'render',
    technology: false,
    concepts: false,
    help: false,
  });
  assert.deepEqual(parseE2EArgs(['--technology', '--unit']), {
    mode: 'unit',
    technology: true,
    concepts: false,
    help: false,
  });
  assert.deepEqual(parseE2EArgs(['--concepts']), {
    mode: 'render',
    technology: false,
    concepts: true,
    help: false,
  });
  assert.deepEqual(parseE2EArgs(['--concepts', '--unit']), {
    mode: 'unit',
    technology: false,
    concepts: true,
    help: false,
  });
  assert.deepEqual(parseE2EArgs(['--technology', '--concepts', '--unit']), {
    mode: 'unit',
    technology: true,
    concepts: true,
    help: false,
  });
  assert.equal(parseE2EArgs(['--concepts', '--help']).help, true);
  assert.throws(() => parseE2EArgs(['--software-raster']), /Only/);
  assert.throws(() => parseE2EArgs(['--unknown']), /Only/);
});

test('bundle gate rejects missing maps, absent technology and changed current source contents', (t) => {
  const dir = temporary(t);
  writeFileSync(path.join(dir, 'index.html'), 'evidence-test');
  assert.throws(() => currentBundleEvidence(dir), /evidence missing/);
  const files = ['src/main/remotion/Root.tsx'];
  const map = {
    sources: files.map((file) => `./${file}`),
    sourcesContent: files.map((file) => readFileSync(path.join(ROOT, file), 'utf8')),
  };
  const save = () => writeFileSync(path.join(dir, 'bundle.js.map'), JSON.stringify(map));
  save();
  assert.match(currentBundleEvidence(dir).sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => currentBundleEvidence(dir, true), /technology.*agent-workflow/);
  map.sourcesContent[0] += '\n// stale';
  save();
  assert.throws(() => currentBundleEvidence(dir), /Stale production bundle/);
});

test('concept freshness requires current scenes, models and poses in every pack before rendering', (t) => {
  const dir = temporary(t);
  writeFileSync(path.join(dir, 'index.html'), 'concept-evidence-test');
  const files = [
    'src/main/remotion/Root.tsx',
    ...CONCEPT_PACKS.flatMap((pack) =>
      ['Scene.tsx', 'poses.ts', 'models.tsx'].map(
        (file) => `src/main/remotion/compositions/explainer/concepts/${pack}/${file}`,
      ),
    ),
  ];
  const sourcesContent = files.map((file) => readFileSync(path.join(ROOT, file), 'utf8'));
  const save = (sources = files, contents = sourcesContent) =>
    writeFileSync(
      path.join(dir, 'bundle.js.map'),
      JSON.stringify({ sources, sourcesContent: contents }),
    );
  save([files[0]], [sourcesContent[0]]);
  assert.throws(() => currentBundleEvidence(dir, false, true), /evidence missing.*concepts/);
  // Every required file matters independently, not just one representative source per pack.
  for (let i = 1; i < files.length; i++) {
    save(
      files.filter((_, n) => n !== i),
      sourcesContent.filter((_, n) => n !== i),
    );
    assert.throws(() => currentBundleEvidence(dir, false, true), /evidence missing/);
    save(
      files,
      sourcesContent.map((content, n) => (n === i ? `${content}\n// stale` : content)),
    );
    assert.throws(() => currentBundleEvidence(dir, false, true), /Stale production bundle/);
  }
  save();
  const evidence = currentBundleEvidence(dir, false, true);
  assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(evidence.sources).sort(), [...files].sort());
  assert.throws(() => currentBundleEvidence(dir, true, true), /technology.*agent-workflow/);
});

test('owned child timeout, failure, cancellation and recovery work on the host platform', async () => {
  let timedOut;
  await assert.rejects(
    runBounded(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      timeoutMs: 100,
      ownProcessGroup: true,
      onSpawn: (pid) => {
        timedOut = pid;
      },
    }),
    /exceeded/,
  );
  assert.throws(() => process.kill(timedOut, 0));
  const controller = new AbortController();
  await assert.rejects(
    runBounded(process.execPath, ['-e', "console.log('ready');setInterval(()=>{},1000)"], {
      ownProcessGroup: true,
      signal: controller.signal,
      onStdout: () => controller.abort(),
    }),
    /aborted/,
  );
  await assert.rejects(
    runBounded(process.execPath, ['-e', 'process.exit(3)'], { ownProcessGroup: true }),
    /exited 3/,
  );
  const result = await runBounded(process.execPath, ['-e', "console.log('recovered')"], {
    ownProcessGroup: true,
  });
  assert.equal(result.stdout.toString().trim(), 'recovered');
});
