import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ch } from '../../shared/ipc-channels';
import type {
  LongformScenePreviewRequest,
  SceneFirstLongformPlan,
} from '../../shared/longform-scenes';
import type { RenderBatchOptions } from './types';

const mocks = vi.hoisted(() => ({
  planAtExport: vi.fn(),
  render: vi.fn(),
  encode: vi.fn(),
  concat: vi.fn(),
  validate: vi.fn(),
  phrases: vi.fn(),
  cards: vi.fn(),
  metadata: vi.fn(),
  mix: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => '/tmp', getAppPath: () => '/tmp' },
}));
vi.mock('../ffmpeg', () => ({
  getVideoMetadata: mocks.metadata,
  getEncoder: () => ({ encoder: 'libx264', presetFlag: [] }),
  isHardwareEncoder: () => false,
}));
vi.mock('../ai/longform-scene-contract', () => ({
  validateSceneFirstLongformPlan: mocks.validate,
}));
vi.mock('../remotion/render', () => ({ renderRemotionSegment: mocks.render }));
vi.mock('./scene-sfx', () => ({ mixSceneSfx: mocks.mix }));
vi.mock('./explainer-longform', () => ({ applyLongformExplainerScenes: mocks.planAtExport }));
vi.mock('./features/phrase-emphasis.feature', () => ({
  applyPhraseOverlays: mocks.phrases,
  cleanupPhraseOverlayTempFiles: vi.fn(),
}));
vi.mock('./features/delos-card.feature', () => ({
  applyDelosCards: mocks.cards,
  filterCardsToSpeakerRanges: () => [],
}));
vi.mock('./longform-encode', () => ({
  encodeSpeakerSegment: mocks.encode,
  concatNormalizedSegments: mocks.concat,
  encodeLongformSceneSegment: mocks.encode,
  concatLongformSceneSegments: mocks.concat,
}));

import { renderLongformVideo } from './longform-pipeline';
import { renderLongformScenePreview } from './longform-scene-render';

const plan: SceneFirstLongformPlan = {
  schemaVersion: 2,
  mode: 'scene-first',
  parserVersion: 1,
  sourceDuration: 20,
  sourceFingerprint: 'lf1-0123456789abcdef',
  phrases: [],
  blocks: [],
  reasoning: '',
  generatedAt: 0,
  sections: [
    {
      id: 'section',
      startWord: 0,
      endWord: 1,
      startTime: 0,
      endTime: 20,
      status: 'planned',
      diagnostics: [],
    },
  ],
  scenes: [
    {
      id: 'approved-statement',
      kind: 'statement',
      startWord: 0,
      endWord: 1,
      startTime: 2,
      endTime: 6,
      sectionId: 'section',
      presentation: 'speaker-side',
      sourceSpec: { kind: 'statement', startWord: 0, endWord: 1 },
      label: 'Source',
      purpose: 'Explain',
    },
  ],
};
const dirs: string[] = [];
function options(): RenderBatchOptions {
  const dir = mkdtempSync(join(tmpdir(), 'lf-scene-test-'));
  dirs.push(dir);
  return {
    outputDirectory: dir,
    outputProfile: 'longform',
    longformEditPlan: structuredClone(plan),
    geminiApiKey: 'must-not-be-used',
    jobs: [
      {
        clipId: 'longform',
        sourceVideoPath: '/source.mp4',
        startTime: 0,
        endTime: 20,
        outputFileName: 'longform',
        wordTimestamps: [
          { text: 'Source', start: 2, end: 3 },
          { text: 'words', start: 4, end: 5 },
        ],
      },
    ],
  };
}
function windowStub() {
  const send = vi.fn();
  return { send, window: { webContents: { send } } as unknown as BrowserWindow };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.metadata.mockResolvedValue({
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 20,
    audioCodec: 'aac',
  });
  mocks.validate.mockImplementation((value) => ({
    ok: true,
    value: {
      plan: value,
      scenes: value.scenes
        .filter((s: { omitted?: boolean }) => !s.omitted)
        .map((placement: (typeof plan.scenes)[number]) => ({
          kind: 'explainer',
          placement,
          planned: {
            startTime: placement.startTime,
            endTime: placement.endTime,
            scene: {
              kind: 'statement',
              words: [{ text: 'Source', at: placement.startTime + 0.5 }],
            },
            layout: 'takeover',
            chained: false,
            transition: 'fade',
            cues: [{ kind: 'tick', at: placement.startTime + 0.5, gain: 0.4 }],
          },
        })),
    },
  }));
  mocks.render.mockImplementation(async (opts) => {
    writeFileSync(opts.outputPath, 'scene');
    return opts.outputPath;
  });
  mocks.encode.mockImplementation(async (opts) => {
    writeFileSync(opts.outputPath, 'segment');
  });
  mocks.concat.mockImplementation(async (opts) => {
    if (opts.outputPath) writeFileSync(opts.outputPath, 'export');
  });
  mocks.mix.mockImplementation(async (_video, cues, opts) => {
    writeFileSync(opts.outputPath, 'mixed export');
    return { ok: true, outputPath: opts.outputPath, placed: cues.length };
  });
});
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function previewRequest(): LongformScenePreviewRequest {
  return {
    requestId: 'preview-test',
    sourceVideoPath: '/source.mp4',
    sceneId: plan.scenes[0].id,
    plan: structuredClone(plan),
    wordTimestamps: [
      { text: 'Source', start: 2, end: 3 },
      { text: 'words', start: 4, end: 5 },
    ],
  };
}

function useBoardPlan(style: 'ink' | 'polish'): SceneFirstLongformPlan {
  const saved = structuredClone(plan);
  saved.parserVersion = 2;
  saved.storyboardStyle = style;
  saved.scenes[0].kind = 'storyboard';
  saved.scenes[0].sourceSpec.kind = 'storyboard';
  saved.scenes[0].presentation = 'full-frame';
  mocks.validate.mockImplementation((value: SceneFirstLongformPlan) => ({
    ok: true,
    value: {
      plan: value,
      scenes: value.scenes
        .filter((scene) => !scene.omitted)
        .map((placement) => ({
          kind: 'storyboard',
          placement,
          board: {
            durationSec: placement.endTime - placement.startTime,
            boardIn: { at: placement.startTime, dur: 0.3 },
            boardOut: { at: placement.endTime - 0.3, dur: 0.3 },
            shots: [{ at: placement.startTime, dur: 0, x: 700, y: 400, zoom: 1 }],
            elements: [
              {
                id: 'title',
                kind: 'text',
                text: 'Source',
                x: 200,
                y: 200,
                size: 44,
                tone: 'ink',
                at: placement.startTime + 0.5,
              },
            ],
            props: [],
          },
          cues: [{ kind: 'tick', at: placement.startTime + 0.5, gain: 0.4 }],
        })),
    },
  }));
  return saved;
}

describe('storyboard shared preview/export route', () => {
  it.each([
    'ink',
    'polish',
  ] as const)('dispatches %s with the same snapshot, local beats and source underlay', async (style) => {
    const saved = useBoardPlan(style);
    const palette = {
      id: 'light-custom',
      name: 'Local light',
      background: '#fafafa',
      foreground: '#101010',
      accent: '#317b50',
      builtin: false,
    };
    const opts = options();
    opts.longformEditPlan = saved;
    opts.longformPaletteId = palette.id;
    opts.customPalettes = [palette];
    opts.geminiApiKey = undefined;
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    expect(send).not.toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_ERROR, expect.anything());
    const request = {
      ...previewRequest(),
      plan: saved,
      paletteId: palette.id,
      customPalettes: [palette],
    };
    const preview = await renderLongformScenePreview(request);
    dirs.push(dirname(preview));
    expect(mocks.render).toHaveBeenCalledTimes(2);
    const exported = mocks.render.mock.calls[0][0];
    const previewed = mocks.render.mock.calls[1][0];
    expect(exported).toMatchObject({
      compositionId: 'StoryBoard',
      width: 1920,
      height: 1080,
      fps: 30,
      concurrency: 1,
      transparent: true,
      durationSec: 4,
    });
    expect(previewed.inputProps).toEqual(exported.inputProps);
    expect(exported.inputProps).toMatchObject({
      style,
      palette,
      spec: { boardIn: { at: 0, dur: 0.3 }, elements: [{ at: 0.5 }] },
    });
    const visuals = mocks.encode.mock.calls.map(([args]) => args).filter((args) => args.visualPath);
    expect(visuals).toHaveLength(2);
    for (const args of visuals)
      expect(args).toMatchObject({
        sourceUnderlay: true,
        presentation: 'full-frame',
        frameCount: 120,
      });
    expect(mocks.concat).toHaveBeenCalledTimes(2);
    expect(mocks.mix.mock.calls[0][1]).toEqual([{ kind: 'tick', at: 2.5, gain: 0.4 }]);
    expect(mocks.mix.mock.calls[1][1]).toEqual([{ kind: 'tick', at: 0.5, gain: 0.4 }]);
    expect(mocks.planAtExport).not.toHaveBeenCalled();
  });
  it('falls back for the complete board interval but reports preview visual failure', async () => {
    const saved = useBoardPlan('ink');
    const opts = options();
    opts.longformEditPlan = saved;
    mocks.render.mockRejectedValue(new Error('Board graphics failed'));
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    expect(send).not.toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_ERROR, expect.anything());
    expect(mocks.encode.mock.calls.map(([args]) => args.frameCount)).toEqual([60, 120, 420]);
    expect(mocks.encode.mock.calls.every(([args]) => !args.visualPath)).toBe(true);
    expect(mocks.mix).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      Ch.Send.RENDER_CLIP_DONE,
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          sceneResults: [
            expect.objectContaining({
              kind: 'storyboard',
              status: 'failed',
              reason: expect.stringContaining('Speaker fallback'),
            }),
          ],
        }),
      }),
    );
    await expect(renderLongformScenePreview({ ...previewRequest(), plan: saved })).rejects.toThrow(
      'Board graphics failed',
    );
    expect(readdirSync(opts.outputDirectory)).toEqual(['source_longform.mp4']);
  });
});

describe('scene-first saved SFX', () => {
  it.each([
    undefined,
    true,
    false,
  ])('honors enabled=%s for export and preview without rebasing twice', async (enabled) => {
    const opts = options();
    const request = previewRequest();
    if (enabled !== undefined) {
      opts.sceneSfxEnabled = enabled;
      request.sceneSfxEnabled = enabled;
    }
    const controller = new AbortController();
    await renderLongformVideo(opts, windowStub().window, controller.signal);
    const preview = await renderLongformScenePreview(request, controller.signal);
    dirs.push(dirname(preview));
    expect(mocks.mix).toHaveBeenCalledTimes(enabled === false ? 0 : 2);
    if (enabled !== false) {
      expect(mocks.mix).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        [{ kind: 'tick', at: 2.5, gain: 0.4 }],
        expect.objectContaining({
          clipDuration: 20,
          masterDb: 7,
          bounded: true,
          signal: controller.signal,
        }),
      );
      expect(mocks.mix).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        [{ kind: 'tick', at: 0.5, gain: 0.4 }],
        expect.objectContaining({
          clipDuration: 4,
          masterDb: 7,
          bounded: true,
          signal: controller.signal,
        }),
      );
      expect(mocks.concat.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.mix.mock.invocationCallOrder[0],
      );
      expect(mocks.concat.mock.invocationCallOrder[1]).toBeLessThan(
        mocks.mix.mock.invocationCallOrder[1],
      );
      expect(mocks.validate.mock.results[1].value.value.scenes[0].planned.cues[0].at).toBe(2.5);
    }
    expect(readFileSync(preview, 'utf8')).toBe(enabled === false ? 'export' : 'mixed export');
    expect(readFileSync(join(opts.outputDirectory, 'source_longform.mp4'), 'utf8')).toBe(
      enabled === false ? 'export' : 'mixed export',
    );
  });

  it('rebases against the actual frame-aligned preview start', async () => {
    const request = previewRequest();
    request.plan.scenes[0].startTime = 2.01;
    const preview = await renderLongformScenePreview(request);
    dirs.push(dirname(preview));
    expect(mocks.concat.mock.calls[0][0].audioStartTime).toBe(2);
    expect(mocks.mix.mock.calls[0][1]).toEqual([
      { kind: 'tick', at: expect.closeTo(0.51, 8), gain: 0.4 },
    ]);
    expect(mocks.validate.mock.results[0].value.value.scenes[0].planned.cues[0].at).toBe(2.51);
  });

  it('collects only successfully encoded scenes, excluding failures and omissions', async () => {
    const opts = options();
    const saved = structuredClone(plan);
    saved.scenes.push(
      { ...saved.scenes[0], id: 'failed', startTime: 8, endTime: 12 },
      { ...saved.scenes[0], id: 'omitted', startTime: 14, endTime: 18, omitted: true },
    );
    // Separate cuts: this case covers per-scene fallback, not the scene canvas.
    saved.sceneCanvas = false;
    opts.longformEditPlan = saved;
    mocks.encode.mockImplementation(async (args) => {
      writeFileSync(args.outputPath, 'segment');
      if (args.visualPath && args.startTime === 8) throw new Error('Composite failed');
    });
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    expect(mocks.mix).toHaveBeenCalledTimes(1);
    expect(mocks.mix.mock.calls[0][1]).toEqual([{ kind: 'tick', at: 2.5, gain: 0.4 }]);
    expect(send).toHaveBeenCalledWith(
      Ch.Send.RENDER_CLIP_DONE,
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          sceneResults: [
            expect.objectContaining({ id: 'approved-statement', status: 'rendered' }),
            expect.objectContaining({ id: 'failed', status: 'failed' }),
            expect.objectContaining({ id: 'omitted', status: 'omitted' }),
          ],
        }),
      }),
    );
    const request = previewRequest();
    request.plan.scenes[0].omitted = true;
    await expect(renderLongformScenePreview(request)).rejects.toThrow(/omitted/);
    expect(mocks.mix).toHaveBeenCalledTimes(1);
  });

  it.each([
    false,
    true,
  ])('draws consecutive scenes as one canvas (canvas fails: %s)', async (failCanvas) => {
    const saved = structuredClone(plan);
    saved.scenes.push({ ...saved.scenes[0], id: 'second', startTime: 8, endTime: 12 });
    mocks.render.mockImplementation(async (args) => {
      if (failCanvas && args.compositionId === 'SceneCanvas')
        throw new Error('Canvas graphics failed');
      writeFileSync(args.outputPath, 'scene');
      return args.outputPath;
    });
    const opts = options();
    opts.longformEditPlan = saved;
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    const compositions = mocks.render.mock.calls.map((c) => c[0].compositionId);
    expect(compositions[0]).toBe('SceneCanvas');
    if (failCanvas) {
      // Falls back to the exact separate scenes it replaced.
      expect(compositions.slice(1)).toHaveLength(2);
      expect(compositions.slice(1)).not.toContain('SceneCanvas');
    } else {
      expect(compositions).toHaveLength(1);
      expect(mocks.render.mock.calls[0][0].inputProps.panels).toHaveLength(2);
    }
    expect(mocks.mix.mock.calls[0][1]).toHaveLength(2);
    expect(send).toHaveBeenCalledWith(
      Ch.Send.RENDER_CLIP_DONE,
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          sceneResults: [
            expect.objectContaining({ id: 'approved-statement', status: 'rendered' }),
            expect.objectContaining({ id: 'second', status: 'rendered' }),
          ],
        }),
      }),
    );
  });

  it('fails rather than mixing or publishing when speaker fallback encoding fails', async () => {
    mocks.render.mockRejectedValueOnce(new Error('Visual failed'));
    mocks.encode.mockImplementation(async (args) => {
      if (args.startTime === 2) throw new Error('Speaker fallback failed');
      writeFileSync(args.outputPath, 'segment');
    });
    const opts = options();
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    expect(mocks.mix).not.toHaveBeenCalled();
    expect(mocks.concat).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_ERROR, expect.anything());
    expect(send).not.toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_DONE, expect.anything());
    expect(readdirSync(opts.outputDirectory)).toEqual([]);
  });

  it.each([
    'failure',
    'cancellation',
  ] as const)('never publishes on mixer %s; cleans only owned work', async (mode) => {
    const controller = new AbortController();
    mocks.mix.mockImplementation(async (_input, _cues, args) => {
      writeFileSync(args.outputPath, 'partial mix');
      if (mode === 'cancellation') {
        controller.abort();
        // Even an apparent successful child exit cannot authorize publication after abort.
        return { ok: true, outputPath: args.outputPath, placed: 1 };
      }
      return { ok: false, error: 'Mixer failed' };
    });
    const opts = options();
    const previous = join(opts.outputDirectory, 'source_longform.mp4');
    writeFileSync(previous, 'completed export');
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window, controller.signal);
    expect(send).not.toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_DONE, expect.anything());
    expect(send).toHaveBeenCalledWith(
      mode === 'cancellation' ? Ch.Send.RENDER_CLIP_CANCELLED : Ch.Send.RENDER_CLIP_ERROR,
      expect.anything(),
    );
    expect(readdirSync(opts.outputDirectory)).toEqual(['source_longform.mp4']);
    expect(readFileSync(previous, 'utf8')).toBe('completed export');
    expect(existsSync(dirname(mocks.mix.mock.calls[0][2].outputPath))).toBe(false);
  });

  it.each([
    'failure',
    'cancellation',
  ] as const)('rejects preview mixer %s and removes its request directory', async (mode) => {
    const controller = new AbortController();
    mocks.mix.mockImplementationOnce(async (_input, _cues, args) => {
      writeFileSync(args.outputPath, 'partial');
      if (mode === 'cancellation') controller.abort();
      return { ok: false, error: 'Mixer failed' };
    });
    await expect(renderLongformScenePreview(previewRequest(), controller.signal)).rejects.toThrow(
      mode === 'cancellation' ? /abort/i : /Scene SFX mix failed/,
    );
    expect(existsSync(dirname(dirname(mocks.mix.mock.calls[0][2].outputPath)))).toBe(false);
  });
});

describe('scene-first export is the approved plan, not an export-time planner', () => {
  it('preserves completed exports and reports the selected unique output in DONE and reconciliation', async () => {
    const opts = options();
    const original = join(opts.outputDirectory, 'source_longform.mp4');
    const second = join(opts.outputDirectory, 'source_longform (2).mp4');
    const outputPath = join(opts.outputDirectory, 'source_longform (3).mp4');
    writeFileSync(original, 'previous export');
    writeFileSync(second, 'another export');
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    expect(send).toHaveBeenCalledWith(
      Ch.Send.RENDER_CLIP_DONE,
      expect.objectContaining({
        outputPath,
        reconciliation: expect.objectContaining({ outputPath }),
      }),
    );
    expect(readFileSync(original, 'utf8')).toBe('previous export');
    expect(readFileSync(second, 'utf8')).toBe('another export');
    expect(readFileSync(outputPath, 'utf8')).toBe('mixed export');
  });

  it('fails publication without touching a target created during rendering', async () => {
    const opts = options();
    const target = join(opts.outputDirectory, 'source_longform.mp4');
    mocks.concat.mockImplementationOnce(async (args) => {
      writeFileSync(args.outputPath, 'export');
      writeFileSync(target, 'racing user file');
    });
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    expect(send).not.toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_DONE, expect.anything());
    expect(send).toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_ERROR, expect.anything());
    expect(readFileSync(target, 'utf8')).toBe('racing user file');
    expect(readdirSync(opts.outputDirectory)).toEqual(['source_longform.mp4']);
  });

  it.each([
    'speaker-side',
    'speaker-pip',
    'full-frame',
  ] as const)('uses the real %s scene geometry for preview and leaves its deliverable alive', async (presentation) => {
    const request = previewRequest();
    request.plan.scenes[0].presentation = presentation;
    const controller = new AbortController();
    const output = await renderLongformScenePreview(request, controller.signal);
    dirs.push(dirname(output));
    expect(existsSync(output)).toBe(true);
    expect(readdirSync(dirname(output))).toEqual(['preview.mp4']);
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        compositionId: 'ExplainerSequence',
        width: 1920,
        height: 1080,
        fps: 30,
        concurrency: 1,
        signal: controller.signal,
        inputProps: expect.objectContaining({
          presentation,
          scenes: [
            {
              scene: { kind: 'statement', words: [{ text: 'Source', at: 0.5 }] },
              durationInFrames: 120,
            },
          ],
        }),
      }),
    );
    expect(mocks.encode).toHaveBeenCalledWith(
      expect.objectContaining({
        presentation,
        startTime: 2,
        frameCount: 120,
        qualityParams: { crf: 28, preset: 'veryfast' },
      }),
    );
    expect(mocks.concat).toHaveBeenCalledWith(
      expect.objectContaining({
        audioStartTime: 2,
        duration: 4,
        outputPath: join(dirname(output), 'work', 'narrated.mp4'),
      }),
    );
    expect(mocks.planAtExport).not.toHaveBeenCalled();
  });

  it('does not pretend a failed preview rendered, and removes its partial work', async () => {
    mocks.render.mockImplementationOnce(async (opts) => {
      writeFileSync(opts.outputPath, 'partial');
      throw new Error('3D failed');
    });
    await expect(renderLongformScenePreview(previewRequest())).rejects.toThrow('3D failed');
    expect(mocks.encode).not.toHaveBeenCalled();
    expect(mocks.mix).not.toHaveBeenCalled();
    expect(existsSync(dirname(dirname(mocks.render.mock.calls[0][0].outputPath)))).toBe(false);
  });

  it.each([
    'render',
    'encode',
  ] as const)('retains exact source intervals and failed IDs when scene %s fails', async (stage) => {
    if (stage === 'render') mocks.render.mockRejectedValueOnce(new Error('3D failed'));
    else
      mocks.encode.mockImplementation(async (opts) => {
        writeFileSync(opts.outputPath, 'segment');
        if (opts.visualPath) throw new Error('Composite failed');
      });
    const opts = options();
    delete opts.geminiApiKey;
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    const speakers = mocks.encode.mock.calls
      .map(([args]) => args)
      .filter((args) => !args.visualPath);
    expect(speakers.map((args) => [args.startTime, args.frameCount])).toEqual([
      [0, 60],
      [2, 120],
      [6, 420],
    ]);
    expect(mocks.concat).toHaveBeenCalledWith(
      expect.objectContaining({ audioStartTime: 0, duration: 20, sourceVideoPath: '/source.mp4' }),
    );
    expect(send).toHaveBeenCalledWith(
      Ch.Send.RENDER_CLIP_DONE,
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          scenes: { planned: 1, eligible: 1, rendered: 0, dropped: 1 },
          sceneResults: [
            expect.objectContaining({
              id: 'approved-statement',
              status: 'failed',
              reason: expect.stringContaining('Speaker fallback:'),
            }),
          ],
          fallbacks: [expect.objectContaining({ type: 'scene', count: 1 })],
        }),
      }),
    );
    expect(readdirSync(opts.outputDirectory)).toEqual(['source_longform.mp4']);
    expect(mocks.planAtExport).not.toHaveBeenCalled();
    expect(mocks.mix).not.toHaveBeenCalled();
  });

  it('keeps intentional omissions and an empty plan speaker-only without AI', async () => {
    const opts = options();
    const omittedPlan = structuredClone(plan);
    omittedPlan.scenes[0].omitted = true;
    opts.longformEditPlan = omittedPlan;
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.encode).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: 0, frameCount: 600 }),
    );
    expect(send).toHaveBeenCalledWith(
      Ch.Send.RENDER_CLIP_DONE,
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          sceneResults: [expect.objectContaining({ status: 'omitted' })],
        }),
      }),
    );
    omittedPlan.scenes = [];
    await renderLongformVideo(opts, window);
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.planAtExport).not.toHaveBeenCalled();
    expect(mocks.mix).not.toHaveBeenCalled();
  });

  it('uses probed full-source duration, rejects invalid reconstruction, never falls into legacy', async () => {
    const opts = options();
    opts.jobs[0].startTime = 5;
    opts.jobs[0].endTime = 10;
    mocks.validate.mockReturnValueOnce({ ok: false, error: 'Stale source identity.' });
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    expect(mocks.validate).toHaveBeenCalledWith(
      opts.longformEditPlan,
      opts.jobs[0].wordTimestamps,
      20,
    );
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.encode).not.toHaveBeenCalled();
    expect(mocks.planAtExport).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_ERROR, expect.anything());
    expect(send).not.toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_DONE, expect.anything());
  });

  it('rejects malformed versioned envelopes instead of downgrading them', async () => {
    const opts = options();
    Object.assign(opts.longformEditPlan ?? {}, { schemaVersion: 99, mode: 'legacy' });
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);
    expect(mocks.encode).not.toHaveBeenCalled();
    expect(mocks.planAtExport).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_ERROR, expect.anything());
  });

  it('propagates cancellation to scene work without fallback or publishing a partial export', async () => {
    const opts = options();
    const controller = new AbortController();
    mocks.render.mockImplementationOnce(async (args) => {
      expect(args.signal).toBe(controller.signal);
      writeFileSync(args.outputPath, 'partial');
      controller.abort();
      controller.signal.throwIfAborted();
    });
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window, controller.signal);
    expect(mocks.encode).toHaveBeenCalledTimes(1); // opening speaker only, not scene fallback
    expect(mocks.concat).not.toHaveBeenCalled();
    expect(readdirSync(opts.outputDirectory)).toEqual([]);
    expect(send).toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_CANCELLED, { clipId: 'longform' });
    expect(send).toHaveBeenCalledWith(Ch.Send.RENDER_CANCELLED, {
      completed: 0,
      failed: 0,
      cancelled: 1,
      total: 1,
    });
    expect(send).not.toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_ERROR, expect.anything());
    expect(send).not.toHaveBeenCalledWith(Ch.Send.RENDER_BATCH_DONE, expect.anything());
    expect(send).not.toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_DONE, expect.anything());
  });

  it.each([
    'aac',
    'unknown',
  ])('detects %s audio before scene work and shares that decision with export and preview', async (audioCodec) => {
    mocks.metadata.mockResolvedValue({
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 20,
      audioCodec,
    });
    const controller = new AbortController();
    await renderLongformVideo(options(), windowStub().window, controller.signal);
    const preview = await renderLongformScenePreview(previewRequest(), controller.signal);
    expect(mocks.metadata).toHaveBeenCalledTimes(2);
    for (const args of mocks.metadata.mock.calls)
      expect(args).toEqual(['/source.mp4', { localOnly: true, signal: controller.signal }]);
    dirs.push(dirname(preview));
    expect(mocks.concat).toHaveBeenCalledTimes(2);
    expect(mocks.mix).toHaveBeenCalledTimes(2); // Bounded silence also supplies an audio stream.
    for (const [args] of mocks.concat.mock.calls)
      expect(args.sourceHasAudio).toBe(audioCodec !== 'unknown');
    expect(mocks.metadata.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.render.mock.invocationCallOrder[0],
    );
    expect(mocks.metadata.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.render.mock.invocationCallOrder[1],
    );
  });

  it('uses the same custom palette in preview and export, never silently substituting brand', async () => {
    const custom = {
      id: 'custom-ocean',
      name: 'Ocean',
      background: '#123456',
      foreground: '#abcdef',
      accent: '#1255ee',
      builtin: false,
    };
    const opts = options();
    opts.longformPaletteId = custom.id;
    opts.customPalettes = [custom];
    await renderLongformVideo(opts, windowStub().window);
    const request = previewRequest();
    request.paletteId = custom.id;
    Object.assign(request, { customPalettes: [custom] });
    const preview = await renderLongformScenePreview(request);
    dirs.push(dirname(preview));
    expect(mocks.render.mock.calls[1][0].inputProps.palette).toEqual(
      mocks.render.mock.calls[0][0].inputProps.palette,
    );
    expect(mocks.render.mock.calls[1][0].inputProps.palette.accent).toBe(custom.accent);
    request.paletteId = 'missing-palette';
    await expect(renderLongformScenePreview(request)).rejects.toThrow(/palette.*unavailable/i);
    expect(mocks.render).toHaveBeenCalledTimes(2);
  });

  it('reports an already-aborted scene-first job as cancelled with no rendering or error', async () => {
    const controller = new AbortController();
    controller.abort();
    const { send, window } = windowStub();
    await renderLongformVideo(options(), window, controller.signal);
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.encode).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(Ch.Send.RENDER_CANCELLED, {
      completed: 0,
      failed: 0,
      cancelled: 1,
      total: 1,
    });
    expect(send).not.toHaveBeenCalledWith(Ch.Send.RENDER_CLIP_ERROR, expect.anything());
  });

  it('composites saved phrase overlays on speaker ranges only, after the scene timeline', async () => {
    const opts = options();
    const saved = opts.longformEditPlan as SceneFirstLongformPlan;
    saved.phrases = [
      { text: 'ON CAMERA', startTime: 10, endTime: 11.5 },
      // Inside the speaker-side scene (2s-6s): never composited over an explanation.
      { text: 'DURING SCENE', startTime: 3, endTime: 4 },
    ];
    mocks.phrases.mockImplementation(async (phraseOpts) => {
      writeFileSync(phraseOpts.outputPath, 'with phrases');
      return {
        outputPath: phraseOpts.outputPath,
        tempFiles: [],
        stats: { rendered: phraseOpts.phrases.length, dropped: 0 },
      };
    });
    const { send, window } = windowStub();
    await renderLongformVideo(opts, window);

    expect(mocks.phrases).toHaveBeenCalledTimes(1);
    const phraseCall = mocks.phrases.mock.calls[0]?.[0];
    expect(phraseCall).toMatchObject({
      phrases: [{ text: 'ON CAMERA', startTime: 10, endTime: 11.5 }],
      width: 1920,
      height: 1080,
      fps: 30,
      phraseColor: expect.stringMatching(/^#[0-9a-fA-F]{6}$/),
    });
    // The concatenated scene timeline is the overlay input; the overlaid video gets the SFX mix.
    expect(mocks.concat.mock.calls.at(-1)?.[0].outputPath).toBe(phraseCall.inputPath);
    expect(mocks.mix.mock.calls[0]?.[0]).toBe(phraseCall.outputPath);
    expect(send).toHaveBeenCalledWith(
      Ch.Send.RENDER_CLIP_DONE,
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          phrases: { planned: 2, eligible: 1, rendered: 1, dropped: 1 },
        }),
      }),
    );
  });

  it('renders the saved scene with no AI or legacy gap fill and reconciles its ID', async () => {
    const { send, window } = windowStub();
    await renderLongformVideo(options(), window);
    expect(mocks.render).toHaveBeenCalledTimes(1);
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        compositionId: 'ExplainerSequence',
        width: 1920,
        height: 1080,
        fps: 30,
        durationSec: 4,
        inputProps: expect.objectContaining({ aspect: '16:9', presentation: 'speaker-side' }),
      }),
    );
    expect(mocks.planAtExport).not.toHaveBeenCalled();
    expect(mocks.phrases).not.toHaveBeenCalled();
    expect(mocks.cards).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      Ch.Send.RENDER_CLIP_DONE,
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          scenes: { planned: 1, eligible: 1, rendered: 1, dropped: 0 },
          sceneResults: [expect.objectContaining({ id: 'approved-statement', status: 'rendered' })],
        }),
      }),
    );
  });
});
