import { resolve } from 'node:path';
import { Ch } from '@shared/ipc-channels';
import { longformSourceFingerprint, type SceneFirstLongformPlan } from '@shared/longform-scenes';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  render: vi.fn(),
  cancel: vi.fn(),
  createStore: vi.fn(),
  send: vi.fn(),
  store: { owner: 'fixture' },
  stat: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { getPath: () => '/owned/user-data' },
  BrowserWindow: { fromWebContents: () => ({ webContents: { send: mocks.send } }) },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) =>
      mocks.handlers.set(channel, handler),
  },
}));
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  stat: mocks.stat,
}));
vi.mock('../planner-usage-store', () => ({ createPlannerUsageStore: mocks.createStore }));
vi.mock('../render/pipeline', () => ({
  startBatchRender: mocks.render,
  cancelRender: mocks.cancel,
  beginRenderBatch: vi.fn(),
  cancelQueuedRenderJob: vi.fn(),
  stopRenderAfterCurrent: vi.fn(),
  isRenderCancellationRequested: () => false,
}));
vi.mock('../render/output-dir', () => ({ resolveOutputDirectory: (path: string) => path }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      throw new Error('Paid provider reached');
    }
  },
  ThinkingLevel: {},
}));

import { registerRenderHandlers } from './render-handlers';

const event = { sender: { send: mocks.send } };
const options = () => ({ jobs: [], outputDirectory: '/owned/output', captionsEnabled: true });
async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error('Missing handler');
  return handler(...args);
}
beforeEach(() => {
  mocks.handlers.clear();
  mocks.render.mockReset();
  mocks.cancel.mockReset();
  mocks.createStore.mockReset().mockReturnValue(mocks.store);
  mocks.send.mockReset();
  mocks.stat.mockReset().mockResolvedValue({ isFile: () => true });
  registerRenderHandlers();
});

function sceneOptions(sourceVideoPath = resolve('/owned/source.mp4')) {
  const words = [
    { text: 'Local', start: 0.1, end: 0.4 },
    { text: 'source', start: 0.5, end: 0.9 },
  ];
  const plan: SceneFirstLongformPlan = {
    schemaVersion: 2,
    mode: 'scene-first',
    parserVersion: 1,
    sourceDuration: 2,
    sourceFingerprint: longformSourceFingerprint(words, 2),
    generatedAt: 0,
    blocks: [],
    phrases: [],
    cards: [],
    scenes: [],
    reasoning: 'Keep the speaker.',
    sections: [
      {
        id: 'section-0',
        startWord: 0,
        endWord: 1,
        startTime: 0,
        endTime: 2,
        status: 'empty',
        diagnostics: [],
      },
    ],
  };
  return {
    ...options(),
    outputProfile: 'longform',
    longformEditPlan: plan,
    jobs: [{ clipId: 'source', sourceVideoPath, startTime: 0, endTime: 2, wordTimestamps: words }],
  };
}

describe('scene-first batch boundary', () => {
  it.each([
    'https://example.invalid/video.mp4',
    'file:///video.mp4',
    'relative.mp4',
    `C:\\source\0.mp4`,
  ])('rejects a non-native source before filesystem/probe work: %s', async (path) => {
    await expect(invoke(Ch.Invoke.RENDER_START_BATCH, event, sceneOptions(path))).rejects.toThrow(
      /native source video file/,
    );
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it('requires one source for one approved plan', async () => {
    const input = sceneOptions();
    input.jobs.push({ ...input.jobs[0], clipId: 'other' });
    await expect(invoke(Ch.Invoke.RENDER_START_BATCH, event, input)).rejects.toThrow(
      /one approved/,
    );
    expect(mocks.stat).not.toHaveBeenCalled();
  });
  it('rejects a mismatched transcript and invalid palette before filesystem work', async () => {
    const input = sceneOptions();
    input.jobs[0].wordTimestamps[0].text = 'changed';
    await expect(invoke(Ch.Invoke.RENDER_START_BATCH, event, input)).rejects.toThrow(
      /different transcript/,
    );
    await expect(
      invoke(Ch.Invoke.RENDER_START_BATCH, event, {
        ...sceneOptions(),
        longformPaletteId: 'missing',
      }),
    ).rejects.toThrow(/palette/);
    expect(mocks.stat).not.toHaveBeenCalled();
  });
  it('accepts a source-bound speaker-only plan unchanged', async () => {
    const input = sceneOptions();
    await expect(invoke(Ch.Invoke.RENDER_START_BATCH, event, input)).resolves.toEqual({
      started: true,
    });
    expect(mocks.render.mock.calls[0]?.[0].longformEditPlan).toBe(input.longformEditPlan);
    expect(mocks.stat).toHaveBeenCalledWith(input.jobs[0].sourceVideoPath);
  });
  it('treats cancellation during source validation as cancellation, not an export failure', async () => {
    let release: (value: { isFile: () => boolean }) => void = () => undefined;
    mocks.stat.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = invoke(Ch.Invoke.RENDER_START_BATCH, event, sceneOptions());
    await Promise.resolve();
    await invoke(Ch.Invoke.RENDER_CANCEL, event);
    release({ isFile: () => true });
    await expect(pending).resolves.toEqual({ started: false });
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith(Ch.Send.RENDER_CANCELLED, {
      completed: 0,
      failed: 0,
      total: 1,
    });
  });
});

describe('render registration owns planner history and cancellation', () => {
  it('injects one store and an owned signal rather than global planner state', async () => {
    mocks.render.mockResolvedValue(undefined);
    expect(await invoke(Ch.Invoke.RENDER_START_BATCH, event, options())).toEqual({ started: true });
    await Promise.resolve();
    expect(mocks.createStore).toHaveBeenCalledTimes(1);
    expect(mocks.render.mock.calls[0][3]).toMatchObject({
      plannerUsage: mocks.store,
      signal: expect.any(AbortSignal),
    });
  });
  it('cancels planning as well as owned media work', async () => {
    let finish: () => void = () => {};
    mocks.render.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await invoke(Ch.Invoke.RENDER_START_BATCH, event, options());
    const signal = mocks.render.mock.calls[0][3]?.signal;
    await invoke(Ch.Invoke.RENDER_CANCEL, event);
    expect(signal?.aborted).toBe(true);
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
  });
  it('rejects overlapping batches and clears ownership when a batch ends', async () => {
    let finish: () => void = () => {};
    mocks.render.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await invoke(Ch.Invoke.RENDER_START_BATCH, event, options());
    await expect(invoke(Ch.Invoke.RENDER_START_BATCH, event, options())).rejects.toThrow(
      'already running',
    );
    finish();
    await Promise.resolve();
    await Promise.resolve();
    mocks.render.mockResolvedValue(undefined);
    expect(await invoke(Ch.Invoke.RENDER_START_BATCH, event, options())).toEqual({ started: true });
  });
});
