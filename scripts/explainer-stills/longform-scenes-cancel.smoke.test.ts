import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { it, vi } from 'vitest';
import { disableGpuEncoderForSession, setupFFmpeg } from '../../src/main/ffmpeg';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import { renderRemotionSegment } from '../../src/main/remotion/render';
import {
  buildLongformSceneProps,
  renderLongformScenePreview,
  renderSceneFirstLongform,
} from '../../src/main/render/longform-scene-render';
import { buildLongformSceneTimeline } from '../../src/main/render/longform-scene-timeline';
import { getLongformLayout } from '../../src/shared/longform-layout';
import { longformScenesFixture } from './longform-scenes.fixture';
import { sourceFileDigest } from './longform-scenes-media.mjs';
import { runBounded } from './verify-systems-e2e.mjs';

const boundary = vi.hoisted(() => {
  Object.defineProperty(process, 'resourcesPath', {
    value: process.env.LONGFORM_PROOF_RESOURCES,
    configurable: true,
  });
  return {
    controller: null as AbortController | null,
    cancelAfterFrames: 0,
    sampleFrame: null as number | null,
    frames: 0,
    paths: [] as string[],
    ai: 0,
    builds: 0,
  };
});
vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getAppPath: () => process.cwd(),
    getPath: () => process.env.LONGFORM_PROOF_OUT,
  },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      boundary.ai++;
      throw new Error('No paid provider in media proof');
    }
  },
  ThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));
vi.mock('@remotion/bundler', () => ({
  bundle: () => {
    boundary.builds++;
    throw new Error('No builds in media proof');
  },
}));
// Observe deterministic progress/frame selection, but run the real renderer and real cancelSignal.
vi.mock('@remotion/renderer', async (original) => {
  const actual = await original<typeof import('@remotion/renderer')>();
  const local = () => {
    assert.ok(process.env.LONGFORM_PROOF_BROWSER, 'Installed browser must be supplied');
    return {
      browserExecutable: process.env.LONGFORM_PROOF_BROWSER,
      onBrowserDownload: () => {
        throw new Error('No downloads');
      },
    };
  };
  return {
    ...actual,
    selectComposition: (options: Parameters<typeof actual.selectComposition>[0]) =>
      actual.selectComposition({ ...options, ...local() }),
    renderMedia: (options: Parameters<typeof actual.renderMedia>[0]) => {
      if (typeof options.outputLocation === 'string') boundary.paths.push(options.outputLocation);
      return actual.renderMedia({
        ...options,
        ...local(),
        ...(boundary.sampleFrame === null
          ? {}
          : { frameRange: [boundary.sampleFrame, boundary.sampleFrame] as [number, number] }),
        onProgress: (progress) => {
          boundary.frames = Math.max(boundary.frames, progress.renderedFrames);
          options.onProgress?.(progress);
          if (
            boundary.cancelAfterFrames > 0 &&
            progress.renderedFrames >= boundary.cancelAfterFrames
          )
            boundary.controller?.abort();
        },
      });
    },
  };
});

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static') as string;
const ffprobe = (require('@ffprobe-installer/ffprobe') as { path: string }).path;
const out = process.env.LONGFORM_PROOF_OUT;
assert.ok(out && readFileSync(join(out, '.owner'), 'utf8') === process.env.LONGFORM_PROOF_OWNER);
const output = out;
const fixtureRoot = process.env.LONGFORM_CANCEL_FIXTURE;
assert.ok(
  fixtureRoot,
  'Supply LONGFORM_CANCEL_FIXTURE with the existing approved 42s proof directory',
);
const source = join(fixtureRoot, 'source.mp4');
const existingExport = join(fixtureRoot, 'preview.mp4');
const fixture = longformScenesFixture();
const palette = deriveExplainerPalette();
const qualityParams = { crf: 28, preset: 'veryfast' } as const;
const report: {
  status: string;
  cases: unknown[];
  limitations: string[];
  startedAt: string;
  finishedAt?: string;
} = {
  status: 'running',
  cases: [],
  startedAt: new Date().toISOString(),
  limitations: [
    'Publication/link cancellation race is covered by existing writable-output-path tests, not claimed by this media run.',
    'Alpha proof samples one real mid-scene ProRes frame per presentation, not every frame or GPU.',
    'Process cleanup is collected by the separate bounded Windows sampler; inspect its report before declaring cleanup passed.',
  ],
};
const save = () => writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
async function check(label: string, body: () => Promise<unknown>) {
  const started = performance.now();
  try {
    const evidence = await body();
    report.cases.push({ label, status: 'passed', ms: performance.now() - started, evidence });
    console.log(`CANCEL_ALPHA_PASS ${label}`);
  } catch (error) {
    report.cases.push({
      label,
      status: 'failed',
      ms: performance.now() - started,
      error: String(error),
    });
    console.error(`CANCEL_ALPHA_FAIL ${label}`, error);
  } finally {
    save();
  }
}
function alphaStats(bytes: Buffer, rect: { x: number; y: number; width: number; height: number }) {
  let zero = 0,
    opaque = 0,
    samples = 0;
  for (let y = rect.y; y < rect.y + rect.height; y++)
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const alpha = bytes[(y * 1920 + x) * 4 + 3];
      if (alpha === 0) zero++;
      if (alpha === 255) opaque++;
      samples++;
    }
  return { zero, opaque, samples };
}

it('cancels actual render/preview/finalization work and proves pre-composition alpha', async () => {
  setupFFmpeg();
  disableGpuEncoderForSession();
  save();
  const originalSourceHash = await sourceFileDigest(source);
  const originalExportHash = await sourceFileDigest(existingExport);
  for (const label of ['render-2d', 'render-3d', 'preview-3d', 'finalization'] as const) {
    await check(label, async () => {
      const directory = join(output, label);
      mkdirSync(directory);
      const survivor = join(directory, 'existing-export.mp4');
      copyFileSync(existingExport, survivor);
      const keep = join(directory, 'unrelated.txt');
      writeFileSync(keep, 'Never remove this sibling');
      const controller = new AbortController();
      boundary.controller = controller;
      boundary.frames = 0;
      boundary.paths = [];
      boundary.sampleFrame = null;
      boundary.cancelAfterFrames = label === 'finalization' ? 0 : 2;
      const plan = structuredClone(fixture.plan);
      const selected = label === 'render-2d' ? 'checklist' : 'house-cutaway';
      const selectedScene = plan.scenes.find((scene) => scene.kind === selected);
      assert.ok(selectedScene, 'The existing fixture must contain the requested real scene');
      for (const scene of plan.scenes)
        scene.omitted = label === 'finalization' || scene.kind !== selected;
      let finalizationProgress: { message: string; fraction: number } | undefined;
      const target = label === 'finalization' ? survivor : join(directory, 'cancelled.mp4');
      const started = performance.now();
      const work =
        label === 'preview-3d'
          ? renderLongformScenePreview(
              {
                requestId: 'owned-real-cancellation',
                sourceVideoPath: source,
                wordTimestamps: fixture.words,
                plan,
                sceneId: selectedScene.id,
              },
              controller.signal,
            )
          : renderSceneFirstLongform({
              plan,
              words: fixture.words,
              sourceVideoPath: source,
              outputPath: target,
              palette,
              qualityParams,
              signal: controller.signal,
              onProgress: (message, fraction) => {
                if (label === 'finalization' && message.startsWith('Finishing') && fraction > 0.9) {
                  finalizationProgress = { message, fraction };
                  controller.abort();
                }
              },
            });
      await assert.rejects(work, /abort|cancel/i);
      assert.ok(controller.signal.aborted, 'Must cancel through the actual progress boundary');
      if (label === 'finalization')
        assert.ok(finalizationProgress, 'No actual finalization progress observed');
      else assert.ok(boundary.frames >= 2, 'No actual rendered frames observed');
      for (const path of boundary.paths) {
        assert.equal(existsSync(path), false, `Partial overlay survived: ${path}`);
        assert.equal(
          existsSync(dirname(path)),
          false,
          `Owned working directory survived: ${dirname(path)}`,
        );
        if (label === 'preview-3d')
          assert.equal(
            existsSync(dirname(dirname(path))),
            false,
            'Preview request directory survived',
          );
      }
      if (label !== 'finalization')
        assert.equal(existsSync(target), false, 'Cancelled output published');
      assert.deepEqual(readdirSync(directory).sort(), ['existing-export.mp4', 'unrelated.txt']);
      assert.equal(await sourceFileDigest(survivor), originalExportHash);
      assert.equal(readFileSync(keep, 'utf8'), 'Never remove this sibling');
      return {
        renderedFramesBeforeAbort: boundary.frames,
        elapsedMs: performance.now() - started,
        finalizationProgress,
        ownedOverlayPaths: [...boundary.paths],
        outputAbsent: label !== 'finalization',
        existingExportUnchanged: true,
        ownedDirectoriesRemoved: true,
      };
    });
  }
  boundary.controller = null;
  boundary.cancelAfterFrames = 0;
  const timeline = buildLongformSceneTimeline(fixture.plan, fixture.compiled);
  for (const presentation of ['speaker-side', 'speaker-pip', 'full-frame'] as const) {
    await check(`alpha-${presentation}`, async () => {
      const segment = timeline.segments.find(
        (item) => item.kind === 'scene' && item.compiled.placement.presentation === presentation,
      );
      assert.ok(segment?.kind === 'scene');
      const props = buildLongformSceneProps(segment, palette);
      boundary.sampleFrame = Math.floor((segment.endFrame - segment.startFrame) / 2);
      const path = join(output, `alpha-${presentation}.mov`);
      await renderRemotionSegment({
        compositionId: 'ExplainerSequence',
        inputProps: props as unknown as Record<string, unknown>,
        durationSec: segment.endTime - segment.startTime,
        fps: 30,
        width: 1920,
        height: 1080,
        transparent: true,
        outputPath: path,
        concurrency: 1,
      });
      const probe = await runBounded(ffprobe, [
        '-v',
        'error',
        '-show_streams',
        '-of',
        'json',
        path,
      ]);
      const stream = JSON.parse(probe.stdout.toString()).streams[0];
      assert.equal(stream.codec_name, 'prores');
      assert.match(stream.pix_fmt, /^yuva/);
      const { stdout: rgba } = await runBounded(ffmpeg, [
        '-v',
        'error',
        '-i',
        path,
        '-frames:v',
        '1',
        '-pix_fmt',
        'rgba',
        '-f',
        'rawvideo',
        'pipe:1',
      ]);
      assert.equal(rgba.length, 1920 * 1080 * 4);
      const layout = getLongformLayout(presentation);
      const clearRect =
        presentation === 'speaker-side' ? { x: 0, y: 0, width: 720, height: 1080 } : layout.speaker;
      const clear = clearRect ? alphaStats(rgba, clearRect) : null;
      if (clear)
        assert.equal(
          clear.zero,
          clear.samples,
          'Speaker region must be transparent before FFmpeg composition',
        );
      const text = alphaStats(rgba, layout.text);
      const model = alphaStats(rgba, layout.model);
      assert.equal(text.opaque, text.samples, 'Editorial reservation lost opacity');
      assert.equal(model.opaque, model.samples, 'Model reservation lost opacity');
      await runBounded(ffmpeg, [
        '-v',
        'error',
        '-i',
        path,
        '-frames:v',
        '1',
        '-threads',
        '1',
        join(output, `alpha-${presentation}.png`),
      ]);
      return {
        path,
        kind: segment.compiled.placement.kind,
        sampleFrame: boundary.sampleFrame,
        codec: stream.codec_name,
        pixelFormat: stream.pix_fmt,
        clear,
        text,
        model,
      };
    });
  }
  assert.equal(await sourceFileDigest(source), originalSourceHash);
  assert.equal(await sourceFileDigest(existingExport), originalExportHash);
  assert.equal(boundary.ai, 0);
  assert.equal(boundary.builds, 0);
  report.finishedAt = new Date().toISOString();
  const failed = report.cases.filter((item) => (item as { status: string }).status === 'failed');
  report.status = failed.length ? 'failed' : 'passed';
  save();
  assert.equal(
    failed.length,
    0,
    `${failed.length} actual cancellation/alpha cases failed; see report.json`,
  );
});
