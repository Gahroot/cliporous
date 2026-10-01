import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { toFFmpegPath } from './helpers';
import type { SfxPlacement } from './scene-sfx';

const SAMPLE_RATE = 48_000;
export const SFX_BED_WINDOW_SECONDS = 5;
// The allowlisted, pre-mastered assets are <= 1.5 s. Include codec padding and bound decoding.
const MAX_TAIL_SAMPLES = 2 * SAMPLE_RATE;

type RunFfmpeg = (args: string[], signal?: AbortSignal) => Promise<string | null>;

/** Absolute placements are planned ONCE: rotation, spacing and levels survive window boundaries. */
export function buildSfxBedWindowArgs(
  placements: SfxPlacement[],
  startSample: number,
  sampleCount: number,
  outputPath: string,
): string[] {
  const local = placements.filter((p) => {
    const at = Math.round(p.at * SAMPLE_RATE);
    return at < startSample + sampleCount && at + MAX_TAIL_SAMPLES > startSample;
  });
  const args = ['-hide_banner', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  const chains = [`[0:a]atrim=end_sample=${sampleCount}[base]`];
  local.forEach((p, i) => {
    args.push('-protocol_whitelist', 'file,pipe', '-i', toFFmpegPath(p.file));
    const offset = Math.round(p.at * SAMPLE_RATE) - startSample;
    const trim = Math.max(0, -offset);
    const delay = Math.max(0, offset);
    // Filter before trimming so a tail retains its original filter history at the seam.
    chains.push(
      `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,lowpass=f=7000,volume=${p.gainDb}dB,atrim=start_sample=${trim}:end_sample=${MAX_TAIL_SAMPLES},asetpts=PTS-STARTPTS,adelay=${delay}S|${delay}S[s${i}]`,
    );
  });
  chains.push(
    `[base]${local.map((_, i) => `[s${i}]`).join('')}amix=inputs=${local.length + 1}:duration=first:normalize=0:dropout_transition=0[bed]`,
  );
  args.push(
    '-filter_complex',
    chains.join(';'),
    '-map',
    '[bed]',
    '-t',
    String(sampleCount / SAMPLE_RATE),
    '-c:a',
    'flac',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-y',
    toFFmpegPath(outputPath),
  );
  return args;
}

/** Sequential lossless windows bound both argv size and delay buffers; only the final mix is AAC. */
export async function mixSceneSfxBed(
  videoPath: string,
  placements: SfxPlacement[],
  opts: { clipDuration: number; outputPath: string; signal?: AbortSignal },
  run: RunFfmpeg,
): Promise<string | null> {
  const directory = mkdtempSync(join(dirname(opts.outputPath), '.scene-sfx-bed-'));
  try {
    const totalSamples = Math.round(opts.clipDuration * SAMPLE_RATE);
    const windowSamples = SFX_BED_WINDOW_SECONDS * SAMPLE_RATE;
    const files: string[] = [];
    for (let start = 0; start < totalSamples; start += windowSamples) {
      if (opts.signal?.aborted) return 'aborted';
      const count = Math.min(windowSamples, totalSamples - start);
      const args = buildSfxBedWindowArgs(placements, start, count, 'placeholder.flac');
      const silent = args.filter((arg) => arg === '-i').length === 1;
      // Reuse full-length silence windows without repeatedly spawning ffmpeg.
      const name = silent ? `silence-${count}.flac` : `window-${start}.flac`;
      const path = join(directory, name);
      args[args.length - 1] = toFFmpegPath(path);
      if (!existsSync(path)) {
        const error = await run(args, opts.signal);
        if (error) return error;
      }
      files.push(`file '${name}'`);
    }
    if (opts.signal?.aborted) return 'aborted';
    const list = join(directory, 'bed.ffconcat');
    writeFileSync(list, `${files.join('\n')}\n`);
    return await run(
      [
        '-hide_banner',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        toFFmpegPath(videoPath),
        '-f',
        'concat',
        '-safe',
        '1',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        toFFmpegPath(list),
        '-filter_complex',
        '[0:a][1:a]amix=inputs=2:duration=first:normalize=0:dropout_transition=0,alimiter=limit=0.95:level=disabled:latency=1[aout]',
        '-map',
        '0:v',
        '-map',
        '[aout]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        '-y',
        toFFmpegPath(opts.outputPath),
      ],
      opts.signal,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
