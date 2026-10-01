import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), stat: vi.fn() }));
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: mocks.spawn,
}));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, stat: mocks.stat.mockImplementation(actual.stat) };
});

import { getVideoMetadata } from './ffmpeg';

class Probe extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn(() => {
    this.emit('close', null, 'SIGKILL');
    return true;
  });
}
const metadata = JSON.stringify({
  streams: [
    {
      codec_type: 'video',
      width: 320,
      height: 180,
      r_frame_rate: '30/1',
      codec_name: 'h264',
      duration: '2',
    },
  ],
  format: { duration: '2' },
});
let directory: string;
let file: string;
let probe: Probe;
beforeEach(() => {
  vi.clearAllMocks();
  directory = mkdtempSync(join(tmpdir(), 'local-probe-test-'));
  file = join(directory, 'source.mp4');
  writeFileSync(file, 'local fixture');
  probe = new Probe();
  mocks.spawn.mockReturnValue(probe);
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(directory, { recursive: true, force: true });
});
async function started() {
  await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
}
function finish() {
  probe.stdout.emit('data', Buffer.from(metadata));
  probe.emit('close', 0);
}

describe('local-only metadata boundary', () => {
  it.each([
    'https://example.invalid/source.mp4',
    'file:///tmp/source.mp4',
    'pipe:0',
    'relative.mp4',
    '\\\\.\\PhysicalDrive0',
    '\\\\?\\C:\\source.mp4',
    '/dev/stdin',
  ])('rejects URL/relative/device input %s before spawn', async (path) => {
    await expect(getVideoMetadata(path, { localOnly: true })).rejects.toThrow();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('rejects directories and missing files before spawn', async () => {
    await expect(getVideoMetadata(directory, { localOnly: true })).rejects.toThrow(/regular file/i);
    await expect(
      getVideoMetadata(join(directory, 'missing.mp4'), { localOnly: true }),
    ).rejects.toThrow();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('probes an absolute regular file using a protocol whitelist and no shell', async () => {
    const pending = getVideoMetadata(file, { localOnly: true });
    await started();
    const [, args, options] = mocks.spawn.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(['-protocol_whitelist', 'file,pipe', file]));
    expect(options.shell).not.toBe(true);
    finish();
    await expect(pending).resolves.toMatchObject({ duration: 2, width: 320, height: 180, fps: 30 });
    expect(probe.kill).not.toHaveBeenCalled();
  });
  it('preserves an authorized native UNC/mounted source with a regular-file check and whitelist', async () => {
    const path =
      process.platform === 'win32' ? '\\\\server\\share\\source.mp4' : '/mnt/nas/source.mp4';
    mocks.stat.mockResolvedValueOnce({ isFile: () => true });
    const pending = getVideoMetadata(path, { localOnly: true });
    await started();
    expect(mocks.stat).toHaveBeenCalledWith(path);
    expect(mocks.spawn.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['-protocol_whitelist', 'file,pipe', path]),
    );
    finish();
    await expect(pending).resolves.toMatchObject({ duration: 2 });
  });
  it('does not spawn for an already cancelled probe', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      getVideoMetadata(file, { localOnly: true, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('kills only its owned child on cancellation and removes the abort listener', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = getVideoMetadata(file, { localOnly: true, signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await started();
    controller.abort();
    await rejected;
    expect(probe.kill).toHaveBeenCalledTimes(1);
    expect(probe.kill).toHaveBeenCalledWith('SIGKILL');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
  it('times out and kills its child at 30 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = getVideoMetadata(file, { localOnly: true });
    const rejected = expect(pending).rejects.toThrow(/timed out/i);
    await started();
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(probe.kill).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    'stdout',
    'stderr',
  ] as const)('caps %s without retaining further process output', async (stream) => {
    const pending = getVideoMetadata(file, { localOnly: true });
    const rejected = expect(pending).rejects.toThrow(/output limit/i);
    await started();
    probe[stream].emit(
      'data',
      Buffer.alloc(stream === 'stdout' ? 4 * 1024 * 1024 + 1 : 64 * 1024 + 1),
    );
    await rejected;
    probe[stream].emit('data', Buffer.alloc(1024));
    expect(probe.kill).toHaveBeenCalledTimes(1);
  });
  it('preserves legacy URL probing when localOnly is not requested', async () => {
    const pending = getVideoMetadata('https://example.invalid/legacy.mp4');
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.spawn.mock.calls[0][1]).not.toContain('-protocol_whitelist');
    finish();
    await expect(pending).resolves.toMatchObject({ duration: 2 });
  });
});
