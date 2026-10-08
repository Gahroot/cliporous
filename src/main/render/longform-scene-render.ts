import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isLongformPalette } from '@shared/longform-palette';
import {
  type LongformScenePreviewRequest,
  type LongformSceneRenderResult,
  partitionLongformPhrases,
  type SceneFirstLongformPlan,
} from '@shared/longform-scenes';
import { getPaletteById, type Palette } from '@shared/palettes';
import { resolveStoryboardPalette } from '@shared/storyboard-palette';
import { normalizeStoryboardStyle, type StoryboardStyle } from '@shared/storyboards';
import type { LongformRenderReconciliation, PhraseEmphasis, WordTimestamp } from '@shared/types';
import { validateSceneFirstLongformPlan } from '../ai/longform-scene-contract';
import { LANDSCAPE_FPS, LANDSCAPE_HEIGHT, LANDSCAPE_WIDTH } from '../aspect-ratios';
import { getVideoMetadata, type QualityParams } from '../ffmpeg';
import { log } from '../logger';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import {
  type ExplainerPalette,
  type ExplainerSequenceProps,
  mapSceneTimes,
  type SceneCue,
} from '../remotion/compositions/explainer/types';
import type { SceneCanvasNote } from '../remotion/compositions/scene-canvas/types';
import {
  applyPhraseOverlays,
  cleanupPhraseOverlayTempFiles,
} from './features/phrase-emphasis.feature';
import { concatLongformSceneSegments, encodeLongformSceneSegment } from './longform-encode';
import {
  buildSceneCanvasNotes,
  buildSceneCanvasPanels,
  groupSceneCanvases,
  type SceneCanvasGroup,
  sceneCanvasEnabled,
} from './longform-scene-canvas';
import { buildLongformSceneTimeline, type LongformSceneSegment } from './longform-scene-timeline';
import { buildLongformStoryboardProps } from './longform-storyboard-props';
import { mixSceneSfx } from './scene-sfx';
import { publishNewOutput } from './writable-output-path';

type SceneSegment = Extract<LongformSceneSegment, { kind: 'scene' }>;
interface Source {
  sourceVideoPath: string;
  sourceWidth: number;
  sourceHeight: number;
  palette: ExplainerPalette;
  storyboardPalette?: Palette;
  storyboardStyle?: StoryboardStyle;
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
  if (segment.compiled.kind !== 'explainer') throw new Error('Expected a compiled explainer.');
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

/** One canvas alpha render composited full-frame over the source; members share its fate. */
async function renderSceneCanvasSegment(
  opts: Source & {
    group: SceneCanvasGroup;
    notes: SceneCanvasNote[];
    closeBySec?: number | undefined;
    outputPath: string;
    workDirectory: string;
    qualityParams?: QualityParams | undefined;
    onProgress?: ((fraction: number) => void) | undefined;
  },
): Promise<void> {
  const { group, signal } = opts;
  if (!opts.storyboardPalette) throw new Error('Scene canvas palette is missing.');
  // Plans saved before storyboard styles existed carry none; use the shared default.
  const style = normalizeStoryboardStyle(opts.storyboardStyle);
  const visualPath = join(opts.workDirectory, 'canvas.mov');
  const frameCount = group.endFrame - group.startFrame;
  try {
    const { renderRemotionSegment } = await import('../remotion/render');
    signal?.throwIfAborted();
    await renderRemotionSegment({
      compositionId: 'SceneCanvas',
      inputProps: {
        style,
        palette: opts.storyboardPalette,
        durationSec: frameCount / LANDSCAPE_FPS,
        panels: buildSceneCanvasPanels(group),
        notes: opts.notes,
        ...(opts.closeBySec === undefined ? {} : { closeBySec: opts.closeBySec }),
      },
      durationSec: frameCount / LANDSCAPE_FPS,
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
    });
    signal?.throwIfAborted();
    await encodeLongformSceneSegment({
      sourceVideoPath: opts.sourceVideoPath,
      outputPath: opts.outputPath,
      sourceWidth: opts.sourceWidth,
      sourceHeight: opts.sourceHeight,
      background: resolveStoryboardPalette(style, opts.storyboardPalette).canvas,
      startTime: group.startTime,
      frameCount,
      visualPath,
      presentation: 'full-frame',
      sourceUnderlay: true,
      signal,
      qualityParams: opts.qualityParams,
      onProgress: (percent) => opts.onProgress?.(0.8 + percent / 500),
    });
    signal?.throwIfAborted();
  } finally {
    rmSync(visualPath, { force: true });
  }
}

/** Actual scene-segment path shared by export and preview; errors are never hidden here. */
async function renderSceneSegment(opts: SegmentOptions): Promise<void> {
  const { segment, signal } = opts;
  signal?.throwIfAborted();
  const visualPath = join(opts.workDirectory, 'scene.mov');
  const isBoard = segment.kind === 'scene' && segment.compiled.kind === 'storyboard';
  if (isBoard && (!opts.storyboardPalette || !opts.storyboardStyle))
    throw new Error('Storyboard appearance is missing from the saved plan.');
  const background =
    isBoard && opts.storyboardPalette && opts.storyboardStyle
      ? resolveStoryboardPalette(opts.storyboardStyle, opts.storyboardPalette).canvas
      : opts.palette.bgOuter;
  try {
    if (segment.kind === 'scene') {
      const { renderRemotionSegment } = await import('../remotion/render');
      signal?.throwIfAborted();
      const renderOptions = {
        compositionId: isBoard ? 'StoryBoard' : 'ExplainerSequence',
        inputProps: (isBoard && opts.storyboardStyle && opts.storyboardPalette
          ? buildLongformStoryboardProps(segment, opts.storyboardStyle, opts.storyboardPalette)
          : buildLongformSceneProps(segment, opts.palette)) as unknown as Record<string, unknown>,
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
      background,
      startTime: segment.startTime,
      frameCount: segment.endFrame - segment.startFrame,
      ...(segment.kind === 'scene'
        ? {
            visualPath,
            presentation: segment.compiled.placement.presentation,
            ...(isBoard ? { sourceUnderlay: true } : {}),
          }
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
  /** Raw immutable palette snapshot, required when the approved plan contains a board. */
  storyboardPalette?: Palette;
  qualityParams: QualityParams;
  sceneSfxEnabled?: boolean | undefined;
  /** Phrase overlay text colour; the composition's own accent is used when absent. */
  phraseColor?: string | undefined;
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
  if (
    validated.value.scenes.some((scene) => scene.kind === 'storyboard') &&
    !isLongformPalette(opts.storyboardPalette)
  )
    throw new Error('The approved storyboard palette snapshot is missing or invalid.');
  const timeline = buildLongformSceneTimeline(validated.value.plan, validated.value.scenes);
  // Keep the final encode on the destination volume for atomic publication after success.
  const workDirectory = mkdtempSync(join(dirname(opts.outputPath), '.batchcontent-lf-scenes-'));
  const finalPath = join(workDirectory, 'final.mp4');
  const sceneResults: LongformSceneRenderResult[] = [...timeline.omitted];
  const cues: SceneCue[] = [];
  const segments: { path: string; frameCount: number }[] = [];
  const phrasesOnCanvas = new Set<PhraseEmphasis>();
  const source: Source = {
    sourceVideoPath: opts.sourceVideoPath,
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    palette: opts.palette,
    storyboardPalette: opts.storyboardPalette,
    storyboardStyle: validated.value.plan.storyboardStyle,
    signal: opts.signal,
  };
  // Canvas grouping is export-only and derived from the approved plan; old plans default on.
  const canvasOn =
    sceneCanvasEnabled(validated.value.plan) && isLongformPalette(opts.storyboardPalette);
  const entries = canvasOn
    ? groupSceneCanvases(timeline.segments, timeline.totalFrames)
    : timeline.segments.map((segment) => ({ kind: 'segment' as const, segment }));
  const renderOrdinary = async (
    segment: LongformSceneSegment,
    outputPath: string,
  ): Promise<void> => {
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
        if (opts.sceneSfxEnabled !== false) cues.push(...compiledCues(segment));
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
  };
  try {
    for (const [index, entry] of entries.entries()) {
      opts.signal?.throwIfAborted();
      const outputPath = join(workDirectory, `segment-${index}.mp4`);
      if (entry.kind === 'canvas') {
        const { group } = entry;
        const span = group.endFrame - group.startFrame;
        const progress = (fraction: number): void =>
          opts.onProgress?.(
            `Drawing the scene canvas (${group.members.length} scenes)…`,
            ((group.startFrame + fraction * span) / timeline.totalFrames) * 0.9,
          );
        // Approved phrases spoken inside the canvas are drawn on the board instead of overlaid.
        const { notes, absorbed, closeBySec } = buildSceneCanvasNotes(
          group,
          validated.value.plan.phrases,
        );
        try {
          await renderSceneCanvasSegment({
            ...source,
            group,
            notes,
            closeBySec,
            outputPath,
            workDirectory,
            qualityParams: opts.qualityParams,
            onProgress: progress,
          });
          segments.push({ path: outputPath, frameCount: span });
          for (const phrase of absorbed) phrasesOnCanvas.add(phrase);
          for (const member of group.members) {
            sceneResults.push(sceneResult(member, 'rendered'));
            if (opts.sceneSfxEnabled !== false) cues.push(...compiledCues(member));
          }
          log('info', 'longform-scene-canvas', 'canvas rendered', {
            scenes: group.members.map((m) => m.compiled.placement.id),
            startTime: group.startTime,
            endTime: group.endTime,
            notes: notes.length,
          });
        } catch (error) {
          opts.signal?.throwIfAborted();
          const reason = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
          log('warn', 'longform-scene-canvas', 'canvas failed; rendering its scenes separately', {
            reason,
          });
          rmSync(outputPath, { force: true });
          // Fall back to the exact ordinary segments this canvas replaced, including the tail.
          const parts = timeline.segments.filter(
            (s) => s.startFrame >= group.startFrame && s.endFrame <= group.endFrame,
          );
          const covered = parts.reduce((n, s) => n + s.endFrame - s.startFrame, 0);
          const lastPart = parts[parts.length - 1];
          if (lastPart && covered < span)
            parts.push({
              kind: 'speaker',
              startFrame: lastPart.endFrame,
              endFrame: group.endFrame,
              startTime: lastPart.endFrame / LANDSCAPE_FPS,
              endTime: group.endTime,
            });
          for (const [partIndex, part] of parts.entries()) {
            const partPath = join(workDirectory, `segment-${index}-${partIndex}.mp4`);
            await renderOrdinary(part, partPath);
          }
        }
        continue;
      }
      await renderOrdinary(entry.segment, outputPath);
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
    // Phrase text over the full-screen speaker only. A scene that fell back to the speaker
    // keeps its window phrase-free: the approved plan never placed text there.
    // Phrases already written on a rendered canvas are not overlaid a second time.
    const fullPartition = partitionLongformPhrases(
      validated.value.plan.phrases,
      validated.value.plan.scenes,
      meta.duration,
    );
    const phrasePartition = {
      kept: fullPartition.kept.filter((phrase) => !phrasesOnCanvas.has(phrase)),
      dropped: fullPartition.dropped.filter(({ phrase }) => !phrasesOnCanvas.has(phrase)),
    };
    for (const { phrase, reason } of phrasePartition.dropped)
      log('warn', 'longform-phrases', 'phrase overlay skipped at export', {
        text: phrase.text.slice(0, 80),
        startTime: phrase.startTime,
        endTime: phrase.endTime,
        reason,
      });
    let visualPath = finalPath;
    let phraseStats = {
      rendered: phrasesOnCanvas.size,
      dropped: phrasePartition.dropped.length,
    };
    if (phrasePartition.kept.length > 0) {
      opts.onProgress?.('Adding phrase overlays…', 0.95);
      const phraseTarget = join(workDirectory, 'phrases.mp4');
      const result = await applyPhraseOverlays({
        inputPath: finalPath,
        outputPath: phraseTarget,
        phrases: phrasePartition.kept,
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        fps: LANDSCAPE_FPS,
        qualityParams: opts.qualityParams,
        ...(opts.phraseColor ? { phraseColor: opts.phraseColor } : {}),
      });
      cleanupPhraseOverlayTempFiles(result.tempFiles);
      visualPath = result.outputPath;
      phraseStats = {
        rendered: phrasesOnCanvas.size + result.stats.rendered,
        dropped: phraseStats.dropped + result.stats.dropped,
      };
      opts.signal?.throwIfAborted();
    }
    const byId = new Map(sceneResults.map((result) => [result.id, result]));
    const results = validated.value.plan.scenes.map((scene) => {
      const result = byId.get(scene.id);
      if (!result) throw new Error(`Scene ${scene.id} has no render reconciliation.`);
      return result;
    });
    const mixedPath = await mixSceneAudio(
      visualPath,
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
      phrases: {
        planned: validated.value.plan.phrases.length,
        eligible: phrasePartition.kept.length + phrasesOnCanvas.size,
        rendered: phraseStats.rendered,
        dropped: phraseStats.dropped,
      },
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

function compiledCues(segment: SceneSegment): SceneCue[] {
  return segment.compiled.kind === 'storyboard'
    ? segment.compiled.cues
    : segment.compiled.planned.cues;
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
  if (
    !isLongformPalette(selected) ||
    (request.paletteId !== undefined && selected.id !== request.paletteId)
  ) {
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
      storyboardPalette: selected,
      storyboardStyle: validated.value.plan.storyboardStyle,
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
        : compiledCues(segment).map((cue) => ({ ...cue, at: cue.at - segment.startTime }));
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
