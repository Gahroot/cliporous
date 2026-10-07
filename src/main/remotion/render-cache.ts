/**
 * Content-addressed cache for finished Remotion renders.
 *
 * A Remotion scene render is pure: the same bundle + composition + props +
 * canvas + encoding settings always produce the same frames. Re-exporting a
 * clip after a caption, title or trim change used to re-render every 3D scene
 * from scratch; with this cache the second export copies the finished file.
 *
 * The key covers the bundle fingerprint (any code change invalidates it), the
 * canonical JSON of the props, and size/mtime of any local files the props
 * reference, so an edited image under the same path is a miss, not a stale hit.
 */

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  utimesSync,
} from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';

/** Default cap; oldest entries are evicted beyond it. */
export const DEFAULT_RENDER_CACHE_MAX_BYTES = 4 * 1024 ** 3;

export interface RemotionCacheKeyInput {
  bundleFingerprint: string;
  compositionId: string;
  inputProps: Record<string, unknown>;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  transparent: boolean;
  /** Describes codec / image format / pixel format so a settings change misses. */
  encoding: string;
}

/** JSON with object keys sorted at every depth, so key order never changes the hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** Absolute paths of existing local files referenced anywhere in the props, sorted. */
function referencedFiles(value: unknown, out: Set<string>): Set<string> {
  if (typeof value === 'string') {
    if (value.length < 1024 && isAbsolute(value) && existsSync(value)) {
      try {
        if (statSync(value).isFile()) out.add(value);
      } catch {
        /* unreadable path: hash the string only */
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) referencedFiles(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) referencedFiles(item, out);
  }
  return out;
}

export function remotionCacheKey(input: RemotionCacheKeyInput): string {
  const files = [...referencedFiles(input.inputProps, new Set())].sort().map((path) => {
    const s = statSync(path);
    return [path, s.size, Math.round(s.mtimeMs)];
  });
  return createHash('sha256')
    .update(canonicalJson({ ...input, files, v: 1 }))
    .digest('hex');
}

/** Hash the top-level bundle files (index.html + emitted JS). Changes with any code change. */
export function fingerprintBundle(bundleDir: string): string {
  const hash = createHash('sha256');
  const names = readdirSync(bundleDir)
    .filter((name) => name === 'index.html' || name.endsWith('.js'))
    .sort();
  for (const name of names) {
    hash.update(name);
    hash.update(readFileSync(join(bundleDir, name)));
  }
  return hash.digest('hex');
}

function entryPath(cacheDir: string, key: string, ext: string): string {
  return join(cacheDir, `${key}${ext}`);
}

/** Hard-link (or copy) a cached render to `outputPath`. Returns false on a miss. */
export function restoreCachedRender(cacheDir: string, key: string, outputPath: string): boolean {
  const cached = entryPath(cacheDir, key, extname(outputPath));
  if (!existsSync(cached)) return false;
  try {
    if (existsSync(outputPath)) unlinkSync(outputPath);
    try {
      linkSync(cached, outputPath);
    } catch {
      copyFileSync(cached, outputPath);
    }
    const now = new Date();
    utimesSync(cached, now, now); // LRU: mark as recently used
    return true;
  } catch {
    return false;
  }
}

/** Store a finished render. Writes to a temp name then renames so readers never see a partial file. */
export function storeCachedRender(cacheDir: string, key: string, renderedPath: string): void {
  mkdirSync(cacheDir, { recursive: true });
  const target = entryPath(cacheDir, key, extname(renderedPath));
  const partial = `${target}.${process.pid}.partial`;
  copyFileSync(renderedPath, partial);
  renameSync(partial, target);
}

/** Evict least-recently-used entries until the cache fits in `maxBytes`. */
export function pruneRenderCache(cacheDir: string, maxBytes: number): number {
  if (!existsSync(cacheDir)) return 0;
  const entries = readdirSync(cacheDir)
    .filter((name) => !name.endsWith('.partial'))
    .map((name) => {
      const path = join(cacheDir, name);
      const s = statSync(path);
      return { path, size: s.size, mtimeMs: s.mtimeMs };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs || (a.path < b.path ? -1 : 1));
  let total = entries.reduce((sum, e) => sum + e.size, 0);
  let removed = 0;
  for (const entry of entries) {
    if (total <= maxBytes) break;
    try {
      unlinkSync(entry.path);
      total -= entry.size;
      removed++;
    } catch {
      /* in use (Windows) — try the next one */
    }
  }
  return removed;
}
