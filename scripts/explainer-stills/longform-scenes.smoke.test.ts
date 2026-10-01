import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { it, vi } from 'vitest';
import * as explainerPlanner from '../../src/main/ai/explainer-scenes';
import * as legacyPlanner from '../../src/main/ai/longform-edit-plan';
import { validateSceneFirstLongformPlan } from '../../src/main/ai/longform-scene-contract';
import * as longformPlanner from '../../src/main/ai/longform-scenes';
import { disableGpuEncoderForSession, setupFFmpeg } from '../../src/main/ffmpeg';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import { collectSceneTimes } from '../../src/main/remotion/compositions/explainer/types';
import { renderLongformVideo } from '../../src/main/render/longform-pipeline';
import {
  buildLongformSceneProps,
  renderLongformScenePreview,
} from '../../src/main/render/longform-scene-render';
import { buildLongformSceneTimeline } from '../../src/main/render/longform-scene-timeline';
import * as sceneSfx from '../../src/main/render/scene-sfx';
import { Ch } from '../../src/shared/ipc-channels';
import type { LongformRenderReconciliation } from '../../src/shared/types';
import { digest, startReport } from './harness-runtime.mjs';
import { longformScenesFixture } from './longform-scenes.fixture';
import {
  assertAudioSample,
  assertVideoProbe,
  meanPixelDifference,
  sourceAudioFilter,
  sourceFileDigest,
} from './longform-scenes-media.mjs';
import { ROOT, runBounded } from './verify-systems-e2e.mjs';

const boundary = vi.hoisted(() => {
  if (process.env.LONGFORM_PROOF_RESOURCES)
    Object.defineProperty(process, 'resourcesPath', {
      value: process.env.LONGFORM_PROOF_RESOURCES,
      configurable: true,
    });
  return { ai: 0, builds: 0, renders: 0 };
});
// Runtime boundaries only. The production parser, timeline, render wrapper,
// FFmpeg encoder and Remotion composition/renderMedia all execute unchanged.
vi.mock('electron', () => ({
  app: {
    isPackaged: process.env.LONGFORM_PROOF_MODE === 'media',
    getAppPath: () => process.cwd(),
    getPath: () => process.env.LONGFORM_PROOF_OUT,
  },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      boundary.ai++;
      throw new Error('AI forbidden in saved-plan export proof');
    }
  },
  ThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));
vi.mock('@remotion/bundler', () => ({
  bundle: () => {
    boundary.builds++;
    throw new Error('Proof must use the approved bundle, never build');
  },
}));
vi.mock('@remotion/renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@remotion/renderer')>();
  const local = () => {
    assert.ok(process.env.LONGFORM_PROOF_BROWSER, 'Explicit installed local browser required');
    return {
      browserExecutable: process.env.LONGFORM_PROOF_BROWSER,
      onBrowserDownload: () => {
        throw new Error('Browser downloads forbidden');
      },
    };
  };
  return {
    ...actual,
    selectComposition: (options: Parameters<typeof actual.selectComposition>[0]) =>
      actual.selectComposition({ ...options, ...local() }),
    renderMedia: (options: Parameters<typeof actual.renderMedia>[0]) => {
      boundary.renders++;
      return actual.renderMedia({ ...options, ...local() });
    },
  };
});

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static') as string;
const ffprobe = (require('@ffprobe-installer/ffprobe') as { path: string }).path;
const out = process.env.LONGFORM_PROOF_OUT;
assert.ok(
  out && readFileSync(join(out, '.owner'), 'utf8') === process.env.LONGFORM_PROOF_OWNER,
  'Launch using verify-longform-scenes.mjs',
);
const output = out;
const json = (name: string, value: unknown) =>
  writeFileSync(join(output, name), `${JSON.stringify(value, null, 2)}\n`);
const ff = (args: string[], timeoutMs = 180_000) =>
  runBounded(ffmpeg, ['-hide_banner', '-y', ...args], { timeoutMs });
async function probe(path: string, name: string, seconds: number) {
  const result = await runBounded(ffprobe, [
    '-v',
    'error',
    '-count_frames',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    path,
  ]);
  writeFileSync(join(output, `${name}-ffprobe.json`), result.stdout);
  return assertVideoProbe(JSON.parse(result.stdout.toString()), seconds);
}
async function audio(path: string, start: number) {
  return (
    await ff([
      '-ss',
      String(start),
      '-i',
      path,
      '-t',
      '0.35',
      '-vn',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-c:a',
      'pcm_f32le',
      '-f',
      'f32le',
      'pipe:1',
    ])
  ).stdout;
}
async function pixels(path: string, time: number) {
  return (
    await ff([
      '-ss',
      String(time),
      '-i',
      path,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:180',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      'pipe:1',
    ])
  ).stdout;
}

it('reconstructs saved source decisions and optionally exports/ previews the real scene-first pipeline', async () => {
  const mode = process.env.LONGFORM_PROOF_MODE;
  const report = startReport(output, `longform-scenes-${mode}`, {
    mediaExecuted: mode === 'media',
    audioScope:
      'Synthetic stereo tone identity/timing at every four-second interval; not speech intelligibility',
    visualApproval: 'Parent must inspect contact-sheet.png and stills',
  });
  const soundMixer = vi.spyOn(sceneSfx, 'mixSceneSfx');
  const spies = [
    vi.spyOn(explainerPlanner, 'planExplainerScenes'),
    vi.spyOn(explainerPlanner, 'planExplainerEditPlan'),
    vi.spyOn(longformPlanner, 'generateSceneFirstLongformPlan'),
    vi.spyOn(legacyPlanner, 'generateLongformEditPlan'),
  ];
  try {
    const fixture: ReturnType<typeof longformScenesFixture> & {
      timeline: ReturnType<typeof buildLongformSceneTimeline>;
    } = await report.measure({ label: 'real-source-contract' }, async () => {
      const value = longformScenesFixture(Number(process.env.LONGFORM_PROOF_REPETITIONS));
      const roundtrip = JSON.parse(JSON.stringify(value.plan));
      const validation = validateSceneFirstLongformPlan(
        roundtrip,
        value.words,
        value.plan.sourceDuration,
      );
      assert.ok(validation.ok, validation.ok ? '' : validation.error);
      assert.deepEqual(validation.value.plan, value.plan);
      assert.equal(value.plan.scenes.length, 4 * value.repetitions);
      assert.equal(value.compiled.length, 3 * value.repetitions);
      assert.deepEqual(
        [...new Set(value.compiled.map((item) => item.placement.presentation))].sort(),
        ['full-frame', 'speaker-pip', 'speaker-side'],
      );
      const timeline = buildLongformSceneTimeline(value.plan, value.compiled);
      assert.equal(timeline.totalFrames, value.plan.sourceDuration * 30);
      assert.equal(timeline.omitted.length, value.repetitions);
      assert.ok(timeline.segments.some((segment) => segment.kind === 'speaker'));
      let cursor = 0;
      for (const segment of timeline.segments) {
        assert.equal(segment.startFrame, cursor);
        cursor = segment.endFrame;
        if (segment.kind !== 'scene') continue;
        const props = buildLongformSceneProps(segment, deriveExplainerPalette());
        const original = collectSceneTimes(segment.compiled.planned.scene);
        collectSceneTimes(props.scenes[0].scene).forEach((time, index) => {
          assert.ok(Math.abs(time + segment.startTime - original[index]) < 1e-8);
        });
        assert.equal(props.presentation, segment.compiled.placement.presentation);
        const parsed = explainerPlanner.parseLongformSceneSpec(
          segment.compiled.placement.sourceSpec,
          value.words,
          { clipStart: 0, clipEnd: value.plan.sourceDuration },
        );
        assert.equal(parsed?.startTime, segment.compiled.placement.startTime);
        assert.equal(parsed?.endTime, segment.compiled.placement.endTime);
      }
      assert.equal(cursor, timeline.totalFrames);
      json('plan.json', roundtrip);
      json('transcript.json', value.words);
      json('timeline.json', timeline);
      json('contract.json', {
        fixtureNames: value.fixtureNames,
        repetitions: value.repetitions,
        planned: value.plan.scenes.length,
        active: value.compiled.length,
        omitted: timeline.omitted.length,
      });
      // Longer source-global fixture reconstruction also runs in --unit; no media.
      assert.equal(longformScenesFixture(4).compiled.length, 12);
      assert.equal(longformScenesFixture(24).plan.sourceDuration, 1008);
      for (const invalid of [0, 25, 1.5, NaN]) assert.throws(() => longformScenesFixture(invalid));
      return { ...value, timeline };
    });
    if (mode === 'media') {
      setupFFmpeg();
      disableGpuEncoderForSession();
      const source = join(output, 'source.mp4');
      await report.measure(
        { label: 'synthetic-source' },
        async (entry: { renderedFrames: number }) => {
          await ff(
            [
              '-f',
              'lavfi',
              '-i',
              `testsrc2=size=1920x1080:rate=30:duration=${fixture.plan.sourceDuration}`,
              '-f',
              'lavfi',
              '-i',
              sourceAudioFilter(fixture.plan.sourceDuration),
              '-map',
              '0:v',
              '-map',
              '1:a',
              '-c:v',
              'libx264',
              '-preset',
              'ultrafast',
              '-crf',
              '18',
              '-threads',
              '2',
              '-pix_fmt',
              'yuv420p',
              '-c:a',
              'aac',
              '-b:a',
              '192k',
              '-t',
              String(fixture.plan.sourceDuration),
              source,
            ],
            Math.max(180_000, fixture.plan.sourceDuration * 1000),
          );
          entry.renderedFrames = fixture.timeline.totalFrames;
          return probe(source, 'source', fixture.plan.sourceDuration);
        },
      );
      const sourceHash = await sourceFileDigest(source);
      const planBefore = JSON.stringify(fixture.plan);
      const events: { channel: string; payload: unknown }[] = [];
      const window = {
        webContents: {
          send: (channel: string, payload: unknown) => {
            events.push({ channel, payload });
            if (channel === Ch.Send.RENDER_CLIP_ERROR)
              console.error('PRODUCTION RENDER ERROR', payload);
            if (channel === Ch.Send.RENDER_CLIP_PREPARE) {
              const update = payload as { percent: number; message: string };
              if (update.percent % 10 === 0)
                console.log(`Longform ${update.percent}% ${update.message}`);
            }
          },
        },
      } as unknown as BrowserWindow;
      const video = join(output, 'export', 'source_longform.mp4');
      await report.measure(
        { label: 'real-renderLongformVideo' },
        async (entry: { renderedFrames: number }) => {
          await renderLongformVideo(
            {
              jobs: [
                {
                  clipId: 'proof',
                  sourceVideoPath: source,
                  startTime: 0,
                  endTime: fixture.plan.sourceDuration,
                  wordTimestamps: fixture.words,
                },
              ],
              outputDirectory: join(output, 'export'),
              outputProfile: 'longform',
              longformEditPlan: fixture.plan,
            },
            window,
            new AbortController().signal,
          );
          json('render-events.json', events);
          assert.equal(
            events.filter((event) => event.channel === Ch.Send.RENDER_CLIP_ERROR).length,
            0,
            'Production export reported an error; no fallback is a pass',
          );
          const done = events.find((event) => event.channel === Ch.Send.RENDER_CLIP_DONE)
            ?.payload as
            | { outputPath: string; reconciliation: LongformRenderReconciliation }
            | undefined;
          assert.ok(done, 'Export did not publish a completed video');
          assert.equal(done.outputPath, video);
          assert.deepEqual(done.reconciliation.scenes, {
            planned: 4 * fixture.repetitions,
            eligible: 3 * fixture.repetitions,
            rendered: 3 * fixture.repetitions,
            dropped: fixture.repetitions,
          });
          assert.equal(
            done.reconciliation.fallbacks.length,
            0,
            'Speaker recovery is a failure for this proof',
          );
          assert.equal(
            done.reconciliation.sceneResults?.filter((scene) => scene.status === 'omitted').length,
            fixture.repetitions,
          );
          json('reconciliation.json', done.reconciliation);
          entry.renderedFrames = fixture.timeline.totalFrames;
          json('export-contract.json', await probe(video, 'export', fixture.plan.sourceDuration));
        },
      );
      const audioProof = [];
      for (let time = 0.75; time + 0.35 < fixture.plan.sourceDuration; time += 4)
        audioProof.push(
          assertAudioSample(await audio(source, time), await audio(video, time), time),
        );
      json('audio-proof.json', audioProof);
      const previewSegment = fixture.timeline.segments.find(
        (segment) =>
          segment.kind === 'scene' && segment.compiled.placement.presentation === 'speaker-pip',
      );
      assert.ok(previewSegment?.kind === 'scene');
      const preview = join(output, 'preview.mp4');
      await report.measure(
        { label: 'real-renderLongformScenePreview' },
        async (entry: { renderedFrames: number }) => {
          const path = await renderLongformScenePreview(
            {
              requestId: 'local-proof',
              sourceVideoPath: source,
              wordTimestamps: fixture.words,
              plan: fixture.plan,
              sceneId: previewSegment.compiled.placement.id,
            },
            new AbortController().signal,
          );
          copyFileSync(path, preview);
          const duration = previewSegment.endTime - previewSegment.startTime;
          json('preview-contract.json', {
            originalPreviewPath: path,
            ...(await probe(preview, 'preview', duration)),
          });
          entry.renderedFrames = previewSegment.endFrame - previewSegment.startFrame;
          const time = Math.ceil(previewSegment.startTime / 4) * 4 + 0.75;
          assert.ok(time + 0.35 < previewSegment.endTime);
          json(
            'preview-audio-proof.json',
            assertAudioSample(
              await audio(source, time),
              await audio(preview, time - previewSegment.startTime),
              time,
            ),
          );
        },
      );
      assert.equal(soundMixer.mock.calls.length, 2, 'Export and preview must each mix saved cues');
      const expectedCues = [
        fixture.compiled.flatMap((scene) => scene.planned.cues),
        previewSegment.compiled.planned.cues.map((cue) => ({
          ...cue,
          at: cue.at - previewSegment.startTime,
        })),
      ];
      const soundProof = [];
      for (const [index, [, cues, options]] of soundMixer.mock.calls.entries()) {
        assert.deepEqual(cues, expectedCues[index], 'Saved cue timing changed');
        assert.equal(options.bounded, true);
        const returned = soundMixer.mock.results[index];
        assert.ok(returned.type === 'return');
        const result = await returned.value;
        assert.ok(result.ok, result.ok ? undefined : result.error);
        const planned = sceneSfx.planSceneSfx(cues, options);
        assert.ok(planned.length > 0);
        assert.equal(result.placed, planned.length, 'A planned sound asset was not mixed');
        soundProof.push({
          route: index === 0 ? 'export' : 'preview',
          cueTimes: cues.map((cue) => cue.at),
          duration: options.clipDuration,
          placed: result.placed,
        });
      }
      json('sound-proof.json', soundProof);
      const stillDirectory = join(output, 'stills');
      mkdirSync(stillDirectory);
      const samples = [
        { name: 'speaker-gap', time: 1, speaker: true },
        ...fixture.timeline.segments
          .filter((segment) => segment.kind === 'scene')
          .slice(0, 3)
          .flatMap((segment, index) => [
            {
              name: `scene-${index + 1}-action`,
              time: Math.floor((segment.startFrame + segment.endFrame) / 2) / 30,
              speaker: false,
            },
            { name: `scene-${index + 1}-hold`, time: (segment.endFrame - 16) / 30, speaker: false },
          ]),
        { name: 'omitted-speaker', time: 38, speaker: true },
      ];
      const comparisons = [];
      for (const sample of samples) {
        const file = join(stillDirectory, `${sample.name}.png`);
        await ff([
          '-ss',
          String(sample.time),
          '-i',
          video,
          '-frames:v',
          '1',
          '-threads',
          '1',
          file,
        ]);
        const difference = meanPixelDifference(
          await pixels(source, sample.time),
          await pixels(video, sample.time),
        );
        if (sample.speaker)
          assert.ok(
            difference < 8,
            `Speaker-only interval changed: ${sample.name} (${difference})`,
          );
        else assert.ok(difference > 8, `Scene appears missing: ${sample.name} (${difference})`);
        comparisons.push({ ...sample, file, meanPixelDifference: difference });
      }
      const previewTime =
        Math.floor((previewSegment.endFrame - previewSegment.startFrame) / 2) / 30;
      await ff([
        '-ss',
        String(previewTime),
        '-i',
        preview,
        '-frames:v',
        '1',
        '-threads',
        '1',
        join(stillDirectory, 'preview.png'),
      ]);
      const previewDifference = meanPixelDifference(
        await pixels(preview, previewTime),
        await pixels(video, previewSegment.startTime + previewTime),
      );
      assert.ok(previewDifference < 10, `Preview/export composition differs: ${previewDifference}`);
      json('frame-proof.json', { comparisons, previewDifference });
      const files = [...comparisons.map((item) => item.file), join(stillDirectory, 'preview.png')];
      const filter =
        files.map((_, index) => `[${index}:v]scale=480:270[v${index}]`).join(';') +
        ';' +
        files.map((_, index) => `[v${index}]`).join('') +
        `xstack=inputs=${files.length}:layout=${files.map((_, index) => `${(index % 3) * 480}_${Math.floor(index / 3) * 270}`).join('|')}[sheet]`;
      await ff([
        ...files.flatMap((file) => ['-i', file]),
        '-filter_complex',
        filter,
        '-map',
        '[sheet]',
        '-frames:v',
        '1',
        '-threads',
        '1',
        join(output, 'contact-sheet.png'),
      ]);
      assert.equal(
        await sourceFileDigest(source),
        sourceHash,
        'Source bytes changed during export/preview',
      );
      assert.equal(
        JSON.stringify(fixture.plan),
        planBefore,
        'Approved plan mutated during export/preview',
      );
      json('immutability.json', {
        sourceSha256: sourceHash,
        planSha256: digest(planBefore),
        sourceUnchanged: true,
        planUnchanged: true,
      });
      assert.equal(boundary.renders, fixture.compiled.length + 1);
      console.log(`MEDIA PROOF COMPLETE: ${join(output, 'contact-sheet.png')}`);
    }
    for (const spy of spies)
      assert.equal(spy.mock.calls.length, 0, 'Saved-plan export invoked a planner');
    assert.equal(boundary.ai, 0);
    assert.equal(boundary.builds, 0);
    json('boundary-proof.json', {
      plannerCalls: 0,
      aiCalls: boundary.ai,
      builds: boundary.builds,
      realRemotionRenders: boundary.renders,
      mediaExecuted: mode === 'media',
      root: ROOT,
    });
    report.finish();
  } catch (error) {
    report.finish(error);
    throw error;
  } finally {
    soundMixer.mockRestore();
    for (const spy of spies) spy.mockRestore();
  }
});
