// ---------------------------------------------------------------------------
// Brand kit feature — logo watermark overlay + bumper config injection
// ---------------------------------------------------------------------------

import { existsSync } from 'fs'
import type { RenderFeature, PrepareResult } from './feature'
import type { RenderClipJob, RenderBatchOptions, BrandKitRenderOptions } from '../types'

// ---------------------------------------------------------------------------
// Logo overlay helpers — exported for use by base-render.ts
// ---------------------------------------------------------------------------

/**
 * Returns the FFmpeg overlay position expression for the given corner.
 * W/H = main video dimensions, w/h = overlay (logo) dimensions.
 */
export function buildLogoPositionExpr(
  position: BrandKitRenderOptions['logoPosition']
): string {
  const pad = 40
  switch (position) {
    case 'top-left':
      return `x=${pad}:y=${pad}`
    case 'top-right':
      return `x=W-w-${pad}:y=${pad}`
    case 'bottom-left':
      return `x=${pad}:y=H-h-${pad}`
    case 'bottom-right':
    default:
      return `x=W-w-${pad}:y=H-h-${pad}`
  }
}

/**
 * Build a filter_complex string that overlays a logo onto the processed video
 * (no sound design). Inputs: [0] = source video, [1] = logo image.
 *
 * @param videoFilter - The base video filter chain (crop, scale, etc.)
 * @param bk - Brand kit render options with logo settings
 * @param targetWidth - Target canvas width (default 1080)
 */
export function buildLogoOnlyFilterComplex(
  videoFilter: string,
  bk: BrandKitRenderOptions,
  targetWidth: number = 1080
): string {
  const logoW = Math.round(bk.logoScale * targetWidth)
  const opacity = bk.logoOpacity.toFixed(3)
  const posExpr = buildLogoPositionExpr(bk.logoPosition)

  return [
    `[0:v]${videoFilter}[mainv]`,
    // loop=-1:size=1 makes the single-frame image last for the full video duration
    `[1:v]loop=loop=-1:size=1:start=0,scale=${logoW}:-2,format=rgba,colorchannelmixer=aa=${opacity}[logo]`,
    `[mainv][logo]overlay=${posExpr}:format=auto[outv]`
  ].join(';')
}

// ---------------------------------------------------------------------------
// Brand kit feature implementation
// ---------------------------------------------------------------------------

/**
 * Brand kit feature handles:
 * 1. Config injection: populates `job.brandKit` from global batch options,
 *    respecting per-clip overrides (`clipOverrides.enableBrandKit`).
 * 2. Logo overlay helpers: exported for use by base-render.ts (logo overlay
 *    is part of the base render's filter_complex, not a separate overlay pass).
 * 3. Bumper config: paths are set on `job.brandKit` for post-render concat
 *    handled by bumpers.ts.
 */
export const brandKitFeature: RenderFeature = {
  name: 'brand-kit',

  async prepare(
    job: RenderClipJob,
    batchOptions: RenderBatchOptions,
    _onProgress?: (message: string, percent: number) => void
  ): Promise<PrepareResult> {
    const bk = batchOptions.brandKit
    if (!bk) {
      return { tempFiles: [], modified: false }
    }

    // Determine whether brand kit should be applied to this clip
    const perClipOverride = job.clipOverrides?.enableBrandKit
    const globalEnabled = bk.enabled

    let shouldApply: boolean
    if (perClipOverride !== undefined) {
      // Explicit per-clip override takes precedence
      shouldApply = perClipOverride
    } else {
      // Fall back to global setting
      shouldApply = globalEnabled
    }

    if (!shouldApply) {
      return { tempFiles: [], modified: false }
    }

    try {
      // Inject brand kit config into the job
      job.brandKit = {
        logoPath: bk.logoPath,
        logoPosition: bk.logoPosition,
        logoScale: bk.logoScale,
        logoOpacity: bk.logoOpacity,
        introBumperPath: bk.introBumperPath,
        outroBumperPath: bk.outroBumperPath
      }

      // Validate that referenced files actually exist
      if (job.brandKit.logoPath && !existsSync(job.brandKit.logoPath)) {
        console.warn(
          `[BrandKit] Clip ${job.clipId}: logo file not found at ${job.brandKit.logoPath} — disabling logo`
        )
        job.brandKit.logoPath = null
      }
      if (job.brandKit.introBumperPath && !existsSync(job.brandKit.introBumperPath)) {
        console.warn(
          `[BrandKit] Clip ${job.clipId}: intro bumper not found at ${job.brandKit.introBumperPath} — skipping`
        )
        job.brandKit.introBumperPath = null
      }
      if (job.brandKit.outroBumperPath && !existsSync(job.brandKit.outroBumperPath)) {
        console.warn(
          `[BrandKit] Clip ${job.clipId}: outro bumper not found at ${job.brandKit.outroBumperPath} — skipping`
        )
        job.brandKit.outroBumperPath = null
      }

      const hasLogo = !!job.brandKit.logoPath
      const hasBumpers = !!(job.brandKit.introBumperPath || job.brandKit.outroBumperPath)
      console.log(
        `[BrandKit] Clip ${job.clipId}: logo=${hasLogo}, bumpers=${hasBumpers}`
      )

      return { tempFiles: [], modified: true }
    } catch (err) {
      console.error(`[BrandKit] Prepare failed for clip ${job.clipId}, skipping brand kit:`, err)
      job.brandKit = undefined
      return { tempFiles: [], modified: false }
    }
  }
}
