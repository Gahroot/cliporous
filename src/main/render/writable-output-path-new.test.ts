import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishNewOutput, resolveNewOutputPath } from './writable-output-path';

vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, linkSync: vi.fn(actual.linkSync) };
});
let dir: string;
let source: string;
let target: string;
beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'new-output-'));
  source = join(dir, 'owned-temp.mp4');
  target = join(dir, 'export.mp4');
  fs.writeFileSync(source, Buffer.alloc(256 * 1024, 42));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});
function withoutHardlinks() {
  vi.mocked(fs.linkSync).mockImplementationOnce(() => {
    throw Object.assign(new Error('Hardlinks unsupported'), { code: 'ENOTSUP' });
  });
}

describe('V2 output preservation with real files', () => {
  it('selects the first unused stable sibling without touching existing files', () => {
    expect(resolveNewOutputPath(target)).toBe(target);
    fs.writeFileSync(target, 'previous export');
    fs.writeFileSync(join(dir, 'export (2).mp4'), 'another export');
    expect(resolveNewOutputPath(target)).toBe(join(dir, 'export (3).mp4'));
    expect(fs.readFileSync(target, 'utf8')).toBe('previous export');
    expect(fs.readFileSync(join(dir, 'export (2).mp4'), 'utf8')).toBe('another export');
  });

  it('throws on bounded exhaustion rather than accepting an existing path', () => {
    fs.writeFileSync(target, 'previous export');
    for (let n = 2; n <= 99; n++) fs.writeFileSync(join(dir, `export (${n}).mp4`), 'occupied');
    expect(() => resolveNewOutputPath(target)).toThrow(/No unused output filename/);
    expect(fs.readFileSync(target, 'utf8')).toBe('previous export');
  });

  it.each([false, true])('publishes successfully (stream fallback=%s)', async (fallback) => {
    if (fallback) withoutHardlinks();
    await publishNewOutput(source, target);
    expect(fs.readFileSync(target)).toEqual(fs.readFileSync(source));
    fs.unlinkSync(source); // Render cleanup must leave the published file intact.
    expect(fs.statSync(target).size).toBe(256 * 1024);
  });

  it.each([
    false,
    true,
  ])('preserves a publish-time conflict (stream fallback=%s)', async (fallback) => {
    const chosen = resolveNewOutputPath(target);
    fs.writeFileSync(chosen, 'racing user file');
    if (fallback) withoutHardlinks();
    await expect(publishNewOutput(source, chosen)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(fs.readFileSync(chosen, 'utf8')).toBe('racing user file');
    expect(fs.statSync(source).size).toBe(256 * 1024);
  });

  it('cancels streaming and removes only its positively-owned partial', async () => {
    withoutHardlinks();
    const controller = new AbortController();
    const other = join(dir, 'user.mp4');
    fs.writeFileSync(other, 'keep me');
    const createReadStream = fs.createReadStream;
    vi.spyOn(fs, 'createReadStream').mockImplementationOnce((...args) => {
      const input = createReadStream(...args);
      input.once('data', () => {
        expect(fs.existsSync(target)).toBe(true);
        controller.abort();
      });
      return input;
    });
    await expect(publishNewOutput(source, target, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readFileSync(other, 'utf8')).toBe('keep me');
    expect(fs.statSync(source).size).toBe(256 * 1024);
  });
});
