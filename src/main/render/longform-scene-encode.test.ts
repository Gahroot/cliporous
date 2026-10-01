import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  ffmpeg: vi.fn(),
  gpuError: vi.fn(),
  disableGpu: vi.fn(),
  encoder: 'libx264',
}));
vi.mock('../ffmpeg', () => ({
  ffmpeg: state.ffmpeg,
  getEncoder: () => ({ encoder: state.encoder, presetFlag: ['-crf', '12'] }),
  isHardwareEncoder: (encoder: string) => encoder !== 'libx264',
  getSoftwareEncoder: () => ({ encoder: 'libx264', presetFlag: ['-crf', '12'] }),
  isGpuEncoderDisabled: () => false,
  isGpuSessionError: state.gpuError,
  disableGpuEncoderForSession: state.disableGpu,
}));

import { concatLongformSceneSegments, encodeLongformSceneSegment } from './longform-encode';

class Command extends EventEmitter {
  inputs: { path: string; options: string[]; seek?: number }[] = [];
  options: string[] = [];
  frameCount = 0;
  seconds = 0;
  hold = false;
  failure?: string;
  kill = vi.fn(() => {
    queueMicrotask(() => this.emit('error', new Error('Process terminated')));
  });
  constructor(path?: string) {
    super();
    if (path) this.input(path);
  }
  input(path: string) {
    this.inputs.push({ path, options: [] });
    return this;
  }
  inputOptions(options: string[]) {
    this.inputs[this.inputs.length - 1].options.push(...options);
    return this;
  }
  seekInput(seek: number) {
    this.inputs[this.inputs.length - 1].seek = seek;
    return this;
  }
  frames(count: number) {
    this.frameCount = count;
    return this;
  }
  duration(seconds: number) {
    this.seconds = seconds;
    return this;
  }
  outputOptions(options: string[]) {
    this.options.push(...options);
    return this;
  }
  save() {
    if (!this.hold)
      queueMicrotask(() =>
        this.failure ? this.emit('error', new Error(this.failure)) : this.emit('end'),
      );
    return this;
  }
}
const commands: Command[] = [];
const dirs: string[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  state.encoder = 'libx264';
  commands.length = 0;
  state.ffmpeg.mockImplementation((path?: string) => {
    const command = new Command(path);
    commands.push(command);
    return command;
  });
});
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const segment = {
  sourceVideoPath: '/source.mp4',
  outputPath: '/output.mp4',
  visualPath: '/scene.mov',
  startTime: 61 / 30,
  frameCount: 121,
  sourceWidth: 1920,
  sourceHeight: 1080,
  background: '#123456',
  presentation: 'speaker-side' as const,
};

describe('scene-first FFmpeg primitives', () => {
  it('seeks source in frame time, emits an exact CFR frame count, and never segments narration', async () => {
    await encodeLongformSceneSegment(segment);
    const command = commands[0];
    expect(command.inputs.map((input) => [input.path, input.seek])).toEqual([
      ['/source.mp4', 61 / 30],
      ['/scene.mov', undefined],
    ]);
    for (const input of command.inputs)
      expect(input.options).toEqual(['-protocol_whitelist', 'file,pipe']);
    expect(command.frameCount).toBe(121);
    expect(command.options).toContain('-an');
    expect(command.options).toEqual(
      expect.arrayContaining(['-r', '30', '-fps_mode', 'cfr', '-pix_fmt', 'yuv420p']),
    );
    expect(command.options[command.options.indexOf('-filter_complex') + 1]).toContain(
      'trim=end_frame=121',
    );
  });

  it('assembles video with a bounded concat demuxer and one continuous original audio stream', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lf-concat-test-'));
    dirs.push(dir);
    const listPath = join(dir, 'concat.txt');
    await concatLongformSceneSegments({
      segments: [
        { path: "/segments/speaker's.mp4", frameCount: 61 },
        { path: '/segments/scene.mp4', frameCount: 121 },
      ],
      listPath,
      sourceVideoPath: '/source.mp4',
      sourceHasAudio: true,
      outputPath: '/output.mp4',
      audioStartTime: 0,
      duration: 182 / 30,
    });
    expect(readFileSync(listPath, 'utf8')).toContain("file '/segments/speaker'\\''s.mp4'");
    expect(readFileSync(listPath, 'utf8')).toContain(`duration ${121 / 30}`);
    const command = commands[0];
    expect(command.inputs).toHaveLength(2);
    expect(command.inputs[0].options).toEqual([
      '-f',
      'concat',
      '-safe',
      '0',
      '-protocol_whitelist',
      'file,pipe',
    ]);
    expect(command.inputs[1]).toMatchObject({
      path: '/source.mp4',
      seek: 0,
      options: ['-protocol_whitelist', 'file,pipe'],
    });
    expect(command.seconds).toBe(182 / 30);
    const filter = command.options[command.options.indexOf('-filter_complex') + 1];
    expect(filter).toContain('setpts=N/30/TB,trim=end_frame=182');
    expect(filter).toContain(
      `[1:a]aresample=48000,apad,atrim=duration=${182 / 30},asetpts=PTS-STARTPTS[outa]`,
    );
    expect(filter).not.toContain('concat=');
  });

  it('adds bounded silence without ever mapping missing source audio', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lf-silence-test-'));
    dirs.push(dir);
    await concatLongformSceneSegments({
      segments: [{ path: '/segments/scene.mp4', frameCount: 121 }],
      listPath: join(dir, 'concat.txt'),
      sourceVideoPath: '/silent.mp4',
      sourceHasAudio: false,
      outputPath: '/output.mp4',
      audioStartTime: 2,
      duration: 121 / 30,
    });
    const command = commands[0];
    expect(command.inputs).toHaveLength(1);
    expect(command.seconds).toBe(121 / 30);
    const filter = command.options[command.options.indexOf('-filter_complex') + 1];
    expect(filter).toContain(
      `anullsrc=r=48000:cl=stereo,atrim=duration=${121 / 30},asetpts=PTS-STARTPTS[outa]`,
    );
    expect(filter).not.toContain('[1:a]');
  });

  it.each([
    'libx264',
    'h264_nvenc',
  ])('does not disable GPU/retry %s on an input/filter failure', async (encoder) => {
    state.encoder = encoder;
    state.gpuError.mockReturnValue(true); // legacy heuristic accepts generic 'Error initializing'
    state.ffmpeg.mockImplementationOnce((path?: string) => {
      const command = new Command(path);
      command.failure =
        'Stream specifier matches no streams. Error initializing complex filters: Invalid argument';
      commands.push(command);
      return command;
    });
    await expect(encodeLongformSceneSegment(segment)).rejects.toThrow('matches no streams');
    expect(state.ffmpeg).toHaveBeenCalledTimes(1);
    expect(state.disableGpu).not.toHaveBeenCalled();
  });

  it('retries a confirmed hardware-session failure once using software', async () => {
    state.encoder = 'h264_nvenc';
    state.gpuError.mockReturnValue(true);
    state.ffmpeg.mockImplementationOnce((path?: string) => {
      const command = new Command(path);
      command.failure = '[h264_nvenc @ 0x1234] OpenEncodeSessionEx failed: out of memory';
      commands.push(command);
      return command;
    });
    await encodeLongformSceneSegment(segment);
    expect(state.disableGpu).toHaveBeenCalledTimes(1);
    expect(state.ffmpeg).toHaveBeenCalledTimes(2);
    expect(commands[1].options[commands[1].options.indexOf('-c:v') + 1]).toBe('libx264');
  });

  it('kills only its owned process, waits for exit, and never retries cancellation as GPU failure', async () => {
    const controller = new AbortController();
    state.ffmpeg.mockImplementationOnce((path?: string) => {
      const command = new Command(path);
      command.hold = true;
      commands.push(command);
      return command;
    });
    const pending = encodeLongformSceneSegment({ ...segment, signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(commands[0].kill).toHaveBeenCalledWith('SIGTERM');
    expect(state.ffmpeg).toHaveBeenCalledTimes(1);
    expect(state.gpuError).not.toHaveBeenCalled();
    expect(state.disableGpu).not.toHaveBeenCalled();
  });

  it('does no process work for an already cancelled request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      encodeLongformSceneSegment({ ...segment, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(state.ffmpeg).not.toHaveBeenCalled();
  });
});
