import assert from 'node:assert/strict';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { bundleDigest, digest, localBundle, ROOT } from '../explainer-stills/harness-runtime.mjs';

export { ROOT };
export const PIN_SUFFIX = '.storyboard-pin.json';
export const REQUIRED_BUNDLE_SOURCES = [
  'src/main/remotion/Root.tsx',
  'src/main/remotion/compositions/storyboard/StoryBoard.tsx',
  'src/main/remotion/compositions/storyboard/BoardProps3D.tsx',
  'src/main/remotion/compositions/storyboard/elements.tsx',
  'src/main/remotion/compositions/storyboard/look.ts',
  'src/shared/storyboard-palette.ts',
];
export function localPath(value, flag = '--bundle') {
  if (
    !value ||
    value.startsWith('--') ||
    value.length > 4096 ||
    value.includes('\0') ||
    /^[\\/]{2}/u.test(value) ||
    (/^[a-z][a-z\d+.-]*:/iu.test(value) && !/^[a-z]:[\\/]/iu.test(value))
  )
    throw new Error(`${flag} requires a local path, not a URL or network share`);
  return value;
}
export function outsideRepository(directory, root = ROOT) {
  const resolved = realpathSync(directory);
  const relative = path.relative(realpathSync(root), resolved);
  assert.ok(
    relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
    'Pinned bundle must be outside the repository; snapshot the production bundle first',
  );
  return resolved;
}
function filesUnder(directory) {
  const result = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const stat = lstatSync(file);
      assert.ok(!stat.isSymbolicLink(), `Symlink not allowed in evidence tree: ${file}`);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) result.push(file);
    }
  };
  visit(directory);
  return result;
}
/** Production inputs only: changing the proof scripts/UI cannot invalidate an in-flight source hash. */
export function sourceEvidence(root = ROOT, media = true) {
  const entries = [];
  const roots = ['src/main', 'src/shared', ...(media ? ['resources/fonts', 'resources/sfx'] : [])];
  for (const directory of roots)
    for (const file of filesUnder(path.join(root, directory))) {
      if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) continue;
      entries.push([path.relative(root, file).replaceAll('\\', '/'), digest(readFileSync(file))]);
    }
  for (const file of [
    'package.json',
    'package-lock.json',
    'scripts/build-remotion-bundle.mjs',
    'tailwind.config.js',
    'tsconfig.remotion.json',
  ]) {
    const full = path.join(root, file);
    if (existsSync(full)) entries.push([file, digest(readFileSync(full))]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return {
    scope: media
      ? 'main/shared + local fonts/SFX + dependency/build config (not proof scripts)'
      : 'main/shared + dependency/build config; no assets read',
    sha256: digest(entries),
    files: Object.fromEntries(entries),
  };
}
/** Strict byte freshness, including all bundled project modules. No formatting exceptions. */
export function bundleEvidence(directory, root = ROOT) {
  const bundle = localBundle(directory);
  const files = filesUnder(bundle);
  const sources = new Map();
  for (const file of files.filter((file) => file.endsWith('.js.map'))) {
    const map = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(
      Array.isArray(map.sources) && Array.isArray(map.sourcesContent),
      'Missing source-map contents',
    );
    map.sources.forEach((source, i) => {
      const normalized = source.replaceAll('\\', '/');
      // Dependency source maps often contain their own src/ tree (for example Three.js).
      if (/(?:^|\/)node_modules\//.test(normalized)) return;
      const relative = normalized.match(/(?:^|\/)(src\/[^?]+\.[cm]?[jt]sx?)(?:\?.*)?$/)?.[1];
      if (!relative) return;
      assert.ok(!relative.split('/').includes('..'), 'Unsafe source-map path');
      assert.ok(
        !/\/(?:proof-root|board-proof)\.[jt]sx?$/.test(relative),
        'Prototype entry in production bundle',
      );
      const current = readFileSync(path.join(root, relative), 'utf8');
      assert.equal(map.sourcesContent[i], current, `Stale production bundle source: ${relative}`);
      sources.set(relative, digest(current));
    });
  }
  for (const file of files)
    assert.ok(!/proof-source\.mp4$/i.test(file), 'Private prototype media in bundle');
  for (const file of REQUIRED_BUNDLE_SOURCES)
    assert.ok(sources.has(file), `Missing production source-map evidence: ${file}`);
  return {
    path: realpathSync(bundle),
    sha256: bundleDigest(bundle),
    sources: Object.fromEntries([...sources].sort()),
  };
}
export function verifyPin(directory, root = ROOT) {
  localPath(directory);
  const bundle = outsideRepository(directory, root);
  const pinPath = `${bundle}${PIN_SUFFIX}`;
  assert.ok(
    existsSync(pinPath),
    'Missing storyboard pin manifest; run scripts/storyboard-proof/pin.mjs after the coordinator build',
  );
  const pin = JSON.parse(readFileSync(pinPath, 'utf8'));
  assert.equal(pin.schemaVersion, 1, 'Unsupported pin manifest');
  const source = sourceEvidence(root);
  assert.equal(
    source.sha256,
    pin.source.sha256,
    'Stale source hash: pin again after the final production edits/build',
  );
  const evidence = bundleEvidence(bundle, root);
  assert.equal(evidence.sha256, pin.bundle.sha256, 'Pinned bundle hash changed');
  assert.deepEqual(evidence.sources, pin.bundle.sources, 'Pinned source-map hashes changed');
  return { pinPath, source, bundle: evidence };
}
