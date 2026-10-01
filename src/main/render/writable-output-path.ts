// ---------------------------------------------------------------------------
// Pick an output path FFmpeg can actually open for writing.
//
// Re-rendering a source reuses the same deterministic filename. On Windows, if
// the earlier render is still open in a media player (or being scanned), FFmpeg
// fails with "Error opening output file … Permission denied". Detect that up
// front and pick a free ` (n)` sibling instead of failing the clip.
// ---------------------------------------------------------------------------

import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
  openSync,
  unlinkSync,
} from 'node:fs';
import { extname } from 'node:path';
import { pipeline } from 'node:stream/promises';

const MAX_SUFFIX = 99;

/** True when `path` does not exist, or exists and can be opened for writing. */
export function canOverwrite(path: string): boolean {
  if (!existsSync(path)) return true;
  try {
    closeSync(openSync(path, 'r+'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Return `path` if it is writable; otherwise the first `name (n).ext` sibling
 * that is. Falls back to `path` unchanged if none is found, so the caller's
 * normal error handling still reports the failure.
 */
export function resolveWritableOutputPath(path: string): string {
  if (canOverwrite(path)) return path;
  const ext = extname(path);
  const stem = path.slice(0, path.length - ext.length);
  for (let n = 2; n <= MAX_SUFFIX; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (canOverwrite(candidate)) return candidate;
  }
  return path;
}

/** V2 never accepts an existing entry. Publication must still exclude racing writers. */
export function resolveNewOutputPath(path: string): string {
  const ext = extname(path);
  const stem = path.slice(0, path.length - ext.length);
  for (let n = 1; n <= MAX_SUFFIX; n++) {
    const candidate = n === 1 ? path : `${stem} (${n})${ext}`;
    if (!lstatSync(candidate, { throwIfNoEntry: false })) return candidate;
  }
  throw new Error(`No unused output filename available for ${path}`);
}

/** Atomic no-clobber hardlink from owned same-volume temp. Caller retains temp ownership.
 * Unsupported filesystems fall back to exclusive, cancellable streaming (NOT atomic).
 */
export async function publishNewOutput(
  sourcePath: string,
  outputPath: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  try {
    linkSync(sourcePath, outputPath);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes(code)) throw error;
  }
  const fd = openSync(outputPath, 'wx'); // EEXIST never grants ownership or cleanup rights.
  const owned = fstatSync(fd);
  try {
    await pipeline(createReadStream(sourcePath), createWriteStream(outputPath, { fd }), { signal });
  } catch (error) {
    const current = lstatSync(outputPath, { throwIfNoEntry: false });
    if (current?.dev === owned.dev && current.ino === owned.ino) unlinkSync(outputPath);
    throw error;
  }
}
