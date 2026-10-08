import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Ch } from '../../shared/ipc-channels';
import {
  type LongformScenePreviewRequest,
  longformSceneId,
  longformSourceFingerprint,
} from '../../shared/longform-scenes';
import { parseLongformSceneSpec } from '../ai/explainer-scenes';
import { registerLongformHandlers } from './longform-handlers';

const m = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  stat: vi.fn(),
  probe: vi.fn(),
  plan: vi.fn(),
  legacy: vi.fn(),
  render: vi.fn(),
}));
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  stat: m.stat,
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) =>
      m.handlers.set(channel, fn),
  },
}));
vi.mock('../logger', () => ({ log: vi.fn() }));
vi.mock('../ffmpeg', () => ({ getVideoMetadata: m.probe }));
vi.mock('../ai/longform-edit-plan', () => ({ generateLongformEditPlan: m.legacy }));
vi.mock('../ai/longform-scenes', () => ({ generateSceneFirstLongformPlan: m.plan }));
vi.mock('../render/longform-scene-render', () => ({ renderLongformScenePreview: m.render }));
let root: string;
const file = { isFile: () => true };
const metadata = { duration: 15, width: 1920, height: 1080 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function hold(mock: ReturnType<typeof vi.fn>) {
  const entered = deferred<void>(),
    result = deferred<unknown>();
  mock.mockImplementationOnce(() => {
    entered.resolve();
    return result.promise;
  });
  return { ...result, entered: entered.promise };
}
function windowEvent(id: number, iframe = false): IpcMainInvokeEvent {
  const mainFrame = {};
  return {
    sender: { id, mainFrame, isDestroyed: () => false, once: vi.fn(), send: vi.fn() },
    senderFrame: iframe ? {} : mainFrame,
  } as unknown as IpcMainInvokeEvent;
}
function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = m.handlers.get(channel);
  if (!handler) throw new Error(`Unregistered channel: ${channel}`);
  return handler(...args);
}
function preview(requestId = 'first'): LongformScenePreviewRequest {
  const words = Array.from({ length: 30 }, (_, i) => ({
    text: i === 6 ? 'battery' : `word${i}`,
    start: i * 0.5,
    end: i * 0.5 + 0.4,
  }));
  const spec = JSON.parse(`{"kind":"hero","prop":"battery","label":"battery",
    "startWord":4,"endWord":20,"word":6,"layout":"takeover"}`);
  const parsed = parseLongformSceneSpec(spec, words, { clipStart: 0, clipEnd: 15 });
  if (!parsed) throw new Error('Fixture must pass the real scene parser');
  const sceneId = longformSceneId('hero', 4, 20);
  // Exercise the saved JSON trust boundary, not a mock validator or pre-approved runtime scene.
  const plan = JSON.parse(`{
    "mode":"scene-first","schemaVersion":2,"parserVersion":1,"sourceDuration":15,
    "sourceFingerprint":"${longformSourceFingerprint(words, 15)}",
    "blocks":[],"phrases":[],"cards":[],"reasoning":"Offline fixture","generatedAt":1,
    "sections":[{"id":"section-0","startWord":0,"endWord":29,"startTime":0,
      "endTime":15,"status":"planned","diagnostics":[]}],
    "scenes":[{"id":"${sceneId}","kind":"hero","startWord":4,"endWord":20,
      "startTime":${parsed.startTime},"endTime":${parsed.endTime},"sectionId":"section-0",
      "presentation":"full-frame","sourceSpec":${JSON.stringify(spec)},
      "label":"battery","purpose":"Show the spoken battery."}]
  }`);
  return {
    requestId,
    sourceVideoPath: join(root, 'source.mp4'),
    sceneId,
    wordTimestamps: words,
    plan,
  };
}
async function media(): Promise<string> {
  const path = join(await mkdtemp(join(root, 'preview-')), 'preview.mp4');
  await writeFile(path, 'offline media boundary');
  return path;
}
beforeEach(async () => {
  vi.resetAllMocks();
  m.handlers.clear();
  root = await mkdtemp(join(tmpdir(), 'longform-ipc-'));
  m.stat.mockResolvedValue(file);
  m.probe.mockResolvedValue(metadata);
  m.render.mockImplementation(media);
  m.plan.mockResolvedValue(preview().plan);
  registerLongformHandlers();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
it.each([
  'selective',
  'balanced',
  'continuous',
])('forwards edit cadence %s', async (editCadence) => {
  const input = preview();
  await invoke(
    Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN,
    windowEvent(1),
    'offline-key',
    input.wordTimestamps,
    15,
    [],
    { editCadence },
  );
  expect(m.plan).toHaveBeenCalledWith(expect.objectContaining({ editCadence }));
});
it.each([
  'unknown',
  null,
  {},
])('rejects invalid edit cadence %s before planning', async (editCadence) => {
  const input = preview();
  await expect(
    invoke(
      Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN,
      windowEvent(1),
      'offline-key',
      input.wordTimestamps,
      15,
      [],
      { editCadence },
    ),
  ).rejects.toThrow('generation options');
  expect(m.plan).not.toHaveBeenCalled();
});
it('rejects invalid saved cadence before preview', async () => {
  const input = preview();
  Reflect.set(input.plan, 'editCadence', 'unknown');
  await expect(
    invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, windowEvent(1), input),
  ).rejects.toThrow('Invalid long-form preview request');
  expect(m.render).not.toHaveBeenCalled();
});
it.each([
  'ink',
  'polish',
])('forwards the bounded storyboard style %s before generation', async (storyboardStyle) => {
  const input = preview();
  await invoke(
    Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN,
    windowEvent(1),
    'offline-key',
    input.wordTimestamps,
    15,
    [],
    { mode: 'scene-first', storyboardStyle },
  );
  expect(m.plan).toHaveBeenCalledWith(expect.objectContaining({ storyboardStyle }));
});
it.each([
  'editorial',
  'dark',
  {},
  'url(example)',
])('rejects an invalid storyboard style before planning (%s)', async (storyboardStyle) => {
  const input = preview();
  await expect(
    invoke(
      Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN,
      windowEvent(1),
      'offline-key',
      input.wordTimestamps,
      15,
      [],
      { mode: 'scene-first', storyboardStyle },
    ),
  ).rejects.toThrow('generation options');
  expect(m.plan).not.toHaveBeenCalled();
  expect(m.legacy).not.toHaveBeenCalled();
});
it('rejects malformed parser-2 style before preview I/O', async () => {
  const input = preview();
  input.plan.parserVersion = 2;
  Reflect.set(input.plan, 'storyboardStyle', 'terminal');
  await expect(
    invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, windowEvent(1), input),
  ).rejects.toThrow('preview request');
  expect(m.stat).not.toHaveBeenCalled();
  expect(m.render).not.toHaveBeenCalled();
});
it.each([false, true])('preserves the preview sound-cue choice (%s)', async (enabled) => {
  const input = { ...preview(), sceneSfxEnabled: enabled };
  await invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, windowEvent(1), input);
  expect(m.render).toHaveBeenCalledWith(
    expect.objectContaining({ sceneSfxEnabled: enabled }),
    expect.any(AbortSignal),
  );
});
it('rejects an invalid preview sound-cue flag before media work', async () => {
  await expect(
    invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, windowEvent(1), {
      ...preview(),
      sceneSfxEnabled: 'false',
    }),
  ).rejects.toThrow('Invalid long-form preview request');
  expect(m.stat).not.toHaveBeenCalled();
  expect(m.render).not.toHaveBeenCalled();
});
it.each(['stat', 'probe'] as const)('cancels during delayed %s', async (boundary) => {
  const blocked = hold(m[boundary]);
  const event = windowEvent(1);
  const result = invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, event, preview()).catch(
    (error) => error,
  );
  await blocked.entered;
  await invoke(Ch.Invoke.RENDER_CANCEL_LONGFORM_SCENE_PREVIEW, event, 'first');
  blocked.resolve(boundary === 'stat' ? file : metadata);
  expect(await result).toBeInstanceOf(Error);
  expect(m.render).not.toHaveBeenCalled();
  if (boundary === 'stat') expect(m.probe).not.toHaveBeenCalled();
});
it.each(['preview', 'planning'] as const)('isolates %s ownership and queue', async (kind) => {
  const event = windowEvent(1),
    other = windowEvent(2),
    input = preview();
  const work = kind === 'preview' ? m.render : m.plan;
  const cancel =
    kind === 'preview'
      ? Ch.Invoke.RENDER_CANCEL_LONGFORM_SCENE_PREVIEW
      : Ch.Invoke.AI_CANCEL_LONGFORM_EDIT_PLAN;
  const args = (id: string) => ['offline-key', input.wordTimestamps, 15, [], { requestId: id }];
  const launch = (id: string) =>
    kind === 'preview'
      ? invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, event, preview(id))
      : invoke(Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN, event, ...args(id));
  const first = hold(work),
    second = hold(work);
  const old = launch('old').catch((error) => error);
  await first.entered;
  const signal = (i: number): AbortSignal =>
    kind === 'preview' ? work.mock.calls[i][1] : work.mock.calls[i][0].signal;
  const newer = launch('new');
  expect(signal(0).aborted).toBe(true);
  await expect(launch('third')).rejects.toThrow('still stopping');
  expect(work).toHaveBeenCalledTimes(1);
  const oldValue = kind === 'preview' ? await media() : input.plan;
  first.resolve(oldValue);
  await second.entered;
  expect(await old).toBeInstanceOf(Error);
  await invoke(cancel, event, 'old');
  await invoke(cancel, other, 'new');
  expect(signal(1).aborted).toBe(false);
  const newValue = kind === 'preview' ? await media() : input.plan;
  second.resolve(newValue);
  await expect(newer).resolves.toEqual(newValue);
  expect(work).toHaveBeenCalledTimes(2);
  if (typeof oldValue === 'string')
    await expect(access(dirname(oldValue))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('rejects a slow old probe without letting it render or cancel the queued replacement', async () => {
  const blocked = hold(m.probe),
    event = windowEvent(1);
  const old = invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, event, preview('old')).catch(
    (error) => error,
  );
  await blocked.entered;
  const newer = invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, event, preview('new'));
  await invoke(Ch.Invoke.RENDER_CANCEL_LONGFORM_SCENE_PREVIEW, event, 'old');
  blocked.resolve(metadata);
  expect(await old).toBeInstanceOf(Error);
  await expect(newer).resolves.toEqual(expect.any(String));
  expect(m.render).toHaveBeenCalledTimes(1);
  expect(m.render.mock.calls[0][0].requestId).toBe('new');
  expect(m.render.mock.calls[0][1].aborted).toBe(false);
});
it('only the owning window can remove its preview file and empty directory', async () => {
  const owner = windowEvent(1);
  const path = (await invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, owner, preview())) as string;
  await invoke(Ch.Invoke.RENDER_CLEANUP_LONGFORM_SCENE_PREVIEW, windowEvent(2), path);
  await expect(access(path)).resolves.toBeUndefined();
  await invoke(Ch.Invoke.RENDER_CLEANUP_LONGFORM_SCENE_PREVIEW, owner, path);
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(access(dirname(path))).rejects.toMatchObject({ code: 'ENOENT' });
});
const custom = {
  id: 'owned-custom',
  name: 'Custom',
  builtin: false,
  background: '#123456',
  foreground: '#abcdef',
  accent: '#123ABC',
};
it('forwards the validated custom palette to the renderer', async () => {
  const input = { ...preview(), paletteId: custom.id, customPalettes: [custom] };
  await invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, windowEvent(1), input);
  expect(m.render).toHaveBeenCalledWith(
    expect.objectContaining({ paletteId: custom.id, customPalettes: [custom] }),
    expect.any(AbortSignal),
  );
});
it.each([
  'unknown palette',
  'invalid hex',
  'version',
  'schema',
  'fingerprint',
  'source spec',
  'source path',
] as const)('rejects %s before I/O or paid work', async (change) => {
  const input = preview();
  if (change === 'unknown palette') input.paletteId = 'missing';
  if (change === 'invalid hex') {
    input.paletteId = custom.id;
    input.customPalettes = [{ ...custom, accent: 'url(evil)' }];
  }
  if (change === 'version') Reflect.set(input.plan, 'parserVersion', 99);
  if (change === 'schema') Reflect.set(input.plan, 'schemaVersion', 99);
  if (change === 'fingerprint') input.wordTimestamps[6].text = 'changed';
  if (change === 'source spec') input.plan.scenes[0].sourceSpec.kind = 'unknown-scene';
  if (change === 'source path') input.sourceVideoPath = 'relative.mp4';
  await expect(
    invoke(Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW, windowEvent(1), input),
  ).rejects.toThrow();
  expect(m.stat).not.toHaveBeenCalled();
  expect(m.probe).not.toHaveBeenCalled();
  expect(m.render).not.toHaveBeenCalled();
  expect(m.plan).not.toHaveBeenCalled();
  expect(m.legacy).not.toHaveBeenCalled();
});
it('denies iframe invocation on every registered channel before work', async () => {
  expect(m.handlers.size).toBe(5);
  for (const channel of m.handlers.keys())
    await expect(invoke(channel, windowEvent(1, true), preview())).rejects.toThrow(
      'application window',
    );
  expect(m.stat).not.toHaveBeenCalled();
  expect(m.render).not.toHaveBeenCalled();
  expect(m.plan).not.toHaveBeenCalled();
});
