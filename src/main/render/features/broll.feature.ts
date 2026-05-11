// ---------------------------------------------------------------------------
// B-Roll overlay feature — composites stock footage onto the rendered clip
// ---------------------------------------------------------------------------

import { copyFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { RenderFeature, PrepareResult, PostProcessContext } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import type { BRollPlacement, BRollDisplayMode, BRollTransition } from '../../broll-placement'
import { toFFmpegPath } from '../helpers'
import { ffmpeg as createFfmpeg, getSoftwareEncoder } from '../../ffmpeg'
import { OUTPUT_WIDTH, OUTPUT_HEIGHT, OUTPUT_FPS } from '../../aspect-ratios'

// ---------------------------------------------------------------------------
// Canvas constants — locked to 1080×1920 @ 30fps (9:16 vertical)
// ---------------------------------------------------------------------------

const CANVAS_W = OUTPUT_WIDTH
const CANVAS_H = OUTPUT_HEIGHT
const CANVAS_FPS = OUTPUT_FPS

// ---------------------------------------------------------------------------
// Feature export
// ---------------------------------------------------------------------------

export const brollFeature: RenderFeature = {
  name: 'broll',

  async prepare(
    job: RenderClipJob,
    _batchOptions: RenderBatchOptions,
    _onProgress?: (message: string, percent: number) => void
  ): Promise<PrepareResult> {
    // Emit edit events from B-Roll placements so downstream features
    // (sound-design) can synchronise SFX to B-Roll transitions
    if (!job.brollPlacements || job.brollPlacements.length === 0) {
      return { tempFiles: [], modified: false }
    }

    try {
      // Initialize editEvents array if not present
      if (!job.editEvents) {
        job.editEvents = []
      }

      // Apply per-shot brollMode overrides from shotStyleConfigs.
      // When a shot has an explicit brollMode, B-Roll placements that fall
      // within that shot's time range inherit the override display mode.
      let modesOverridden = 0
      if (job.shotStyleConfigs && job.shotStyleConfigs.length > 0) {
        for (const br of job.brollPlacements) {
          const brMidpoint = br.startTime + br.duration / 2
          const matchingShot = job.shotStyleConfigs.find(
            (s) =>
              s.brollMode !== null &&
              s.brollMode !== undefined &&
              brMidpoint >= s.startTime &&
              brMidpoint <= s.endTime
          )
          if (matchingShot && matchingShot.brollMode && matchingShot.brollMode !== br.displayMode) {
            br.displayMode = matchingShot.brollMode
            modesOverridden++
          }
        }
        if (modesOverridden > 0) {
          console.log(
            `[B-Roll] Clip ${job.clipId}: overrode display mode for ${modesOverridden} placement(s) from per-shot style`
          )
        }
      }

      // Derive broll-transition edit events from each placement
      let emitted = 0
      for (const br of job.brollPlacements) {
        // Check if an edit event for this time already exists (from IPC handler pre-computation)
        const alreadyExists = job.editEvents.some(
          (e) => e.type === 'broll-transition' && Math.abs(e.time - br.startTime) < 0.05
        )
        if (!alreadyExists) {
          job.editEvents.push({
            type: 'broll-transition',
            time: br.startTime,
            transition: br.transition
          })
          emitted++
        }
      }

      if (emitted > 0) {
        console.log(
          `[B-Roll] Clip ${job.clipId}: emitted ${emitted} edit event(s) from ${job.brollPlacements.length} placement(s)`
        )
      }

      return { tempFiles: [], modified: emitted > 0 || modesOverridden > 0 }
    } catch (err) {
      console.error(`[B-Roll] Prepare failed for clip ${job.clipId}, skipping B-Roll:`, err)
      return { tempFiles: [], modified: false }
    }
  },

  async postProcess(
    job: RenderClipJob,
    renderedPath: string,
    _context: PostProcessContext
  ): Promise<string> {
    if (!job.brollPlacements || job.brollPlacements.length === 0) {
      return renderedPath
    }

    const brollBasePath = join(tmpdir(), `batchcontent-broll-base-${Date.now()}.mp4`)
    try {
      copyFileSync(renderedPath, brollBasePath)
      unlinkSync(renderedPath)
      await applyBRollOverlay(brollBasePath, job.brollPlacements, renderedPath)
      console.log(
        `[B-Roll] Applied ${job.brollPlacements.length} overlay(s) to clip ${job.clipId}`
      )
    } catch (err) {
      console.warn(
        `[B-Roll] Overlay failed for clip ${job.clipId}, keeping original:`,
        err
      )
      if (existsSync(brollBasePath) && !existsSync(renderedPath)) {
        copyFileSync(brollBasePath, renderedPath)
      }
    } finally {
      try {
        unlinkSync(brollBasePath)
      } catch {
        /* ignore */
      }
    }

    return renderedPath
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure pixel dimension is even (required by most codecs / filters). */
function roundEven(n: number): number {
  const v = Math.round(n)
  return v % 2 === 0 ? v : v - 1
}

/** Transition fade / swipe duration in seconds */
const TRANSITION_DUR = 0.3

/**
 * Compute the overlay X, Y position for a PiP box placed in the given corner.
 */
function pipXY(
  pipW: number,
  pipH: number,
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
): { x: number; y: number } {
  const margin = 24
  switch (position) {
    case 'top-left':
      return { x: margin, y: margin }
    case 'top-right':
      return { x: CANVAS_W - pipW - margin, y: margin }
    case 'bottom-left':
      return { x: margin, y: CANVAS_H - pipH - margin }
    case 'bottom-right':
    default:
      return { x: CANVAS_W - pipW - margin, y: CANVAS_H - pipH - margin }
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
  outputPath: string
): Promise<void> {
  if (placements.length === 0) {
    copyFileSync(inputPath, outputPath)
    return Promise.resolve()
  }

  const filterParts: string[] = []

  // We need a split of the main video for each placement that uses
  // split-top, split-bottom, or pip (they need a scaled speaker panel).
  // We also need the main chain for overlaying everything.
  const needsSpeaker = placements.some(
    (p) => p.displayMode !== 'fullscreen'
  )
  const splitCount = needsSpeaker
    ? placements.filter((p) => p.displayMode !== 'fullscreen').length
    : 0

  // Split main video if we need speaker copies
  if (splitCount > 0) {
    // Split [0:v] into [main] + [spk0], [spk1], ... for each non-fullscreen placement
    const outputs = ['[main]']
    let spkIdx = 0
    for (const p of placements) {
      if (p.displayMode !== 'fullscreen') {
        outputs.push(`[spk${spkIdx}]`)
        spkIdx++
      }
    }
    filterParts.push(`[0:v]split=${outputs.length}${outputs.join('')}`)
  }

  const mainLabel = splitCount > 0 ? 'main' : '0:v'
  let prevLabel = mainLabel
  let spkIdx = 0

  placements.forEach((p, i) => {
    const inputIdx = i + 1
    const outLabel = i === placements.length - 1 ? 'outv' : `v${i}`
    const mode: BRollDisplayMode = p.displayMode ?? 'fullscreen'
    const transition: BRollTransition = p.transition ?? 'crossfade'

    const start = p.startTime
    const end = start + p.duration
    const tDur = Math.min(TRANSITION_DUR, p.duration / 4)

    // --- Build the composed frame based on display mode ---
    const composedLabel = `comp${i}`

    if (mode === 'fullscreen') {
      buildFullscreenComposed(filterParts, inputIdx, p, i, composedLabel, transition, tDur)
    } else if (mode === 'split-top' || mode === 'split-bottom') {
      buildSplitComposed(
        filterParts, inputIdx, p, i, composedLabel, transition, tDur,
        mode, `spk${spkIdx}`
      )
      spkIdx++
    } else if (mode === 'pip') {
      buildPipComposed(
        filterParts, inputIdx, p, i, composedLabel, transition, tDur,
        `spk${spkIdx}`
      )
      spkIdx++
    }

    // --- Overlay the composed frame onto the main timeline ---
    const overlayExpr = buildOverlayExpr(mode, transition, start, end, tDur)
    filterParts.push(
      `[${prevLabel}][${composedLabel}]` +
        `overlay=${overlayExpr}:eof_action=pass:format=auto:` +
        `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'` +
        `[${outLabel}]`
    )

    prevLabel = outLabel
  })

  const filterComplex = filterParts.join(';\n')

  return new Promise<void>((resolve, reject) => {
    const { encoder, presetFlag } = getSoftwareEncoder()

    const cmd = createFfmpeg(toFFmpegPath(inputPath))

    for (const p of placements) {
      cmd.input(toFFmpegPath(p.videoPath))
    }

    cmd
      .outputOptions([
        '-filter_complex',
        filterComplex,
        '-filter_threads',
        '0',
        '-filter_complex_threads',
        '0',
        '-map',
        '[outv]',
        '-map',
        '0:a',
        '-c:v',
        encoder,
        ...presetFlag,
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        '-y'
      ])
      .on('end', () => resolve())
      .on('error', reject)
      .save(toFFmpegPath(outputPath))
  })
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
  idx: number,
  outLabel: string,
  transition: BRollTransition,
  tDur: number
): void {
  const start = p.startTime
  const fadeOutSt = start + p.duration - tDur

  // Trim → shift PTS → scale/crop to 1080×1920 → fps → format
  let chain =
    `[${inputIdx}:v]` +
    `trim=0:${p.duration.toFixed(3)},` +
    `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
    `scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=increase,` +
    `crop=${CANVAS_W}:${CANVAS_H},` +
    `fps=${CANVAS_FPS},format=rgba`

  // Apply transition (alpha fade for crossfade, no alpha for swipe/hard-cut)
  if (transition === 'crossfade') {
    chain +=
      `,fade=t=in:st=${start.toFixed(3)}:d=${tDur.toFixed(3)}:alpha=1` +
      `,fade=t=out:st=${fadeOutSt.toFixed(3)}:d=${tDur.toFixed(3)}:alpha=1`
  } else if (transition === 'hard-cut') {
    // No fade — instant appear/disappear handled by overlay enable
  }
  // For swipe transitions, the alpha is opaque; position animation is in the overlay expr

  parts.push(`${chain}[${outLabel}]`)
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
  speakerLabel: string
): void {
  const start = p.startTime
  const fadeOutSt = start + p.duration - tDur

  const brollH = roundEven(Math.round(CANVAS_H * 0.65))
  const speakerH = roundEven(CANVAS_H - brollH)

  // B-Roll: trim → shift PTS → scale/crop
  const brLabel = `br${idx}`
  parts.push(
    `[${inputIdx}:v]` +
    `trim=0:${p.duration.toFixed(3)},` +
    `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
    `scale=${CANVAS_W}:${brollH}:force_original_aspect_ratio=increase,` +
    `crop=${CANVAS_W}:${brollH},` +
    `fps=${CANVAS_FPS}` +
    `[${brLabel}]`
  )

  // Speaker: trim the same time window from main, scale to speaker panel size
  const spLabel = `sp${idx}`
  parts.push(
    `[${speakerLabel}]` +
    `trim=${start.toFixed(3)}:${(start + p.duration).toFixed(3)},` +
    `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
    `scale=${CANVAS_W}:${speakerH}:force_original_aspect_ratio=increase,` +
    `crop=${CANVAS_W}:${speakerH},` +
    `fps=${CANVAS_FPS}` +
    `[${spLabel}]`
  )

  // VStack based on mode
  const vstackLabel = `vs${idx}`
  if (mode === 'split-top') {
    // B-Roll on top, speaker on bottom
    parts.push(`[${brLabel}][${spLabel}]vstack=inputs=2[${vstackLabel}]`)
  } else {
    // Speaker on top, B-Roll on bottom
    parts.push(`[${spLabel}][${brLabel}]vstack=inputs=2[${vstackLabel}]`)
  }

  // Convert to rgba and apply transition
  let chain = `[${vstackLabel}]format=rgba`
  if (transition === 'crossfade') {
    chain +=
      `,fade=t=in:st=${start.toFixed(3)}:d=${tDur.toFixed(3)}:alpha=1` +
      `,fade=t=out:st=${fadeOutSt.toFixed(3)}:d=${tDur.toFixed(3)}:alpha=1`
  }

  parts.push(`${chain}[${outLabel}]`)
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
  speakerLabel: string
): void {
  const start = p.startTime
  const fadeOutSt = start + p.duration - tDur
  const pipFrac = p.pipSize ?? 0.25
  const pipPos = p.pipPosition ?? 'bottom-right'

  const pipW = roundEven(Math.round(CANVAS_W * pipFrac))
  const pipH = roundEven(Math.round(pipW * (CANVAS_H / CANVAS_W)))
  const { x: pipX, y: pipY } = pipXY(pipW, pipH, pipPos)

  // B-Roll fullscreen
  const brLabel = `br${idx}`
  parts.push(
    `[${inputIdx}:v]` +
    `trim=0:${p.duration.toFixed(3)},` +
    `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
    `scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=increase,` +
    `crop=${CANVAS_W}:${CANVAS_H},` +
    `fps=${CANVAS_FPS}` +
    `[${brLabel}]`
  )

  // Speaker PiP: trim → scale to small size
  const spLabel = `sp${idx}`
  parts.push(
    `[${speakerLabel}]` +
    `trim=${start.toFixed(3)}:${(start + p.duration).toFixed(3)},` +
    `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB,` +
    `scale=${pipW}:${pipH}:force_original_aspect_ratio=increase,` +
    `crop=${pipW}:${pipH},` +
    `fps=${CANVAS_FPS}` +
    `[${spLabel}]`
  )

  // Overlay speaker PiP on B-Roll
  const pipOverLabel = `po${idx}`
  parts.push(
    `[${brLabel}][${spLabel}]overlay=${pipX}:${pipY}:eof_action=pass[${pipOverLabel}]`
  )

  // Convert to rgba and apply transition
  let chain = `[${pipOverLabel}]format=rgba`
  if (transition === 'crossfade') {
    chain +=
      `,fade=t=in:st=${start.toFixed(3)}:d=${tDur.toFixed(3)}:alpha=1` +
      `,fade=t=out:st=${fadeOutSt.toFixed(3)}:d=${tDur.toFixed(3)}:alpha=1`
  }

  parts.push(`${chain}[${outLabel}]`)
}

// ---------------------------------------------------------------------------
// Overlay expression builder (handles position animations for swipe)
// ---------------------------------------------------------------------------

/**
 * Returns the `x:y` portion of the overlay filter for each placement.
 *
 * - hard-cut / crossfade: static 0:0
 * - swipe-up: Y animates from H to 0 on entry, 0 to -H on exit
 * - swipe-down: Y animates from -H to 0 on entry, 0 to H on exit
 */
function buildOverlayExpr(
  mode: BRollDisplayMode,
  transition: BRollTransition,
  start: number,
  end: number,
  tDur: number
): string {
  if (transition === 'swipe-up') {
    // Entry: Y goes from H → 0 over tDur after start
    // Exit: Y goes from 0 → -H over tDur before end
    const entryEnd = start + tDur
    const exitStart = end - tDur
    const yExpr =
      `'if(lt(t,${entryEnd.toFixed(3)}),` +
      `${CANVAS_H}*(1-(t-${start.toFixed(3)})/${tDur.toFixed(3)}),` +
      `if(gt(t,${exitStart.toFixed(3)}),` +
      `-${CANVAS_H}*(t-${exitStart.toFixed(3)})/${tDur.toFixed(3)},` +
      `0))'`
    return `0:${yExpr}`
  }

  if (transition === 'swipe-down') {
    // Entry: Y goes from -H → 0 over tDur after start
    // Exit: Y goes from 0 → H over tDur before end
    const entryEnd = start + tDur
    const exitStart = end - tDur
    const yExpr =
      `'if(lt(t,${entryEnd.toFixed(3)}),` +
      `-${CANVAS_H}+${CANVAS_H}*(t-${start.toFixed(3)})/${tDur.toFixed(3)},` +
      `if(gt(t,${exitStart.toFixed(3)}),` +
      `${CANVAS_H}*(t-${exitStart.toFixed(3)})/${tDur.toFixed(3)},` +
      `0))'`
    return `0:${yExpr}`
  }

  // hard-cut and crossfade: static position
  return '0:0'
}
