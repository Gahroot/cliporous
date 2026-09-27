import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp'), getAppPath: vi.fn(() => '/tmp') },
  BrowserWindow: class {},
}));

import type { SceneCue } from '../remotion/compositions/explainer/types';
import {
  buildSfxMixArgs,
  mixSceneSfx,
  planSceneSfx,
  SCENE_SFX_BASE_DB,
  SCENE_SFX_FILES,
  type SfxPlacement,
} from './scene-sfx';

const plan = (cues: SceneCue[], clipDuration = 30, masterDb?: number) =>
  planSceneSfx(cues, { clipDuration, masterDb });

const summary = (cues: SceneCue[], clipDuration = 30) =>
  plan(cues, clipDuration).map((p) => `${p.file.replace(/-\d+\.mp3$/, '')}@${p.at}`);

// ---------------------------------------------------------------------------
// planSceneSfx
// ---------------------------------------------------------------------------

describe('planSceneSfx guardrails', () => {
  it.each<{ name: string; cues: SceneCue[]; clip?: number; expected: string[] }>([
    {
      name: 'sorts by time',
      cues: [
        { kind: 'slide', at: 2 },
        { kind: 'tick', at: 1 },
      ],
      expected: ['tick@1', 'slide@2'],
    },
    {
      name: 'drops cues outside [0, clipDuration - 0.05]',
      cues: [
        { kind: 'tick', at: -0.1 },
        { kind: 'tick', at: 0 },
        { kind: 'tick', at: 4.95 },
        { kind: 'tick', at: 4.97 },
        { kind: 'tick', at: 6 },
        { kind: 'tick', at: Number.NaN },
      ],
      clip: 5,
      expected: ['tick@0', 'tick@4.95'],
    },
    {
      name: 'keeps 0.22 s spacing (same priority → earlier wins)',
      cues: [
        { kind: 'tick', at: 1 },
        { kind: 'tick', at: 1.1 },
        { kind: 'tick', at: 1.22 },
      ],
      expected: ['tick@1', 'tick@1.22'],
    },
    {
      name: 'priority beats time on collision (thump > tick)',
      cues: [
        { kind: 'tick', at: 1 },
        { kind: 'thump', at: 1.1 },
      ],
      expected: ['thump@1.1'],
    },
    {
      name: 'full priority order flip > pop > slide > tick > whoosh > rise',
      cues: [
        { kind: 'rise', at: 1 },
        { kind: 'whoosh', at: 1.01 },
        { kind: 'tick', at: 1.02 },
        { kind: 'slide', at: 1.03 },
        { kind: 'pop', at: 1.04 },
        { kind: 'flip', at: 1.05 },
      ],
      expected: ['flip@1.05'],
    },
    {
      name: 'max one thump per 6 s',
      cues: [
        { kind: 'thump', at: 0 },
        { kind: 'thump', at: 5 },
        { kind: 'thump', at: 6 },
        { kind: 'thump', at: 11 },
        { kind: 'thump', at: 12.5 },
      ],
      expected: ['thump@0', 'thump@6', 'thump@12.5'],
    },
    {
      name: 'max one rise per 10 s',
      cues: [
        { kind: 'rise', at: 1 },
        { kind: 'rise', at: 9 },
        { kind: 'rise', at: 11 },
      ],
      expected: ['rise@1', 'rise@11'],
    },
    {
      name: 'rate caps do not block other kinds',
      cues: [
        { kind: 'thump', at: 1 },
        { kind: 'tick', at: 2 },
        { kind: 'thump', at: 3 },
      ],
      expected: ['thump@1', 'tick@2'],
    },
    {
      name: 'zero gain cue is dropped and does not block neighbours',
      cues: [
        { kind: 'thump', at: 1, gain: 0 },
        { kind: 'tick', at: 1.1 },
      ],
      expected: ['tick@1.1'],
    },
  ])('$name', ({ cues, clip, expected }) => {
    expect(summary(cues, clip)).toEqual(expected);
  });

  it('never places two cues closer than 0.22 s', () => {
    const cues: SceneCue[] = Array.from({ length: 60 }, (_, i) => ({
      kind: (['tick', 'slide', 'pop', 'flip', 'whoosh'] as const)[i % 5],
      at: i * 0.07,
    }));
    const out = plan(cues);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].at - out[i - 1].at).toBeGreaterThanOrEqual(0.22 - 1e-9);
    }
  });

  it('rotates files per kind in time order, deterministically', () => {
    const cues: SceneCue[] = [0, 1, 2, 3, 4, 5].map((at) => ({ kind: 'tick', at }));
    const shuffled = [cues[3], cues[0], cues[5], cues[1], cues[4], cues[2]];
    const a = plan(cues).map((p) => p.file);
    const b = plan(shuffled).map((p) => p.file);
    const files = SCENE_SFX_FILES.tick;
    expect(a).toEqual([0, 1, 2, 3, 4, 5].map((i) => files[i % files.length]));
    expect(b).toEqual(a);
    expect(new Set(a.slice(0, 2)).size).toBe(Math.min(2, files.length));
  });

  it.each<{ cue: SceneCue; masterDb?: number; expected: number }>([
    { cue: { kind: 'tick', at: 1 }, expected: -26 },
    { cue: { kind: 'slide', at: 1 }, expected: -24 },
    { cue: { kind: 'pop', at: 1 }, expected: -24 },
    { cue: { kind: 'flip', at: 1 }, expected: -23 },
    { cue: { kind: 'whoosh', at: 1 }, expected: -27 },
    { cue: { kind: 'thump', at: 1 }, expected: -20 },
    { cue: { kind: 'rise', at: 1 }, expected: -28 },
    { cue: { kind: 'tick', at: 1, gain: 0.5 }, expected: -32.02 },
    { cue: { kind: 'thump', at: 1, gain: 0.1 }, expected: -40 },
    { cue: { kind: 'tick', at: 1, gain: 2 }, expected: -26 },
    { cue: { kind: 'tick', at: 1 }, masterDb: 3, expected: -23 },
    { cue: { kind: 'slide', at: 1, gain: 0.5 }, masterDb: -6, expected: -36.02 },
  ])('gain → dB: $cue.kind gain=$cue.gain master=$masterDb → $expected', ({
    cue,
    masterDb,
    expected,
  }) => {
    const [p] = plan([cue], 30, masterDb);
    expect(p.gainDb).toBeCloseTo(expected, 2);
  });

  it('exposes the default base levels', () => {
    expect(SCENE_SFX_BASE_DB).toMatchObject({ tick: -26, thump: -20, rise: -28 });
  });
});

// ---------------------------------------------------------------------------
// buildSfxMixArgs
// ---------------------------------------------------------------------------

describe('buildSfxMixArgs', () => {
  const placements: SfxPlacement[] = [
    { file: '/sfx/tick-1.mp3', at: 0.5, gainDb: -26 },
    { file: '/sfx/thump-1.mp3', at: 1.2345, gainDb: -20 },
    { file: '/sfx/pop-1.mp3', at: 0, gainDb: -32.02 },
  ];
  const args = buildSfxMixArgs('/in/video.mp4', placements, '/out/video.mp4');
  const graph = args[args.indexOf('-filter_complex') + 1];

  it('adds the video then every sfx as inputs', () => {
    const inputs = args.flatMap((a, i) => (a === '-i' ? [args[i + 1]] : []));
    expect(inputs).toEqual([
      '/in/video.mp4',
      '/sfx/tick-1.mp3',
      '/sfx/thump-1.mp3',
      '/sfx/pop-1.mp3',
    ]);
  });

  it.each([
    [0, '[1:a]', 'volume=-26dB', 'adelay=500|500[s0]'],
    [1, '[2:a]', 'volume=-20dB', 'adelay=1235|1235[s1]'],
    [2, '[3:a]', 'volume=-32.02dB', 'adelay=0|0[s2]'],
  ])('sfx chain %i has input, volume and adelay ms', (i, input, volume, delay) => {
    const chain = graph.split(';')[i];
    expect(chain.startsWith(input)).toBe(true);
    expect(chain).toContain('aformat=sample_rates=48000:channel_layouts=stereo');
    expect(chain).toContain('lowpass=f=7000');
    expect(chain).toContain(volume);
    expect(chain.endsWith(delay)).toBe(true);
  });

  it('mixes voice + all sfx without normalisation and limits', () => {
    const mix = graph.split(';').at(-1) ?? '';
    expect(mix.startsWith('[0:a][s0][s1][s2]amix=')).toBe(true);
    expect(mix).toContain('inputs=4');
    expect(mix).toContain('normalize=0');
    expect(mix).toContain('dropout_transition=0');
    expect(mix).toContain('duration=first');
    expect(mix).toContain('alimiter=limit=0.95');
    expect(mix.endsWith('[aout]')).toBe(true);
  });

  it('copies video, encodes aac 192k, faststart, overwrites output last', () => {
    const joined = args.join(' ');
    expect(joined).toContain('-map 0:v -map [aout] -c:v copy -c:a aac -b:a 192k');
    expect(joined).toContain('-movflags +faststart');
    expect(args.slice(-2)).toEqual(['-y', '/out/video.mp4']);
  });

  it('keeps the graph free of shell-sensitive characters', () => {
    expect(graph).not.toMatch(/["'`\s\\]/);
  });
});

// ---------------------------------------------------------------------------
// mixSceneSfx
// ---------------------------------------------------------------------------

describe('mixSceneSfx', () => {
  it('returns the original file without running ffmpeg when nothing is placed', async () => {
    const res = await mixSceneSfx('/nope/in.mp4', [{ kind: 'tick', at: 99 }], {
      clipDuration: 2,
      outputPath: '/nope/out.mp4',
    });
    expect(res).toEqual({ ok: true, outputPath: '/nope/in.mp4', placed: 0 });
  });

  it('returns ok:false without running ffmpeg when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const res = await mixSceneSfx('/nope/in.mp4', [{ kind: 'tick', at: 0.5 }], {
      clipDuration: 2,
      outputPath: '/nope/out.mp4',
      signal: controller.signal,
    });
    expect(res).toEqual({ ok: false, error: 'aborted' });
  });

  it('returns ok:false (does not throw) when ffmpeg fails', async () => {
    const res = await mixSceneSfx('/definitely/missing/in.mp4', [{ kind: 'tick', at: 0.5 }], {
      clipDuration: 2,
      outputPath: join(tmpdir(), 'scene-sfx-never.mp4'),
    });
    expect(res.ok).toBe(false);
  });

  const hasFfmpeg = typeof ffmpegPath === 'string' && existsSync(ffmpegPath);
  const workDir = mkdtempSync(join(tmpdir(), 'scene-sfx-test-'));
  afterAll(() => rmSync(workDir, { recursive: true, force: true }));

  it.skipIf(!hasFfmpeg)(
    'mixes real cues into a 2 s clip with bundled ffmpeg',
    async () => {
      const bin = ffmpegPath as string;
      // FfmpegCommand spawns `ffmpeg` from PATH when setupFFmpeg() has not run.
      vi.stubEnv('PATH', `${dirname(bin)}${delimiter}${process.env.PATH ?? ''}`);
      const input = join(workDir, 'in.mp4');
      const output = join(workDir, 'out.mp4');
      const gen = spawnSync(bin, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x240:r=30:d=2',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=180:sample_rate=48000:duration=2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        '-y',
        input,
      ]);
      expect(gen.status).toBe(0);

      const res = await mixSceneSfx(
        input,
        [
          { kind: 'tick', at: 0.2 },
          { kind: 'thump', at: 0.9 },
          { kind: 'flip', at: 1.8 },
        ],
        { clipDuration: 2, outputPath: output },
      );
      vi.unstubAllEnvs();

      expect(res).toEqual({ ok: true, outputPath: output, placed: 3 });
      expect(existsSync(output)).toBe(true);
      // Container duration as ffprobe reports it (`ffmpeg -i` prints the same field;
      // @ffprobe-installer ships no types, so probe with the bundled ffmpeg).
      const probe = spawnSync(bin, ['-hide_banner', '-i', output]);
      const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe.stderr.toString());
      expect(m).not.toBeNull();
      const [, h, min, sec] = m as RegExpExecArray;
      const duration = Number(h) * 3600 + Number(min) * 60 + Number.parseFloat(sec);
      expect(duration).toBeGreaterThan(1.9);
      expect(duration).toBeLessThan(2.15);
    },
    30_000,
  );
});
