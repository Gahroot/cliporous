import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type {
  LongformScenePreviewRequest,
  LongformSceneRenderResult,
  SceneFirstLongformPlan,
} from '@shared/longform-scenes';
import { getPaletteById } from '@shared/palettes';
import type { LongformRenderReconciliation, WordTimestamp } from '@shared/types';
import { validateSceneFirstLongformPlan } from '../ai/longform-scene-contract';
import { LANDSCAPE_FPS, LANDSCAPE_HEIGHT, LANDSCAPE_WIDTH } from '../aspect-ratios';
import { getVideoMetadata, type QualityParams } from '../ffmpeg';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import {
  type ExplainerPalette,
  type ExplainerSequenceProps,
  mapSceneTimes,
  type SceneCue,
} from '../remotion/compositions/explainer/types';
import { concatLongformSceneSegments, encodeLongformSceneSegment } from './longform-encode';
import { buildLongformSceneTimeline, type LongformSceneSegment } from './longform-scene-timeline';
import { mixSceneSfx } from './scene-sfx';
import { publishNewOutput } from './writable-output-path';

type SceneSegment = Extract<LongformSceneSegment, { kind: 'scene' }>;
interface Source {
  sourceVideoPath: string;
  sourceWidth: number;
  sourceHeight: number;
  palette: ExplainerPalette;
  signal?: AbortSignal | undefined;
}
interface SegmentOptions extends Source {
  segment: LongformSceneSegment;
  outputPath: string;
  workDirectory: string;
  qualityParams?: QualityParams | undefined;
  onProgress?: ((fraction: number) => void) | undefined;
}

/** Rebase every authored beat once, against the outward-rounded source frame. No story clamping. */
export function buildLongformSceneProps(
  segment: SceneSegment,
  palette: ExplainerPalette,
): ExplainerSequenceProps {
  return {
    scenes: [
      {
        scene: mapSceneTimes(segment.compiled.planned.scene, (time) => time - segment.startTime),
        durationInFrames: segment.endFrame - segment.startFrame,
      },
    ],
    transitions: [],
    layout: 'takeover',
    aspect: '16:9',
    presentation: segment.compiled.placement.presentation,
    palette,
    enter: true,
    exit: true,
    visibleSec: segment.endTime - segment.startTime,
  };
}

/** Actual scene-segment path shared by export and preview; errors are never hidden here. */
async function renderSceneSegment(opts: SegmentOptions): Promise<void> {
  const { segment, signal } = opts;
  signal?.throwIfAborted();
  const visualPath = join(opts.workDirectory, 'scene.mov');
  try {
    if (segment.kind === 'scene') {
      const { renderRemotionSegment } = await import('../remotion/render');
      signal?.throwIfAborted();
      const renderOptions = {
        compositionId: 'ExplainerSequence',
        inputProps: buildLongformSceneProps(segment, opts.palette) as unknown as Record<
          string,
          unknown
        >,
        durationSec: (segment.endFrame - segment.startFrame) / LANDSCAPE_FPS,
        fps: LANDSCAPE_FPS,
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        transparent: true,
        outputPath: visualPath,
        signal,
        concurrency: 1,
        onProgress: (fraction: number) => {
          if (!signal?.aborted) opts.onProgress?.(fraction * 0.8);
        },
      };
      await renderRemotionSegment(renderOptions);
      signal?.throwIfAborted();
    }
    await encodeLongformSceneSegment({
      sourceVideoPath: opts.sourceVideoPath,
      outputPath: opts.outputPath,
      sourceWidth: opts.sourceWidth,
      sourceHeight: opts.sourceHeight,
      background: opts.palette.bgOuter,
      startTime: segment.startTime,
      frameCount: segment.endFrame - segment.startFrame,
      ...(segment.kind === 'scene'
        ? { visualPath, presentation: segment.compiled.placement.presentation }
        : {}),
      signal,
      qualityParams: opts.qualityParams,
      onProgress: (percent) =>
        opts.onProgress?.(segment.kind === 'scene' ? 0.8 + percent / 500 : percent / 100),
    });
    signal?.throwIfAborted();
  } finally {
    // Include partial/failed renders; do not retain a long video's alpha intermediates.
    rmSync(visualPath, { force: true });
  }
}

export interface SceneFirstLongformRenderOptions {
  plan: SceneFirstLongformPlan;
  words: WordTimestamp[];
  sourceVideoPath: string;
  outputPath: string;
  palette: ExplainerPalette;
  qualityParams: QualityParams;
  sceneSfxEnabled?: boolean | undefined;
  signal?: AbortSignal | undefined;
  onProgress?: ((message: string, fraction: number) => void) | undefined;
}

/** Bounded sequential scene work, explicit same-window speaker recovery, uninterrupted source audio. */
export async function renderSceneFirstLongform(
  opts: SceneFirstLongformRenderOptions,
): Promise<LongformRenderReconciliation> {
  opts.signal?.throwIfAborted();
  const meta = await getVideoMetadata(opts.sourceVideoPath, {
    localOnly: true,
    signal: opts.signal,
  });
  // getVideoMetadata reports 'unknown' when there is no audio stream.
  const sourceHasAudio = meta.audioCodec !== 'unknown';
  opts.signal?.throwIfAborted();
  const validated = validateSceneFirstLongformPlan(opts.plan, opts.words, meta.duration);
  if (!validated.ok) throw new Error(validated.error);
  const timeline = buildLongformSceneTimeline(validated.value.plan, validated.value.scenes);
  // Keep the final encode on the destination volume for atomic publication after success.
  const workDirectory = mkdtempSync(join(dirname(opts.outputPath), '.batchcontent-lf-scenes-'));
  const finalPath = join(workDirectory, 'final.mp4');
  const sceneResults: LongformSceneRenderResult[] = [...timeline.omitted];
  const cues: SceneCue[] = [];
  const segments: { path: string; frameCount: number }[] = [];
  const source: Source = {
    sourceVideoPath: opts.sourceVideoPath,
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    palette: opts.palette,
    signal: opts.signal,
  };
  try {
    for (const [index, segment] of timeline.segments.entries()) {
      opts.signal?.throwIfAborted();
      const outputPath = join(workDirectory, `segment-${index}.mp4`);
      const onProgress = (fraction: number): void =>
        opts.onProgress?.(
          segment.kind === 'scene'
            ? `Rendering approved scene ${segment.compiled.placement.label}…`
            : 'Encoding source speaker…',
          ((segment.startFrame + fraction * (segment.endFrame - segment.startFrame)) /
            timeline.totalFrames) *
            0.9,
        );
      const common = { ...source, segment, outputPath, workDirectory, onProgress };
      try {
        await renderSceneSegment(common);
        if (segment.kind === 'scene') {
          sceneResults.push(sceneResult(segment, 'rendered'));
          // Full-source output: validated cue times are already absolute. Never rebase here.
          if (opts.sceneSfxEnabled !== false) cues.push(...segment.compiled.planned.cues);
        }
      } catch (error) {
        opts.signal?.throwIfAborted();
        if (segment.kind !== 'scene') throw error;
        const reason = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
        // Delete any partial scene encode before reusing its exact output interval.
        rmSync(outputPath, { force: true });
        await renderSceneSegment({ ...common, segment: { ...segment, kind: 'speaker' } });
        sceneResults.push({
          ...sceneResult(segment, 'failed'),
          reason: `Speaker fallback: ${reason}`,
        });
      }
      segments.push({ path: outputPath, frameCount: segment.endFrame - segment.startFrame });
    }
    opts.signal?.throwIfAborted();
    await concatLongformSceneSegments({
      segments,
      listPath: join(workDirectory, 'concat.txt'),
      outputPath: finalPath,
      sourceVideoPath: opts.sourceVideoPath,
      audioStartTime: 0,
      sourceHasAudio,
      duration: meta.duration,
      qualityParams: opts.qualityParams,
      signal: opts.signal,
      onProgress: (percent) =>
        opts.onProgress?.(
          sourceHasAudio
            ? 'Finishing with continuous source narration…'
            : 'Finishing with silent source audio…',
          0.9 + percent / 1000,
        ),
    });
    opts.signal?.throwIfAborted();
    const byId = new Map(sceneResults.map((result) => [result.id, result]));
    const results = validated.value.plan.scenes.map((scene) => {
      const result = byId.get(scene.id);
      if (!result) throw new Error(`Scene ${scene.id} has no render reconciliation.`);
      return result;
    });
    const mixedPath = await mixSceneAudio(
      finalPath,
      cues,
      join(workDirectory, 'mixed.mp4'),
      meta.duration,
      opts.signal,
    );
    await publishNewOutput(mixedPath, opts.outputPath, opts.signal);
    const rendered = results.filter((scene) => scene.status === 'rendered').length;
    const zero = (): LongformRenderReconciliation['blocks'] => ({
      planned: 0,
      eligible: 0,
      rendered: 0,
      dropped: 0,
    });
    return {
      renderedAt: Date.now(),
      outputPath: opts.outputPath,
      phrases: zero(),
      blocks: zero(),
      cards: zero(),
      scenes: {
        planned: results.length,
        eligible: results.length - timeline.omitted.length,
        rendered,
        dropped: results.length - rendered,
      },
      sceneResults: results,
      fallbacks: results
        .filter((scene) => scene.status === 'failed')
        .map((scene) => ({
          type: 'scene',
          count: 1,
          label: scene.id,
          reason: scene.reason ?? 'Scene failed; source speaker retained.',
        })),
    };
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

/** Mix only completed visuals; a mix failure must never masquerade as a complete export. */
async function mixSceneAudio(
  videoPath: string,
  cues: SceneCue[],
  outputPath: string,
  clipDuration: number,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  if (cues.length === 0) return videoPath;
  const mixed = await mixSceneSfx(videoPath, cues, {
    clipDuration,
    outputPath,
    masterDb: 7,
    bounded: true,
    ...(signal ? { signal } : {}),
  });
  signal?.throwIfAborted();
  if (!mixed.ok) throw new Error(`Scene SFX mix failed: ${mixed.error}`);
  return mixed.outputPath;
}

function sceneResult(
  segment: SceneSegment,
  status: 'rendered' | 'failed',
): LongformSceneRenderResult {
  const { id, kind, startTime, endTime } = segment.compiled.placement;
  return { id, kind, startTime, endTime, status };
}

/** Caller authorizes the source and owns the returned request directory/file after success. */
export async function renderLongformScenePreview(
  request: LongformScenePreviewRequest,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const meta = await getVideoMetadata(request.sourceVideoPath, { localOnly: true, signal });
  const sourceHasAudio = meta.audioCodec !== 'unknown';
  signal?.throwIfAborted();
  const validated = validateSceneFirstLongformPlan(
    request.plan,
    request.wordTimestamps,
    meta.duration,
  );
  if (!validated.ok) throw new Error(validated.error);
  const timeline = buildLongformSceneTimeline(validated.value.plan, validated.value.scenes);
  const segment = timeline.segments.find(
    (item): item is SceneSegment =>
      item.kind === 'scene' && item.compiled.placement.id === request.sceneId,
  );
  if (!segment) throw new Error('This scene is missing or omitted from the plan.');
  const selected = getPaletteById(request.paletteId, request.customPalettes);
  if (request.paletteId !== undefined && selected.id !== request.paletteId) {
    throw new Error('The preview palette is unavailable. Restore or select a palette first.');
  }
  const palette = deriveExplainerPalette({
    background: selected.background,
    foreground: selected.foreground,
    accent: selected.accent,
    ...(selected.accent2 ? { accent2: selected.accent2 } : {}),
  });
  const directory = mkdtempSync(join(tmpdir(), 'batchcontent-lf-preview-'));
  const workDirectory = join(directory, 'work');
  mkdirSync(workDirectory);
  const outputPath = join(directory, 'preview.mp4');
  const intermediate = join(workDirectory, 'segment.mp4');
  const narrated = join(workDirectory, 'narrated.mp4');
  const duration = Math.min(segment.endTime, meta.duration) - segment.startTime;
  const qualityParams: QualityParams = { crf: 28, preset: 'veryfast' };
  try {
    await renderSceneSegment({
      segment,
      sourceVideoPath: request.sourceVideoPath,
      sourceWidth: meta.width,
      sourceHeight: meta.height,
      palette,
      outputPath: intermediate,
      workDirectory,
      qualityParams,
      signal,
    });
    await concatLongformSceneSegments({
      segments: [{ path: intermediate, frameCount: segment.endFrame - segment.startFrame }],
      listPath: join(workDirectory, 'concat.txt'),
      sourceVideoPath: request.sourceVideoPath,
      outputPath: narrated,
      audioStartTime: segment.startTime,
      sourceHasAudio,
      duration,
      qualityParams,
      signal,
    });
    const cues =
      request.sceneSfxEnabled === false
        ? []
        : segment.compiled.planned.cues.map((cue) => ({ ...cue, at: cue.at - segment.startTime }));
    const mixedPath = await mixSceneAudio(
      narrated,
      cues,
      join(workDirectory, 'mixed.mp4'),
      duration,
      signal,
    );
    await publishNewOutput(mixedPath, outputPath, signal);
    return outputPath;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}
