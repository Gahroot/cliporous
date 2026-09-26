// ---------------------------------------------------------------------------
// B-Roll overlay feature — composites stock footage onto the rendered clip
// ---------------------------------------------------------------------------

import { copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OUTPUT_FPS, OUTPUT_HEIGHT, OUTPUT_WIDTH } from '../../aspect-ratios';
import type { BRollDisplayMode, BRollPlacement, BRollTransition } from '../../broll-placement';
import { ffmpeg as createFfmpeg, getSoftwareEncoder } from '../../ffmpeg';
import { toFFmpegPath } from '../helpers';
import { buildEasedAlphaEnvelope, buildEasedMotionExpr } from '../transition-easing';
import type { RenderBatchOptions, RenderClipJob } from '../types';
import type { PostProcessContext, PrepareResult, RenderFeature } from './feature';

// ---------------------------------------------------------------------------
// Canvas constants — locked to 1080×1920 @ 30fps (9:16 vertical)
// ---------------------------------------------------------------------------

const CANVAS_W = OUTPUT_WIDTH;
const CANVAS_H = OUTPUT_HEIGHT;
const CANVAS_FPS = OUTPUT_FPS;

// ---------------------------------------------------------------------------
// Feature export
// ---------------------------------------------------------------------------

export const brollFeature: RenderFeature = {
  name: 'broll',

  async prepare(
    job: RenderClipJob,
    _batchOptions: RenderBatchOptions,
    _onProgress?: (message: string, percent: number) => void,
  ): Promise<PrepareResult> {
    // Emit edit events from B-Roll placements so downstream features
    // (sound-design) can synchronise SFX to B-Roll transitions
    if (!job.brollPlacements || job.brollPlacements.length === 0) {
      return { tempFiles: [], modified: false };
    }

    try {
      // Initialize editEvents array if not present
      if (!job.editEvents) {
        job.editEvents = [];
      }

      // Apply per-shot brollMode overrides from shotStyleConfigs.
      // When a shot has an explicit brollMode, B-Roll placements that fall
      // within that shot's time range inherit the override display mode.
      let modesOverridden = 0;
      if (job.shotStyleConfigs && job.shotStyleConfigs.length > 0) {
        for (const br of job.brollPlacements) {
          const brMidpoint = br.startTime + br.duration / 2;
          const matchingShot = job.shotStyleConfigs.find(
            (s) =>
              s.brollMode !== null &&
              s.brollMode !== undefined &&
              brMidpoint >= s.startTime &&
              brMidpoint <= s.endTime,
          );
          if (matchingShot?.brollMode && matchingShot.brollMode !== br.displayMode) {
            br.displayMode = matchingShot.brollMode;
            modesOverridden++;
          }
        }
        if (modesOverridden > 0) {
          console.log(
            `[B-Roll] Clip ${job.clipId}: overrode display mode for ${modesOverridden} placement(s) from per-shot style`,
          );
        }
      }

      // Derive broll-transition edit events from each placement
      let emitted = 0;
      for (const br of job.brollPlacements) {
        // Check if an edit event for this time already exists (from IPC handler pre-computation)
        const alreadyExists = job.editEvents.some(
          (e) => e.type === 'broll-transition' && Math.abs(e.time - br.startTime) < 0.05,
        );
        if (!alreadyExists) {
          job.editEvents.push({
            type: 'broll-transition',
            time: br.startTime,
            transition: br.transition,
          });
          emitted++;
        }
      }

      if (emitted > 0) {
        console.log(
          `[B-Roll] Clip ${job.clipId}: emitted ${emitted} edit event(s) from ${job.brollPlacements.length} placement(s)`,
        );
      }

      return { tempFiles: [], modified: emitted > 0 || modesOverridden > 0 };
    } catch (err) {
      console.error(`[B-Roll] Prepare failed for clip ${job.clipId}, skipping B-Roll:`, err);
      return { tempFiles: [], modified: false };
    }
  },

  async postProcess(
    job: RenderClipJob,
    renderedPath: string,
    _context: PostProcessContext,
  ): Promise<string> {
    if (!job.brollPlacements || job.brollPlacements.length === 0) {
      return renderedPath;
    }

    const brollBasePath = join(tmpdir(), `batchcontent-broll-base-${Date.now()}.mp4`);
    try {
      copyFileSync(renderedPath, brollBasePath);
      unlinkSync(renderedPath);
      await applyBRollOverlay(brollBasePath, job.brollPlacements, renderedPath);
      console.log(
        `[B-Roll] Applied ${job.brollPlacements.length} overlay(s) to clip ${job.clipId}`,
      );
    } catch (err) {
      console.warn(`[B-Roll] Overlay failed for clip ${job.clipId}, keeping original:`, err);
      if (existsSync(brollBasePath) && !existsSync(renderedPath)) {
        copyFileSync(brollBasePath, renderedPath);
      }
    } finally {
      try {
        unlinkSync(brollBasePath);
      } catch {
        /* ignore */
      }
    }

    return renderedPath;
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure pixel dimension is even (required by most codecs / filters). */
function roundEven(n: number): number {
  const v = Math.round(n);
  return v % 2 === 0 ? v : v - 1;
}

/** Transition fade / swipe duration in seconds (eased, so it can run a touch
 *  longer than the old linear 0.3s without feeling sluggish). */
const TRANSITION_DUR = 0.35;

/** Floating cards rise this many pixels into place on entry (and sink on exit). */
const CARD_RISE_PX = 72;

/**
 * Filter-chain suffix (leading comma, or '') giving an RGBA stream an eased
 * entry/exit opacity for `crossfade`. Swipes stay opaque (motion is in the
 * overlay expr) and hard cuts rely on the overlay's enable window.
 */
function entryExitAlpha(
  transition: BRollTransition,
  start: number,
  end: number,
  tDur: number,
): string {
  if (transition !== 'crossfade') return '';
  const envelope = buildEasedAlphaEnvelope(start, end, tDur, CANVAS_FPS);
  return envelope === 'null' ? '' : `,${envelope}`;
}

/**
 * Compute the overlay X, Y position for a PiP box placed in the given corner.
 */
function pipXY(
  pipW: number,
  pipH: number,
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
): { x: number; y: number } {
  const margin = 24;
  switch (position) {
    case 'top-left':
      return { x: margin, y: margin };
    case 'top-right':
      return { x: CANVAS_W - pipW - margin, y: margin };
    case 'bottom-left':
      return { x: margin, y: CANVAS_H - pipH - margin };
    default:
      return { x: CANVAS_W - pipW - margin, y: CANVAS_H - pipH - margin };
  }
}

// ---------------------------------------------------------------------------
// B-Roll overlay FFmpeg filter_complex builder
// ---------------------------------------------------------------------------

/**
 * Apply B-Roll overlays to a rendered clip using a single FFmpeg filter_complex.
 *
 * Each placement specifies its display mode and transition type. The filter
 * builder composes each B-Roll segment as a full 1080×1920 frame (combining
 * the B-Roll footage with a scaled copy of the speaker when needed for split
 * or PiP modes), then overlays it onto the main video with the chosen
 * transition effect.
 */
function applyBRollOverlay(
  inputPath: string,
  placements: BRollPlacement[],
  outputPath: string,
): Promise<void> {
  if (placements.length === 0) {
    copyFileSync(inputPath, outputPath);
    return Promise.resolve();
  }

  const filterParts: string[] = [];

  // We need a split of the main video for each placement that uses
  // split-top, split-bottom, or pip (they need a scaled speaker panel).
  // `fullscreen` and `floating-card` overlay onto the speaker directly, so
  // they never need a speaker copy.
  const needsSpeakerCopy = (mode: BRollDisplayMode): boolean =>
    mode !== 'fullscreen' && mode !== 'floating-card';
  const needsSpeaker = placements.some((p) => needsSpeakerCopy(p.displayMode));
  const splitCount = needsSpeaker
    ? placements.filter((p) => needsSpeakerCopy(p.displayMode)).length
    : 0;

  // Split main video if we need speaker copies
  if (splitCount > 0) {
    // Split [0:v] into [main] + [spk0], [spk1], ... for each mode that needs one
    const outputs = ['[main]'];
    let spkIdx = 0;
    for (const p of placements) {
      if (needsSpeakerCopy(p.displayMode)) {
        outputs.push(`[spk${spkIdx}]`);
        spkIdx++;
      }
    }
    filterParts.push(`[0:v]split=${outputs.length}${outputs.join('')}`);
  }

  const mainLabel = splitCount > 0 ? 'main' : '0:v';
  let prevLabel = mainLabel;
  let spkIdx = 0;

  placements.forEach((p, i) => {
    const inputIdx = i + 1;
    const outLabel = i === placements.length - 1 ? 'outv' : `v${i}`;
    const mode: BRollDisplayMode = p.displayMode ?? 'fullscreen';
    const transition: BRollTransition = p.transition ?? 'crossfade';

    const start = p.startTime;
    const end = start + p.duration;
    const tDur = Math.min(TRANSITION_DUR, p.duration / 4);

    // --- Build the composed frame based on display mode ---
    const composedLabel = `comp${i}`;

    if (mode === 'fullscreen') {
      buildFullscreenComposed(filterParts, inputIdx, p, i, composedLabel, transition, tDur);
    } else if (mode === 'floating-card') {
      buildFloatingCardComposed(filterParts, inputIdx, p, i, composedLabel, transition, tDur);
    } else if (mode === 'split-top' || mode === 'split-bottom') {
      buildSplitComposed(
        filterParts,
        inputIdx,
        p,
        i,
        composedLabel,
        transition,
        tDur,
        mode,
        `spk${spkIdx}`,
      );
      spkIdx++;
    } else if (mode === 'pip') {
      buildPipComposed(
        filterParts,
        inputIdx,
        p,
        i,
        composedLabel,
        transition,
        tDur,
        `spk${spkIdx}`,
      );
      spkIdx++;
    }

    // --- Overlay the composed frame onto the main timeline ---
    const overlayExpr = buildOverlayExpr(mode, transition, start, end, tDur);
    filterParts.push(
      `[${prevLabel}][${composedLabel}]` +
        `overlay=${overlayExpr}:eof_action=pass:format=auto:` +
        `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'` +
        `[${outLabel}]`,
    );

    prevLabel = outLabel;
  });

  const filterComplex = filterParts.join(';\n');

  // Pin format=yuv420p on the final overlay output — split / overlay / scale
  // can leave the chain in higher-subsampling pix_fmt, which TikTok / Reels
  // soft-decode or reject. Append onto the last labelled output.
  const pixFmtFilter = `[outv]format=yuv420p[outvf]`;
  const filterComplexWithPixFmt = `${filterComplex};\n${pixFmtFilter}`;

  return new Promise<void>((resolve, reject) => {
    // CRF 18 / medium keeps the overlay re-encode visually transparent vs.
    // the base render (see overlay-runner.ts for the matching quality
    // baseline). Using the same OVERLAY_QUALITY across all post-base passes
    // avoids one pass becoming the weakest link in the generation chain.
    const { encoder, presetFlag } = getSoftwareEncoder({ crf: 18, preset: 'medium' });

    const cmd = createFfmpeg(toFFmpegPath(inputPath));

    for (const p of placements) {
      cmd.input(toFFmpegPath(p.videoPath));
    }

    cmd
      .outputOptions([
        '-filter_complex',
        filterComplexWithPixFmt,
        '-filter_threads',
        '0',
        '-filter_complex_threads',
        '0',
        '-map',
        '[outvf]',
        '-map',
        '0:a',
        '-c:v',
        encoder,
        ...presetFlag,
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
      ])
      .on('end', () => resolve())
      .on('error', reject)
      .save(toFFmpegPath(outputPath));
  });
}

// ---------------------------------------------------------------------------
// Composed frame builders per display mode
// ---------------------------------------------------------------------------

/**
 * Fullscreen: B-Roll fills the entire 1080×1920 canvas.
 */
function buildFullscreenComposed(
  parts: string[],
  inputIdx: number,
  p: BRollPlacement,
  _idx: number,
  outLabel: string,
  transition: BRollTransition,
  tDur: number,
): void {
  const start = p.startTime;

  // Trim → shift PTS → scale/crop to 1080×1920 → fps → format
  let chain =
    `[${inputIdx}:v]` +
    `trim=0:${p.duration.toFixed(3)},` +
    `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
    `scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=increase,` +
    `crop=${CANVAS_W}:${CANVAS_H},` +
    `fps=${CANVAS_FPS},format=rgba`;

  // Crossfade → eased alpha envelope. Swipe motion lives in the overlay expr;
  // hard-cut appears/disappears via the overlay's enable window.
  chain += entryExitAlpha(transition, start, start + p.duration, tDur);

  parts.push(`${chain}[${outLabel}]`);
}

/**
 * Floating-Card: speaker stays full-frame (the base video); the asset floats
 * as a rounded, drop-shadowed card centered in the BOTTOM HALF of the canvas.
 * The composed label is a full 1080×1920 transparent frame with the card +
 * shadow already positioned, so it overlays at 0:0.
 */
function buildFloatingCardComposed(
  parts: string[],
  inputIdx: number,
  p: BRollPlacement,
  idx: number,
  outLabel: string,
  transition: BRollTransition,
  tDur: number,
): void {
  const start = p.startTime;

  // Card width as a fraction of canvas (leaves a margin either side).
  const cardW = roundEven(Math.round(CANVAS_W * 0.86));
  const radius = 40;

  // Rounded-corner alpha mask via geq: a pixel is transparent when it lies
  // outside the rounded rectangle's corner radius. Expression values are
  // single-quoted so their commas are not parsed as filter separators.
  const roundedAlpha =
    `geq=` +
    `r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
    `a='if(gt(hypot(max(0,${radius}-min(X,W-1-X)),max(0,${radius}-min(Y,H-1-Y))),${radius}),0,255)'`;

  // Card: trim → shift PTS → scale to card width → fps → rgba → rounded mask.
  const cardLabel = `fc${idx}`;
  parts.push(
    `[${inputIdx}:v]` +
      `trim=0:${p.duration.toFixed(3)},` +
      `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
      `scale=${cardW}:-2,` +
      `fps=${CANVAS_FPS},format=rgba,` +
      `${roundedAlpha}` +
      `[${cardLabel}]`,
  );

  // Split the rounded card: one copy for the drop shadow, one for the card.
  const shadowSrc = `fcs${idx}`;
  const cardSrc = `fcc${idx}`;
  parts.push(`[${cardLabel}]split[${cardSrc}][${shadowSrc}]`);

  // Shadow: darken to black, blur, pad onto full canvas centered in bottom
  // half, nudged down 16px. pad y expression centers within the lower half:
  //   y = oh*0.75 - ih/2   (midpoint of the [oh/2, oh] band)
  const shadowLabel = `fcsh${idx}`;
  parts.push(
    `[${shadowSrc}]` +
      `colorchannelmixer=rr=0:gg=0:bb=0,boxblur=24:1,` +
      `pad=${CANVAS_W}:${CANVAS_H}:(ow-iw)/2:oh*0.75-ih/2+16:color=0x00000000` +
      `[${shadowLabel}]`,
  );

  // Card padded onto full canvas at the same bottom-half center.
  const cardFullLabel = `fccf${idx}`;
  parts.push(
    `[${cardSrc}]` +
      `pad=${CANVAS_W}:${CANVAS_H}:(ow-iw)/2:oh*0.75-ih/2:color=0x00000000` +
      `[${cardFullLabel}]`,
  );

  // Composite card over its shadow.
  const compedLabel = `fccomp${idx}`;
  parts.push(`[${shadowLabel}][${cardFullLabel}]overlay=0:0[${compedLabel}]`);

  // Cards always ease their opacity alongside the rise in `buildOverlayExpr`
  // (a card popping in at full opacity reads as a glitch). Hard-cut stays
  // instant.
  const alpha = entryExitAlpha(
    transition === 'hard-cut' ? 'hard-cut' : 'crossfade',
    start,
    start + p.duration,
    tDur,
  );
  parts.push(`[${compedLabel}]null${alpha}[${outLabel}]`);
}

/**
 * Split-Top / Split-Bottom: B-Roll in one portion, speaker in the other.
 * Split-top: B-Roll top 65%, speaker bottom 35%
 * Split-bottom: speaker top 65%, B-Roll bottom 35%
 */
function buildSplitComposed(
  parts: string[],
  inputIdx: number,
  p: BRollPlacement,
  idx: number,
  outLabel: string,
  transition: BRollTransition,
  tDur: number,
  mode: 'split-top' | 'split-bottom',
  speakerLabel: string,
): void {
  const start = p.startTime;

  const brollH = roundEven(Math.round(CANVAS_H * 0.65));
  const speakerH = roundEven(CANVAS_H - brollH);

  // B-Roll: trim → shift PTS → scale/crop
  const brLabel = `br${idx}`;
  parts.push(
    `[${inputIdx}:v]` +
      `trim=0:${p.duration.toFixed(3)},` +
      `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
      `scale=${CANVAS_W}:${brollH}:force_original_aspect_ratio=increase,` +
      `crop=${CANVAS_W}:${brollH},` +
      `fps=${CANVAS_FPS}` +
      `[${brLabel}]`,
  );

  // Speaker: trim the same time window from main, scale to speaker panel size
  const spLabel = `sp${idx}`;
  parts.push(
    `[${speakerLabel}]` +
      `trim=${start.toFixed(3)}:${(start + p.duration).toFixed(3)},` +
      `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
      `scale=${CANVAS_W}:${speakerH}:force_original_aspect_ratio=increase,` +
      `crop=${CANVAS_W}:${speakerH},` +
      `fps=${CANVAS_FPS}` +
      `[${spLabel}]`,
  );

  // VStack based on mode
  const vstackLabel = `vs${idx}`;
  if (mode === 'split-top') {
    // B-Roll on top, speaker on bottom
    parts.push(`[${brLabel}][${spLabel}]vstack=inputs=2[${vstackLabel}]`);
  } else {
    // Speaker on top, B-Roll on bottom
    parts.push(`[${spLabel}][${brLabel}]vstack=inputs=2[${vstackLabel}]`);
  }

  // Convert to rgba and apply transition
  const chain = `[${vstackLabel}]format=rgba${entryExitAlpha(transition, start, start + p.duration, tDur)}`;
  parts.push(`${chain}[${outLabel}]`);
}

/**
 * PiP: B-Roll fills fullscreen, speaker in a small corner window.
 */
function buildPipComposed(
  parts: string[],
  inputIdx: number,
  p: BRollPlacement,
  idx: number,
  outLabel: string,
  transition: BRollTransition,
  tDur: number,
  speakerLabel: string,
): void {
  const start = p.startTime;
  const pipFrac = p.pipSize ?? 0.25;
  const pipPos = p.pipPosition ?? 'bottom-right';

  const pipW = roundEven(Math.round(CANVAS_W * pipFrac));
  const pipH = roundEven(Math.round(pipW * (CANVAS_H / CANVAS_W)));
  const { x: pipX, y: pipY } = pipXY(pipW, pipH, pipPos);

  // B-Roll fullscreen
  const brLabel = `br${idx}`;
  parts.push(
    `[${inputIdx}:v]` +
      `trim=0:${p.duration.toFixed(3)},` +
      `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
      `scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=increase,` +
      `crop=${CANVAS_W}:${CANVAS_H},` +
      `fps=${CANVAS_FPS}` +
      `[${brLabel}]`,
  );

  // Speaker PiP: trim → scale to small size
  const spLabel = `sp${idx}`;
  parts.push(
    `[${speakerLabel}]` +
      `trim=${start.toFixed(3)}:${(start + p.duration).toFixed(3)},` +
      `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
      `scale=${pipW}:${pipH}:force_original_aspect_ratio=increase,` +
      `crop=${pipW}:${pipH},` +
      `fps=${CANVAS_FPS}` +
      `[${spLabel}]`,
  );

  // Overlay speaker PiP on B-Roll
  const pipOverLabel = `po${idx}`;
  parts.push(`[${brLabel}][${spLabel}]overlay=${pipX}:${pipY}:eof_action=pass[${pipOverLabel}]`);

  // Convert to rgba and apply transition
  const chain = `[${pipOverLabel}]format=rgba${entryExitAlpha(transition, start, start + p.duration, tDur)}`;
  parts.push(`${chain}[${outLabel}]`);
}

// ---------------------------------------------------------------------------
// Overlay expression builder (handles position animations for swipe)
// ---------------------------------------------------------------------------

/**
 * Returns the `x:y` portion of the overlay filter for each placement.
 *
 * - hard-cut / crossfade: static 0:0
 * - swipe-up: Y eases H → 0 on entry (decelerating), 0 → -H on exit (accelerating)
 * - swipe-down: Y eases -H → 0 on entry, 0 → H on exit
 * - floating-card (any non hard-cut): rises CARD_RISE_PX into place and sinks
 *   back out, paired with the eased alpha envelope from the card builder
 *
 * Motion uses easeOutCubic on entry and easeInCubic on exit so elements
 * glide in and accelerate away instead of moving at constant speed.
 */
export function buildOverlayExpr(
  mode: BRollDisplayMode,
  transition: BRollTransition,
  start: number,
  end: number,
  tDur: number,
): string {
  if (transition === 'hard-cut') return '0:0';

  // Floating-card is positioned inside its composed full-canvas frame, so a
  // swipe would move the whole frame. Every soft transition becomes a short
  // rise instead (small offset — the card never leaves the canvas).
  if (mode === 'floating-card') {
    const y = buildEasedMotionExpr({
      start,
      end,
      dur: tDur,
      from: CARD_RISE_PX,
      rest: 0,
      to: CARD_RISE_PX,
    });
    return `0:'${y}'`;
  }

  if (transition === 'swipe-up') {
    const y = buildEasedMotionExpr({
      start,
      end,
      dur: tDur,
      from: CANVAS_H,
      rest: 0,
      to: -CANVAS_H,
    });
    return `0:'${y}'`;
  }

  if (transition === 'swipe-down') {
    const y = buildEasedMotionExpr({
      start,
      end,
      dur: tDur,
      from: -CANVAS_H,
      rest: 0,
      to: CANVAS_H,
    });
    return `0:'${y}'`;
  }

  // crossfade: static position (opacity is eased in the composed stream)
  return '0:0';
}
