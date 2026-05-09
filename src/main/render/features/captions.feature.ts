// ---------------------------------------------------------------------------
// Captions render feature — V2.
//
// Consumes the V2 caption pipeline, which supports exactly three modes:
//   • 'standard'           — Inter Bold, white, soft 0-offset black halo
//   • 'emphasis'            — emphasis words recolor to the purple accent
//   • 'emphasis_highlight'  — emphasis words recolor AND swap to Bebas Neue
//
// This feature picks the mode and accent for the clip, then hands a
// CaptionStyleInput annotated with `captionMode` + `accentColor` to
// generateCaptions(). All V1 animation/box/supersize variations are gone.
// ---------------------------------------------------------------------------

import { existsSync } from 'fs'
import { join } from 'path'
import type { RenderFeature, PrepareResult, OverlayContext, OverlayPassResult } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import { buildASSFilter } from '../helpers'
import {
  generateCaptions,
  DEFAULT_ACCENT,
  type CaptionMode,
  type CaptionStyleInput,
  type ShotCaptionOverride,
  type WordInput
} from '../../captions'
import { analyzeEmphasisHeuristic } from '../../word-emphasis'
import { ASPECT_RATIO_CONFIGS } from '../../aspect-ratios'
import type { ShotStyleConfig } from '@shared/types'

/**
 * Pick the V2 caption mode for a clip. Only three values are possible.
 *
 * The decision is driven by:
 *   1. An explicit `captionMode` on the style object (strongest signal).
 *   2. Whether any words are flagged as emphasis. No flagged words → 'standard'.
 *   3. Whether the style provides an accent color distinct from the standard
 *      cream. An accent present → 'emphasis_highlight'; otherwise 'emphasis'.
 */
function resolveCaptionMode(
  style: CaptionStyleInput,
  words: WordInput[]
): CaptionMode {
  if (style.captionMode === 'standard'
    || style.captionMode === 'emphasis'
    || style.captionMode === 'emphasis_highlight') {
    return style.captionMode
  }

  const hasEmphasis = words.some((w) => {
    const e = w.emphasis
    return e === true || e === 'emphasis' || e === 'supersize' || e === 'box'
  })
  if (!hasEmphasis) return 'standard'

  // Treat any explicit accent (on `accentColor`, or the legacy `emphasisColor`
  // / `highlightColor` slots) as a request for the highlighted variant.
  const accent = style.accentColor ?? style.emphasisColor ?? style.highlightColor
  if (accent && accent.toLowerCase() !== '#ffffff') {
    return 'emphasis_highlight'
  }
  return 'emphasis'
}

/** Resolve the accent color from a style object — or fall back to PRESTYJ purple. */
function resolveAccent(style: CaptionStyleInput): string {
  return style.accentColor ?? style.emphasisColor ?? style.highlightColor ?? DEFAULT_ACCENT
}

/**
 * Create a captions render feature.
 *
 * Uses a factory function (closure) so the resolved `fontsDir` can be cached
 * across all clips in a batch without requiring a class instance.
 */
export function createCaptionsFeature(): RenderFeature {
  let fontsDir: string | undefined

  /** Resolve the bundled fonts directory once and cache it. */
  async function resolveFontsDir(): Promise<string | undefined> {
    if (fontsDir !== undefined) return fontsDir

    try {
      const { app } = await import('electron')
      const fontsPath = app.isPackaged
        ? join(process.resourcesPath, 'fonts')
        : join(__dirname, '../../resources/fonts')
      if (existsSync(fontsPath)) {
        fontsDir = fontsPath
        console.log(`[Captions] Fonts directory: ${fontsDir}`)
        return fontsDir
      }
    } catch {
      const fontsPath = join(__dirname, '../../resources/fonts')
      if (existsSync(fontsPath)) {
        fontsDir = fontsPath
        return fontsDir
      }
    }

    fontsDir = undefined
    return undefined
  }

  return {
    name: 'captions',

    async prepare(job: RenderClipJob, batchOptions: RenderBatchOptions, _onProgress?: (message: string, percent: number) => void): Promise<PrepareResult> {
      if (!batchOptions.captionStyle) {
        return { tempFiles: [], modified: false }
      }

      // Per-clip opt-out (clean clip with no burn-in).
      const captionOv = job.clipOverrides?.enableCaptions
      const captionsEnabled = captionOv === undefined ? true : captionOv
      if (!captionsEnabled) {
        return { tempFiles: [], modified: false }
      }

      // Filter word timestamps to the clip's time range, then shift to 0-based.
      const words = (job.wordTimestamps ?? []).filter(
        (w) => w.start >= job.startTime && w.end <= job.endTime
      )
      if (words.length === 0) {
        return { tempFiles: [], modified: false }
      }

      const localWordsBase: WordInput[] = words.map((w) => ({
        text: w.text,
        start: w.start - job.startTime,
        end: w.end - job.startTime
      }))

      // Resolve emphasis: prefer the upstream word-emphasis feature, fall back
      // to the local heuristic. V2 collapses every non-normal level into a
      // single boolean, but we keep the rich enum on the wire so the data
      // stays compatible with any future re-introduction.
      const emphasized = job.wordEmphasis && job.wordEmphasis.length > 0
        ? localWordsBase.map((w) => {
            const match = job.wordEmphasis!.find((ov) => Math.abs(ov.start - w.start) < 0.05)
            return { ...w, emphasis: match?.emphasis ?? 'normal' }
          })
        : analyzeEmphasisHeuristic(localWordsBase)

      const localWords: WordInput[] = localWordsBase.map((w, i) => ({
        ...w,
        emphasis: ((emphasized as Array<{ emphasis?: string }>)[i]?.emphasis ?? 'normal') as
          'normal' | 'emphasis' | 'supersize' | 'box'
      }))

      // Surface emphasis keyframes for downstream features (zoom, etc.) when
      // the upstream feature didn't already compute them.
      if (!job.emphasisKeyframes || job.emphasisKeyframes.length === 0) {
        job.emphasisKeyframes = localWords
          .filter((w) => w.emphasis === 'emphasis' || w.emphasis === 'supersize' || w.emphasis === 'box')
          .map((w) => ({
            time: w.start,
            end: w.end,
            level: w.emphasis as 'emphasis' | 'supersize' | 'box'
          }))
      }

      await resolveFontsDir()

      try {
        const arCfg = ASPECT_RATIO_CONFIGS[batchOptions.outputAspectRatio ?? '9:16']

        // Bottom-anchored alignment (AN2): templateLayout y is from the top
        // (percent), so marginV (from the bottom) = (1 - y/100) * height.
        const marginVOverride = batchOptions.templateLayout?.subtitles
          ? Math.round((1 - batchOptions.templateLayout.subtitles.y / 100) * arCfg.height)
          : undefined

        // Lock the style to one of the three V2 modes before passing it down.
        const baseStyle = batchOptions.captionStyle as CaptionStyleInput
        const resolvedStyle: CaptionStyleInput = {
          ...baseStyle,
          captionMode: resolveCaptionMode(baseStyle, localWords),
          accentColor: resolveAccent(baseStyle)
        }

        const shotCaptionOverrides = buildShotCaptionOverrides(
          job.shotStyleConfigs,
          localWords
        )

        job.assFilePath = await generateCaptions(
          localWords,
          resolvedStyle,
          undefined,
          arCfg.width,
          arCfg.height,
          marginVOverride,
          shotCaptionOverrides
        )
        console.log(
          `[Captions] Clip ${job.clipId}: mode=${resolvedStyle.captionMode} → ${job.assFilePath}`
        )
        return { tempFiles: [job.assFilePath], modified: true }
      } catch (captionErr) {
        console.warn(`[Captions] Clip ${job.clipId}: generation failed:`, captionErr)
        return { tempFiles: [], modified: false }
      }
    },

    overlayPass(job: RenderClipJob, _context: OverlayContext): OverlayPassResult | null {
      if (!job.assFilePath) return null
      return {
        name: 'captions',
        filter: buildASSFilter(job.assFilePath, fontsDir)
      }
    }
  }
}

/**
 * Build per-shot caption style overrides.
 *
 * Each ShotStyleConfig with a `captionStyle` override produces a
 * ShotCaptionOverride locked to one of the three V2 modes. The mode is
 * resolved per-shot using the same logic as the global style, against the
 * subset of words inside the shot's time window.
 */
function buildShotCaptionOverrides(
  shotStyleConfigs: ShotStyleConfig[] | undefined,
  allWords: WordInput[]
): ShotCaptionOverride[] | undefined {
  if (!shotStyleConfigs || shotStyleConfigs.length === 0) return undefined

  const overrides: ShotCaptionOverride[] = []

  for (const config of shotStyleConfigs) {
    if (!config.captionStyle) continue

    const shotWords = allWords.filter(
      (w) => w.start >= config.startTime && w.end <= config.endTime
    )

    const cs = config.captionStyle as CaptionStyleInput
    const style: CaptionStyleInput = {
      ...cs,
      captionMode: resolveCaptionMode(cs, shotWords),
      accentColor: resolveAccent(cs)
    }

    overrides.push({
      startTime: config.startTime,
      endTime: config.endTime,
      style
    })
  }

  return overrides.length > 0 ? overrides : undefined
}
