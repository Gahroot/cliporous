// ---------------------------------------------------------------------------
// Captions feature — ASS subtitle generation + burn-in overlay
// ---------------------------------------------------------------------------

import { existsSync } from 'fs'
import { join } from 'path'
import type { RenderFeature, PrepareResult, OverlayContext, OverlayPassResult } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import { buildASSFilter } from '../helpers'
import { generateCaptions, type ShotCaptionOverride, type CaptionStyleInput } from '../../captions'
import { analyzeEmphasisHeuristic } from '../../word-emphasis'
import { ASPECT_RATIO_CONFIGS } from '../../aspect-ratios'
import type { ShotStyleConfig } from '@shared/types'

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
      // Caption style flows from the selected AI edit style, resolved by the
      // renderer and passed in as batchOptions.captionStyle. captionsEnabled
      // is always true post-refactor (the basic caption path has been
      // removed) — we only honour the per-clip opt-out below.
      if (!batchOptions.captionStyle) {
        return { tempFiles: [], modified: false }
      }

      // Per-clip opt-out (e.g. clean clip with no burn-in)
      const captionOv = job.clipOverrides?.enableCaptions
      const captionsEnabled = captionOv === undefined ? true : captionOv
      if (!captionsEnabled) {
        return { tempFiles: [], modified: false }
      }

      // Filter word timestamps to the clip's time range
      const words = (job.wordTimestamps ?? []).filter(
        (w) => w.start >= job.startTime && w.end <= job.endTime
      )
      if (words.length === 0) {
        return { tempFiles: [], modified: false }
      }

      // Shift to 0-based clip-relative timestamps
      const localWordsBase = words.map((w) => ({
        text: w.text,
        start: w.start - job.startTime,
        end: w.end - job.startTime
      }))

      // Read emphasis from upstream word-emphasis feature, or fall back to own heuristic
      const emphasized = job.wordEmphasis && job.wordEmphasis.length > 0
        ? localWordsBase.map((w) => {
            const match = job.wordEmphasis!.find(
              (ov) => Math.abs(ov.start - w.start) < 0.05
            )
            return { ...w, emphasis: match?.emphasis ?? 'normal' }
          })
        : analyzeEmphasisHeuristic(localWordsBase)

      const localWords = localWordsBase.map((w, i) => ({
        ...w,
        emphasis: (emphasized as Array<{ emphasis?: string }>)[i]?.emphasis ?? ('normal' as const) as 'normal' | 'emphasis' | 'supersize'
      }))

      // If upstream word-emphasis feature didn't provide keyframes, compute them here as fallback
      if (!job.emphasisKeyframes || job.emphasisKeyframes.length === 0) {
        job.emphasisKeyframes = localWords
          .filter((w) => w.emphasis === 'emphasis' || w.emphasis === 'supersize' || w.emphasis === 'box')
          .map((w) => ({ time: w.start, end: w.end, level: w.emphasis as 'emphasis' | 'supersize' | 'box' }))
      }

      // Resolve fonts dir (cached after first call)
      await resolveFontsDir()

      try {
        const arCfg = ASPECT_RATIO_CONFIGS[batchOptions.outputAspectRatio ?? '9:16']

        // Subtitles use bottom-center alignment (AN2); y% is from top,
        // so marginV (from bottom) = (1 - y/100) * height
        const marginVOverride = batchOptions.templateLayout?.subtitles
          ? Math.round((1 - batchOptions.templateLayout.subtitles.y / 100) * arCfg.height)
          : undefined

        // Build per-shot caption overrides from shotStyleConfigs
        const shotCaptionOverrides = buildShotCaptionOverrides(
          job.shotStyleConfigs,
          batchOptions.captionStyle
        )

        job.assFilePath = await generateCaptions(
          localWords,
          batchOptions.captionStyle,
          undefined,
          arCfg.width,
          arCfg.height,
          marginVOverride,
          shotCaptionOverrides
        )
        console.log(`[Captions] Clip ${job.clipId}: generated ${job.assFilePath}`)
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
 * Build per-shot caption style overrides from resolved shot style configs.
 *
 * Each ShotStyleConfig that has a `captionStyle` override produces a
 * ShotCaptionOverride that the ASS builder uses to switch animation/color
 * for word groups within that shot's time range.
 *
 * @returns ShotCaptionOverride[] or undefined when no per-shot overrides apply
 */
function buildShotCaptionOverrides(
  shotStyleConfigs?: ShotStyleConfig[],
  globalStyle?: CaptionStyleInput
): ShotCaptionOverride[] | undefined {
  if (!shotStyleConfigs || shotStyleConfigs.length === 0 || !globalStyle) {
    return undefined
  }

  const overrides: ShotCaptionOverride[] = []

  for (const config of shotStyleConfigs) {
    if (!config.captionStyle) continue

    overrides.push({
      startTime: config.startTime,
      endTime: config.endTime,
      style: {
        fontName: config.captionStyle.fontName,
        fontSize: config.captionStyle.fontSize,
        primaryColor: config.captionStyle.primaryColor,
        highlightColor: config.captionStyle.highlightColor,
        outlineColor: config.captionStyle.outlineColor,
        backColor: config.captionStyle.backColor,
        outline: config.captionStyle.outline,
        shadow: config.captionStyle.shadow,
        borderStyle: config.captionStyle.borderStyle,
        wordsPerLine: config.captionStyle.wordsPerLine,
        animation: config.captionStyle.animation,
        emphasisColor: config.captionStyle.emphasisColor,
        supersizeColor: config.captionStyle.supersizeColor,
        emphasisScale: config.captionStyle.emphasisScale,
        emphasisFontWeight: config.captionStyle.emphasisFontWeight,
        supersizeScale: config.captionStyle.supersizeScale,
        supersizeFontWeight: config.captionStyle.supersizeFontWeight,
        boxColor: config.captionStyle.boxColor,
        boxOpacity: config.captionStyle.boxOpacity,
        boxPadding: config.captionStyle.boxPadding,
        boxTextColor: config.captionStyle.boxTextColor,
        boxFontWeight: config.captionStyle.boxFontWeight
      }
    })
  }

  return overrides.length > 0 ? overrides : undefined
}
