import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  bundleEvidence,
  outsideRepository,
  PIN_SUFFIX,
  REQUIRED_BUNDLE_SOURCES,
  sourceEvidence,
  verifyPin,
} from './gates.mjs';
import { diskSnapshot, startMetrics } from './metrics.mjs';
import { generatedConfig, parseArgs } from './verify.mjs';

function sandbox(t) {
  const out = mkdtempSync(join(tmpdir(), 'storyboard-gate-test-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const root = join(out, 'repo'),
    bundle = join(out, 'pin');
  mkdirSync(root);
  mkdirSync(bundle);
  const put = (name, content = '') => {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  for (const file of REQUIRED_BUNDLE_SOURCES) put(file, `// ${file}\n`);
  put('src/main/render/longform-scene-render.ts', '// actual pipeline hash');
  put('src/shared/storyboards.ts', '// contract hash');
  put('src/renderer/src/UI.tsx', '// not a Remotion dependency');
  put('resources/fonts/font.woff', 'local');
  put('resources/sfx/local.wav', 'local');
  writeFileSync(join(bundle, 'index.html'), '<html>existing local bundle</html>');
  writeFileSync(join(bundle, 'bundle.js'), '/* test-only simulated artifact, not media */');
  const map = {
    sources: REQUIRED_BUNDLE_SOURCES.map((f) => `webpack://batchclip/./${f}`),
    sourcesContent: REQUIRED_BUNDLE_SOURCES.map((f) => readFileSync(join(root, f), 'utf8')),
  };
  const saveMap = () => writeFileSync(join(bundle, 'bundle.js.map'), JSON.stringify(map));
  saveMap();
  const pin = () =>
    writeFileSync(
      `${bundle}${PIN_SUFFIX}`,
      JSON.stringify({
        schemaVersion: 1,
        source: sourceEvidence(root),
        bundle: bundleEvidence(bundle, root),
      }),
    );
  return { out, root, bundle, put, map, saveMap, pin };
}
test('explicit unit or local pinned bundle only; no implicit build/render or network', () => {
  assert.equal(parseArgs(['--unit']).unit, true);
  assert.equal(parseArgs(['--bundle', 'C:\\local\\pin']).bundle, 'C:\\local\\pin');
  assert.equal(parseArgs(['--help']).help, true);
  for (const args of [
    [],
    ['--media'],
    ['--bundle'],
    ['--bundle', '--unit'],
    ['--unit', '--bundle', 'local'],
    ['--unit', '--unit'],
    ['--bundle', 'one', '--bundle', 'two'],
    ['--download'],
    ['--repetitions', '100'],
  ])
    assert.throws(() => parseArgs(args));
  for (const remote of [
    'https://host/bundle',
    'file:///tmp/bundle',
    '//host/share',
    '\\\\host\\share',
    'a\0b',
  ])
    assert.throws(() => parseArgs(['--bundle', remote]), /local path/);
});
test('source hash includes contract/pipeline, excludes proof scripts and UI-only files; unit reads no assets', (t) => {
  const s = sandbox(t);
  const before = sourceEvidence(s.root);
  s.put('scripts/storyboard-proof/verify.mjs', 'edited during proof');
  s.put('scripts/storyboard-proof/ui-entry.tsx', 'coordinator-owned');
  s.put('src/renderer/src/UI.tsx', 'changed UI only');
  assert.equal(sourceEvidence(s.root).sha256, before.sha256);
  s.put('src/main/render/longform-scene-render.ts', 'changed pipeline');
  assert.notEqual(sourceEvidence(s.root).sha256, before.sha256);
  rmSync(join(s.root, 'resources'), { recursive: true });
  assert.ok(sourceEvidence(s.root, false).sha256);
});
for (const file of ['scripts/build-remotion-bundle.mjs', 'package.json']) {
  test(`pin rejects changes to build input ${file}`, (t) => {
    const s = sandbox(t);
    s.put(file, 'original build input');
    s.pin();
    s.put(file, 'changed build input');
    assert.throws(() => verifyPin(s.bundle, s.root), /Stale source hash/);
  });
  test(`pin rejects removal of build input ${file}`, (t) => {
    const s = sandbox(t);
    s.put(file, 'original build input');
    s.pin();
    rmSync(join(s.root, file));
    assert.throws(() => verifyPin(s.bundle, s.root), /Stale source hash/);
  });
}
test('valid external immutable manifest accepted; artifact tamper rejected', (t) => {
  const s = sandbox(t);
  s.pin();
  assert.equal(verifyPin(s.bundle, s.root).bundle.sha256, bundleEvidence(s.bundle, s.root).sha256);
  writeFileSync(join(s.bundle, 'bundle.js'), 'tampered');
  assert.throws(() => verifyPin(s.bundle, s.root), /bundle hash changed/);
});
test('bundled dependency sources are not mistaken for local project source files', (t) => {
  const s = sandbox(t);
  s.map.sources.push('webpack://batchclip/./node_modules/three/src/renderers/WebGLRenderer.js');
  s.map.sourcesContent.push('// installed dependency, not repo/src');
  s.saveMap();
  s.pin();
  assert.equal(
    verifyPin(s.bundle, s.root).bundle.sources['src/renderers/WebGLRenderer.js'],
    undefined,
  );
});
test('pin required, in-repository bundle refused, source-hash drift refused', (t) => {
  const s = sandbox(t);
  assert.throws(() => verifyPin(s.bundle, s.root), /Missing storyboard pin manifest/);
  assert.throws(() => outsideRepository(s.root, s.root), /outside the repository/);
  s.pin();
  s.put('src/shared/storyboards.ts', 'new contract');
  assert.throws(() => verifyPin(s.bundle, s.root), /Stale source hash/);
});
test('fresh timestamps cannot hide stale/missing source map or prototype bundle', (t) => {
  const s = sandbox(t);
  s.map.sourcesContent[0] = '// stale';
  s.saveMap();
  assert.throws(() => bundleEvidence(s.bundle, s.root), /Stale production bundle source/);
  s.map.sourcesContent[0] = readFileSync(join(s.root, REQUIRED_BUNDLE_SOURCES[0]), 'utf8');
  s.map.sources.pop();
  s.map.sourcesContent.pop();
  s.saveMap();
  assert.throws(() => bundleEvidence(s.bundle, s.root), /Missing production source-map evidence/);
  s.map.sources.push('webpack://x/./src/main/remotion/proof-root.tsx');
  s.map.sourcesContent.push('prototype');
  s.saveMap();
  assert.throws(() => bundleEvidence(s.bundle, s.root), /Prototype entry/);
});
test('pin source-map hash tamper rejected even with intact media bundle', (t) => {
  const s = sandbox(t);
  s.pin();
  const path = `${s.bundle}${PIN_SUFFIX}`;
  const pin = JSON.parse(readFileSync(path));
  pin.bundle.sources[REQUIRED_BUNDLE_SOURCES[0]] = 'wrong';
  writeFileSync(path, JSON.stringify(pin));
  assert.throws(() => verifyPin(s.bundle, s.root), /source-map hashes changed/);
});
test('generated Vitest config is isolated and all referenced harness modules exist', () => {
  const config = generatedConfig('/owned-temp', true);
  assert.ok(config.includes('scripts/storyboard-proof/proof.test.ts'));
  assert.ok(config.includes('vite-cache'));
  assert.ok(!config.includes('vitest.config.main'));
  for (const name of ['proof.test.ts', 'media.ts', 'metrics.mjs', 'fixtures.ts'])
    assert.ok(readFileSync(new URL(name, import.meta.url), 'utf8').length > 0);
  const media = readFileSync(new URL('media.ts', import.meta.url), 'utf8');
  assert.match(media, /renderSceneFirstLongform/);
  assert.match(media, /renderLongformScenePreview/);
  assert.ok(!media.includes('proof-root'));
});
test('metrics report measured worker RSS/disk and explicit unmeasured process/GPU scope', async (t) => {
  const s = sandbox(t);
  mkdirSync(join(s.out, 'scratch'));
  const metrics = startMetrics(s.out, 'unit');
  await metrics.measure('actual filesystem measurement', async () => {
    writeFileSync(join(s.out, 'scratch', 'owned'), 'hello');
    assert.equal(diskSnapshot(join(s.out, 'scratch')).bytes, 5);
    return { measuredBytes: 5 };
  });
  metrics.finish();
  const result = JSON.parse(readFileSync(join(s.out, 'report.json')));
  assert.equal(result.status, 'passed');
  assert.ok(result.metrics.nodePeakRssBytes > 0);
  assert.equal(result.tempAfter.bytes, 5);
  assert.equal(result.metrics.tempPeakFiles, 1);
});
