import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { expect, test, vi } from 'vitest';
import { summarizeUsage } from '../../src/main/ai/explainer/recent-usage';
import { parseCorpus } from '../../src/main/ai/planner-eval/corpus';
import {
  type EvaluationOptions,
  runEvaluation,
  runTrial,
} from '../../src/main/ai/planner-eval/runner';
import { getVideoMetadata, setupFFmpeg } from '../../src/main/ffmpeg';
import { plannerInputFingerprint } from '../../src/main/render/explainer-scenes';
import {
  beginRenderBatch,
  type RenderedLayoutWindow,
  startBatchRender,
} from '../../src/main/render/pipeline';
import type { RenderBatchOptions } from '../../src/main/render/types';
import { Ch } from '../../src/shared/ipc-channels';
import { assignArchetypesDeterministic, splitIntoSegments } from '../../src/shared/segments';

const paid = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('Paid provider forbidden in saved-plan preview');
  }),
);
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      paid();
    }
  },
  ThinkingLevel: { LOW: 'LOW', HIGH: 'HIGH', MINIMAL: 'MINIMAL', MEDIUM: 'MEDIUM' },
}));
vi.mock('../../src/main/ai/gemini-client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  callGeminiWithRetry: paid,
}));
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => tmpdir() },
}));
const localFetch = globalThis.fetch;
vi.stubGlobal('fetch', (...args: Parameters<typeof fetch>) => {
  const [input] = args;
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error('External network forbidden in saved-plan preview');
  return localFetch(...args);
});
// Infrastructure adapter only: production rendering consumes the immutable built snapshot.
vi.mock('@remotion/bundler', () => ({
  bundle: async () => {
    const raw = process.env.PLANNER_EVAL_RENDER;
    if (!raw) throw new Error('Missing render configuration');
    return JSON.parse(raw).bundle;
  },
}));

test('saved complete plan through production timeline, captions, SFX and encoding', async () => {
  const raw = process.env.PLANNER_EVAL_RENDER;
  if (!raw || raw.length > 16_384) throw new Error('Use render-finalists.mjs');
  const config: unknown = JSON.parse(raw);
  if (!config || typeof config !== 'object') throw new Error('Invalid render configuration');
  const c = config as Record<string, unknown>;
  for (const key of [
    'directory',
    'output',
    'corpus',
    'media',
    'bundle',
    'trial',
    'codeFingerprint',
  ])
    if (typeof c[key] !== 'string') throw new Error('Invalid render configuration');
  const directory = String(c.directory),
    output = String(c.output);
  if (readFileSync(join(output, '.planner-eval-owner'), 'utf8') !== 'planner-eval-v1')
    throw new Error('Unowned output directory');
  const corpus = parseCorpus(readFileSync(String(c.corpus), 'utf8'));
  if (!corpus.ok) throw new Error(corpus.error);
  if (c.fixture !== undefined && c.fixture !== 'authored-responses-v1')
    throw new Error('Invalid authored fixture');
  for (const key of ['model', 'codexExecutable', 'executableSha256', 'reasoning'])
    if (c[key] !== undefined && typeof c[key] !== 'string')
      throw new Error('Invalid saved identity');
  if (c.autoReloadDisabled !== undefined && typeof c.autoReloadDisabled !== 'boolean')
    throw new Error('Invalid saved identity');
  if (
    c.transport !== undefined &&
    c.transport !== 'gg-chatgpt' &&
    c.transport !== 'codex-subscription'
  )
    throw new Error('Invalid saved transport');
  const replayOptions: EvaluationOptions = {
    mode: 'replay',
    corpus: corpus.value,
    directory,
    codeFingerprint: String(c.codeFingerprint),
    fixture: c.fixture,
    transport: c.transport,
    model: typeof c.model === 'string' ? c.model : undefined,
    codexExecutable: typeof c.codexExecutable === 'string' ? c.codexExecutable : undefined,
    executableSha256: typeof c.executableSha256 === 'string' ? c.executableSha256 : undefined,
    reasoning: typeof c.reasoning === 'string' ? c.reasoning : undefined,
    autoReloadDisabled:
      typeof c.autoReloadDisabled === 'boolean' ? c.autoReloadDisabled : undefined,
  };
  const report = await runEvaluation(replayOptions);
  const spec = report.schedule.find((trial) => trial.id === c.trial);
  if (!spec) throw new Error('No matching scheduled trial');
  const trial = await runTrial(replayOptions, spec);
  if (!trial.result?.ok || trial.status !== 'completed')
    throw new Error('No matching completed saved plan');
  const clip = corpus.value.clips.find((clip) => clip.id === spec.clipId);
  if (!clip) throw new Error('Missing corpus clip');
  const bounds = {
    minStart: clip.bounds.start + Math.max(1.5, clip.hookLeadSec ?? 0),
    maxEnd: clip.bounds.end,
  };
  const split = splitIntoSegments(
    clip.id,
    clip.words.map((word) => ({ ...word })),
  );
  const first = split[0],
    last = split[split.length - 1];
  if (!first || !last) throw new Error('No source segments');
  first.startTime = clip.bounds.start;
  last.endTime = clip.bounds.end;
  const segments = assignArchetypesDeterministic(
    split,
    false,
    spec.profileId === 'baseline-policy-codex-v1' ? 'baseline' : 'content-led',
  );
  const options: RenderBatchOptions = {
    jobs: [
      {
        clipId: clip.id,
        sourceVideoPath: String(c.media),
        startTime: clip.bounds.start,
        endTime: clip.bounds.end,
        outputFileName: 'preview',
        wordTimestamps: clip.words.map((word) => ({ ...word })),
        hookTitleText: clip.hookLeadSec
          ? clip.words
              .slice(0, 4)
              .map((word) => word.text)
              .join(' ')
          : undefined,
        segmentedSegments: segments.map((segment, index) => ({
          id: `${clip.id}-${index}`,
          startTime: segment.startTime,
          endTime: segment.endTime,
          archetype: segment.archetype,
          captionText: segment.captionText,
          zoomStyle: 'none',
          zoomIntensity: 1,
          transitionIn: 'hard-cut',
        })),
      },
    ],
    outputDirectory: output,
    explainerScenesEnabled: true,
    captionsEnabled: true,
    sceneSfxEnabled: true,
    shotTransitionsEnabled: false,
    captionStyle: { captionMode: 'editorial', fontSize: 0.042, wordsPerLine: 5 },
    renderConcurrency: 1,
    hookTitleOverlay: {
      enabled: !!clip.hookLeadSec,
      displayDuration: clip.hookLeadSec ?? 0,
      style: 'centered-bold',
      fadeIn: 0.15,
      fadeOut: 0.15,
      fontSize: 72,
      textColor: '#FFFFFF',
      outlineColor: '#000000',
      outlineWidth: 3,
    },
  };
  let completed = false;
  const failures: unknown[] = [];
  let renderedChoices: unknown = [];
  let renderedTimeline: RenderedLayoutWindow[] = [];
  const events: unknown[] = [];
  const window = {
    webContents: {
      send: (channel: string, payload: unknown) => {
        if (channel === Ch.Send.RENDER_CLIP_DONE) completed = true;
        if (channel === Ch.Send.RENDER_CLIP_ERROR) failures.push(payload);
        if (channel === Ch.Send.RENDER_BATCH_DONE) events.push({ channel, payload });
      },
    },
  } as unknown as BrowserWindow;
  setupFFmpeg();
  beginRenderBatch();
  await startBatchRender(options, window, undefined, {
    noAi: true,
    signal: AbortSignal.timeout(18 * 60 * 1000),
    plans: new Map([
      [
        clip.id,
        { plan: trial.result.value, wordsHash: plannerInputFingerprint(clip.words, bounds) },
      ],
    ]),
    onDiagnostic: (event) => events.push(event),
    onRendered: (_clipId, choices, timeline) => {
      renderedChoices = choices;
      renderedTimeline = timeline;
    },
  });
  expect(paid).not.toHaveBeenCalled();
  expect(failures).toEqual([]);
  expect(completed).toBe(true);
  expect(renderedChoices).toEqual(summarizeUsage(trial.result.value.scenes));
  const metadata = await getVideoMetadata(join(output, 'preview.mp4'));
  expect(metadata.width).toBe(1080);
  expect(metadata.height).toBe(1920);
  expect(metadata.fps).toBe(30);
  expect(Math.abs(metadata.duration - (clip.bounds.end - clip.bounds.start))).toBeLessThanOrEqual(
    0.12,
  );
  writeFileSync(
    join(output, 'render-proof.json'),
    JSON.stringify(
      {
        version: 1,
        trialId: spec.id,
        profileId: spec.profileId,
        provenance: clip.provenance,
        planningSource: 'Saved complete plan; see trial artifact for generation provenance.',
        metadata,
        renderedChoices,
        renderedTimeline,
        renderedQuoteCount: renderedTimeline.filter(
          (window) => window.archetype === 'fullscreen-quote',
        ).length,
        windows: [...trial.result.value.scenes, ...trial.result.value.quotes].map((window) => ({
          startTime: window.startTime - clip.bounds.start,
          endTime: window.endTime - clip.bounds.start,
        })),
        events,
        paidProviderCalls: paid.mock.calls.length,
        bundle: String(c.bundle),
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
});
