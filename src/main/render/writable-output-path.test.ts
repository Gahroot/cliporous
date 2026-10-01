import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canOverwrite, resolveWritableOutputPath } from './writable-output-path';

describe('writable-output-path', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wop-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the path unchanged when it does not exist', () => {
    const p = join(dir, 'clip.mp4');
    expect(resolveWritableOutputPath(p)).toBe(p);
  });

  it('returns the path unchanged when an existing file is writable', () => {
    const p = join(dir, 'clip.mp4');
    writeFileSync(p, 'x');
    expect(canOverwrite(p)).toBe(true);
    expect(resolveWritableOutputPath(p)).toBe(p);
  });

  it.skipIf(process.getuid?.() === 0)(
    'treats an unopenable file as locked and picks a sibling',
    () => {
      const p = join(dir, 'clip.mp4');
      writeFileSync(p, 'x');
      chmodSync(p, 0o444);
      expect(canOverwrite(p)).toBe(false);
      expect(resolveWritableOutputPath(p)).toBe(join(dir, 'clip (2).mp4'));
      chmodSync(p, 0o666);
    },
  );
});
