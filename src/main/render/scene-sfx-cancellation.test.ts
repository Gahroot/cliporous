import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mixSceneSfx } from './scene-sfx';

const mocks = vi.hoisted(() => ({ ffmpeg: vi.fn(), active: new Set<unknown>() }));
vi.mock('../ffmpeg', () => ({ ffmpeg: mocks.ffmpeg }));
vi.mock('./overlay-runner', () => ({ activeCommands: mocks.active }));
vi.mock('../logger', () => ({ log: vi.fn() }));
vi.mock('electron', () => ({ app: { isPackaged: false } }));

let directory: string;
let outputPath: string;
let onSave: ((command: Command) => void) | undefined;
const commands: Command[] = [];
const unrelated = { kill: vi.fn() };
class Command extends EventEmitter {
  outputOptions = vi.fn().mockReturnThis();
  kill = vi.fn();
  save = vi.fn((path: string) => {
    writeFileSync(path, 'owned partial');
    onSave?.(this);
    return this;
  });
}
function createCommand() {
  const command = new Command();
  commands.push(command);
  return command;
}
beforeEach(() => {
  vi.clearAllMocks();
  commands.length = 0;
  onSave = undefined;
  directory = mkdtempSync(join(tmpdir(), 'sfx-cancel-unit-'));
  outputPath = join(directory, 'mixed.mp4');
  mocks.active.clear();
  mocks.active.add(unrelated);
  mocks.ffmpeg.mockImplementation(createCommand);
});
afterEach(() => {
  expect(unrelated.kill).not.toHaveBeenCalled();
  expect(mocks.active).toEqual(new Set([unrelated]));
  rmSync(directory, { recursive: true, force: true });
});
const cues = [{ kind: 'tick' as const, at: 0.5 }];

describe('scene mixer owned-process cancellation (no real ffmpeg)', () => {
  it('does not construct a process for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await mixSceneSfx('/source.mp4', cues, {
        clipDuration: 6,
        outputPath,
        bounded: true,
        signal: controller.signal,
      }),
    ).toEqual({ ok: false, error: 'aborted' });
    expect(mocks.ffmpeg).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual([]);
  });

  it.each([
    false,
    true,
  ])('does not launch after cancellation before subscription (bounded=%s)', async (bounded) => {
    const controller = new AbortController();
    mocks.ffmpeg.mockImplementationOnce(() => {
      const command = createCommand();
      controller.abort();
      return command;
    });
    expect(
      await mixSceneSfx('/source.mp4', cues, {
        clipDuration: 6,
        outputPath,
        bounded,
        signal: controller.signal,
      }),
    ).toEqual({ ok: false, error: 'aborted' });
    expect(commands).toHaveLength(1);
    expect(commands[0].save).not.toHaveBeenCalled();
    expect(commands[0].kill).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual([]);
  });

  it.each([
    'end',
    'error',
  ] as const)('kills only its startup process and awaits its %s before cleanup', async (event) => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    onSave = () => controller.abort();
    const pending = mixSceneSfx('/source.mp4', cues, {
      clipDuration: 6,
      outputPath,
      bounded: true,
      signal: controller.signal,
    });
    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    expect(mocks.active.has(command)).toBe(true);
    expect(existsSync(command.save.mock.calls[0][0])).toBe(true);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    command.emit(event, new Error('terminated'));
    expect(await pending).toEqual({ ok: false, error: 'aborted' });
    expect(commands).toHaveLength(1);
    expect(readdirSync(directory)).toEqual([]);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('cancels the final AAC mix without killing completed bed commands', async () => {
    const controller = new AbortController();
    onSave = (command) =>
      queueMicrotask(() => {
        if (command.outputOptions.mock.calls[0][0].includes('aac')) controller.abort();
        command.emit('end');
      });
    const result = await mixSceneSfx('/source.mp4', cues, {
      clipDuration: 6,
      outputPath,
      bounded: true,
      signal: controller.signal,
    });
    expect(result).toEqual({ ok: false, error: 'aborted' });
    expect(commands).toHaveLength(3);
    expect(commands[0].kill).not.toHaveBeenCalled();
    expect(commands[1].kill).not.toHaveBeenCalled();
    expect(commands[2].kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    expect(readdirSync(directory)).toEqual([]);
  });

  it('cleans tracking/listeners and partials on synchronous startup failure', async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    onSave = () => {
      throw new Error('Cannot start');
    };
    expect(
      await mixSceneSfx('/source.mp4', cues, {
        clipDuration: 6,
        outputPath,
        bounded: true,
        signal: controller.signal,
      }),
    ).toEqual({ ok: false, error: 'Cannot start' });
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(readdirSync(directory)).toEqual([]);
  });

  it('retains the legacy one-command path when bounded mode is omitted', async () => {
    onSave = (command) => queueMicrotask(() => command.emit('end'));
    expect(await mixSceneSfx('/source.mp4', cues, { clipDuration: 6, outputPath })).toEqual({
      ok: true,
      outputPath,
      placed: 1,
    });
    expect(commands).toHaveLength(1);
    const args = commands[0].outputOptions.mock.calls[0][0] as string[];
    expect(args.join(' ')).toContain('adelay=500|500[s0]');
    expect(args.join(' ')).toContain('-c:v copy -c:a aac -b:a 192k');
    expect(args).not.toContain('concat');
    expect(existsSync(outputPath)).toBe(true);
  });
});
