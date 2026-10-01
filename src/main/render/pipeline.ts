// ---------------------------------------------------------------------------
// Pipeline orchestrator — composable feature-based batch render
// ---------------------------------------------------------------------------
//
// Replaces the monolithic startBatchRender() in render-pipeline.ts with a
// modular feature pipeline. Each feature hooks into prepare → videoFilter →
// overlayPass → postProcess lifecycle phases.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { Ch } from '@shared/ipc-channels';
import { getPaletteById } from '@shared/palettes';
import type { VideoSegment } from '@shared/types';
import type { BrowserWindow } from 'electron';
import { writeDescriptionFile } from '../ai/description-generator';
import type { PlannerGenerator } from '../ai/explainer/planner-generation';
import type { PlannerProfileId } from '../ai/explainer/planner-profiles';
import type { PlanningObserver } from '../ai/explainer/planning-diagnostics';
import {
  clipIdentity,
  createPlanningReservations,
  type UsageChoice,
  type UsageRecord,
} from '../ai/explainer/recent-usage';
import type { PlannerEditPlan } from '../ai/explainer-scenes';
import { fetchSegmentVideos } from '../ai/segment-videos';
import type { OutputAspectRatio } from '../aspect-ratios';
import { OUTPUT_FPS, OUTPUT_HEIGHT, OUTPUT_WIDTH } from '../aspect-ratios';
import type { ArchetypeWindow } from '../captions';
import { DEFAULT_EDIT_STYLE_ID, getEditStyleById } from './../edit-styles/index';
import {
  ARCHETYPE_DEFAULT_TRANSITION_IN,
  ARCHETYPE_TO_CATEGORY,
} from './../edit-styles/shared/archetypes';
import { BRAND_FG } from './../edit-styles/shared/brand';
import type { ManifestJobMeta } from '../export-manifest';
import type { FfmpegCommand } from '../ffmpeg';
import { getEncoder, getVideoMetadata, isHardwareEncoder } from '../ffmpeg';
import { remapTimeAfterFillers } from '../filler-cuts';
import type { PlannerUsageStore } from '../planner-usage-store';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import type { SceneCue } from '../remotion/compositions/explainer/types';
import { analyzeEmphasisHeuristic, type EmphasizedWord } from '../word-emphasis';
import { activeCommands, buildVideoFilter, renderClip } from './base-render';
import { applyExplainerScenes } from './explainer-scenes';
import { accentColorFeature, restoreBatchOptions } from './features/accent-color.feature';
import { autoZoomFeature } from './features/auto-zoom.feature';
import { brollFeature } from './features/broll.feature';
import { createCaptionsFeature } from './features/captions.feature';
import type {
  FilterContext,
  OverlayContext,
  OverlayPassResult,
  PostProcessContext,
  RenderFeature,
} from './features/feature';
// Feature imports
import { createFillerRemovalFeature, runFillerRemoval } from './features/filler-removal.feature';
import { createHookTitleFeature } from './features/hook-title.feature';
import { createRehookFeature } from './features/rehook.feature';
import { shotTransitionFeature } from './features/shot-transition.feature';
import { wordEmphasisFeature } from './features/word-emphasis.feature';
import { buildOutputPath } from './filename';
import { renderLongformVideo } from './longform-pipeline';
import { enforceSpeakerOpening, MIN_FACE_LEAD_SECONDS } from './opening-guard';
import { measureFaceBands } from './over-face';
import { resolveQualityParams } from './quality';
import { applyQuoteGraphics } from './quote-graphics';
import { classifyRenderError } from './render-error-map';
import type { ResolvedSegment, SegmentRenderConfig } from './segment-render';
import { renderSegmentedClip } from './segment-render';
import { assembleStitchedVideo } from './stitched-render';
import type { RenderBatchOptions, RenderClipJob, RenderStitchedClipJob } from './types';
import { resolveWritableOutputPath } from './writable-output-path';

// ---------------------------------------------------------------------------
// Cancellation state
// ---------------------------------------------------------------------------

let cancelRequested = false;
let stopAfterCurrentRequested = false;
let batchAbortController = new AbortController();
const cancelledJobIds = new Set<string>();

/** Reset cancellation before IPC preparation starts for a new batch. */
export function beginRenderBatch(): void {
  batchAbortController.abort();
  batchAbortController = new AbortController();
  cancelRequested = false;
  stopAfterCurrentRequested = false;
  cancelledJobIds.clear();
}

/** Allow expensive IPC preparation passes to stop before encoding begins. */
export function isRenderCancellationRequested(): boolean {
  return cancelRequested;
}

/** Let active encodes finish, then leave every remaining row queued. */
export function stopRenderAfterCurrent(): void {
  stopAfterCurrentRequested = true;
}

/** Skip one job that has not started encoding yet. */
export function cancelQueuedRenderJob(clipId: string): void {
  cancelledJobIds.add(clipId);
}

/**
 * Cancel the active render batch. Kills all running FFmpeg processes.
 */
export function cancelRender(): void {
  cancelRequested = true;
  batchAbortController.abort();
  const failures: string[] = [];
  for (const cmd of activeCommands) {
    try {
      (cmd as FfmpegCommand).kill('SIGTERM');
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  // Commands remove themselves on end/error. Keeping them tracked means a user
  // can retry cancellation if the first signal failed instead of seeing a false
  // idle state while FFmpeg continues in the background.
  if (failures.length > 0) {
    throw new Error(
      `Cancellation failed for ${failures.length} video process(es): ${failures.join('; ')}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Stitched timeline remapping helpers
// ---------------------------------------------------------------------------

/**
 * Remap a source-video timestamp onto the concatenated stitched timeline.
 * Returns null when the timestamp falls outside every segment (i.e. it was
 * cut from the output).
 */
function remapSourceTime(
  sourceTime: number,
  segments: Array<{ startTime: number; endTime: number }>,
): number | null {
  let concatStart = 0;
  for (const seg of segments) {
    if (sourceTime >= seg.startTime && sourceTime <= seg.endTime) {
      return concatStart + (sourceTime - seg.startTime);
    }
    concatStart += seg.endTime - seg.startTime;
  }
  return null;
}

function remapWordTimestamps(
  words: Array<{ text: string; start: number; end: number }> | undefined,
  segments: Array<{ startTime: number; endTime: number }>,
): Array<{ text: string; start: number; end: number }> | undefined {
  if (!words || words.length === 0) return words;
  const out: Array<{ text: string; start: number; end: number }> = [];
  for (const w of words) {
    const s = remapSourceTime(w.start, segments);
    const e = remapSourceTime(w.end, segments);
    if (s !== null && e !== null && e >= s) {
      out.push({ text: w.text, start: s, end: e });
    }
  }
  return out;
}

function remapWordEmphasis<T extends { start: number; end: number }>(
  emphasis: T[] | undefined,
  segments: Array<{ startTime: number; endTime: number }>,
): T[] | undefined {
  if (!emphasis || emphasis.length === 0) return emphasis;
  const out: T[] = [];
  for (const e of emphasis) {
    const s = remapSourceTime(e.start, segments);
    const en = remapSourceTime(e.end, segments);
    if (s !== null && en !== null && en >= s) {
      out.push({ ...e, start: s, end: en });
    }
  }
  return out;
}

/**
 * Start times (source seconds) of stressed words for explainer emphasis
 * reactions: the upstream AI emphasis when present, else the local heuristic.
 */
function explainerEmphasisTimes(
  emphasis: EmphasizedWord[] | undefined,
  words: { text: string; start: number; end: number }[],
): number[] {
  const source = emphasis && emphasis.length > 0 ? emphasis : analyzeEmphasisHeuristic(words);
  return source.filter((w) => w.emphasis !== 'normal').map((w) => w.start);
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Start a batch render of approved clips using the composable feature pipeline.
 *
 * Flow per clip:
 *   1. feature.prepare()     — pre-render setup (generate ASS, detect fillers, etc.)
 *   2. buildVideoFilter()    — base crop + scale
 *   3. feature.videoFilter() — append feature-specific filters (auto-zoom)
 *   4. renderClip()          — base FFmpeg encode (+ logo, sound design, bumpers)
 *   5. feature.overlayPass() — collect overlay passes (captions, hook, rehook, bar)
 *   6. feature.postProcess() — post-processing (B-Roll)
 */
/**
 * Data passed to a `BatchDoneHandler` so the IPC layer (or test harness) can
 * write the export manifest alongside the rendered MP4s. Decoupling the
 * manifest write from this orchestrator means manifest IO is invoked from
 * `render-handlers.ts` on `render:batchDone` rather than buried mid-pipeline.
 */
export interface BatchDoneInfo {
  options: RenderBatchOptions;
  jobs: RenderClipJob[];
  outputDirectory: string;
  clipMeta: ManifestJobMeta[];
  clipResults: Map<string, string | null>;
  clipRenderTimes: Map<string, number>;
  totalRenderTimeMs: number;
  encoder: string;
  completed: number;
  failed: number;
  total: number;
}

/**
 * Result of the batch-done handler. The IPC layer writes the export manifest
 * and reports back the on-disk paths so they can be forwarded to the renderer
 * in the `render:batchDone` event (lets the UI offer an "Open CSV" action).
 */
export interface BatchDoneResult {
  manifestCsvPath?: string;
  manifestJsonPath?: string;
}

export type BatchDoneHandler = (
  info: BatchDoneInfo,
) => undefined | BatchDoneResult | Promise<undefined | BatchDoneResult>;

export interface RenderedLayoutWindow {
  archetype: ResolvedSegment['archetype'];
  layout?: ResolvedSegment['explainerLayout'];
  startTime: number;
  endTime: number;
}

export interface RenderExecutionOptions {
  signal?: AbortSignal;
  plannerUsage?: PlannerUsageStore;
  profile?: PlannerProfileId;
  generator?: PlannerGenerator;
  plans?: ReadonlyMap<string, { plan: PlannerEditPlan; wordsHash: string }>;
  noAi?: boolean;
  onDiagnostic?: PlanningObserver;
  onRendered?: (clipId: string, choices: UsageChoice[], timeline: RenderedLayoutWindow[]) => void;
}

export async function startBatchRender(
  options: RenderBatchOptions,
  window: BrowserWindow,
  onBatchDone?: BatchDoneHandler,
  execution: RenderExecutionOptions = {},
): Promise<void> {
  execution.signal?.throwIfAborted();
  const isCancelled = (): boolean => cancelRequested || execution.signal?.aborted === true;
  if (execution.noAi) {
    if (
      execution.generator ||
      options.outputProfile === 'longform' ||
      options.jobs.some(
        (job) => !job.segmentedSegments?.length || !execution.plans?.get(job.clipId)?.plan,
      )
    )
      throw new Error(
        'No-AI previews require a saved plan for every segmented vertical job and no generator',
      );
    options = structuredClone(options);
    const stripKeys = (value: object): void => {
      for (const [key, child] of Object.entries(value)) {
        if (/api[_-]?key|(?:access|auth)[_-]?token|secret/i.test(key))
          delete (value as Record<string, unknown>)[key];
        else if (child && typeof child === 'object') stripKeys(child);
      }
    };
    stripKeys(options);
    if (options.broll) options.broll.enabled = false;
  }
  // Cancellation is reset by the IPC handler before its preparation passes.
  // Keeping the flag here prevents a cancel received during preparation from
  // being erased immediately before encoding starts.

  // ── Long-form (16:9) routing ──────────────────────────────────────────────
  // When the caller requests the long-form profile, delegate to the dedicated
  // 1920×1080 orchestrator and return. The 9:16 path below is untouched when
  // outputProfile is undefined/'vertical'.
  if (options.outputProfile === 'longform') {
    const signal = execution.signal
      ? AbortSignal.any([batchAbortController.signal, execution.signal])
      : batchAbortController.signal;
    await renderLongformVideo(options, window, signal);
    return;
  }

  const { jobs, outputDirectory } = options;
  const total = jobs.length;

  // ── Brand palette ─────────────────────────────────────────────────────────
  // The palette the user selected before rendering drives explainer scenes
  // and the caption accent (a per-clip accent override still wins, applied
  // later by the accent-color feature / explainer seed).
  const selectedPalette = getPaletteById(options.longformPaletteId, options.customPalettes);
  if (options.captionStyle) {
    options.captionStyle = { ...options.captionStyle, accentColor: selectedPalette.accent };
  }

  // Ensure output directory exists
  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true });
  }

  // ── Create feature instances ──────────────────────────────────────────────
  // Registration order determines prepare() execution order.
  // Data flows via job mutation — earlier features write, later ones read.
  //
  //  1. filler-removal    — mutates job.sourceVideoPath, startTime, endTime, wordTimestamps
  //  2. accent-color      — reads clipOverrides.accentColor, overrides highlight/emphasis
  //                         colors in captionStyle, hookTitleOverlay, and per-shot
  //                         captionStyle — must run before any visual feature
  //  3. word-emphasis     — writes job.wordEmphasis + job.emphasisKeyframes
  //  4. captions          — reads job.wordEmphasis, generates ASS, fallback emphasisKeyframes
  //  5. hook-title        — generates ASS overlay file
  //  6. rehook            — reads hookTitleOverlay.displayDuration + textColor for appear time
  //  7. auto-zoom         — reads job.emphasisKeyframes for reactive zoom (prepare stores settings)
  //  8. broll             — reads job.brollPlacements + shotStyleConfigs.brollMode,
  //                         emits 'broll-transition' editEvents
  //  9. shot-transition   — reads shotStyleConfigs, emits 'shot-transition' editEvents
  //
  // Cross-feature data flow:
  //   filler-removal ──wordTimestamps──▸ word-emphasis (remapped timestamps)
  //   accent-color ──captionStyle colors──▸ captions, hook-title (+rehook)
  //   word-emphasis ──wordEmphasis──▸ captions (emphasis tags for ASS styling)
  //   word-emphasis ──emphasisKeyframes──▸ auto-zoom (reactive zoom keyframes)
  //   captions ──emphasisKeyframes (fallback)──▸ auto-zoom (if word-emphasis didn't produce them)
  //   IPC handler ──brollPlacements──▸ broll (postProcess + edit event emission)
  const features: RenderFeature[] = [
    createFillerRemovalFeature(),
    accentColorFeature,
    wordEmphasisFeature,
    createCaptionsFeature(),
    createHookTitleFeature(),
    createRehookFeature(),
    autoZoomFeature,
    brollFeature,
    shotTransitionFeature,
  ];

  // ── Resolve batch-level config ────────────────────────────────────────────
  const qualityParams = resolveQualityParams(options.renderQuality);
  const outputFormat = options.renderQuality?.outputFormat ?? 'mp4';

  // Output is hard-locked to 1080×1920 © 30fps (9:16 vertical).
  // outputAspectRatio and outputResolution are accepted for backward compat
  // but ignored — every clip renders at the locked dimensions.
  const effectiveAspectRatio: OutputAspectRatio = '9:16';
  const effectiveResolution: { width: number; height: number } = {
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
  };

  // ── Determine effective concurrency ───────────────────────────────────────
  const currentEncoder = getEncoder(qualityParams);
  const encoderIsHardware = isHardwareEncoder(currentEncoder.encoder);
  const requestedConcurrency = Math.max(1, Math.min(4, options.renderConcurrency ?? 1));
  const effectiveConcurrency = encoderIsHardware
    ? Math.min(2, requestedConcurrency)
    : requestedConcurrency;

  console.log(
    `[Quality] preset=${options.renderQuality?.preset ?? 'normal'}, ` +
      `crf=${qualityParams.crf}, preset=${qualityParams.preset}, ` +
      `format=${outputFormat}, resolution=${effectiveResolution.width}x${effectiveResolution.height}, ` +
      `aspectRatio=${effectiveAspectRatio}`,
  );
  console.log(
    `[Concurrency] requested=${requestedConcurrency}, effective=${effectiveConcurrency}, ` +
      `encoder=${currentEncoder.encoder}`,
  );

  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  // Manifest tracking
  const manifestResults = new Map<string, string | null>();
  const manifestRenderTimes = new Map<string, number>();
  const batchStartTime = Date.now();

  // Cache video metadata per source file to avoid redundant ffprobe calls
  const metadataCache = new Map<
    string,
    {
      width: number;
      height: number;
      codec: string;
      fps: number;
      audioCodec: string;
      duration: number;
    }
  >();

  // Capture identity/order before stitched assembly or filler removal rewrites jobs.
  let history: UsageRecord[] = [];
  let startOrder = 0;
  try {
    history = (await execution.plannerUsage?.load()) ?? [];
    startOrder = execution.plannerUsage?.reserveOrders(jobs.length) ?? 0;
  } catch (error) {
    console.warn('[Pipeline] Planner history unavailable:', error);
  }
  const identities = jobs.map((job, index) => ({
    key: String(index),
    clipHash: clipIdentity(job.sourceVideoPath, job.startTime, job.endTime),
  }));
  const reservations = createPlanningReservations(identities, history, startOrder);
  const canPlan = (job: RenderClipJob): boolean =>
    !!job.segmentedSegments?.length &&
    (!!execution.plans?.get(job.clipId) ||
      (options.explainerScenesEnabled !== false &&
        !!(options.geminiApiKey?.trim() || execution.generator) &&
        !!job.wordTimestamps?.length));
  jobs.forEach((job, index) => {
    if (!canPlan(job) || cancelledJobIds.has(job.clipId)) reservations.release(String(index));
  });
  const recordRendered = async (
    job: RenderClipJob,
    index: number,
    choices: UsageChoice[],
    timeline: RenderedLayoutWindow[],
  ): Promise<void> => {
    if (isCancelled()) return;
    try {
      execution.onRendered?.(job.clipId, structuredClone(choices), structuredClone(timeline));
    } catch (error) {
      console.warn('[Pipeline] Render observer failed:', error);
    }
    try {
      await execution.plannerUsage?.commit(
        {
          clipHash: identities[index].clipHash,
          order: startOrder + index,
          choices,
        },
        execution.signal,
      );
    } catch (error) {
      console.warn('[Pipeline] Planner history write failed:', error);
    }
  };

  // ── Per-clip job processor ────────────────────────────────────────────────

  const processJob = async (job: RenderClipJob, i: number): Promise<void> => {
    if (isCancelled()) {
      reservations.release(String(i));
      return;
    }
    if (cancelledJobIds.has(job.clipId)) {
      reservations.release(String(i));
      cancelled++;
      window.webContents.send(Ch.Send.RENDER_CLIP_CANCELLED, { clipId: job.clipId });
      return;
    }
    // A previous render of this clip may still be open in a player (locked on
    // Windows) - fall back to a ` (n)` sibling rather than failing the clip.
    const outputPath = resolveWritableOutputPath(
      buildOutputPath(outputDirectory, job, i, outputFormat, options.filenameTemplate, {
        score: job.manifestMeta?.score ?? 0,
        quality: options.renderQuality?.preset ?? 'normal',
      }),
    );

    // Safety: ensure output directory exists right before rendering
    const clipOutputDir = dirname(outputPath);
    if (!existsSync(clipOutputDir)) {
      mkdirSync(clipOutputDir, { recursive: true });
    }

    window.webContents.send(Ch.Send.RENDER_CLIP_START, {
      clipId: job.clipId,
      index: i,
      total,
      encoder: currentEncoder.encoder,
      encoderIsHardware,
    });

    // Initial prepare-phase progress
    window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
      clipId: job.clipId,
      message: 'Preparing clip…',
      percent: 0,
    });

    const clipStartTime = Date.now();
    let capturedCommand: string | undefined;
    const allTempFiles: string[] = [];
    let renderedChoices: UsageChoice[] = [];
    let renderedTimeline: RenderedLayoutWindow[] = [];

    try {
      // ── Stitched clip assembly pre-pass ──────────────────────────────────
      // Stitched clips are multiple source-video time ranges concatenated into
      // one output. We do ONLY the stitched-specific work here (per-segment
      // crop/layout via the edit-style template + concat into a raw MP4), then
      // rewrite the job to point at the assembled MP4 with remapped timestamps.
      // After this block, the job looks identical to a regular clip and runs
      // through the exact same feature pipeline — captions, hook title,
      // rehook, color grade, accent color, sound design, etc.
      if (job.stitchedSegments && job.stitchedSegments.length > 0) {
        window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
          clipId: job.clipId,
          message: 'Assembling stitched segments…',
          percent: 0,
        });

        const stitchedStyleId = job.stylePresetId ?? DEFAULT_EDIT_STYLE_ID;
        // Stitched assembly only needs to crop+scale source ranges and concat
        // them. Archetype text / color treatment is owned by the feature
        // pipeline that runs on the assembled output, so strip overlayText /
        // accentColor / captionBgOpacity here. Hook segments still get a
        // tight-punch crop; everything else collapses to talking-head.
        const styledStitchedSegments = job.stitchedSegments.map((seg) => ({
          startTime: seg.startTime,
          endTime: seg.endTime,
          role: seg.role,
          imagePath: seg.imagePath,
          cropRect: seg.cropRect,
        }));

        const assemblyJob: RenderStitchedClipJob = {
          clipId: job.clipId,
          sourceVideoPath: job.sourceVideoPath,
          segments: styledStitchedSegments,
          stylePresetId: stitchedStyleId,
          cropRegion: job.cropRegion,
          outputFileName: job.outputFileName,
        };

        const assembledPath = join(
          tmpdir(),
          `batchcontent-stitched-${job.clipId}-${Date.now()}.mp4`,
        );
        allTempFiles.push(assembledPath);

        await assembleStitchedVideo(
          assemblyJob,
          assembledPath,
          (percent) => {
            if (!isCancelled()) {
              // Assembly runs in the prepare phase — report under the same
              // prepare channel the feature pipeline will use shortly.
              window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message: 'Assembling stitched segments…',
                // Reserve the first half of the prepare percent budget for
                // assembly so feature-prepare can claim 50-100.
                percent: Math.min(49, Math.round(percent * 0.49)),
              });
            }
          },
          qualityParams,
        );

        // ── Rewrite the job to look like a regular clip on the assembled MP4 ──
        // Remap all source-time data (word timestamps, word emphasis, shots)
        // onto the concatenated timeline so captions/sound-design/shot-style
        // see the right times when they run.
        const totalDuration = styledStitchedSegments.reduce(
          (sum, s) => sum + (s.endTime - s.startTime),
          0,
        );

        // wordTimestamps / wordEmphasis are in source-video time for stitched
        // clips (same convention the old stitched path used). Remap them onto
        // the concatenated timeline so caption / sound-design / word-emphasis
        // features see clip-local times.
        job.wordTimestamps = remapWordTimestamps(job.wordTimestamps, styledStitchedSegments);
        job.wordEmphasis = remapWordEmphasis(job.wordEmphasis, styledStitchedSegments);
        job.wordEmphasisOverride = remapWordEmphasis(
          job.wordEmphasisOverride,
          styledStitchedSegments,
        );

        // Shot-based data is not currently populated for stitched clips; if it
        // shows up in the future, decide the time basis at that point.
        job.shots = undefined;
        job.shotStyleConfigs = undefined;
        job.shotStyles = undefined;

        job.sourceVideoPath = assembledPath;
        job.startTime = 0;
        job.endTime = totalDuration;
        // Assembled video is already at the locked 1080×1920 — no further crop needed.
        job.cropRegion = undefined;
        // Clear the stitched marker so we don't re-enter this block.
        job.stitchedSegments = undefined;
        // Fall through to the regular feature pipeline below.
      }

      // ── Segmented clip shortcut ───────────────────────────────────────────
      // When segmentedSegments are present, delegate to the segment-based render
      // path which encodes each segment with its own layout, zoom, and caption
      // treatment, then concatenates with configurable transitions.
      if (job.segmentedSegments && job.segmentedSegments.length > 0) {
        // ── Filler removal (pre-segment) ────────────────────────────
        // The feature pipeline (which normally runs filler removal) is
        // skipped on the segmented path. Run it inline here so:
        //   1. The cleaned MP4 becomes the source for per-segment encoding
        //   2. `segmentedSegments[].startTime/endTime` are remapped onto the
        //      cleaned timeline so each segment encodes the right audio range
        //   3. `job.wordTimestamps` are 0-based against the cleaned source
        //      (handled inside `runFillerRemoval`)
        if (options.fillerRemoval?.enabled && job.clipOverrides?.enableFillerRemoval !== false) {
          window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
            clipId: job.clipId,
            message: 'Removing fillers & silences…',
            percent: 2,
          });
          const fillerResult = await runFillerRemoval(job, options, (message, percent) => {
            if (!isCancelled()) {
              window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message,
                percent: Math.min(4, Math.round(percent * 0.04)),
              });
            }
          });
          allTempFiles.push(...fillerResult.tempFiles);

          if (fillerResult.modified) {
            // Remap every segment's source-time bounds onto the cleaned
            // timeline. Drop segments whose entire word range collapses
            // (start ≥ end after remap) — they were 100% filler/silence.
            // The metadata cache key was the OLD source path; invalidate it
            // so the metadata fetch below probes the cleaned intermediate.
            metadataCache.delete(job.sourceVideoPath);
            const remappedSegments = job.segmentedSegments
              .map((raw) => {
                const newStart = remapTimeAfterFillers(
                  raw.startTime,
                  fillerResult.originalStart,
                  fillerResult.originalEnd,
                  fillerResult.fillerSegments,
                );
                const newEnd = remapTimeAfterFillers(
                  raw.endTime,
                  fillerResult.originalStart,
                  fillerResult.originalEnd,
                  fillerResult.fillerSegments,
                );
                return { ...raw, startTime: newStart, endTime: newEnd };
              })
              .filter((s) => s.endTime - s.startTime >= 0.1);

            if (remappedSegments.length === 0) {
              console.warn(
                `[Pipeline] Filler removal collapsed every segment for clip ${job.clipId} — aborting clip`,
              );
              window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
                clipId: job.clipId,
                error: 'Filler removal removed every segment; clip is empty.',
              });
              return;
            }
            job.segmentedSegments = remappedSegments;
          }
        }

        // Resolve source metadata for the segmented clip (after potential
        // filler-removal swap of `job.sourceVideoPath` to the cleaned file).
        let segMeta: { width: number; height: number; fps: number };
        const segCached = metadataCache.get(job.sourceVideoPath);
        if (segCached) {
          segMeta = segCached;
        } else {
          try {
            const fullMeta = await getVideoMetadata(job.sourceVideoPath);
            metadataCache.set(job.sourceVideoPath, fullMeta);
            segMeta = fullMeta;
          } catch (metaErr) {
            const msg = metaErr instanceof Error ? metaErr.message : String(metaErr);
            throw new Error(
              `Failed to read source video metadata for segmented clip ${job.clipId}: ${msg}`,
            );
          }
        }

        // Resolve edit style (defaults to cinematic if not set)
        const editStyleId = job.stylePresetId ?? DEFAULT_EDIT_STYLE_ID;
        const editStyle = getEditStyleById(editStyleId) ?? getEditStyleById(DEFAULT_EDIT_STYLE_ID)!;

        // ── Inline b-roll video fetch for media-archetype segments ──────────
        // Only runs at render time, only for approved clips that contain a
        // split-image / fullscreen-image segment, only when B-roll is enabled
        // (explainer scenes own the top half otherwise) and the Pexels key
        // is set. Cached on disk so re-renders are free. Without footage these
        // segments degrade to talking-head.
        const mediaRaws = job.segmentedSegments.filter(
          (raw) => raw.archetype === 'split-image' || raw.archetype === 'fullscreen-image',
        );
        if (
          mediaRaws.length > 0 &&
          options.broll?.enabled === true &&
          options.pexelsApiKey &&
          options.pexelsApiKey.trim().length > 0
        ) {
          window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
            clipId: job.clipId,
            message: `Fetching ${mediaRaws.length} b-roll video(s)…`,
            percent: 5,
          });
          // Build minimal VideoSegment-shaped objects for the video fetcher.
          // It only reads id, captionText, segmentStyleCategory, start/end.
          const stubs: VideoSegment[] = mediaRaws.map((raw) => ({
            id: raw.id ?? `${job.clipId}-${raw.startTime}`,
            clipId: job.clipId,
            index: 0,
            startTime: raw.startTime,
            endTime: raw.endTime,
            captionText: raw.captionText ?? '',
            words: [],
            archetype: raw.archetype,
            segmentStyleCategory: ARCHETYPE_TO_CATEGORY[raw.archetype],
            zoomKeyframes: [],
            transitionIn: 'hard-cut',
            transitionOut: 'hard-cut',
          }));
          try {
            const videoMap = await fetchSegmentVideos(
              stubs,
              options.pexelsApiKey,
              options.geminiApiKey ?? '',
            );
            for (const raw of mediaRaws) {
              const stubId = raw.id ?? `${job.clipId}-${raw.startTime}`;
              const path = videoMap.get(stubId);
              if (path) raw.videoPath = path;
            }
          } catch (vidErr) {
            const msg = vidErr instanceof Error ? vidErr.message : String(vidErr);
            console.warn(`[Pipeline] Segment b-roll fetch failed for clip ${job.clipId}: ${msg}`);
            // Non-fatal — segments without videoPath surface as fallbackReason
            // at render time and degrade to talking-head.
          }
        }

        // Build minimal ResolvedSegments — archetype owns layout + caption
        // marginV; no per-segment text / color / variant plumbing. Captions,
        // hook title, and rehook are burned post-concat inside
        // renderSegmentedClip from the data forwarded below.
        const builtSegments: ResolvedSegment[] = job.segmentedSegments.map((raw) => ({
          startTime: raw.startTime,
          endTime: raw.endTime,
          archetype: raw.archetype,
          zoom: {
            style: raw.zoomStyle ?? editStyle.defaultZoomStyle,
            intensity: raw.zoomIntensity ?? editStyle.defaultZoomIntensity,
          },
          transitionIn:
            options.shotTransitionsEnabled === false ||
            job.clipOverrides?.enableShotTransitions === false
              ? 'hard-cut'
              : (ARCHETYPE_DEFAULT_TRANSITION_IN[raw.archetype] ?? editStyle.defaultTransition),
          videoPath: raw.videoPath,
          cropRect: raw.cropRect,
        }));

        // ── Opening guard ────────────────────────────────────────────────
        // Guarantee the clip opens on the speaker (talking-head) within the
        // first MIN_FACE_LEAD_SECONDS. When the first segment is a non-speaker
        // archetype (fullscreen image/quote card, split-image), it is split or
        // demoted so a face is visible from frame 0 and any media/card overlay
        // is delayed past the lead.
        let resolvedSegments: ResolvedSegment[] = enforceSpeakerOpening(builtSegments);

        // ── Explainer scenes ────────────────────────────────────────────────────
        // Transcript-driven animated diagrams on the top half (speaker on the
        // bottom). Scenes start after the speaker opening and the hook title,
        // replace whatever layout their window had, and fall back to the
        // speaker on any failure.
        if (isCancelled()) return;
        const explainerKey = options.geminiApiKey?.trim();
        const savedPlan = execution.plans?.get(job.clipId);
        let sceneCues: SceneCue[] = [];
        const firstSeg = resolvedSegments[0];
        const lastSeg = resolvedSegments[resolvedSegments.length - 1];
        if (
          firstSeg &&
          lastSeg &&
          (savedPlan ||
            (options.explainerScenesEnabled !== false &&
              (explainerKey || execution.generator) &&
              job.wordTimestamps?.length))
        ) {
          const hookLead =
            options.hookTitleOverlay?.enabled && job.hookTitleText
              ? (options.hookTitleOverlay.displayDuration ?? 2.5)
              : 0;
          const clipAccent = job.clipOverrides?.accentColor;
          const recentUse = await reservations.acquire(String(i), execution.signal);
          let reserved = false;
          const explainer = await applyExplainerScenes({
            apiKey: explainerKey ?? '',
            precomputedPlan: savedPlan?.plan,
            precomputedWordsHash: savedPlan?.wordsHash,
            noAi: execution.noAi,
            profile: execution.profile,
            generator: execution.generator,
            signal: execution.signal,
            recentUse,
            onDiagnostic: execution.onDiagnostic,
            onPlanned: (choices) => {
              if (reserved || isCancelled()) return;
              reservations.reserve(String(i), choices);
              reserved = true;
            },
            segments: resolvedSegments,
            words: job.wordTimestamps ?? [],
            bounds: {
              minStart: firstSeg.startTime + Math.max(MIN_FACE_LEAD_SECONDS, hookLead),
              maxEnd: lastSeg.endTime,
            },
            palette: deriveExplainerPalette({
              background: selectedPalette.background,
              foreground: selectedPalette.foreground,
              accent: clipAccent ?? selectedPalette.accent,
              ...(selectedPalette.accent2 ? { accent2: selectedPalette.accent2 } : {}),
            }),
            emphasisTimes: explainerEmphasisTimes(job.wordEmphasis, job.wordTimestamps ?? []),
            measureFaces: (windows) => measureFaceBands(job.sourceVideoPath, windows),
            framing: {
              sourceWidth: segMeta.width,
              sourceHeight: segMeta.height,
              width: effectiveResolution.width,
              height: effectiveResolution.height,
            },
            isCancelled,
            onProgress: (message, fraction) => {
              if (!isCancelled()) {
                window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                  clipId: job.clipId,
                  message,
                  percent: 6 + Math.round(fraction * 14),
                });
              }
            },
          });
          allTempFiles.push(...explainer.tempFiles);
          resolvedSegments = explainer.segments;
          sceneCues = explainer.cues;
          renderedChoices = explainer.renderedChoices;
        }
        // Release skipped/empty/failed planning; a reserved proposal remains in this batch.
        reservations.release(String(i));
        if (isCancelled()) return;

        // ── Quote-card graphics ─────────────────────────────────────────────────────
        // Fullscreen-quote cards keep their sand backdrop and one-word-at-a-time
        // serif text; when the quote names a catalog prop, that prop animates
        // in the top band. Same toggle as the explainer scenes; no API call.
        if (
          options.explainerScenesEnabled !== false &&
          job.wordTimestamps &&
          job.wordTimestamps.length > 0 &&
          resolvedSegments.some((s) => s.archetype === 'fullscreen-quote')
        ) {
          const quotes = await applyQuoteGraphics({
            onDiagnostic: execution.onDiagnostic,
            segments: resolvedSegments,
            words: job.wordTimestamps,
            colors: {
              background: BRAND_FG,
              seedBackground: selectedPalette.background,
              seedForeground: selectedPalette.foreground,
              accent: job.clipOverrides?.accentColor ?? selectedPalette.accent,
              ...(selectedPalette.accent2 ? { accent2: selectedPalette.accent2 } : {}),
            },
            isCancelled,
            onProgress: (message, fraction) => {
              if (!isCancelled()) {
                window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                  clipId: job.clipId,
                  message,
                  percent: 20 + Math.round(fraction * 4),
                });
              }
            },
          });
          allTempFiles.push(...quotes.tempFiles);
          resolvedSegments = quotes.segments;
          sceneCues = [...sceneCues, ...quotes.cues].sort((a, b) => a.at - b.at);
        }

        // Clip-relative archetype windows for the post-concat caption pass.
        const archetypeWindows: ArchetypeWindow[] = [];
        {
          let cumulative = 0;
          for (const seg of resolvedSegments) {
            const segDuration = seg.endTime - seg.startTime;
            archetypeWindows.push({
              startTime: cumulative,
              endTime: cumulative + segDuration,
              archetype: seg.archetype,
            });
            cumulative += segDuration;
          }
        }

        renderedTimeline = archetypeWindows.map((window, index) => ({
          ...window,
          layout: resolvedSegments[index].explainerLayout,
        }));

        // Rehook config for the segmented path — feature pipeline doesn't run
        // here, so wire it directly from batch options.
        const rehookEnabled =
          options.rehookOverlay?.enabled === true && job.clipOverrides?.enableRehook !== false;
        const rehookText = rehookEnabled ? job.rehookText : undefined;
        const rehookConfig = rehookEnabled ? options.rehookOverlay : undefined;
        const rehookAppearTime = rehookEnabled
          ? (options.hookTitleOverlay?.displayDuration ?? 2.5)
          : undefined;

        const segConfig: SegmentRenderConfig = {
          sourceVideoPath: job.sourceVideoPath,
          segments: resolvedSegments,
          editStyle,
          transitionsEnabled:
            options.shotTransitionsEnabled !== false &&
            job.clipOverrides?.enableShotTransitions !== false,
          width: effectiveResolution.width,
          height: effectiveResolution.height,
          fps: OUTPUT_FPS,
          sourceWidth: segMeta.width,
          sourceHeight: segMeta.height,
          wordTimestamps: job.wordTimestamps,
          wordEmphasis: job.wordEmphasis,
          captionStyle:
            options.captionStyle && job.clipOverrides?.captionMode
              ? { ...options.captionStyle, captionMode: job.clipOverrides.captionMode }
              : options.captionStyle,
          sceneCues,
          sceneSfxEnabled: options.sceneSfxEnabled !== false,
          captionsEnabled:
            options.captionsEnabled !== false && job.clipOverrides?.enableCaptions !== false,
          archetypeWindows,
          hookTitleText: job.hookTitleText,
          hookTitleConfig: options.hookTitleOverlay
            ? {
                ...options.hookTitleOverlay,
                enabled:
                  options.hookTitleOverlay.enabled && job.clipOverrides?.enableHookTitle !== false,
              }
            : undefined,
          rehookText,
          rehookConfig,
          rehookAppearTime,
          templateLayout: options.templateLayout,
          qualityParams,
          onFallback: (info) => {
            const layoutWindow = renderedTimeline[info.segmentIndex];
            if (layoutWindow) {
              if (layoutWindow.layout) {
                // Conservative history: never count an animation when its composite fell back.
                renderedChoices = [];
                execution.onDiagnostic?.({
                  stage: 'render',
                  action: 'removed',
                  reason: 'composite-fallback-history-omitted',
                });
              }
              layoutWindow.archetype = 'talking-head';
              layoutWindow.layout = undefined;
            }
            if (!isCancelled()) {
              window.webContents.send(Ch.Send.SEGMENT_FALLBACK, {
                clipId: job.clipId,
                segmentIndex: info.segmentIndex,
                archetype: info.archetype,
                reason: info.reason,
              });
            }
          },
        };

        if (isCancelled()) return;
        await renderSegmentedClip(segConfig, outputPath, (percent) => {
          if (!isCancelled()) {
            window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent });
          }
        });

        if (isCancelled()) return;
        await recordRendered(job, i, renderedChoices, renderedTimeline);
        if (isCancelled()) return;
        manifestResults.set(job.clipId, outputPath);
        manifestRenderTimes.set(job.clipId, Date.now() - clipStartTime);
        completed++;
        window.webContents.send(Ch.Send.RENDER_CLIP_DONE, { clipId: job.clipId, outputPath });
        return;
      }

      // ── Phase 0: Get source metadata ────────────────────────────────────
      let meta: {
        width: number;
        height: number;
        codec: string;
        fps: number;
        audioCodec: string;
        duration: number;
      };
      const cached = metadataCache.get(job.sourceVideoPath);
      if (cached) {
        meta = cached;
      } else {
        try {
          meta = await getVideoMetadata(job.sourceVideoPath);
          metadataCache.set(job.sourceVideoPath, meta);
        } catch (metaErr) {
          const msg = metaErr instanceof Error ? metaErr.message : String(metaErr);
          throw new Error(`Failed to read source video metadata for clip ${job.clipId}: ${msg}`);
        }
      }

      // ── Phase 1: Prepare — call feature.prepare() ──────────────────────
      // Each feature is isolated: a failure in one feature does NOT prevent
      // the remaining features from preparing. The clip still renders, just
      // without that one feature's contribution.
      const featureCount = features.length;
      for (let fi = 0; fi < featureCount; fi++) {
        const feature = features[fi];
        if (isCancelled()) return;
        if (feature.prepare) {
          window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
            clipId: job.clipId,
            message: `Preparing ${feature.name}…`,
            percent: Math.round(((fi + 1) / featureCount) * 50),
          });
          try {
            const result = await feature.prepare(job, options, (message, percent) => {
              window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message,
                percent,
              });
            });
            if (result.tempFiles.length > 0) {
              allTempFiles.push(...result.tempFiles);
            }
            if (result.modified) {
              console.log(`[Pipeline] ${feature.name}: prepared clip ${job.clipId}`);
            }
          } catch (featureErr) {
            const msg = featureErr instanceof Error ? featureErr.message : String(featureErr);
            console.error(
              `[Pipeline] ${feature.name} prepare() failed for clip ${job.clipId}, skipping: ${msg}`,
            );
            window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
              clipId: job.clipId,
              error: `[${feature.name}] prepare failed (clip will render without this feature): ${msg}`,
              ffmpegCommand: null,
            });
          }
        }
      }

      if (isCancelled()) return;

      // After filler removal, the job's sourceVideoPath may have changed.
      // Re-fetch metadata if the source path is no longer in the cache.
      if (!metadataCache.has(job.sourceVideoPath)) {
        try {
          meta = await getVideoMetadata(job.sourceVideoPath);
          metadataCache.set(job.sourceVideoPath, meta);
        } catch {
          // If intermediate file can't be probed, use original meta
        }
      } else {
        meta = metadataCache.get(job.sourceVideoPath)!;
      }

      // ── Phase 2: Build video filter chain ──────────────────────────────
      // Base: crop + scale
      let videoFilter = buildVideoFilter(
        job,
        meta.width,
        meta.height,
        effectiveResolution,
        effectiveAspectRatio,
        meta.fps,
      );

      // Append feature video filters (auto-zoom)
      const clipDuration = job.endTime - job.startTime;
      const filterContext: FilterContext = {
        sourceWidth: meta.width,
        sourceHeight: meta.height,
        targetWidth: effectiveResolution.width,
        targetHeight: effectiveResolution.height,
        clipDuration,
        outputAspectRatio: effectiveAspectRatio,
      };

      for (const feature of features) {
        if (feature.videoFilter) {
          try {
            const featureFilter = feature.videoFilter(job, filterContext);
            if (featureFilter) {
              videoFilter = `${videoFilter},${featureFilter}`;
            }
          } catch (featureErr) {
            const msg = featureErr instanceof Error ? featureErr.message : String(featureErr);
            console.error(
              `[Pipeline] ${feature.name} videoFilter() failed for clip ${job.clipId}, skipping: ${msg}`,
            );
          }
        }
      }

      // ── Phase 3: Collect overlay passes ────────────────────────────────
      const overlayContext: OverlayContext = {
        clipDuration,
        targetWidth: effectiveResolution.width,
        targetHeight: effectiveResolution.height,
      };

      const overlaySteps: OverlayPassResult[] = [];
      for (const feature of features) {
        if (feature.overlayPass) {
          try {
            const step = feature.overlayPass(job, overlayContext);
            if (step) {
              overlaySteps.push(step);
            }
          } catch (featureErr) {
            const msg = featureErr instanceof Error ? featureErr.message : String(featureErr);
            console.error(
              `[Pipeline] ${feature.name} overlayPass() failed for clip ${job.clipId}, skipping: ${msg}`,
            );
          }
        }
      }

      // ── Phase 3.5: Merge simple overlay filters into the base -vf ──────
      // Each separate overlay pass is a full FFmpeg re-encode of the clip
      // which compounds generation loss (visible blocking, mosquito noise).
      // Any overlay step that's a plain -vf filter (e.g. ass subtitles for
      // captions, hook title, rehook) can be safely chained onto the base
      // filter and burned in a single encode. Only filter_complex passes
      // (B-roll image overlay, animated progress bar) need their own pass
      // because they require multiple inputs.
      //
      // The base videoFilter ends in `…,format=yuv420p`; we strip that tail,
      // append each mergeable overlay, then re-pin format=yuv420p so the
      // final output stays in universally-playable subsampling.
      const complexSteps: OverlayPassResult[] = [];
      const mergedNames: string[] = [];
      for (const step of overlaySteps) {
        if (step.filterComplex) {
          complexSteps.push(step);
        } else {
          videoFilter = videoFilter.replace(/,format=yuv420p$/, '');
          videoFilter = `${videoFilter},${step.filter},format=yuv420p`;
          mergedNames.push(step.name);
        }
      }
      if (mergedNames.length > 0) {
        console.log(
          `[Pipeline] Clip ${job.clipId}: merged ${mergedNames.length} overlay(s) ` +
            `into base encode (${mergedNames.join(', ')})`,
        );
      }

      // ── Phase 4: Base render ───────────────────────────────────────────
      window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
        clipId: job.clipId,
        message: 'Encoding…',
        percent: 50,
      });
      await renderClip(
        job,
        outputPath,
        videoFilter,
        (percent) => {
          if (!isCancelled()) {
            window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent });
          }
        },
        (cmd) => {
          capturedCommand = cmd;
          if (options.developerMode) {
            console.log(`[DevMode] Clip ${job.clipId} FFmpeg:`, cmd);
            window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
              clipId: `${job.clipId}__devmode`,
              error: `[DevMode] FFmpeg command for clip ${job.clipId}`,
              ffmpegCommand: cmd,
            });
          }
        },
        qualityParams,
        outputFormat,
        null, // hookFontPath — no longer needed, features handle their own fonts
        null, // captionFontsDir — features handle their own font dirs
        complexSteps,
      );

      if (isCancelled()) return;

      // ── Phase 5: Post-process — call feature.postProcess() ─────────────
      const postContext: PostProcessContext = {
        clipDuration,
        outputPath,
      };

      for (const feature of features) {
        if (isCancelled()) return;
        if (feature.postProcess) {
          try {
            await feature.postProcess(job, outputPath, postContext);
          } catch (featureErr) {
            const msg = featureErr instanceof Error ? featureErr.message : String(featureErr);
            console.error(
              `[Pipeline] ${feature.name} postProcess() failed for clip ${job.clipId}, skipping: ${msg}`,
            );
            window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
              clipId: job.clipId,
              error: `[${feature.name}] postProcess failed (clip may be incomplete): ${msg}`,
              ffmpegCommand: null,
            });
          }
        }
      }

      // ── Restore batch options after this clip's overlays are done ──────
      // The accent-color feature mutates shared batchOptions during prepare().
      // Restore now so the next clip doesn't inherit this clip's accent color.
      restoreBatchOptions(job, options);

      // ── Write description file ─────────────────────────────────────────
      if (job.description) {
        try {
          const clipFilename = basename(outputPath);
          writeDescriptionFile(outputDirectory, clipFilename, job.description);
          console.log(
            `[Description] Written: ${basename(clipFilename, extname(clipFilename))}.txt`,
          );
        } catch (descErr) {
          console.warn(`[Description] Failed to write .txt for clip ${job.clipId}:`, descErr);
        }
      }

      if (isCancelled()) return;
      await recordRendered(job, i, renderedChoices, renderedTimeline);
      if (isCancelled()) return;
      manifestResults.set(job.clipId, outputPath);
      manifestRenderTimes.set(job.clipId, Date.now() - clipStartTime);
      completed++;
      window.webContents.send(Ch.Send.RENDER_CLIP_DONE, { clipId: job.clipId, outputPath });
    } catch (err) {
      // Clean up partial output file on failure
      try {
        if (existsSync(outputPath)) unlinkSync(outputPath);
      } catch {
        // Ignore cleanup errors
      }

      if (isCancelled()) return;

      // Restore batch options even on failure so the next clip isn't affected
      restoreBatchOptions(job, options);

      manifestResults.set(job.clipId, null);
      manifestRenderTimes.set(job.clipId, Date.now() - clipStartTime);
      failed++;
      const rawMessage = err instanceof Error ? err.message : String(err);
      // Map raw engine output → human summary + suggested action (RF-022),
      // keeping the raw stderr tail available behind a "details" expander.
      const classified = classifyRenderError(rawMessage);
      window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
        clipId: job.clipId,
        error: classified,
        ffmpegCommand: capturedCommand,
      });
    } finally {
      reservations.release(String(i));
      // Clean up temp files from all features
      for (const tempFile of allTempFiles) {
        try {
          unlinkSync(tempFile);
        } catch {
          /* ignore */
        }
      }
    }
  };

  // ── Concurrent render pool ──────────────────────────────────────────────
  try {
    if (effectiveConcurrency <= 1) {
      // Sequential path (no overhead)
      for (let i = 0; i < jobs.length; i++) {
        if (isCancelled()) {
          window.webContents.send(Ch.Send.RENDER_CANCELLED, {
            completed,
            failed,
            cancelled,
            total,
          });
          return;
        }
        const job = jobs[i];
        if (!job) continue;
        await processJob(job, i);
        if (stopAfterCurrentRequested && i < jobs.length - 1) {
          window.webContents.send(Ch.Send.RENDER_CANCELLED, {
            completed,
            failed,
            cancelled,
            total,
          });
          return;
        }
      }
    } else {
      // Parallel path: each worker finishes its current encode before honoring stop-after-current.
      let nextJobIndex = 0;

      const worker = async (): Promise<void> => {
        while (true) {
          if (isCancelled() || stopAfterCurrentRequested) return;
          const i = nextJobIndex++;
          if (i >= jobs.length) return;
          const job = jobs[i];
          if (!job) return;
          await processJob(job, i);
        }
      };

      await Promise.all(Array.from({ length: effectiveConcurrency }, worker));

      if (isCancelled() || (stopAfterCurrentRequested && nextJobIndex < jobs.length)) {
        window.webContents.send(Ch.Send.RENDER_CANCELLED, { completed, failed, cancelled, total });
        return;
      }
    }
  } finally {
    for (const { key } of identities) reservations.release(key);
  }
  if (isCancelled()) {
    window.webContents.send(Ch.Send.RENDER_CANCELLED, { completed, failed, cancelled, total });
    return;
  }

  // ── Generate export manifest ────────────────────────────────────────────
  // Hand off batch-done info to the IPC layer for manifest writing.
  // The export manifest is written from `render-handlers.ts` on the
  // `render:batchDone` boundary rather than here, so this orchestrator stays
  // focused on rendering and IO concerns live at the IPC layer.
  let manifestCsvPath: string | undefined;
  let manifestJsonPath: string | undefined;
  if (onBatchDone) {
    try {
      const clipMeta: ManifestJobMeta[] = jobs.map((job) => ({
        clipId: job.clipId,
        score: job.manifestMeta?.score ?? 0,
        hookText: job.hookTitleText ?? '',
        reasoning: job.manifestMeta?.reasoning ?? '',
        transcriptText: job.manifestMeta?.transcriptText ?? '',
        loopScore: job.manifestMeta?.loopScore,
        description: job.description,
      }));

      const result = await onBatchDone({
        options,
        jobs,
        outputDirectory,
        clipMeta,
        clipResults: manifestResults,
        clipRenderTimes: manifestRenderTimes,
        totalRenderTimeMs: Date.now() - batchStartTime,
        encoder: getEncoder().encoder,
        completed,
        failed,
        total,
      });
      if (result) {
        manifestCsvPath = result.manifestCsvPath;
        manifestJsonPath = result.manifestJsonPath;
      }
    } catch (err) {
      console.warn('[render-pipeline] onBatchDone handler threw:', err);
    }
  }

  window.webContents.send(Ch.Send.RENDER_BATCH_DONE, {
    completed,
    failed,
    cancelled,
    total,
    manifestCsvPath,
    manifestJsonPath,
  });
}
