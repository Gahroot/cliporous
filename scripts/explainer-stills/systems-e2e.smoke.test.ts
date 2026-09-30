import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureBrowser,
  makeCancelSignal,
  openBrowser,
  renderMedia,
  selectComposition,
} from '@remotion/renderer';
import { expect, it, vi } from 'vitest';
import { parseExplainerPlan, parsePlanWithRejections } from '../../src/main/ai/explainer-scenes';
import { buildCaptionASSDocument } from '../../src/main/captions';
import { disableGpuEncoderForSession } from '../../src/main/ffmpeg';
import { buildArchetypeLayout } from '../../src/main/layouts/segment-layouts';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import {
  collectSceneTimes,
  type ExplainerAspect,
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
import { bounds, fps, rawPlan, syntheticFace, words } from './systems-e2e.fixture';
import { CONFIG, ROOT, runBounded, VITEST } from './verify-systems-e2e.mjs';

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
  return { group, window, palette, landscape: landscape[0], planned };
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
      gl: 'swangle',
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
    report.childLifecycle = await childLifecycleProof();
    if (mode === 'render') await renderProof(fixture, report, save);
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
  fixture: ReturnType<typeof planningProof>,
  report: Record<string, unknown>,
  save: () => void,
) {
  const serveUrl = process.env.SYSTEMS_E2E_BUNDLE;
  if (!serveUrl || !existsSync(join(serveUrl, 'index.html')))
    throw new Error('Rebuilt local out/remotion bundle required');
  const onBrowserDownload = (): never => {
    throw new Error(
      'Offline smoke: install/download is forbidden; compatible local Chrome required',
    );
  };
  const installed = await ensureBrowser({ onBrowserDownload });
  if (!('path' in installed)) throw new Error('No compatible local browser');
  const chromiumOptions = { gl: 'swangle' as const };
  const browser = await openBrowser('chrome', {
    browserExecutable: installed.path,
    chromiumOptions,
  });
  const shared = {
    serveUrl,
    puppeteerInstance: browser,
    browserExecutable: installed.path,
    chromiumOptions,
    onBrowserDownload,
    timeoutInMilliseconds: 60_000,
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
      await renderAspect(aspect, fixture, shared, report, save);
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
) {
  const portrait = aspect === '9:16';
  const dir = join(outputDir, portrait ? 'portrait' : 'landscape');
  mkdirSync(dir);
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
  const contactAt =
    fixture.planned[0].scene.kind === 'bottleneck'
      ? fixture.planned[0].scene.openAt - fixture.window.startTime
      : 3;
  let alpha: unknown = null;
  if (!portrait) {
    expect(stageVideo?.pix_fmt).toMatch(/^yuva/);
    const channel = await pixels(overlay, contactAt, 'alphaextract,format=gray');
    let transparent = 0;
    let visible = 0;
    for (const value of channel) {
      if (value < 10) transparent++;
      if (value > 100) visible++;
    }
    expect(transparent).toBeGreaterThan((width * height) / 2);
    expect(visible).toBeGreaterThan(1000);
    alpha = { transparentPixels: transparent, visiblePixels: visible };
  }
  const source = join(dir, 'synthetic-speaker.mp4');
  const face = syntheticFace;
  const mark = [
    `drawbox=x=${face.x}:y=${face.y}:w=${face.width}:h=${face.height}:color=yellow:t=fill`,
    'drawbox=x=875:y=310:w=35:h=35:color=black:t=fill',
    'drawbox=x=1005:y=310:w=35:h=35:color=black:t=fill',
    'drawbox=x=880:y=420:w=160:h=20:color=black:t=fill',
    'drawbox=x=720:y=520:w=480:h=430:color=purple:t=fill',
    `drawtext=fontfile='${join(ROOT, 'resources/fonts/InstrumentSerif-Regular.ttf')}':text='SYNTHETIC SPEAKER - NO HUMAN DATA':fontsize=42:fontcolor=white:box=1:boxcolor=black:x=(w-tw)/2:y=40`,
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
  const captionWords = words.map((w) => ({
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
  expect(placements.length).toBeGreaterThan(2);
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
  const seam = fixture.planned[1].startTime - fixture.window.startTime;
  const samples = {
    setup: 0.8,
    contact: contactAt,
    final: fixture.planned[1].endTime - fixture.window.startTime - 0.4,
    'seam-before': seam - 1 / fps,
    'seam-after': seam + 1 / fps,
  };
  for (const [name, at] of Object.entries(samples)) {
    await ff(['-ss', String(at), '-i', final, '-frames:v', '1', join(dir, `${name}.png`)]);
  }
  const entry = {
    aspect,
    dir,
    duration,
    elapsedMs: Date.now() - began,
    plan,
    stageProbe,
    metadata,
    alpha,
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
