import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planSceneSfx } from './scene-sfx';
import { buildSfxBedWindowArgs, mixSceneSfxBed, SFX_BED_WINDOW_SECONDS } from './scene-sfx-bed';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }));
vi.mock('../logger', () => ({ log: vi.fn() }));
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'sfx-bed-unit-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
const graph = (args: string[]) => args[args.indexOf('-filter_complex') + 1];
const inputs = (args: string[]) => args.flatMap((arg, i) => (arg === '-i' ? [args[i + 1]] : []));

describe('bounded longform SFX bed (no media processes)', () => {
  it('bounds argv and delay memory independently of 924s total duration at maximum cue density', () => {
    const placements = planSceneSfx(
      Array.from({ length: 4_000 }, (_, i) => ({
        kind: 'tick',
        at: i * 0.23,
      })),
      { clipDuration: 924 },
    ).map((p) => ({ ...p, file: `C:/${'x'.repeat(230)}/${p.file}` }));
    expect(placements.length).toBeGreaterThan(150);
    for (let start = 0; start < 924; start += SFX_BED_WINDOW_SECONDS) {
      const args = buildSfxBedWindowArgs(
        placements,
        start * 48_000,
        Math.min(SFX_BED_WINDOW_SECONDS, 924 - start) * 48_000,
        join(directory, 'window.flac'),
      );
      expect(inputs(args).length).toBeLessThanOrEqual(33);
      expect(args.map((arg) => JSON.stringify(arg)).join(' ').length).toBeLessThan(32_000);
      for (const match of graph(args).matchAll(/adelay=(\d+)S\|(\d+)S/g)) {
        expect(Number(match[1])).toBeLessThan(5 * 48_000);
        expect(match[1]).toBe(match[2]);
      }
      expect(args).toContain('flac');
      expect(args).not.toContain('aac');
    }
  });

  it('carries cross-window tails with sample-accurate trim and unchanged global rotation/levels', () => {
    const placements = planSceneSfx(
      [
        { kind: 'tick', at: 4.9 },
        { kind: 'tick', at: 5.2 },
      ],
      { clipDuration: 10, masterDb: 7 },
    );
    const before = structuredClone(placements);
    const first = buildSfxBedWindowArgs(placements, 0, 240_000, '/first.flac');
    const second = buildSfxBedWindowArgs(placements, 240_000, 240_000, '/second.flac');
    expect(inputs(first)).toEqual(['anullsrc=r=48000:cl=stereo', 'tick-1.mp3']);
    expect(inputs(second)).toEqual(['anullsrc=r=48000:cl=stereo', 'tick-1.mp3', 'tick-2.mp3']);
    expect(graph(first)).toContain('adelay=235200S|235200S[s0]');
    expect(graph(second)).toContain(
      'volume=-19dB,atrim=start_sample=4800:end_sample=96000,asetpts=PTS-STARTPTS,adelay=0S|0S[s0]',
    );
    expect(graph(second)).toContain('adelay=9600S|9600S[s1]');
    expect(graph(second)).toContain('atrim=end_sample=240000[base]');
    expect(placements).toEqual(before);
    const next = buildSfxBedWindowArgs(placements, 480_000, 48_000, '/next.flac');
    expect(inputs(next)).toEqual(['anullsrc=r=48000:cl=stereo']);
  });

  it('assigns a cue exactly on a seam only to the following window', () => {
    const placements = [{ file: 'tick-1.mp3', at: 5, gainDb: -26 }];
    expect(inputs(buildSfxBedWindowArgs(placements, 0, 240_000, '/a.flac'))).toHaveLength(1);
    const next = buildSfxBedWindowArgs(placements, 240_000, 240_000, '/b.flac');
    expect(inputs(next)).toHaveLength(2);
    expect(graph(next)).toContain('atrim=start_sample=0:end_sample=96000');
    expect(graph(next)).toContain('adelay=0S|0S');
  });

  it('runs sequential lossless beds then exactly one continuous 48k AAC mix; cleans owned beds', async () => {
    let active = 0;
    let peak = 0;
    let manifest = '';
    const calls: string[][] = [];
    const run = vi.fn(async (args: string[]) => {
      peak = Math.max(peak, ++active);
      calls.push(args);
      if (args.includes('aac')) manifest = readFileSync(inputs(args)[1], 'utf8');
      writeFileSync(args[args.length - 1], 'owned audio');
      await Promise.resolve();
      active--;
      return null;
    });
    const outputPath = join(directory, 'mixed.mp4');
    expect(
      await mixSceneSfxBed(
        '/source.mp4',
        [{ file: 'tick-1.mp3', at: 4.9, gainDb: -26 }],
        { clipDuration: 10.25, outputPath },
        run,
      ),
    ).toBeNull();
    expect(peak).toBe(1);
    expect(calls).toHaveLength(4);
    expect(calls.slice(0, -1).every((args) => args.includes('flac') && !args.includes('aac'))).toBe(
      true,
    );
    expect(graph(calls[2])).toContain('atrim=end_sample=12000[base]');
    expect(manifest.trim().split('\n')).toHaveLength(3);
    expect(manifest).toContain("file 'silence-12000.flac'");
    const final = calls[3];
    expect(inputs(final)[0]).toBe('/source.mp4');
    expect(inputs(final)).toHaveLength(2);
    expect(final.join(' ')).toContain('-c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2');
    expect(graph(final)).toContain('duration=first:normalize=0:dropout_transition=0');
    expect(graph(final)).toContain('alimiter=limit=0.95:level=disabled:latency=1[aout]');
    expect(readdirSync(directory)).toEqual(['mixed.mp4']);
  });

  it('reuses silence beds without losing windows in the concat timeline', async () => {
    let manifest = '';
    const run = vi.fn(async (args: string[]) => {
      if (args.includes('aac')) manifest = readFileSync(inputs(args)[1], 'utf8');
      writeFileSync(args[args.length - 1], 'bed');
      return null;
    });
    await mixSceneSfxBed(
      '/source.mp4',
      [],
      { clipDuration: 15, outputPath: join(directory, 'out.mp4') },
      run,
    );
    expect(run).toHaveBeenCalledTimes(2); // One shared silent FLAC, then one final mix.
    expect(manifest.trim().split('\n')).toEqual(Array(3).fill("file 'silence-240000.flac'"));
  });

  it.each([
    'pre-abort',
    'during-window',
    'window-failure',
    'final-failure',
  ] as const)('stops and cleans owned bed work on %s', async (mode) => {
    const controller = new AbortController();
    const userFile = join(directory, 'user.mp4');
    writeFileSync(userFile, 'keep');
    if (mode === 'pre-abort') controller.abort();
    const run = vi.fn(async (args: string[]) => {
      if (mode === 'during-window') controller.abort();
      if (mode === 'window-failure' || args.includes('aac')) return 'process failed';
      writeFileSync(args[args.length - 1], 'partial bed');
      return null;
    });
    const result = await mixSceneSfxBed(
      '/source.mp4',
      [],
      {
        clipDuration: 10,
        outputPath: join(directory, 'mixed.mp4'),
        signal: controller.signal,
      },
      run,
    );
    expect(result).toBe(
      mode.includes('abort') || mode === 'during-window' ? 'aborted' : 'process failed',
    );
    expect(run).toHaveBeenCalledTimes(mode === 'pre-abort' ? 0 : mode === 'final-failure' ? 2 : 1);
    expect(readdirSync(directory)).toEqual(['user.mp4']);
    expect(readFileSync(userFile, 'utf8')).toBe('keep');
    if (run.mock.calls.length > 0)
      expect(existsSync(dirname(run.mock.calls[0][0].at(-1) ?? ''))).toBe(false);
  });
});
