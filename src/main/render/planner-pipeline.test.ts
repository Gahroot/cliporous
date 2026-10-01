import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ch } from '../../shared/ipc-channels';
import { clipIdentity, summarizeUsage } from '../ai/explainer/recent-usage';
import { parseExplainerEditPlan } from '../ai/explainer-scenes';
import { createPlannerUsageStore } from '../planner-usage-store';
import * as explainers from './explainer-scenes';
import { MIN_FACE_LEAD_SECONDS } from './opening-guard';
import { beginRenderBatch, type RenderExecutionOptions, startBatchRender } from './pipeline';
import type { RenderBatchOptions, RenderClipJob } from './types';

const media = vi.hoisted(() => ({
  encode: vi.fn<typeof import('./segment-render').renderSegmentedClip>(async () => 'output.mp4'),
  animation: vi.fn<typeof import('../remotion/render').renderRemotionSegment>(
    async () => 'scene.mp4',
  ),
  assembly: vi.fn(async () => {}),
  metadata: vi.fn(async () => ({
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 60,
    codec: 'h264',
    audioCodec: 'aac',
  })),
  paid: vi.fn(() => {
    throw new Error('Paid gateway reached');
  }),
  stock: vi.fn(async () => new Map()),
}));
vi.mock('../ffmpeg', async (original) => ({
  ...(await original<typeof import('../ffmpeg')>()),
  getEncoder: () => ({ encoder: 'libx264' }),
  isHardwareEncoder: () => false,
  getVideoMetadata: media.metadata,
}));
vi.mock('./segment-render', () => ({ renderSegmentedClip: media.encode }));
vi.mock('../ai/segment-videos', () => ({ fetchSegmentVideos: media.stock }));
vi.mock('../remotion/render', () => ({ renderRemotionSegment: media.animation }));
vi.mock('./over-face', async (original) => ({
  ...(await original<typeof import('./over-face')>()),
  measureFaceBands: async () => [],
}));
vi.mock('./stitched-render', () => ({ assembleStitchedVideo: media.assembly }));
vi.mock('../ai/explainer/planner-generation', async (original) => ({
  ...(await original<typeof import('../ai/explainer/planner-generation')>()),
  createGeminiPlannerGenerator: media.paid,
}));

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  if (!release) throw new Error('Promise executor did not initialize');
  return { promise, resolve: release };
}

let directory: string;
const send = vi.fn();
const window = { webContents: { send } } as unknown as BrowserWindow;
const words = Array.from({ length: 40 }, (_, i) => ({ text: `word${i}`, start: i, end: i + 0.8 }));
const bounds = { minStart: MIN_FACE_LEAD_SECONDS, maxEnd: 40 };
const job = (clipId = 'one'): RenderClipJob => ({
  clipId,
  sourceVideoPath: `/${clipId}.mp4`,
  startTime: 0,
  endTime: 40,
  outputFileName: `${clipId}.mp4`,
  wordTimestamps: words,
  segmentedSegments: [
    {
      startTime: 0,
      endTime: 40,
      archetype: 'talking-head',
      zoomStyle: 'none',
      zoomIntensity: 1,
      transitionIn: 'hard-cut',
    },
  ],
});
const options = (jobs = [job()]): RenderBatchOptions => ({
  jobs,
  outputDirectory: directory,
  sceneSfxEnabled: false,
});
const saved = () => ({
  plan: parseExplainerEditPlan({ scenes: [] }, words, bounds),
  wordsHash: explainers.plannerInputFingerprint(words, bounds),
});

beforeEach(async () => {
  // Concurrent dynamic imports can use Vitest's actual-module cache as well.
  const remotion = await vi.importActual<typeof import('../remotion/render')>('../remotion/render');
  vi.spyOn(remotion, 'renderRemotionSegment').mockImplementation(media.animation);
  directory = mkdtempSync(join(tmpdir(), 'planner-pipeline-'));
  vi.clearAllMocks();
  media.encode.mockReset().mockResolvedValue('output.mp4');
  media.animation.mockReset().mockResolvedValue('scene.mp4');
  beginRenderBatch();
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

describe('internal planner render execution', () => {
  it('runs a saved empty plan without a Gemini key through the real segmented route', async () => {
    const apply = vi.spyOn(explainers, 'applyExplainerScenes');
    const execution: RenderExecutionOptions = { noAi: true, plans: new Map([['one', saved()]]) };
    const input = options();
    const original = structuredClone(input);
    await startBatchRender(input, window, undefined, execution);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: '',
        noAi: true,
        precomputedPlan: execution.plans?.get('one')?.plan,
      }),
    );
    expect(media.encode).toHaveBeenCalledOnce();
    expect(media.paid).not.toHaveBeenCalled();
    expect(input).toEqual(original);
  });

  it.each([
    false,
    true,
  ])('reports final windows and omits uncertain usage after composite fallback=%s', async (fallback) => {
    const plan = parseExplainerEditPlan(
      {
        scenes: [
          {
            kind: 'statement',
            startWord: 5,
            endWord: 8,
            layout: 'stack',
            words: [{ text: 'word6', word: 6 }],
          },
        ],
      },
      words,
      bounds,
      { profile: 'content-led-codex-v1' },
    );
    expect(plan.scenes).toHaveLength(1);
    const onRendered = vi.fn<NonNullable<RenderExecutionOptions['onRendered']>>();
    if (fallback)
      media.encode.mockImplementation(async (config) => {
        const index = config.segments.findIndex((segment) => segment.explainerLayout === 'stack');
        expect(index).toBeGreaterThanOrEqual(0);
        config.onFallback?.({
          segmentIndex: index,
          archetype: 'split-image',
          reason: 'media-missing',
        });
        return 'output.mp4';
      });
    await startBatchRender(options(), window, undefined, {
      noAi: true,
      plans: new Map([
        ['one', { plan, wordsHash: explainers.plannerInputFingerprint(words, bounds) }],
      ]),
      onRendered,
    });
    expect(onRendered).toHaveBeenCalledOnce();
    const [, choices, timeline] = onRendered.mock.calls[0];
    expect(choices).toEqual(fallback ? [] : summarizeUsage(plan.scenes));
    expect(timeline.some((window) => window.layout === 'stack')).toBe(!fallback);
    expect(timeline[0].startTime).toBe(0);
    expect(timeline[timeline.length - 1].endTime).toBe(40);
    expect(JSON.stringify(timeline)).not.toContain('videoPath');
    expect(media.paid).not.toHaveBeenCalled();
  });

  it.each([
    'missing',
    'generator',
    'longform',
    'nonsegmented',
  ] as const)('rejects %s previews before any media or paid preparation', async (invalid) => {
    const input = options();
    const execution: RenderExecutionOptions = { noAi: true, plans: new Map([['one', saved()]]) };
    if (invalid === 'missing') input.jobs.push(job('two'));
    if (invalid === 'generator') execution.generator = media.paid;
    if (invalid === 'longform') input.outputProfile = 'longform';
    if (invalid === 'nonsegmented') input.jobs[0].segmentedSegments = undefined;
    await expect(startBatchRender(input, window, undefined, execution)).rejects.toThrow();
    expect(media.metadata).not.toHaveBeenCalled();
    expect(media.encode).not.toHaveBeenCalled();
    expect(media.paid).not.toHaveBeenCalled();
  });

  it('rejects mismatched saved words without replanning or exporting', async () => {
    await startBatchRender(options(), window, undefined, {
      noAi: true,
      plans: new Map([['one', { ...saved(), wordsHash: 'wrong' }]]),
    });
    expect(send).toHaveBeenCalledWith(
      Ch.Send.RENDER_CLIP_ERROR,
      expect.objectContaining({ clipId: 'one' }),
    );
    expect(media.encode).not.toHaveBeenCalled();
    expect(media.paid).not.toHaveBeenCalled();
  });

  it('strips all provider keys and disables network b-roll without changing the source options', async () => {
    const input = options();
    input.geminiApiKey = 'gemini-secret';
    input.pexelsApiKey = 'pexels-secret';
    input.broll = { enabled: true, pexelsApiKey: 'nested-secret' } as RenderBatchOptions['broll'];
    const baseSegment = job().segmentedSegments?.[0];
    if (!baseSegment) throw new Error('Missing test segment');
    input.jobs[0].segmentedSegments = [{ ...baseSegment, archetype: 'split-image' }];
    Object.assign(input, { otherApiKey: 'other-secret' });
    const original = structuredClone(input);
    const done = vi.fn();
    await startBatchRender(input, window, done, { noAi: true, plans: new Map([['one', saved()]]) });
    expect(media.stock).not.toHaveBeenCalled();
    expect(media.paid).not.toHaveBeenCalled();
    expect(JSON.stringify(done.mock.calls[0][0].options)).not.toContain('secret');
    expect(done.mock.calls[0][0].options.broll.enabled).toBe(false);
    expect(input).toEqual(original);
  });

  it('does not rewrite cached words or times after stitched source remapping', async () => {
    const input = options();
    input.jobs[0].stitchedSegments = [{ startTime: 5, endTime: 40 }];
    const original = structuredClone(input);
    const plan = saved();
    const cached = structuredClone(plan);
    await startBatchRender(input, window, undefined, {
      noAi: true,
      plans: new Map([['one', plan]]),
    });
    expect(media.assembly).toHaveBeenCalledOnce();
    expect(media.encode).not.toHaveBeenCalled();
    expect(media.paid).not.toHaveBeenCalled();
    expect(input).toEqual(original);
    expect(plan).toEqual(cached);
  });

  it('previews a stitched segmented saved plan on the final clip-local timeline without paid preparation', async () => {
    const apply = vi.spyOn(explainers, 'applyExplainerScenes');
    const sourceWords = words.map(({ text, start }) => ({ text, start, end: start + 0.75 }));
    const baseSegment = job().segmentedSegments?.[0];
    if (!baseSegment) throw new Error('Missing test segment');
    const input = options([
      {
        ...job(),
        startTime: 10,
        endTime: 40,
        wordTimestamps: sourceWords,
        stitchedSegments: [
          { startTime: 10, endTime: 20 },
          { startTime: 30, endTime: 40 },
        ],
        // stitchedSegmentingPass already emits clip-local segments; do not remap these.
        segmentedSegments: [0, 10].map((startTime) => ({
          ...baseSegment,
          startTime,
          endTime: startTime + 10,
        })),
      },
    ]);
    const finalWords = [...sourceWords.slice(10, 20), ...sourceWords.slice(30, 40)].map(
      ({ text }, i) => ({ text, start: i, end: i + 0.75 }),
    );
    const finalBounds = { minStart: MIN_FACE_LEAD_SECONDS, maxEnd: 20 };
    const profile = 'content-led-codex-v1';
    const plan = parseExplainerEditPlan(
      {
        scenes: [
          {
            kind: 'statement',
            startWord: 5,
            endWord: 8,
            layout: 'stack',
            words: [
              { text: 'word16', word: 6 },
              { text: 'word17', word: 7 },
            ],
          },
        ],
        quotes: [
          {
            startWord: 13,
            endWord: 16,
            text: 'word33 word34 word35 word36',
            reason: 'takeaway',
          },
        ],
      },
      finalWords,
      finalBounds,
      { profile },
    );
    expect(plan.scenes).toMatchObject([
      { startTime: 4.75, endTime: 9.1, layout: 'stack', scene: { kind: 'statement' } },
    ]);
    expect(plan.quotes).toEqual([
      {
        startWord: 13,
        endWord: 16,
        text: 'word33 word34 word35 word36',
        reason: 'takeaway',
        startTime: 13,
        endTime: 16.75,
      },
    ]);
    const savedPlan = {
      plan,
      wordsHash: explainers.plannerInputFingerprint(finalWords, finalBounds),
    };
    const original = structuredClone(input);
    const cached = structuredClone(savedPlan);
    const done = vi.fn();

    // Saved-plan previews intentionally use the private adapter, bypassing IPC preparations.
    await startBatchRender(input, window, done, {
      noAi: true,
      profile,
      plans: new Map([['one', savedPlan]]),
    });

    expect(media.assembly).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        apiKey: '',
        noAi: true,
        precomputedPlan: plan,
        precomputedWordsHash: savedPlan.wordsHash,
        words: finalWords,
        bounds: finalBounds,
      }),
    );
    expect(media.animation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        compositionId: 'ExplainerSequence',
        inputProps: expect.objectContaining({
          scenes: [
            expect.objectContaining({
              scene: expect.objectContaining({
                kind: 'statement',
                words: [
                  { text: 'word16', at: 1.25 },
                  { text: 'word17', at: 2.25 },
                ],
              }),
            }),
          ],
        }),
      }),
    );
    expect(media.encode).toHaveBeenCalledOnce();
    const encoded = media.encode.mock.calls[0][0];
    expect(encoded.wordTimestamps).toEqual(finalWords);
    expect(encoded.segments.map((s) => [s.startTime, s.endTime, s.archetype])).toEqual([
      [0, 4.75, 'talking-head'],
      [4.75, 9.1, 'split-image'],
      [9.1, 10, 'talking-head'],
      [10, 13, 'talking-head'],
      [13, 16.75, 'fullscreen-quote'],
      [16.75, 20, 'talking-head'],
    ]);
    expect(encoded.segments[1]).toMatchObject({
      explainerLayout: 'stack',
      videoPath: media.animation.mock.calls[0][0].outputPath,
    });
    expect(done).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ completed: 1, failed: 0 }),
    );
    expect(media.paid).not.toHaveBeenCalled();
    expect(media.stock).not.toHaveBeenCalled();
    expect(input).toEqual(original);
    expect(savedPlan).toEqual(cached);
  });

  it('reserves by input order despite skips and encode failures, persisting only actual successes', async () => {
    const apply = vi.spyOn(explainers, 'applyExplainerScenes');
    const store = createPlannerUsageStore(directory);
    const scene = {
      kind: 'statement',
      startWord: 5,
      endWord: 8,
      layout: 'stack',
      words: [
        { text: 'word6', word: 6 },
        { text: 'word7', word: 7 },
      ],
    };
    const plan = parseExplainerEditPlan({ scenes: [scene] }, words, bounds);
    expect(plan.scenes).toHaveLength(1);
    const choices = summarizeUsage(plan.scenes);
    const jobs = ['first', 'skip', 'fallback', 'last'].map(job);
    jobs[1].wordTimestamps = undefined;
    const plans = new Map(['first', 'fallback', 'last'].map((id) => [id, { ...saved(), plan }]));
    const lastEncoded = deferred();
    const skipEncoded = deferred();
    const firstReady = deferred();
    media.metadata.mockImplementationOnce(async () => {
      await firstReady.promise;
      return { width: 1920, height: 1080, fps: 30, duration: 60, codec: 'h264', audioCodec: 'aac' };
    });
    media.animation
      .mockResolvedValueOnce('scene.mp4')
      .mockRejectedValueOnce(new Error('Animation failed'));
    media.encode.mockImplementation(async (config) => {
      if (config.sourceVideoPath === '/skip.mp4') skipEncoded.resolve();
      if (config.sourceVideoPath === '/last.mp4') lastEncoded.resolve();
      if (config.sourceVideoPath === '/first.mp4') {
        await lastEncoded.promise;
        throw new Error('Export failed');
      }
      return 'output.mp4';
    });
    const rendering = startBatchRender(
      { ...options(jobs), renderConcurrency: 4 },
      window,
      undefined,
      { plans, plannerUsage: store },
    );
    await skipEncoded.promise;
    expect(apply).not.toHaveBeenCalled();
    firstReady.resolve();
    await rendering;
    expect(apply.mock.calls.map(([opts]) => opts.recentUse?.map((record) => record.order))).toEqual(
      [[], [0], [0, 2]],
    );
    expect(apply.mock.calls[2][0].recentUse?.map((record) => record.choices)).toEqual([
      choices,
      choices,
    ]);
    expect(media.animation).toHaveBeenCalledTimes(3);
    expect(store.snapshot()).toEqual([
      { clipHash: clipIdentity('/skip.mp4', 0, 40), order: 1, choices: [] },
      { clipHash: clipIdentity('/fallback.mp4', 0, 40), order: 2, choices: [] },
      { clipHash: clipIdentity('/last.mp4', 0, 40), order: 3, choices },
    ]);
    expect(await createPlannerUsageStore(directory).load()).toEqual(store.snapshot());
    expect(media.paid).not.toHaveBeenCalled();
  });

  it('does not persist or report an export completed after cancellation', async () => {
    const controller = new AbortController();
    const store = createPlannerUsageStore(directory);
    const rendered = vi.fn();
    media.encode.mockImplementation(async () => {
      controller.abort();
      return 'output.mp4';
    });
    await startBatchRender(options(), window, undefined, {
      noAi: true,
      plans: new Map([['one', saved()]]),
      plannerUsage: store,
      signal: controller.signal,
      onRendered: rendered,
    });
    expect(store.snapshot()).toEqual([]);
    expect(rendered).not.toHaveBeenCalled();
    expect(send.mock.calls.some(([channel]) => channel === Ch.Send.RENDER_CLIP_DONE)).toBe(false);
  });

  it.each([
    'load',
    'commit',
  ] as const)('does not block exports when history %s throws', async (method) => {
    const store = createPlannerUsageStore(directory);
    vi.spyOn(store, method).mockRejectedValue(new Error('History unavailable'));
    await startBatchRender(options(), window, undefined, { plannerUsage: store });
    expect(media.encode).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      Ch.Send.RENDER_CLIP_DONE,
      expect.objectContaining({ clipId: 'one' }),
    );
  });

  it('rejects an already aborted execution before preparation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      startBatchRender(options(), window, undefined, { signal: controller.signal }),
    ).rejects.toThrow();
    expect(media.metadata).not.toHaveBeenCalled();
    expect(media.paid).not.toHaveBeenCalled();
  });
});
