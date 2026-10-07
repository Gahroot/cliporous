import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalJson,
  pruneRenderCache,
  type RemotionCacheKeyInput,
  remotionCacheKey,
  restoreCachedRender,
  storeCachedRender,
} from './render-cache';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'render-cache-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function keyInput(overrides: Partial<RemotionCacheKeyInput> = {}): RemotionCacheKeyInput {
  return {
    bundleFingerprint: 'bundle-a',
    compositionId: 'ExplainerSequence',
    inputProps: { a: 1, b: { c: [1, 2] } },
    durationInFrames: 90,
    fps: 30,
    width: 1080,
    height: 960,
    transparent: false,
    encoding: 'h264/jpeg95',
    ...overrides,
  };
}

describe('remotionCacheKey', () => {
  it('ignores object key order but not values', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
    const base = remotionCacheKey(keyInput());
    expect(remotionCacheKey(keyInput({ inputProps: { b: { c: [1, 2] }, a: 1 } }))).toBe(base);
    expect(remotionCacheKey(keyInput({ inputProps: { a: 2, b: { c: [1, 2] } } }))).not.toBe(base);
    expect(remotionCacheKey(keyInput({ bundleFingerprint: 'bundle-b' }))).not.toBe(base);
    expect(remotionCacheKey(keyInput({ transparent: true }))).not.toBe(base);
  });

  it('misses when a referenced local file changes', () => {
    const dir = tempDir();
    const image = join(dir, 'image.png');
    writeFileSync(image, 'one');
    const before = remotionCacheKey(keyInput({ inputProps: { src: image } }));
    writeFileSync(image, 'longer content');
    expect(remotionCacheKey(keyInput({ inputProps: { src: image } }))).not.toBe(before);
  });
});

describe('render cache store/restore/prune', () => {
  it('round-trips a render and misses unknown keys', () => {
    const cache = tempDir();
    const work = tempDir();
    const rendered = join(work, 'rendered.mov');
    writeFileSync(rendered, 'frames');
    storeCachedRender(cache, 'k1', rendered);

    const restored = join(work, 'restored.mov');
    expect(restoreCachedRender(cache, 'k1', restored)).toBe(true);
    expect(readFileSync(restored, 'utf8')).toBe('frames');
    expect(restoreCachedRender(cache, 'missing', join(work, 'x.mov'))).toBe(false);
  });

  it('evicts least recently used entries first', () => {
    const cache = tempDir();
    writeFileSync(join(cache, 'old.mp4'), 'x'.repeat(10));
    writeFileSync(join(cache, 'new.mp4'), 'y'.repeat(10));
    utimesSync(join(cache, 'old.mp4'), new Date(1_000), new Date(1_000));
    utimesSync(join(cache, 'new.mp4'), new Date(2_000_000), new Date(2_000_000));

    expect(pruneRenderCache(cache, 15)).toBe(1);
    expect(restoreCachedRender(cache, 'old', join(cache, '..', 'o.mp4'))).toBe(false);
  });
});
