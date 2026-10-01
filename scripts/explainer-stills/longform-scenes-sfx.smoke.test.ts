import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { it, vi } from 'vitest';
import { validateSceneFirstLongformPlan } from '../../src/main/ai/longform-scene-contract';
import { setupFFmpeg } from '../../src/main/ffmpeg';
import type { SceneCue } from '../../src/main/remotion/compositions/explainer/types';
import { activeCommands } from '../../src/main/render/overlay-runner';
import { mixSceneSfx, planSceneSfx } from '../../src/main/render/scene-sfx';
import { isSceneFirstPlanEnvelope, validLongformWords } from '../../src/shared/longform-scenes';
import { assertAudioSample, sourceFileDigest } from './longform-scenes-media.mjs';
import { runBounded } from './verify-systems-e2e.mjs';

const boundary = vi.hoisted((): { cancel: AbortController | null; starts: number } => ({
  cancel: null,
  starts: 0,
}));
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.env.LONGFORM_SFX_OUT,
  },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      throw new Error('No live AI in audio proof');
    }
  },
  ThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));
vi.mock('../../src/main/ffmpeg', async (original) => {
  const actual = await original<typeof import('../../src/main/ffmpeg')>();
  return {
    ...actual,
    ffmpeg: (...args: Parameters<typeof actual.ffmpeg>): ReturnType<typeof actual.ffmpeg> => {
      const command = actual.ffmpeg(...args);
      command.on('start', () => {
        boundary.starts++;
        boundary.cancel?.abort();
      });
      return command;
    },
  };
});

const output = process.env.LONGFORM_SFX_OUT ?? '';
assert.ok(output, 'Launch through verify-longform-sfx.mjs');
const require = createRequire(import.meta.url);
const ffmpeg: string = require('ffmpeg-static');
const ffprobe: string = require('@ffprobe-installer/ffprobe').path;
const report: Record<string, unknown> = { status: 'running', output };
function save(): void {
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
async function run(args: string[]): Promise<Buffer> {
  const result = await runBounded(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], {
    timeoutMs: 180_000,
    maxBytes: 1024 * 1024,
  });
  return result.stdout;
}
async function pcm(video: string, name: string, at?: number): Promise<Buffer> {
  const path = join(output, `${name}.f32`);
  await run([
    ...(at === undefined ? [] : ['-ss', String(at)]),
    '-i',
    video,
    ...(at === undefined ? [] : ['-t', '0.125']),
    '-vn',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-f',
    'f32le',
    '-n',
    path,
  ]);
  const data = readFileSync(path);
  rmSync(path);
  return data;
}
async function packetHash(video: string): Promise<string> {
  return (await run(['-i', video, '-map', '0:v', '-c:v', 'copy', '-f', 'md5', '-']))
    .toString()
    .trim();
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

it('mixes bounded real scene sound, preserves the complete video/voice, and cancels owned work', async () => {
  console.log(`SFX_PROOF_OUT ${output}`);
  save();
  try {
    assert.ok(process.env.LONGFORM_SFX_SOURCE, 'Supply the completed long-form proof directory');
    const source = resolve(process.env.LONGFORM_SFX_SOURCE);
    const original = join(source, 'export', 'source_longform.mp4');
    const plan = readJson(join(source, 'plan.json'));
    const words = readJson(join(source, 'transcript.json'));
    assert.ok(isSceneFirstPlanEnvelope(plan));
    assert.ok(validLongformWords(words, plan.sourceDuration));
    const compiled = validateSceneFirstLongformPlan(plan, words, plan.sourceDuration);
    assert.ok(compiled.ok, compiled.ok ? undefined : compiled.error);
    const cues = compiled.value.scenes.flatMap((scene) => scene.planned.cues);
    assert.ok(cues.length > 0);
    setupFFmpeg();
    const originalDigest = await sourceFileDigest(original);

    const silent = join(output, 'silent.mp4');
    await run([
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=16x16:r=30:d=12',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=48000:cl=stereo',
      '-t',
      '12',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-n',
      silent,
    ]);
    const seamCues: SceneCue[] = [
      { kind: 'tick', at: 4.9 },
      { kind: 'pop', at: 5.1 },
      { kind: 'whoosh', at: 9.95 },
    ];
    const reference = await mixSceneSfx(silent, seamCues, {
      clipDuration: 12,
      outputPath: join(output, 'legacy-reference.mp4'),
      masterDb: 7,
    });
    const bounded = await mixSceneSfx(silent, seamCues, {
      clipDuration: 12,
      outputPath: join(output, 'bounded-seams.mp4'),
      masterDb: 7,
      bounded: true,
    });
    assert.ok(reference.ok && bounded.ok);
    const expected = await pcm(reference.outputPath, 'legacy');
    const actual = await pcm(bounded.outputPath, 'bounded');
    // Legacy alimiter delays by 5ms; the new path explicitly compensates it.
    let best = { error: Infinity, lag: 0 };
    for (let lag = 0; lag <= 300; lag++) {
      let error = 0,
        energy = 0;
      for (let frame = 4 * 48_000; frame < 11.8 * 48_000; frame += 3) {
        const a = actual.readFloatLE(frame * 8);
        const b = expected.readFloatLE((frame + lag) * 8);
        error += (a - b) ** 2;
        energy += b ** 2;
      }
      const normalized = Math.sqrt(error / energy);
      if (normalized < best.error) best = { error: normalized, lag };
    }
    assert.ok(best.error < 0.025, `Cross-window SFX changed: ${JSON.stringify(best)}`);
    assert.ok(best.lag >= 230 && best.lag <= 250, 'Expected only the known legacy limiter delay');
    report.seams = { ...best, windowSeconds: 5, cueTimes: seamCues.map((cue) => cue.at) };
    save();

    const cancelledPath = join(output, 'cancelled.mp4');
    const starts = boundary.starts;
    boundary.cancel = new AbortController();
    const cancelled = await mixSceneSfx(silent, seamCues, {
      clipDuration: 12,
      outputPath: cancelledPath,
      bounded: true,
      signal: boundary.cancel.signal,
    });
    boundary.cancel = null;
    assert.ok(!cancelled.ok && /abort/i.test(cancelled.error));
    assert.ok(boundary.starts > starts, 'Cancellation must follow an actual FFmpeg start');
    assert.equal(activeCommands.size, 0);
    assert.equal(existsSync(cancelledPath), false);
    assert.ok(!readdirSync(output).some((name) => name.startsWith('.scene-sfx-bed-')));
    report.cancellation = { nativeStarts: boundary.starts - starts, remainingCommands: 0 };
    save();

    console.log(`SFX_LONG_START seconds=${plan.sourceDuration} cues=${cues.length}`);
    const started = performance.now();
    const mixed = await mixSceneSfx(original, cues, {
      clipDuration: plan.sourceDuration,
      outputPath: join(output, 'longform-with-sound.mp4'),
      bounded: true,
      masterDb: 7,
    });
    assert.ok(mixed.ok, mixed.ok ? undefined : mixed.error);
    assert.ok(mixed.placed > 0);
    assert.equal(
      mixed.placed,
      planSceneSfx(cues, { clipDuration: plan.sourceDuration, masterDb: 7 }).length,
    );
    const videoPacketHash = await packetHash(original);
    assert.equal(
      await packetHash(mixed.outputPath),
      videoPacketHash,
      'Video packets changed during sound mixing',
    );
    const probe = await runBounded(
      ffprobe,
      [
        '-v',
        'error',
        '-count_packets',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        mixed.outputPath,
      ],
      { timeoutMs: 180_000, maxBytes: 1024 * 1024 },
    );
    const metadata: unknown = JSON.parse(probe.stdout.toString());
    assert.ok(isRecord(metadata) && Array.isArray(metadata.streams) && isRecord(metadata.format));
    const streams: unknown[] = metadata.streams;
    const video = streams.find((stream) => isRecord(stream) && stream.codec_type === 'video');
    const audio = streams.find((stream) => isRecord(stream) && stream.codec_type === 'audio');
    assert.ok(isRecord(video) && isRecord(audio));
    assert.equal(video.width, 1920);
    assert.equal(video.height, 1080);
    assert.equal(video.avg_frame_rate, '30/1');
    assert.equal(Number(video.nb_read_packets), Math.round(plan.sourceDuration * 30));
    assert.ok(Math.abs(Number(metadata.format.duration) - plan.sourceDuration) <= 1 / 30);
    assert.equal(Number(audio.sample_rate), 48_000);
    assert.equal(audio.channels, 2);
    assert.equal(audio.codec_name, 'aac');
    assert.ok(Math.abs(Number(audio.duration) - plan.sourceDuration) <= 1 / 30);
    await run(['-xerror', '-i', mixed.outputPath, '-map', '0:a:0', '-vn', '-f', 'null', '-']);
    const samples = [];
    for (let base = 0; base + 42 <= plan.sourceDuration; base += 42) {
      for (const offset of [0.5, 12.5, 30.5]) {
        const at = base + offset;
        samples.push(
          assertAudioSample(
            await pcm(original, `source-${at}`, at),
            await pcm(mixed.outputPath, `mixed-${at}`, at),
            at,
          ),
        );
      }
    }
    const tail = plan.sourceDuration - 0.5;
    samples.push(
      assertAudioSample(
        await pcm(original, 'source-tail', tail),
        await pcm(mixed.outputPath, 'mixed-tail', tail),
        tail,
      ),
    );
    assert.equal(await sourceFileDigest(original), originalDigest);
    assert.equal(activeCommands.size, 0);
    assert.ok(!readdirSync(output).some((name) => name.startsWith('.scene-sfx-bed-')));
    report.longform = {
      duration: plan.sourceDuration,
      eligibleScenes: compiled.value.scenes.length,
      plannedCues: cues.length,
      placed: mixed.placed,
      outputPath: mixed.outputPath,
      elapsedMs: performance.now() - started,
      unchangedVideoPackets: true,
      videoPacketHash,
      audioDuration: Number(audio.duration),
      audioCodec: audio.codec_name,
      audioSampleRate: Number(audio.sample_rate),
      audioChannels: audio.channels,
      completeAudioDecoded: true,
      audioSamples: samples,
    };
    report.status = 'passed';
    save();
    console.log(`SFX_PROOF_PASS ${join(output, 'report.json')}`);
  } catch (error) {
    report.status = 'failed';
    report.error = error instanceof Error ? error.message : String(error);
    save();
    throw error;
  } finally {
    boundary.cancel = null;
  }
});
