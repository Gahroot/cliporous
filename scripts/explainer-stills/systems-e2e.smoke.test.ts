import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { expect, it, vi } from 'vitest';
import {
  type PlannedExplainerScene,
  type PlannerWord,
  parseExplainerPlan,
  parsePlanWithDiagnostics,
  parsePlanWithRejections,
} from '../../src/main/ai/explainer-scenes';
import { buildCaptionASSDocument } from '../../src/main/captions';
import { disableGpuEncoderForSession } from '../../src/main/ffmpeg';
import { buildArchetypeLayout } from '../../src/main/layouts/segment-layouts';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import {
  CONCEPT_SCENE_KINDS,
  collectSceneTimes,
  type ExplainerAspect,
  mapSceneTimes,
  stageCanvasFor,
} from '../../src/main/remotion/compositions/explainer/types';
import { fitGroupsToSpeakerRanges } from '../../src/main/render/explainer-longform';
import {
  buildGroupRenderPlan,
  groupPlannedScenes,
  spliceExplainerScenes,
} from '../../src/main/render/explainer-scenes';
import { buildASSFilter } from '../../src/main/render/helpers';
import { compositePhraseOverlays } from '../../src/main/render/longform-encode';
import { buildSfxMixArgs, planSceneSfx } from '../../src/main/render/scene-sfx';
import type { ResolvedSegment } from '../../src/main/render/segment-render';
import {
  conceptChainFixture,
  conceptFixtures,
  conceptWords,
  offsetConceptWords,
  parseConceptFixture,
} from './concept-e2e.fixture';
import { bundleDigest, digest, openLocalBrowser } from './harness-runtime.mjs';
import {
  bounds,
  fps,
  rawPlan,
  sourceWords,
  syntheticFace,
  technologyFixtures,
  words,
} from './systems-e2e.fixture';
import { CONFIG, currentBundleEvidence, ROOT, runBounded, VITEST } from './verify-systems-e2e.mjs';

// Runtime adapter only. No production parser, renderer, layout, caption or audio mocks.
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => tmpdir() },
}));

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static') as string;
const ffprobe = (require('@ffprobe-installer/ffprobe') as { path: string }).path;
const mode = process.env.SYSTEMS_E2E_MODE;
const out = process.env.SYSTEMS_E2E_OUT;
if (!out || readFileSync(join(out, '.owner'), 'utf8') !== process.env.SYSTEMS_E2E_OWNER) {
  throw new Error(
    'Launch through verify-systems-e2e.mjs (fresh owned temporary directory required).',
  );
}
const outputDir = out;
const json = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const encode = [
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
];
const ff = (args: string[]) =>
  runBounded(ffmpeg, ['-hide_banner', '-y', ...args], { timeoutMs: 180_000 });

function planningProof() {
  const planned = parseExplainerPlan(rawPlan, words, bounds, {});
  expect(
    planned.map((p) => p.scene.kind),
    JSON.stringify(parsePlanWithRejections(rawPlan, words, bounds)),
  ).toEqual(['bottleneck', 'keystone']);
  expect(planned[1].chained).toBe(true);
  const groups = groupPlannedScenes(planned);
  expect(groups).toHaveLength(1);
  const group = groups[0];
  const speaker: ResolvedSegment = {
    startTime: bounds.minStart,
    endTime: bounds.maxEnd,
    archetype: 'talking-head',
    zoom: { style: 'none', intensity: 1 },
    transitionIn: 'hard-cut',
  };
  const pieces = spliceExplainerScenes([speaker], groups, bounds.minStart);
  const piece = pieces.find((p) => p.group);
  expect(piece?.segment).toMatchObject({ archetype: 'split-image', explainerLayout: 'stack' });
  if (!piece?.group) throw new Error('Production splice did not produce a scene segment');
  const window = { startTime: piece.segment.startTime, endTime: piece.segment.endTime };
  expect(window.startTime).toBeGreaterThan(8);
  const palette = deriveExplainerPalette();
  const plan = buildGroupRenderPlan(group, window, palette);
  let sequenceFrame = 0;
  plan.props.scenes.forEach((item, i) => {
    const absolute = collectSceneTimes(planned[i].scene);
    collectSceneTimes(item.scene).forEach((at, n) => {
      expect(at + window.startTime + sequenceFrame / fps).toBeCloseTo(absolute[n], 5);
    });
    sequenceFrame += item.durationInFrames - (plan.props.transitions[i]?.durationInFrames ?? 0);
  });
  expect(sequenceFrame).toBe(Math.round(plan.durationSec * fps));
  expect(plan.cues.map((cue) => cue.at)).toEqual(
    [...plan.cues.map((cue) => cue.at)].sort((a, b) => a - b),
  );
  const gapped = [
    { ...speaker, endTime: 12 },
    { ...speaker, startTime: 14 },
  ];
  const skipped = spliceExplainerScenes(gapped, groups, bounds.minStart);
  expect(skipped.map((p) => p.segment)).toEqual(gapped);
  expect(skipped.every((p) => !p.group)).toBe(true);
  expect(
    fitGroupsToSpeakerRanges(groups, [
      { start: 8, end: 12 },
      { start: 14, end: 25 },
    ]),
  ).toEqual([]);
  const landscape = fitGroupsToSpeakerRanges(groups, [{ start: 8, end: 25 }]);
  expect(landscape).toHaveLength(1);
  expect(landscape[0].layout).toBe('over');
  expect(stageCanvasFor('stack', '9:16')).toMatchObject({ width: 1080, height: 960 });
  expect(stageCanvasFor('over', '16:9')).toEqual({ width: 1920, height: 1080, transparent: true });
  for (const [frameWidth, frameHeight] of [
    [1080, 1920],
    [1920, 1080],
  ]) {
    const ass = buildCaptionASSDocument(
      words.map((w) => ({
        ...w,
        start: w.start - window.startTime,
        end: w.end - window.startTime,
      })),
      { captionMode: 'editorial', fontSize: 0.045, wordsPerLine: 4 },
      { frameWidth, frameHeight },
    );
    expect(ass).toContain('Style: Editorial,Instrument Serif');
    expect(ass).toContain(`PlayResX: ${frameWidth}`);
    expect(ass).toContain(`PlayResY: ${frameHeight}`);
  }
  const placements = planSceneSfx(
    plan.cues.map((cue) => ({ ...cue, at: cue.at - window.startTime })),
    { clipDuration: plan.durationSec },
  );
  expect(placements.length).toBeGreaterThan(2);
  for (const placement of placements)
    expect(existsSync(join(ROOT, 'resources/sfx/scene', placement.file))).toBe(true);
  const layout = buildArchetypeLayout('split-image', {
    width: 1080,
    height: 1920,
    segmentDuration: plan.durationSec,
    fps,
    mediaPath: 'stage.mp4',
    sourceWidth: 1920,
    sourceHeight: 1080,
    explainerLayout: 'stack',
  });
  expect(layout.inputCount).toBe(2);
  expect(layout.filterComplex).toContain('[outv]');
  json(join(outputDir, 'planning.json'), {
    rawPlan,
    words,
    planned,
    pieces,
    plan,
    landscape,
    placements,
    layout,
  });
  return { group, window, palette, landscape: landscape[0], planned, words };
}

function technologyPlanningProof() {
  const results = new Map<string, ReturnType<typeof planningProof>>();
  const fixtures = technologyFixtures();
  expect(fixtures).toHaveLength(15);
  for (const fixture of fixtures) {
    const words = sourceWords(fixture).map((word) => ({
      ...word,
      start: word.start + 30,
      end: word.end + 30,
    }));
    expect(words.map((word) => word.text).join(' ')).toBe(fixture.sourceText);
    const raw = { scenes: [{ ...fixture.raw, layout: 'stack' }] };
    const planned = parseExplainerPlan(raw, words, { minStart: 0, maxEnd: 90 }, {});
    expect(
      planned,
      JSON.stringify(parsePlanWithRejections(raw, words, { minStart: 0, maxEnd: 90 })),
    ).toHaveLength(1);
    expect(planned[0].scene).toMatchObject({
      kind: fixture.scene.kind,
      preset: fixture.scene.preset,
    });
    expect(collectSceneTimes(planned[0].scene)).toHaveLength(5);
    const groups = groupPlannedScenes(planned);
    expect(groups).toHaveLength(1);
    const group = groups[0];
    const pieces = spliceExplainerScenes(
      [
        {
          startTime: 0,
          endTime: 90,
          archetype: 'talking-head',
          zoom: { style: 'none', intensity: 1 },
          transitionIn: 'hard-cut',
        },
      ],
      groups,
      0,
    );
    const piece = pieces.find((p) => p.group);
    if (!piece?.group) throw new Error(`${fixture.name}: no production splice`);
    const window = { startTime: piece.segment.startTime, endTime: piece.segment.endTime };
    const palette = deriveExplainerPalette();
    const landscape = fitGroupsToSpeakerRanges(groups, [{ start: 0, end: 90 }]);
    expect(landscape).toHaveLength(1);
    expect(landscape[0].layout).toBe('over');
    expect(
      fitGroupsToSpeakerRanges(groups, [
        { start: 0, end: 31 },
        { start: 33, end: 90 },
      ]),
    ).toEqual([]);
    for (const aspect of ['9:16', '16:9'] as const) {
      const plan = buildGroupRenderPlan(
        aspect === '9:16' ? group : landscape[0],
        window,
        palette,
        aspect,
      );
      const absolute = collectSceneTimes(planned[0].scene);
      collectSceneTimes(plan.props.scenes[0].scene).forEach((at, i) => {
        expect(at + window.startTime).toBeCloseTo(absolute[i], 3);
      });
      const placements = planSceneSfx(
        plan.cues.map((cue) => ({ ...cue, at: cue.at - window.startTime })),
        { clipDuration: plan.durationSec },
      );
      // Single technology scenes use the existing restrained SFX policy (including thump spacing).
      expect(placements.length).toBeGreaterThanOrEqual(2);
      for (const placement of placements)
        expect(existsSync(join(ROOT, 'resources/sfx/scene', placement.file))).toBe(true);
      const ass = buildCaptionASSDocument(
        words.map((word) => ({
          ...word,
          start: word.start - window.startTime,
          end: word.end - window.startTime,
        })),
        { captionMode: 'editorial', fontSize: 0.045, wordsPerLine: 4 },
        {
          frameWidth: aspect === '9:16' ? 1080 : 1920,
          frameHeight: aspect === '9:16' ? 1920 : 1080,
        },
      );
      expect(ass).toContain('Style: Editorial,Instrument Serif');
      expect(ass).toContain('Dialogue:');
    }
    results.set(fixture.name, { group, window, palette, landscape: landscape[0], planned, words });
  }
  json(join(outputDir, 'technology-planning.json'), Object.fromEntries(results));
  const portrait = results.get('agent-workflow-tool-retry');
  const landscape = results.get('software-release-parallel-release');
  if (!portrait || !landscape) throw new Error('Missing representative technology fixtures');
  return { portrait, landscape };
}

/** Both production render-plan paths, including inward-snap and source-gap rejection. */
function conceptPathProof(planned: PlannedExplainerScene[], words: PlannerWord[]) {
  const groups = groupPlannedScenes(planned);
  expect(groups).toHaveLength(1);
  const original = groups[0];
  const speaker = (startTime: number, endTime: number): ResolvedSegment => ({
    startTime,
    endTime,
    archetype: 'talking-head',
    transitionIn: 'hard-cut',
    zoom: { style: 'none', intensity: 1 },
  });
  const pieces = spliceExplainerScenes(
    [
      speaker(0, original.startTime + 0.2),
      speaker(original.startTime + 0.2, original.endTime - 0.2),
      speaker(original.endTime - 0.2, original.endTime + 10),
    ],
    groups,
    0,
  );
  const piece = pieces.find((entry) => entry.group);
  if (!piece?.group) throw new Error('Concept chain lost in production short-form splice');
  expect(piece.segment).toMatchObject({
    startTime: original.startTime,
    endTime: original.endTime,
    archetype: 'split-image',
    explainerLayout: 'stack',
  });
  const group = piece.group;
  const window = { startTime: piece.segment.startTime, endTime: piece.segment.endTime };
  const gap = original.startTime + 1;
  const gapped = [speaker(0, gap), speaker(gap + 1, original.endTime + 10)];
  expect(spliceExplainerScenes(gapped, groups, 0)).toEqual(gapped.map((segment) => ({ segment })));
  for (const ranges of [
    [{ start: original.startTime + 0.1, end: original.endTime + 10 }],
    [{ start: 0, end: original.endTime - 0.1 }],
    [
      { start: 0, end: gap },
      { start: gap + 1, end: original.endTime + 10 },
    ],
  ])
    expect(fitGroupsToSpeakerRanges(groups, ranges)).toEqual([]);
  const landscape = fitGroupsToSpeakerRanges(groups, [{ start: 0, end: original.endTime + 10 }]);
  expect(landscape).toHaveLength(1);
  expect(landscape[0].layout).toBe('over');
  const palette = deriveExplainerPalette();
  const plans = (['9:16', '16:9'] as const).map((aspect) => {
    const plan = buildGroupRenderPlan(
      aspect === '9:16' ? group : landscape[0],
      window,
      palette,
      aspect,
    );
    expect(plan.props.aspect).toBe(aspect);
    expect(plan.props.visibleSec).toBeCloseTo(window.endTime - window.startTime, 8);
    expect(plan.props.scenes).toHaveLength(planned.length);
    expect(plan.props.transitions).toHaveLength(planned.length - 1);
    let frame = 0;
    plan.props.scenes.forEach((item, i) => {
      const absolute = collectSceneTimes(planned[i].scene);
      const relative = collectSceneTimes(item.scene);
      expect(relative).toHaveLength(absolute.length);
      expect(relative.length).toBeGreaterThanOrEqual(5);
      relative.forEach((at, n) => {
        // TransitionSeries rounds scene starts to frames; the source beats must stay within one frame.
        expect(Math.abs(at + window.startTime + frame / fps - absolute[n])).toBeLessThan(1 / fps);
      });
      frame += item.durationInFrames - (plan.props.transitions[i]?.durationInFrames ?? 0);
    });
    expect(frame).toBe(Math.round(plan.durationSec * fps));
    expect(plan.cues).toEqual(
      [
        ...planned.flatMap((scene) => scene.cues),
        { kind: 'whoosh', at: window.startTime + 0.02, gain: 0.45 },
      ].sort((a, b) => a.at - b.at),
    );
    const placements = planSceneSfx(
      plan.cues.map((cue) => ({ ...cue, at: cue.at - window.startTime })),
      { clipDuration: plan.durationSec },
    );
    expect(placements.length).toBeGreaterThan(0);
    for (const placement of placements)
      expect(existsSync(join(ROOT, 'resources/sfx/scene', placement.file))).toBe(true);
    const captions = buildCaptionASSDocument(
      words.map((word) => ({
        ...word,
        start: word.start - window.startTime,
        end: word.end - window.startTime,
      })),
      { captionMode: 'editorial', fontSize: 0.045, wordsPerLine: 4 },
      {
        frameWidth: aspect === '9:16' ? 1080 : 1920,
        frameHeight: aspect === '9:16' ? 1920 : 1080,
        layoutWindows: [{ startTime: 0, endTime: plan.durationSec, layout: plan.props.layout }],
      },
    );
    expect(captions).toContain('Style: Editorial,Instrument Serif');
    expect(captions).toContain('Dialogue:');
    return { aspect, plan, placements, captionHash: digest(captions) };
  });
  return { group, window, palette, landscape: landscape[0], planned, words, plans };
}

function offsetConceptPlan(planned: PlannedExplainerScene, offset: number): PlannedExplainerScene {
  return {
    ...planned,
    startTime: planned.startTime + offset,
    endTime: planned.endTime + offset,
    scene: mapSceneTimes(planned.scene, (at) => at + offset),
    cues: planned.cues.map((cue) => ({ ...cue, at: cue.at + offset })),
  };
}

function conceptPlanningProof() {
  const fixtures = conceptFixtures();
  expect(fixtures).toHaveLength(42);
  expect(CONCEPT_SCENE_KINDS).toHaveLength(18);
  expect(new Set(fixtures.map(({ scene }) => scene.kind))).toEqual(new Set(CONCEPT_SCENE_KINDS));
  const results = fixtures.map((fixture) => {
    const original = parseConceptFixture(fixture);
    expect(() =>
      parseConceptFixture({
        ...fixture,
        plannerInput: { ...fixture.plannerInput, preset: 'not-an-authored-preset' },
      }),
    ).toThrow();
    expect(() =>
      parseConceptFixture({
        ...fixture,
        plannerInput: { ...fixture.plannerInput, resolveWord: fixture.plannerInput.setupWord },
      }),
    ).toThrow();
    const shifted = offsetConceptPlan(original, 30);
    const words = conceptWords(fixture).map((word) => ({
      ...word,
      start: word.start + 30,
      end: word.end + 30,
    }));
    return {
      name: fixture.name,
      pack: fixture.pack,
      inputHash: digest(fixture),
      ...conceptPathProof([shifted], words),
    };
  });
  // Prove nested evidence indices move but source quantities/target indices do not.
  expect(
    offsetConceptWords({ word: 2, evidence: { fromWord: 1, toWord: 3 }, amount: 12, target: 0 }, 7),
  ).toEqual({ word: 9, evidence: { fromWord: 8, toWord: 10 }, amount: 12, target: 0 });
  const chain = conceptChainFixture(fixtures);
  const diagnostics = parsePlanWithDiagnostics(chain.raw, chain.words, chain.bounds);
  const planned = parseExplainerPlan(chain.raw, chain.words, chain.bounds, {});
  expect(diagnostics.rejected).toEqual([]);
  expect(diagnostics.omitted).toEqual([]);
  expect(
    planned.map(({ scene }) => `${scene.kind}/${'preset' in scene ? scene.preset : ''}`),
  ).toEqual(chain.keys);
  expect(planned.map(({ chained }) => chained)).toEqual([false, true, true]);
  const representative = conceptPathProof(
    planned.map((scene) => offsetConceptPlan(scene, 30)),
    chain.words.map((word) => ({ ...word, start: word.start + 30, end: word.end + 30 })),
  );
  json(join(outputDir, 'concept-planning.json'), {
    fixtureParser:
      'parseExplainerPlan with conceptFixtureWords; 55% coverage and 12s guards unchanged',
    fixtures: results,
    representative: { ...chain, ...representative, parser: 'parseExplainerPlan', sourceOffset: 30 },
  });
  return { portrait: representative, landscape: representative };
}

async function childLifecycleProof() {
  const controller = new AbortController();
  let cancelledPid = 0;
  let progressSeen = false;
  await expect(
    runBounded(
      ffmpeg,
      [
        '-hide_banner',
        '-re',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=220:sample_rate=48000',
        '-t',
        '60',
        '-progress',
        'pipe:1',
        '-f',
        'null',
        '-',
      ],
      {
        timeoutMs: 10_000,
        signal: controller.signal,
        onSpawn: (pid: number) => {
          cancelledPid = pid;
        },
        onStdout: (chunk: Buffer) => {
          if (chunk.toString().includes('progress=')) {
            progressSeen = true;
            controller.abort();
          }
        },
      },
    ),
  ).rejects.toThrow(/aborted/);
  expect(progressSeen).toBe(true);
  expect(cancelledPid).toBeGreaterThan(0);
  expect(() => process.kill(cancelledPid, 0)).toThrow();
  let failedPid = 0;
  await expect(
    runBounded(ffmpeg, ['-i', join(outputDir, 'missing-render.mov'), '-f', 'null', '-'], {
      timeoutMs: 10_000,
      onSpawn: (pid: number) => {
        failedPid = pid;
      },
    }),
  ).rejects.toThrow(/No such file|not found/i);
  expect(failedPid).toBeGreaterThan(0);
  expect(() => process.kill(failedPid, 0)).toThrow();
  return { progressSeen, cancelledChildClosed: true, missingInputChildClosed: true };
}

interface Probe {
  streams: {
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    pix_fmt?: string;
    avg_frame_rate?: string;
    sample_rate?: string;
    duration?: string;
  }[];
  format: { duration: string };
}
async function probe(path: string): Promise<Probe> {
  const result = await runBounded(
    ffprobe,
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path],
    { timeoutMs: 30_000 },
  );
  return JSON.parse(result.stdout.toString()) as Probe;
}
async function pixels(path: string, at: number, filter = 'format=gray') {
  return (
    await ff([
      '-ss',
      String(at),
      '-i',
      path,
      '-frames:v',
      '1',
      '-vf',
      filter,
      '-f',
      'rawvideo',
      'pipe:1',
    ])
  ).stdout;
}
async function audio(path: string) {
  return (await ff(['-i', path, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1']))
    .stdout;
}
function rms(pcm: Buffer, start: number, duration: number) {
  const from = Math.round(start * 48000);
  const to = Math.min(pcm.length / 4, Math.round((start + duration) * 48000));
  let sum = 0;
  for (let i = from; i < to; i++) sum += pcm.readFloatLE(i * 4) ** 2;
  return Math.sqrt(sum / (to - from));
}

// This real helper has no cancellation handle. Run it in a bounded worker, not a mock.
// On interruption the CLI's owned process group also reaps its FFmpeg descendants.
it.skipIf(mode !== 'composite')('production landscape compositor worker', async () => {
  const job = JSON.parse(readFileSync(join(outputDir, 'composite-job.json'), 'utf8'));
  disableGpuEncoderForSession();
  await compositePhraseOverlays(job);
});

it.skipIf(mode === 'composite')('local systems pipeline smoke', async () => {
  const report: Record<string, unknown> = {
    schemaVersion: 1,
    mode,
    status: 'running',
    startedAt: new Date().toISOString(),
    source: { synthetic: true, humanData: false, faceRegion: syntheticFace },
    runtime: {
      node: process.version,
      platform: process.platform,
      gl: 'angle',
      encoder: 'libx264',
    },
    limits: [
      'Not an app cancelRender test: Remotion and child-process cancellation are harness-owned.',
      'Production landscape compositor retains its hwaccel=auto decode option; encoding is forced software.',
      'No perceptual approval or cross-machine pixel determinism implied.',
    ],
    outputs: [],
  };
  const save = () => json(join(outputDir, 'report.json'), report);
  save();
  try {
    const fixture = planningProof();
    report.planning = {
      chainedScenes: 2,
      absoluteBeatsPreserved: true,
      sourceGapsRejected: true,
      speakerRangesOnly: true,
    };
    const scenarios: Record<string, { portrait: typeof fixture; landscape: typeof fixture }> = {};
    if (process.env.SYSTEMS_E2E_TECHNOLOGY === '1')
      scenarios.technology = technologyPlanningProof();
    if (process.env.SYSTEMS_E2E_CONCEPTS === '1') scenarios.concepts = conceptPlanningProof();
    if (Object.keys(scenarios).length === 0)
      scenarios.systems = { portrait: fixture, landscape: fixture };
    const describe = (value: { portrait: typeof fixture; landscape: typeof fixture }) =>
      Object.fromEntries(
        Object.entries(value).map(([aspect, fixture]) => [
          aspect,
          fixture.planned.map((p) => p.scene),
        ]),
      );
    const entries = Object.entries(scenarios);
    report.scenarios =
      entries.length === 1
        ? describe(entries[0][1])
        : Object.fromEntries(entries.map(([name, value]) => [name, describe(value)]));
    if (scenarios.concepts) report.concepts = { presets: 42, kinds: 18, chainedScenes: 3 };
    report.childLifecycle = await childLifecycleProof();
    if (mode === 'render')
      for (const [name, value] of entries)
        await renderProof(
          value,
          report,
          save,
          entries.length === 1 ? outputDir : join(outputDir, name),
        );
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error instanceof Error ? error.stack : String(error);
    throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    save();
  }
});

async function renderProof(
  fixtures: {
    portrait: ReturnType<typeof planningProof>;
    landscape: ReturnType<typeof planningProof>;
  },
  report: Record<string, unknown>,
  save: () => void,
  artifactRoot = outputDir,
) {
  const serveUrl = process.env.SYSTEMS_E2E_BUNDLE;
  if (!serveUrl || !existsSync(join(serveUrl, 'index.html')))
    throw new Error('Rebuilt local out/remotion bundle required');
  const bundle = currentBundleEvidence(
    serveUrl,
    process.env.SYSTEMS_E2E_TECHNOLOGY === '1',
    process.env.SYSTEMS_E2E_CONCEPTS === '1',
  );
  report.bundle = bundle;
  const opened = await openLocalBrowser();
  const browser = opened.browser;
  report.browser = opened.metadata;
  const shared = {
    ...opened.shared,
    chromiumOptions: { ...opened.shared.chromiumOptions, gl: 'angle' as const },
    onBrowserDownload: (): never => {
      throw new Error('Offline smoke: browser download forbidden');
    },
    serveUrl,
    logLevel: 'warn' as const,
  };
  try {
    const pagesBefore = (await browser.pages()).length;
    await expect(
      selectComposition({ ...shared, id: 'MissingSystemsE2EComposition' }),
    ).rejects.toThrow(/Could not find|not found/i);
    // Remotion closes pages asynchronously after its operation rejects.
    await expect
      .poll(async () => (await browser.pages()).length, { timeout: 5_000 })
      .toBe(pagesBefore);
    report.missingComposition = { rejected: true, pagesClosed: true };
    for (const aspect of ['9:16', '16:9'] as const) {
      await renderAspect(
        aspect,
        aspect === '9:16' ? fixtures.portrait : fixtures.landscape,
        shared,
        report,
        save,
        artifactRoot,
      );
      expect(bundleDigest(serveUrl)).toBe(bundle.sha256);
    }
  } finally {
    await browser.close({ silent: true });
    report.browserClosed = true;
    save();
  }
}

type SharedRender = Parameters<typeof renderMedia>[0];
async function renderAspect(
  aspect: ExplainerAspect,
  fixture: ReturnType<typeof planningProof>,
  shared: Pick<
    SharedRender,
    | 'serveUrl'
    | 'puppeteerInstance'
    | 'browserExecutable'
    | 'chromiumOptions'
    | 'onBrowserDownload'
    | 'timeoutInMilliseconds'
    | 'logLevel'
  >,
  report: Record<string, unknown>,
  save: () => void,
  artifactRoot: string,
) {
  const portrait = aspect === '9:16';
  const concepts = fixture.planned.every((p) =>
    CONCEPT_SCENE_KINDS.some((kind) => kind === p.scene.kind),
  );
  const dir = join(artifactRoot, portrait ? 'portrait' : 'landscape');
  mkdirSync(dir, { recursive: true });
  const group = portrait ? fixture.group : fixture.landscape;
  const plan = buildGroupRenderPlan(group, fixture.window, fixture.palette, aspect);
  const canvas = stageCanvasFor(group.layout, aspect);
  const width = portrait ? 1080 : 1920;
  const height = portrait ? 1920 : 1080;
  const duration = plan.durationSec;
  const inputProps = { ...plan.props };
  const selected = await selectComposition({ ...shared, id: 'ExplainerSequence', inputProps });
  const composition = {
    ...selected,
    ...canvas,
    fps,
    durationInFrames: Math.round(duration * fps),
    props: inputProps,
  };
  const overlay = join(dir, canvas.transparent ? 'stage.mov' : 'stage.mp4');
  const renderOptions = {
    ...shared,
    composition,
    inputProps,
    outputLocation: overlay,
    concurrency: 1,
    hardwareAcceleration: 'disable' as const,
    ...(canvas.transparent
      ? {
          codec: 'prores' as const,
          proResProfile: '4444' as const,
          pixelFormat: 'yuva444p10le' as const,
          imageFormat: 'png' as const,
        }
      : {
          codec: 'h264' as const,
          pixelFormat: 'yuv420p' as const,
          x264Preset: 'ultrafast' as const,
        }),
  };
  if (portrait) {
    const browser = shared.puppeteerInstance;
    if (!browser) throw new Error('The smoke must own its browser');
    const { cancel, cancelSignal } = makeCancelSignal();
    let inFlight = false;
    const before = (await browser.pages()).length;
    const timer = setTimeout(cancel, 60_000);
    try {
      await expect(
        renderMedia({
          ...renderOptions,
          outputLocation: join(dir, 'cancelled.mp4'),
          cancelSignal,
          onProgress: ({ renderedFrames }) => {
            if (renderedFrames > 0) {
              inFlight = true;
              cancel();
            }
          },
        }),
      ).rejects.toThrow(/cancel/i);
      expect(inFlight).toBe(true);
      await expect
        .poll(async () => (await browser.pages()).length, { timeout: 5_000 })
        .toBe(before);
      report.remotionCancellation = { inFlight, pagesClosed: true };
    } finally {
      clearTimeout(timer);
      cancel();
    }
  }
  const { cancel, cancelSignal } = makeCancelSignal();
  const timer = setTimeout(cancel, 1_200_000);
  const began = Date.now();
  try {
    await renderMedia({ ...renderOptions, cancelSignal });
  } finally {
    clearTimeout(timer);
    cancel();
  }
  const stageProbe = await probe(overlay);
  const stageVideo = stageProbe.streams.find((s) => s.codec_type === 'video');
  expect(stageVideo).toMatchObject({ width: canvas.width, height: canvas.height });
  const firstScene = fixture.planned[0].scene;
  const contactAt =
    firstScene.kind === 'bottleneck'
      ? firstScene.openAt - fixture.window.startTime
      : 'actionAt' in firstScene
        ? firstScene.actionAt - fixture.window.startTime
        : 3;
  let alpha: unknown = null;
  if (!portrait) {
    expect(stageVideo?.pix_fmt).toMatch(/^yuva/);
    expect(stageVideo?.codec_name).toBe('prores');
    const times = concepts
      ? fixture.planned.map(({ scene }) => {
          if (!('checkAt' in scene)) throw new Error('Concept scene missing comparison beat');
          return scene.checkAt - fixture.window.startTime;
        })
      : [contactAt];
    const measurements = [];
    for (const at of times) {
      const channel = await pixels(overlay, at, 'alphaextract,format=gray');
      expect(channel.length).toBe(width * height);
      let transparent = 0;
      let visible = 0;
      for (const value of channel) {
        if (value < 10) transparent++;
        if (value > 100) visible++;
      }
      expect(transparent).toBeGreaterThan((width * height) / 2);
      expect(visible).toBeGreaterThan(1000);
      measurements.push({ at, transparentPixels: transparent, visiblePixels: visible });
    }
    alpha = concepts ? measurements : measurements[0];
  }
  const source = join(dir, 'synthetic-speaker.mp4');
  const face = syntheticFace;
  const mark = [
    `drawbox=x=${face.x}:y=${face.y}:w=${face.width}:h=${face.height}:color=yellow:t=fill`,
    'drawbox=x=875:y=310:w=35:h=35:color=black:t=fill',
    'drawbox=x=1005:y=310:w=35:h=35:color=black:t=fill',
    'drawbox=x=880:y=420:w=160:h=20:color=black:t=fill',
    'drawbox=x=720:y=520:w=480:h=430:color=purple:t=fill',
    `drawtext=fontfile='${join(ROOT, 'resources/fonts/InstrumentSerif-Regular.ttf').replaceAll('\\', '/').replaceAll(':', '\\:')}':text='SYNTHETIC SPEAKER - NO HUMAN DATA':fontsize=42:fontcolor=white:box=1:boxcolor=black:x=(w-tw)/2:y=40`,
  ].join(',');
  await ff([
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=1920x1080:rate=${fps}`,
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=220:sample_rate=48000',
    '-t',
    String(duration),
    '-vf',
    mark,
    '-af',
    'volume=0.002',
    ...encode,
    '-c:a',
    'aac',
    '-ac',
    '2',
    '-b:a',
    '192k',
    source,
  ]);
  const composite = join(dir, 'composite.mp4');
  if (portrait) {
    const layout = buildArchetypeLayout('split-image', {
      width,
      height,
      segmentDuration: duration,
      fps,
      mediaPath: overlay,
      sourceWidth: 1920,
      sourceHeight: 1080,
      explainerLayout: 'stack',
    });
    expect(layout.inputCount).toBe(2);
    await ff([
      '-i',
      source,
      '-i',
      overlay,
      '-filter_complex_threads',
      '2',
      '-filter_complex',
      layout.filterComplex,
      '-map',
      '[outv]',
      '-map',
      '0:a',
      '-t',
      String(duration),
      ...encode,
      '-c:a',
      'copy',
      composite,
    ]);
  } else {
    json(join(outputDir, 'composite-job.json'), {
      inputPath: source,
      outputPath: composite,
      overlays: [{ overlayPath: overlay, startTime: 0, endTime: duration }],
      qualityParams: { crf: 18, preset: 'ultrafast' },
    });
    const worker = await runBounded(process.execPath, [VITEST, 'run', '--config', CONFIG], {
      timeoutMs: 180_000,
      env: { ...process.env, SYSTEMS_E2E_MODE: 'composite' },
    });
    writeFileSync(join(dir, 'compositor.log'), Buffer.concat([worker.stdout, worker.stderr]));
  }
  const captionWords = fixture.words.map((w) => ({
    ...w,
    start: w.start - fixture.window.startTime,
    end: w.end - fixture.window.startTime,
  }));
  const ass = buildCaptionASSDocument(
    captionWords,
    { captionMode: 'editorial', fontSize: 0.045, wordsPerLine: 4 },
    {
      frameWidth: width,
      frameHeight: height,
      layoutWindows: [{ startTime: 0, endTime: duration, layout: group.layout }],
    },
  );
  expect(ass).toContain('Style: Editorial,Instrument Serif');
  const assPath = join(dir, 'captions.ass');
  writeFileSync(assPath, ass);
  const captioned = join(dir, 'captioned.mp4');
  const burn = await ff([
    '-i',
    composite,
    '-vf',
    buildASSFilter(assPath, join(ROOT, 'resources/fonts')),
    ...encode,
    '-c:a',
    'copy',
    captioned,
  ]);
  writeFileSync(join(dir, 'captions.log'), burn.stderr);
  expect(burn.stderr.toString()).toMatch(/libass/);
  const before = await pixels(composite, 0.8);
  const after = await pixels(captioned, 0.8);
  expect(after.length).toBe(before.length);
  let captionPixels = 0;
  for (let i = 0; i < before.length; i++) if (Math.abs(after[i] - before[i]) > 40) captionPixels++;
  expect(captionPixels).toBeGreaterThan(800);
  const cues = plan.cues.map((cue) => ({ ...cue, at: cue.at - fixture.window.startTime }));
  const placements = planSceneSfx(cues, { clipDuration: duration }).map((p) => ({
    ...p,
    file: join(ROOT, 'resources/sfx/scene', p.file),
  }));
  if ('preset' in fixture.planned[0].scene) expect(placements.length).toBeGreaterThanOrEqual(2);
  else expect(placements.length).toBeGreaterThan(2);
  for (const placement of placements) expect(existsSync(placement.file)).toBe(true);
  const final = join(dir, 'final.mp4');
  const mixArgs = buildSfxMixArgs(captioned, placements, final);
  await runBounded(ffmpeg, mixArgs, { timeoutMs: 180_000 });
  const cue = placements.find((p) => p.file.includes('thump')) ?? placements[0];
  const quietRms = rms(await audio(captioned), cue.at, 0.5);
  const mixedRms = rms(await audio(final), cue.at, 0.5);
  expect(mixedRms).toBeGreaterThan(quietRms * 1.1);
  const metadata = await probe(final);
  expect(metadata.streams.find((s) => s.codec_type === 'video')).toMatchObject({
    width,
    height,
    codec_name: 'h264',
    pix_fmt: 'yuv420p',
    avg_frame_rate: '30/1',
  });
  expect(metadata.streams.find((s) => s.codec_type === 'audio')).toMatchObject({
    codec_name: 'aac',
    sample_rate: '48000',
  });
  expect(Math.abs(Number(metadata.format.duration) - duration)).toBeLessThan(0.1);
  const seam = fixture.planned[1] ? fixture.planned[1].startTime - fixture.window.startTime : null;
  const last = fixture.planned.at(-1);
  if (!last) throw new Error('No planned scenes to verify');
  const samples: Record<string, number> = {
    setup: 0.8,
    contact: contactAt,
    final: last.endTime - fixture.window.startTime - 0.4,
    ...(seam === null ? {} : { 'seam-before': seam - 1 / fps, 'seam-after': seam + 1 / fps }),
  };
  if (concepts) {
    // Decode the entire final export, not just probe its container or inspect a lucky first scene.
    await ff(['-v', 'error', '-xerror', '-i', final, '-f', 'null', '-']);
    for (const [i, planned] of fixture.planned.entries()) {
      const scene = planned.scene;
      for (const field of ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const)
        if (field in scene) {
          const at = (scene[field as keyof typeof scene] as number) - fixture.window.startTime;
          samples[`scene-${i + 1}-${field}`] = at + 1 / fps;
        }
      samples[`scene-${i + 1}-hold`] = planned.endTime - fixture.window.startTime - 0.3;
      if (i > 0) {
        const boundary = planned.startTime - fixture.window.startTime;
        samples[`seam-${i}-before`] = boundary - 1 / fps;
        samples[`seam-${i}-after`] = boundary + 1 / fps;
      }
    }
  }
  for (const [name, at] of Object.entries(samples)) {
    await ff(['-ss', String(at), '-i', final, '-frames:v', '1', join(dir, `${name}.png`)]);
  }
  const entry = {
    aspect,
    artifacts: [
      overlay,
      source,
      composite,
      assPath,
      captioned,
      final,
      ...Object.keys(samples).map((name) => join(dir, `${name}.png`)),
    ].map((file) => ({ file, sha256: digest(readFileSync(file)) })),
    inputHash: digest(inputProps),
    dir,
    duration,
    elapsedMs: Date.now() - began,
    plan,
    stageProbe,
    metadata,
    alpha,
    ...(concepts
      ? { fullDecodeVerified: true, conceptChain: fixture.planned.map((p) => p.scene.kind) }
      : {}),
    captionPixels,
    quietRms,
    mixedRms,
    placements,
    mixArgs,
    samples,
  };
  json(join(dir, 'evidence.json'), entry);
  (report.outputs as unknown[]).push(entry);
  save();
}
