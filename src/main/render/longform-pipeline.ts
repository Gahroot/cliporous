// ---------------------------------------------------------------------------
// Long-form (16:9) render orchestrator — Hormozi-style talking head.
//
// Entry point for `outputProfile === 'longform'`. Builds a segment timeline
// from the AI edit plan, pre-renders skinned content blocks via Remotion,
// encodes speaker blocks through the landscape layout, concatenates
// everything, then composites phrase-emphasis overlays in a final pass.
//
// This path is fully independent of the 9:16 feature pipeline so the locked
// short-form output stays byte-identical.
// ---------------------------------------------------------------------------

import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { Ch } from '@shared/ipc-channels';
import { resolveLongformPlanOverlaps } from '@shared/longform-plan-timing';
import { isSceneFirstPlanEnvelope, sceneFirstPlanProblem } from '@shared/longform-scenes';
import { getPaletteById } from '@shared/palettes';
import type {
  BlockPlacement,
  LongformEditPlan,
  LongformRenderReconciliation,
  PhraseEmphasis,
} from '@shared/types';
import type { BrowserWindow } from 'electron';
import { LANDSCAPE_FPS, LANDSCAPE_HEIGHT, LANDSCAPE_WIDTH } from '../aspect-ratios';
import { getEditStyleById, LONGFORM_TEMPLATES } from '../edit-styles/index';
import { ffmpeg, getEncoder, getVideoMetadata, isHardwareEncoder } from '../ffmpeg';
import { buildLongformLayout } from '../layouts/longform-layouts';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import { DEFAULT_LONGFORM_BLOCK_SKIN } from '../remotion/registry';
import { buildDriftZoom, buildSnapZoom } from '../zoom-filters';
import { buildEditStyleColorGradeFilter } from './color-grade-filter';
import { applyLongformExplainerScenes } from './explainer-longform';
import { extendBlockPlacementEndTime, renderBlockSegment } from './features/blocks.feature';
import {
  applyDelosCards,
  type DelosCardStats,
  filterCardsToSpeakerRanges,
  type SpeakerRange,
} from './features/delos-card.feature';
import {
  applyPhraseOverlays,
  cleanupPhraseOverlayTempFiles,
  type PhraseOverlayStats,
} from './features/phrase-emphasis.feature';
import { toFFmpegPath } from './helpers';
import {
  concatNormalizedSegments,
  encodeSpeakerSegment,
  type NormalizedConcatSegment,
} from './longform-encode';
import { renderSceneFirstLongform } from './longform-scene-render';
import type { WordTimestamp } from './point-coverage';
import { resolveQualityParams } from './quality';
import { classifyRenderError } from './render-error-map';
import { mixSceneSfx } from './scene-sfx';
import type { RenderBatchOptions } from './types';
import { resolveNewOutputPath } from './writable-output-path';

const HORMOZI_STYLE_ID = 'hormozi';

// ---------------------------------------------------------------------------
// Timeline model
// ---------------------------------------------------------------------------

interface SpeakerBlock {
  kind: 'speaker';
  startTime: number;
  endTime: number;
}

interface BlockBlock {
  kind: 'block';
  startTime: number;
  endTime: number;
  placement: BlockPlacement;
}

type TimelineBlock = SpeakerBlock | BlockBlock;

const MIN_BLOCK_SECONDS = 0.4;

/**
 * Minimum SPEAKER time (seconds) required between the END of one content block
 * and the START of the next. Guarantees the speaker is visible — and the prior
 * block has time to breathe — before another full-frame insert lands, so blocks
 * never read as back-to-back. Inserts that start sooner than this after the
 * previous accepted block ends are dropped (the earlier block wins).
 *
 * This is the BODY pace (after the intro). Roughly one block per ~8–10s of
 * speech once a block's own ~3–4s span is added.
 */
export const MIN_GAP_BETWEEN_BLOCKS = 6;

/**
 * Length of the opening "hook" window where blocks land more frequently. The
 * first impression decides whether a viewer stays, so the intro runs at a
 * quicker visual cadence than the body, then settles into MIN_GAP_BETWEEN_BLOCKS.
 */
export const INTRO_SECONDS = 60;

/**
 * Tighter speaker gap applied while a block STARTS inside the intro window —
 * a new block roughly every ~5s of speech to keep the open engaging. With a
 * typical ~3–4s block span this 1.5s speaker gap puts block STARTS ~5s apart,
 * so the first 30s can host ~6 beats instead of ~2. After INTRO_SECONDS the
 * gap relaxes to MIN_GAP_BETWEEN_BLOCKS.
 */
export const INTRO_GAP_BETWEEN_BLOCKS = 1.5;

/**
 * Build a non-overlapping, chronological timeline. Content blocks are inserts
 * that replace the speaker visual for their range; speaker blocks fill every
 * gap. Overlapping inserts are dropped (first one wins), and inserts that start
 * within `minGapBetweenBlocks` of the previous accepted block's end are dropped
 * too so blocks stay spaced out.
 */
export function buildTimeline(
  plan: LongformEditPlan,
  videoDuration: number,
  minGapBetweenBlocks: number = MIN_GAP_BETWEEN_BLOCKS,
  introGapBetweenBlocks: number = INTRO_GAP_BETWEEN_BLOCKS,
  introSeconds: number = INTRO_SECONDS,
  words?: WordTimestamp[],
): TimelineBlock[] {
  type Insert = BlockBlock;
  const inserts: Insert[] = [];

  for (const placement of plan.blocks ?? []) {
    // Keep multi-row list blocks on screen until the last row is spoken. The
    // overlap/spacing pass below still protects against collisions, so this
    // only ever shortens the gap to the next block, never overlaps it.
    const endTime = extendBlockPlacementEndTime(placement, words, videoDuration);
    inserts.push({
      kind: 'block',
      startTime: placement.startTime,
      endTime,
      placement: { ...placement, endTime },
    });
  }

  inserts.sort((a, b) => a.startTime - b.startTime);

  // Drop overlaps + too-close inserts, clamp to [0, videoDuration].
  const accepted: Insert[] = [];
  let lastEnd = 0;
  let haveAccepted = false;
  for (const ins of inserts) {
    const start = Math.max(0, ins.startTime);
    const end = Math.min(videoDuration, ins.endTime);
    if (end - start < MIN_BLOCK_SECONDS) continue;
    if (start < lastEnd) continue; // overlaps a prior insert — skip
    // Enforce breathing room: require a minimum of speaker time between the
    // previous accepted block's end and this one's start. The intro window runs
    // a tighter gap so the open is more visually engaging, then relaxes.
    const requiredGap = start < introSeconds ? introGapBetweenBlocks : minGapBetweenBlocks;
    if (haveAccepted && start - lastEnd < requiredGap) continue;
    accepted.push({ ...ins, startTime: start, endTime: end });
    lastEnd = end;
    haveAccepted = true;
  }

  const timeline: TimelineBlock[] = [];
  let cursor = 0;
  for (const ins of accepted) {
    if (ins.startTime - cursor >= MIN_BLOCK_SECONDS) {
      timeline.push({ kind: 'speaker', startTime: cursor, endTime: ins.startTime });
    }
    timeline.push(ins);
    cursor = ins.endTime;
  }
  if (videoDuration - cursor >= MIN_BLOCK_SECONDS) {
    timeline.push({ kind: 'speaker', startTime: cursor, endTime: videoDuration });
  }

  // Fallback: no inserts at all → one speaker block spanning the whole video.
  if (timeline.length === 0) {
    timeline.push({ kind: 'speaker', startTime: 0, endTime: videoDuration });
  }

  return timeline;
}

/** Merge touching speaker/fallback ranges so cards may span a failed block seam. */
export function mergeSpeakerRanges(ranges: SpeakerRange[]): SpeakerRange[] {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: SpeakerRange[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + 0.001) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

/** `ranges` minus every `busy` interval (both sorted-agnostic). Pure. */
export function subtractRanges(ranges: SpeakerRange[], busy: SpeakerRange[]): SpeakerRange[] {
  let out = ranges.map((r) => ({ ...r }));
  for (const b of busy) {
    out = out.flatMap((r) => {
      if (b.end <= r.start || b.start >= r.end) return [r];
      const parts: SpeakerRange[] = [];
      if (b.start > r.start) parts.push({ start: r.start, end: b.start });
      if (b.end < r.end) parts.push({ start: b.end, end: r.end });
      return parts;
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Speaker zoom — snap to overlapping phrase beats, else gentle drift.
// ---------------------------------------------------------------------------

function buildSpeakerZoom(
  block: SpeakerBlock,
  intensity: number,
  style: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out',
  phrases: PhraseEmphasis[],
): string {
  if (style === 'none' || intensity <= 1.001) return '';
  const duration = block.endTime - block.startTime;

  if (style === 'snap') {
    const local = phrases
      .filter((p) => p.endTime > block.startTime && p.startTime < block.endTime)
      .map((p) => {
        const cs = Math.max(p.startTime, block.startTime);
        const ce = Math.min(p.endTime, block.endTime);
        return { time: cs - block.startTime, duration: ce - cs };
      });
    if (local.length > 0) {
      return buildSnapZoom({
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        fps: LANDSCAPE_FPS,
        duration,
        zoomIntensity: intensity,
        startTime: 0,
        emphasisTimestamps: local,
      });
    }
  }

  return buildDriftZoom({
    width: LANDSCAPE_WIDTH,
    height: LANDSCAPE_HEIGHT,
    fps: LANDSCAPE_FPS,
    duration,
    zoomIntensity: intensity,
    startTime: 0,
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Render a long-form (16:9) Hormozi-style video. Expects exactly one job in
 * `options.jobs` (the full source video) and `options.longformEditPlan`.
 */
export async function renderLongformVideo(
  options: RenderBatchOptions,
  window: BrowserWindow,
  signal?: AbortSignal,
): Promise<void> {
  const { jobs, outputDirectory } = options;
  const job = jobs[0];

  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true });
  }

  const sendError = (message: string): void => {
    const classified = classifyRenderError(message);
    window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
      clipId: job?.clipId ?? 'longform',
      error: classified,
    });
    window.webContents.send(Ch.Send.RENDER_BATCH_DONE, { completed: 0, failed: 1, total: 1 });
  };

  if (!job) {
    sendError('Long-form render requires a source job.');
    return;
  }
  const requestedPlan = options.longformEditPlan;
  if (!requestedPlan) {
    sendError('Long-form render requires a longformEditPlan.');
    return;
  }
  // New or unsupported scene data must never be normalized/downgraded into a legacy plan.
  if (
    (requestedPlan.mode !== undefined && requestedPlan.mode !== 'legacy') ||
    (requestedPlan.schemaVersion !== undefined && requestedPlan.schemaVersion !== 1) ||
    'scenes' in requestedPlan
  ) {
    if (!isSceneFirstPlanEnvelope(requestedPlan)) {
      sendError(sceneFirstPlanProblem(requestedPlan) ?? 'Invalid scene-first plan.');
      return;
    }
    try {
      signal?.throwIfAborted();
      const qualityParams = resolveQualityParams(options.renderQuality);
      const encoder = getEncoder(qualityParams);
      window.webContents.send(Ch.Send.RENDER_CLIP_START, {
        clipId: job.clipId,
        index: 0,
        total: 1,
        encoder: encoder.encoder,
        encoderIsHardware: isHardwareEncoder(encoder.encoder),
      });
      const sourceName = basename(job.sourceVideoPath, extname(job.sourceVideoPath));
      const outputPath = resolveNewOutputPath(join(outputDirectory, `${sourceName}_longform.mp4`));
      const reconciliation = await renderSceneFirstLongform({
        plan: requestedPlan,
        words: job.wordTimestamps ?? [],
        sourceVideoPath: job.sourceVideoPath,
        outputPath,
        palette: deriveExplainerPalette(
          getPaletteById(options.longformPaletteId, options.customPalettes),
        ),
        qualityParams,
        sceneSfxEnabled: options.sceneSfxEnabled,
        signal,
        onProgress: (message, fraction) =>
          window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
            clipId: job.clipId,
            message,
            percent: Math.round(fraction * 100),
          }),
      });
      signal?.throwIfAborted();
      const failed =
        reconciliation.sceneResults?.filter((scene) => scene.status === 'failed').length ?? 0;
      window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent: 100 });
      window.webContents.send(Ch.Send.RENDER_CLIP_DONE, {
        clipId: job.clipId,
        outputPath,
        reconciliation,
        ...(failed
          ? {
              summary: `${failed} scene(s) failed; source speaker retained for their exact intervals.`,
            }
          : {}),
      });
      window.webContents.send(Ch.Send.RENDER_BATCH_DONE, { completed: 1, failed: 0, total: 1 });
    } catch (error) {
      if (signal?.aborted) {
        window.webContents.send(Ch.Send.RENDER_CLIP_CANCELLED, { clipId: job.clipId });
        window.webContents.send(Ch.Send.RENDER_CANCELLED, {
          completed: 0,
          failed: 0,
          cancelled: 1,
          total: 1,
        });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      sendError(`Long-form render failed: ${message}`);
    }
    return;
  }
  // Older saved projects may predate plan-time collision resolution. Normalize
  // defensively so unsupported cross-layer overlaps never reach compositing.
  const plan = resolveLongformPlanOverlaps(requestedPlan);

  const qualityParams = resolveQualityParams(options.renderQuality);
  const encoder = getEncoder(qualityParams);
  const encoderIsHardware = isHardwareEncoder(encoder.encoder);

  window.webContents.send(Ch.Send.RENDER_CLIP_START, {
    clipId: job.clipId,
    index: 0,
    total: 1,
    encoder: encoder.encoder,
    encoderIsHardware,
  });

  const tempFiles: string[] = [];

  try {
    const meta = await getVideoMetadata(job.sourceVideoPath);
    const videoDuration = job.endTime > job.startTime ? job.endTime : meta.duration;

    const editStyle = getEditStyleById(HORMOZI_STYLE_ID);
    const speakerTemplate = LONGFORM_TEMPLATES[HORMOZI_STYLE_ID]?.speaker;
    const zoomStyle = speakerTemplate?.zoomStyle ?? 'snap';
    const zoomIntensity = speakerTemplate?.zoomIntensity ?? 1.12;
    const colorGradeFilter = editStyle?.colorGrade
      ? buildEditStyleColorGradeFilter(editStyle.colorGrade)
      : null;

    // Resolve the chosen skin + palette once for every content block.
    const skinId = options.longformSkinId ?? options.longformSkin ?? DEFAULT_LONGFORM_BLOCK_SKIN;
    const palette = getPaletteById(options.longformPaletteId, options.customPalettes);

    const timeline = buildTimeline(
      plan,
      videoDuration,
      MIN_GAP_BETWEEN_BLOCKS,
      INTRO_GAP_BETWEEN_BLOCKS,
      INTRO_SECONDS,
      job.wordTimestamps,
    );

    // Surface how many planned blocks actually survived buildTimeline's
    // overlap/spacing pass (RF-012): the plan can carry many more blocks than
    // the timeline keeps, and that drop was previously invisible to the user.
    const placedBlocks = timeline.filter((b) => b.kind === 'block').length;
    const plannedBlocks = plan.blocks?.length ?? 0;
    window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
      clipId: job.clipId,
      message:
        `Planning ${timeline.length} long-form segment(s) — ` +
        `${placedBlocks}/${plannedBlocks} block(s) placed`,
      percent: 5,
    });

    // Encode a speaker segment for an arbitrary [startTime, endTime] range,
    // applying the same landscape layout + zoom/grade used for real speaker
    // blocks. Reused as the graceful fallback when a content block fails to
    // render: substituting the underlying speaker shot keeps the concat
    // timeline gap-free (every segment still maps 1:1 onto source time).
    const encodeSpeakerForRange = async (
      startTime: number,
      endTime: number,
      index: number,
      onProgress?: ((percent: number) => void) | undefined,
    ): Promise<string> => {
      const duration = endTime - startTime;
      const layout = buildLongformLayout('speaker', {
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        segmentDuration: duration,
        fps: LANDSCAPE_FPS,
        sourceWidth: meta.width,
        sourceHeight: meta.height,
        ...(job.cropRegion ? { cropRect: job.cropRegion } : {}),
      });
      const zoomFilter = buildSpeakerZoom(
        { kind: 'speaker', startTime, endTime },
        zoomIntensity,
        zoomStyle,
        plan.phrases,
      );
      const extraFilters = [zoomFilter, colorGradeFilter ?? ''].filter(Boolean);
      const out = join(tmpdir(), `batchcontent-lf-speaker-${Date.now()}-${index}.mp4`);
      await encodeSpeakerSegment({
        sourceVideoPath: job.sourceVideoPath,
        outputPath: out,
        startTime,
        duration,
        fps: LANDSCAPE_FPS,
        layout,
        extraFilters,
        onProgress,
      });
      return out;
    };

    // ── Encode every timeline block to a normalized segment ────────────────
    const segmentFiles: string[] = [];
    const concatInputs: NormalizedConcatSegment[] = [];
    const failedBlockRanges: SpeakerRange[] = [];
    let droppedBlocks = 0;
    for (let i = 0; i < timeline.length; i++) {
      const block = timeline[i];
      if (!block) continue;
      // Each segment owns the progress band [base, nextBase]; per-segment
      // progress (0–100) maps into it so the bar advances smoothly mid-encode
      // instead of jumping once per segment (RF-006).
      const base = 5 + Math.round((i / timeline.length) * 65); // 5 → 70%
      const nextBase = 5 + Math.round(((i + 1) / timeline.length) * 65);
      const emitSegmentProgress = (pct: number): void => {
        const clamped = Math.max(0, Math.min(100, pct));
        const mapped = Math.round(base + (clamped / 100) * (nextBase - base));
        window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, {
          clipId: job.clipId,
          percent: mapped,
        });
      };

      if (block.kind === 'speaker') {
        window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, {
          clipId: job.clipId,
          percent: base,
        });
        const out = await encodeSpeakerForRange(
          block.startTime,
          block.endTime,
          i,
          emitSegmentProgress,
        );
        segmentFiles.push(out);
        concatInputs.push({
          path: out,
          duration: block.endTime - block.startTime,
          visual: 'speaker',
        });
        tempFiles.push(out);
      } else {
        window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
          clipId: job.clipId,
          message: `Rendering ${block.placement.kind} block…`,
          percent: base,
        });
        try {
          const out = await renderBlockSegment({
            placement: block.placement,
            skinId,
            palette,
            sourceVideoPath: job.sourceVideoPath,
            width: LANDSCAPE_WIDTH,
            height: LANDSCAPE_HEIGHT,
            fps: LANDSCAPE_FPS,
            onProgress: emitSegmentProgress,
          });
          segmentFiles.push(out);
          concatInputs.push({
            path: out,
            duration: block.endTime - block.startTime,
            visual: 'graphic',
          });
          tempFiles.push(out);
        } catch (err) {
          // Graceful degrade (RF-003): a single content-block render failure
          // must not kill the whole long-form render. Fall back to the plain
          // speaker shot for this block's exact range so the timeline stays
          // gap-free, and keep going.
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `[longform] Block render failed (${block.placement.kind}); ` +
              `substituting speaker shot for ${block.startTime}s–${block.endTime}s: ${message}`,
          );
          droppedBlocks++;
          failedBlockRanges.push({ start: block.startTime, end: block.endTime });
          const out = await encodeSpeakerForRange(
            block.startTime,
            block.endTime,
            i,
            emitSegmentProgress,
          );
          segmentFiles.push(out);
          concatInputs.push({
            path: out,
            duration: block.endTime - block.startTime,
            visual: 'speaker',
          });
          tempFiles.push(out);
        }
      }
    }

    if (segmentFiles.length === 0) {
      throw new Error('Long-form timeline produced no segments.');
    }

    if (droppedBlocks > 0) {
      console.warn(
        `[longform] ${droppedBlocks} content block(s) failed to render and were ` +
          `replaced by the underlying speaker shot; the final video is gap-free.`,
      );
    }

    // ── Concat ─────────────────────────────────────────────────────────────
    window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent: 72 });
    const concatPath = join(tmpdir(), `batchcontent-lf-concat-${Date.now()}.mp4`);
    tempFiles.push(concatPath);
    // Eased dissolves at speaker↔graphic boundaries (the graphic side is
    // freeze-padded, so the timeline still maps 1:1 onto source time).
    const transitionsEnabled =
      options.shotTransitionsEnabled !== false &&
      job.clipOverrides?.enableShotTransitions !== false;
    await concatNormalizedSegments(concatInputs, concatPath, LANDSCAPE_FPS, {
      transitionSeconds: transitionsEnabled ? (editStyle?.transitionDuration ?? 0.3) + 0.1 : 0,
    });

    // ── Phrase overlay pass ──────────────────────────────────────────────────
    const sourceName = options.sourceMeta?.name
      ? basename(options.sourceMeta.name, extname(options.sourceMeta.name))
      : basename(job.sourceVideoPath, extname(job.sourceVideoPath));
    const outputPath = join(outputDirectory, `${sourceName}_longform.mp4`);

    // Phrases map directly onto the concatenated timeline (every block preserves
    // source-time audio 1:1, so concat time == absolute source time — no remap).
    // Keep only phrases that begin inside a SPEAKER block: a phrase composited
    // over a full-frame content block would obscure it and read as a bug, since
    // phrase overlays are meant to float over the speaker.
    // A failed full-frame block was encoded as the speaker shot, so it must also
    // become eligible for phrases/cards. Merge it with adjacent speaker ranges
    // before gating overlays; otherwise a failed visual still suppresses them.
    const speakerRanges = mergeSpeakerRanges([
      ...timeline
        .filter((block): block is SpeakerBlock => block.kind === 'speaker')
        .map((block) => ({ start: block.startTime, end: block.endTime })),
      ...failedBlockRanges,
    ]);
    const inSpeakerBlock = (t: number): boolean =>
      speakerRanges.some((r) => t >= r.start && t < r.end);
    const phrases = plan.phrases.filter(
      (p) => p.endTime > p.startTime && p.startTime < videoDuration && inSpeakerBlock(p.startTime),
    );

    // ── Delos pop-up cards ───────────────────────────────────────────────────
    // Candidates from the plan, gated to SPEAKER time so a pop-up never lands
    // on top of a full-frame content block (this is the single source of truth
    // for that rule). These composite upper-left, clear of bottom phrases.
    const cards = filterCardsToSpeakerRanges(plan.cards ?? [], speakerRanges);
    const haveCards = cards.length > 0;

    // ── Explainer scenes (floating cards / short takeovers over the speaker) ──
    // Composited onto the concat first so phrases and pop-up cards stay on top.
    // Speaker ranges already used by phrase/card overlays are excluded so two
    // overlays never fight for the same moment.
    const explainerKey = options.geminiApiKey?.trim();
    let explainerBase = concatPath;
    if (
      options.explainerScenesEnabled !== false &&
      explainerKey &&
      job.wordTimestamps &&
      job.wordTimestamps.length > 0
    ) {
      const busy = [
        ...phrases.map((p) => ({ start: p.startTime - 0.5, end: p.endTime + 0.5 })),
        ...cards.map((c) => ({ start: c.startTime - 0.5, end: c.endTime + 0.5 })),
      ];
      const freeRanges = subtractRanges(speakerRanges, busy).filter((r) => r.end - r.start >= 3);
      const explainerOut = join(tmpdir(), `batchcontent-lf-explained-${Date.now()}.mp4`);
      const explained = await applyLongformExplainerScenes({
        apiKey: explainerKey,
        inputPath: concatPath,
        outputPath: explainerOut,
        words: job.wordTimestamps,
        speakerRanges: freeRanges,
        palette: deriveExplainerPalette(palette),
        emphasisTimes: (job.wordEmphasis ?? [])
          .filter((w) => w.emphasis !== 'normal')
          .map((w) => w.start),
        fps: LANDSCAPE_FPS,
        qualityParams,
        onProgress: (message, fraction) =>
          window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
            clipId: job.clipId,
            message,
            percent: 72 + Math.round(fraction * 5),
          }),
      });
      tempFiles.push(...explained.tempFiles);
      if (explained.outputPath === explainerOut) {
        tempFiles.push(explainerOut);
        explainerBase = explainerOut;
        if (options.sceneSfxEnabled !== false && explained.cues.length > 0) {
          const sfxOut = join(tmpdir(), `batchcontent-lf-sfx-${Date.now()}.mp4`);
          const mixed = await mixSceneSfx(explainerOut, explained.cues, {
            clipDuration: videoDuration,
            outputPath: sfxOut,
            masterDb: 7,
          });
          if (mixed.ok && mixed.placed > 0) {
            tempFiles.push(sfxOut);
            explainerBase = sfxOut;
          }
        }
      }
    }

    window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
      clipId: job.clipId,
      message: `Compositing ${phrases.length} phrase overlay(s)…`,
      percent: 78,
    });

    // Phrase pass writes straight to the final path when there are no cards to
    // add; otherwise it produces an intermediate the card pass composites onto.
    const phraseTarget = haveCards
      ? join(tmpdir(), `batchcontent-lf-phrased-${Date.now()}.mp4`)
      : outputPath;
    if (haveCards) tempFiles.push(phraseTarget);

    let overlayTempFiles: string[] = [];
    let phraseStats: PhraseOverlayStats = { rendered: 0, dropped: 0 };
    let cardBase = explainerBase;
    if (phrases.length > 0) {
      const result = await applyPhraseOverlays({
        inputPath: explainerBase,
        outputPath: phraseTarget,
        phrases,
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        fps: LANDSCAPE_FPS,
        qualityParams,
        // Phrase emphasis text follows the user-selected palette, same axis as
        // the content blocks (resolved at line ~320).
        phraseColor: palette.accent,
      });
      overlayTempFiles = result.tempFiles;
      phraseStats = result.stats;
      if (result.outputPath === phraseTarget) {
        // Overlays composited onto phraseTarget → cards build on top of it.
        cardBase = phraseTarget;
      } else {
        // Every phrase overlay failed (e.g. Remotion wholly unavailable) →
        // phraseTarget was never written. Fall back to the speaker concat as
        // the card base; if there are no cards either, finalize it directly so
        // the render still completes (RF-003).
        cardBase = explainerBase;
        if (!haveCards) {
          await reencodeToFinal(explainerBase, outputPath, qualityParams);
        }
      }
    } else if (!haveCards) {
      // No phrases and no cards — re-encode the concat to the user's quality.
      await reencodeToFinal(explainerBase, outputPath, qualityParams);
    }

    let cardTempFiles: string[] = [];
    let cardStats: DelosCardStats | null = null;
    if (haveCards) {
      window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
        clipId: job.clipId,
        message: `Compositing ${cards.length} pop-up card(s)…`,
        percent: 88,
      });
      const result = await applyDelosCards({
        inputPath: cardBase,
        outputPath,
        cards,
        speakerRanges,
        words: job.wordTimestamps,
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        fps: LANDSCAPE_FPS,
        qualityParams,
        // Cards follow the same palette accent as phrases and blocks.
        accentColor: palette.accent,
        apiKey: options.geminiApiKey,
      });
      cardTempFiles = result.tempFiles;
      cardStats = result.stats;
      if (result.outputPath !== outputPath) {
        // Every card render failed → nothing was written to the final path.
        // Finalize the card pass's base instead so the render still completes.
        if (cardBase === concatPath || cardBase === explainerBase) {
          await reencodeToFinal(cardBase, outputPath, qualityParams);
        } else {
          copyFileSync(cardBase, outputPath);
        }
      }
    }

    // Surface what actually rendered vs. what was unavailable on the existing
    // done channel. The structured payload is persisted by the review screen so
    // a reopened project can still explain every fallback.
    const summary = buildLongformRenderSummary(droppedBlocks, cardStats);
    const reconciliation = buildLongformRenderReconciliation({
      outputPath,
      plannedPhrases: plan.phrases.length,
      eligiblePhrases: phrases.length,
      phraseStats,
      plannedBlocks,
      placedBlocks,
      droppedBlocks,
      plannedCards: plan.cards?.length ?? 0,
      eligibleCards: cards.length,
      cardStats,
    });

    window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent: 100 });
    window.webContents.send(Ch.Send.RENDER_CLIP_DONE, {
      clipId: job.clipId,
      outputPath,
      reconciliation,
      ...(summary ? { summary } : {}),
    });
    window.webContents.send(Ch.Send.RENDER_BATCH_DONE, { completed: 1, failed: 0, total: 1 });

    cleanupPhraseOverlayTempFiles(overlayTempFiles);
    cleanupPhraseOverlayTempFiles(cardTempFiles);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(`Long-form render failed: ${message}`);
  } finally {
    for (const f of tempFiles) {
      try {
        unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Render summary (RF-008)
// ---------------------------------------------------------------------------

/**
 * Compose a one-line "what rendered vs. what was unavailable" summary from the
 * long-form pass counts, shown once on the done row instead of a silent "Done".
 * Returns `undefined` when there is nothing noteworthy to report (no cards, no
 * dropped blocks) so the UI stays quiet on a fully clean render.
 *
 * Examples: "9 cards · 2 unavailable", "7 cards · 3 offline text", "1 block dropped".
 */
export function buildLongformRenderSummary(
  droppedBlocks: number,
  cardStats: DelosCardStats | null,
): string | undefined {
  const parts: string[] = [];

  if (cardStats && (cardStats.rendered > 0 || cardStats.dropped > 0)) {
    parts.push(`${cardStats.rendered} card${cardStats.rendered === 1 ? '' : 's'}`);
    if (cardStats.dropped > 0) parts.push(`${cardStats.dropped} unavailable`);
    if (cardStats.fallbackText > 0) parts.push(`${cardStats.fallbackText} offline text`);
  }

  if (droppedBlocks > 0) {
    parts.push(`${droppedBlocks} block${droppedBlocks === 1 ? '' : 's'} dropped`);
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

interface LongformReconciliationInput {
  outputPath: string;
  plannedPhrases: number;
  eligiblePhrases: number;
  phraseStats: PhraseOverlayStats;
  plannedBlocks: number;
  placedBlocks: number;
  droppedBlocks: number;
  plannedCards: number;
  eligibleCards: number;
  cardStats: DelosCardStats | null;
}

export function buildLongformRenderReconciliation(
  input: LongformReconciliationInput,
): LongformRenderReconciliation {
  const renderedBlocks = Math.max(0, input.placedBlocks - input.droppedBlocks);
  const renderedCards = input.cardStats?.rendered ?? 0;
  const fallbacks: LongformRenderReconciliation['fallbacks'] = [];

  const spacingDrops = Math.max(0, input.plannedBlocks - input.placedBlocks);
  if (spacingDrops > 0) {
    fallbacks.push({
      type: 'block',
      count: spacingDrops,
      reason: 'Removed during timeline spacing to prevent overlapping full-frame visuals.',
    });
  }
  if (input.droppedBlocks > 0) {
    fallbacks.push({
      type: 'block',
      count: input.droppedBlocks,
      reason: 'Replaced with the speaker shot because the content block could not render.',
    });
  }

  const gatedPhrases = Math.max(0, input.plannedPhrases - input.eligiblePhrases);
  if (gatedPhrases > 0) {
    fallbacks.push({
      type: 'phrase',
      count: gatedPhrases,
      reason:
        'Omitted because the phrase overlapped a full-frame visual or fell outside the source.',
    });
  }
  if (input.phraseStats.dropped > 0) {
    fallbacks.push({
      type: 'phrase',
      count: input.phraseStats.dropped,
      reason: 'Omitted because the phrase overlay could not render.',
    });
  }

  const gatedCards = Math.max(0, input.plannedCards - input.eligibleCards);
  if (gatedCards > 0) {
    fallbacks.push({
      type: 'card',
      count: gatedCards,
      reason: 'Omitted because the evidence card overlapped a full-frame visual.',
    });
  }
  if ((input.cardStats?.dropped ?? 0) > 0) {
    fallbacks.push({
      type: 'card',
      count: input.cardStats?.dropped ?? 0,
      reason: 'Omitted because the evidence card asset could not render.',
    });
  }
  if ((input.cardStats?.fallbackText ?? 0) > 0) {
    fallbacks.push({
      type: 'card',
      count: input.cardStats?.fallbackText ?? 0,
      reason: 'Rendered with transcript-derived text because generated card copy was unavailable.',
    });
  }

  return {
    renderedAt: Date.now(),
    outputPath: input.outputPath,
    phrases: {
      planned: input.plannedPhrases,
      eligible: input.eligiblePhrases,
      rendered: input.phraseStats.rendered,
      dropped: Math.max(0, input.plannedPhrases - input.phraseStats.rendered),
    },
    blocks: {
      planned: input.plannedBlocks,
      eligible: input.placedBlocks,
      rendered: renderedBlocks,
      dropped: Math.max(0, input.plannedBlocks - renderedBlocks),
    },
    cards: {
      planned: input.plannedCards,
      eligible: input.eligibleCards,
      rendered: renderedCards,
      dropped: Math.max(0, input.plannedCards - renderedCards),
    },
    fallbacks,
  };
}

// ---------------------------------------------------------------------------
// Final re-encode (no-phrase path)
// ---------------------------------------------------------------------------

function reencodeToFinal(
  inputPath: string,
  outputPath: string,
  qualityParams: ReturnType<typeof resolveQualityParams>,
): Promise<void> {
  const { encoder, presetFlag } = getEncoder(qualityParams);
  return new Promise<void>((resolve, reject) => {
    ffmpeg(toFFmpegPath(inputPath))
      .outputOptions([
        '-c:v',
        encoder,
        ...presetFlag,
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
      ])
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .save(toFFmpegPath(outputPath));
  });
}
