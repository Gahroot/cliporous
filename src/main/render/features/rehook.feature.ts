// ---------------------------------------------------------------------------
// Re-hook feature — mid-clip pattern interrupt ASS overlay
// ---------------------------------------------------------------------------

import type { RenderFeature, PrepareResult, OverlayContext, OverlayPassResult } from './feature'
import type { RenderClipJob, RenderBatchOptions, RehookConfig, OverlayVisualSettings, HookTitleConfig } from '../types'
import type { Archetype } from '@shared/types'
import { buildASSFilter } from '../helpers'
import { getDefaultRehookPhrase } from '../../overlays/rehook'
import { generateHookTitleASSFile } from './hook-title.feature'
import { resolveTemplate, isSpeakerFullscreen, DEFAULT_EDIT_STYLE_ID } from '../../edit-styles'

/** Default visual settings used when hook title overlay is not configured. */
const DEFAULT_OVERLAY_VISUALS: OverlayVisualSettings = {
  fontSize: 72,
  textColor: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 4
}

// ---------------------------------------------------------------------------
// ASS generation — delegates to the hook-title pill builder
// ---------------------------------------------------------------------------

/**
 * Generate an ASS subtitle file for the re-hook / pattern interrupt overlay.
 *
 * Visually identical to the hook title: solid white pill, black Inter Bold
 * text. The only differences are timing (`appearTime`) and the temp file
 * name. Reuses `generateHookTitleASSFile` so the two overlays stay locked in
 * sync — change the pill once, both overlays update.
 *
 * @returns Path to the generated .ass file in the temp directory.
 */
export function generateRehookASSFile(
  text: string,
  config: RehookConfig,
  visuals: OverlayVisualSettings,
  appearTime: number,
  frameWidth = 1080,
  frameHeight = 1920,
  yPositionPx?: number
): string {
  // Adapt RehookConfig (no fontSize/colors) into a HookTitleConfig by
  // borrowing the inherited visual settings. textColor/outlineColor are
  // intentionally ignored downstream — the hook pill is visually locked to
  // white-on-black — but we still pass them through to satisfy the type.
  const hookLikeConfig: HookTitleConfig = {
    enabled: config.enabled,
    style: 'centered-bold',
    displayDuration: config.displayDuration,
    fadeIn: config.fadeIn,
    fadeOut: config.fadeOut,
    fontSize: visuals.fontSize,
    textColor: visuals.textColor,
    outlineColor: visuals.outlineColor,
    outlineWidth: visuals.outlineWidth
  }

  const assPath = generateHookTitleASSFile(
    text,
    hookLikeConfig,
    frameWidth,
    frameHeight,
    yPositionPx,
    appearTime,
    'batchcontent-rehook'
  )
  console.log(`[Rehook] Generated ASS overlay: ${assPath}`)
  return assPath
}

// ---------------------------------------------------------------------------
// Feature implementation
// ---------------------------------------------------------------------------

/**
 * Create a re-hook render feature.
 *
 * The re-hook is a mid-clip "pattern interrupt" text overlay that appears
 * after the hook title ends, designed to reset viewer attention and combat
 * the mid-clip retention dip. Rendered as an ASS subtitle burned in during
 * a separate FFmpeg pass.
 */
export function createRehookFeature(): RenderFeature {
  /** Map from clipId → generated ASS file path (survives across prepare → overlayPass) */
  const assPathMap = new Map<string, string>()

  return {
    name: 'rehook',

    async prepare(job: RenderClipJob, batchOptions: RenderBatchOptions, _onProgress?: (message: string, percent: number) => void): Promise<PrepareResult> {
      // Guard: global rehook overlay must be enabled
      if (!batchOptions.rehookOverlay?.enabled) {
        return { tempFiles: [], modified: false }
      }

      // Per-clip override: enableHookTitle is reused for the rehook toggle
      const ov = job.clipOverrides?.enableHookTitle
      const hookEnabled = ov === undefined ? true : ov
      if (!hookEnabled) {
        return { tempFiles: [], modified: false }
      }

      // Inject rehook config from batch options
      job.rehookConfig = batchOptions.rehookOverlay

      // Compute appear time: immediately after hook title disappears
      const hookDuration = batchOptions.hookTitleOverlay?.displayDuration ?? 2.5
      job.rehookAppearTime = hookDuration

      // Use pre-set text if provided (e.g. AI-generated ahead of render);
      // otherwise pick a deterministic default phrase from the curated list.
      if (!job.rehookText) {
        job.rehookText = getDefaultRehookPhrase(job.clipId)
      }

      console.log(
        `[Rehook] Clip ${job.clipId}: appear at ${job.rehookAppearTime.toFixed(2)}s (after hook) — "${job.rehookText}"`
      )

      try {
        // Compute Y position: per-archetype default, overridable by the
        // global template editor only for speaker-fullscreen archetypes.
        const frameWidth = 1080
        const frameHeight = 1920

        const editStyleId = job.stylePresetId ?? DEFAULT_EDIT_STYLE_ID
        const rehookArchetype = resolveClipRehookArchetype(job)
        const tpl = resolveTemplate(rehookArchetype, editStyleId)

        const yPositionPx = isSpeakerFullscreen(rehookArchetype) && batchOptions.templateLayout?.rehookText
          ? Math.round((batchOptions.templateLayout.rehookText.y / 100) * frameHeight)
          : tpl.rehookY

        // Inherit visual settings from hook title config, falling back to defaults
        const hookVisuals = batchOptions.hookTitleOverlay
        const visuals: OverlayVisualSettings = hookVisuals
          ? {
              fontSize: hookVisuals.fontSize,
              textColor: hookVisuals.textColor,
              outlineColor: hookVisuals.outlineColor,
              outlineWidth: hookVisuals.outlineWidth
            }
          : DEFAULT_OVERLAY_VISUALS

        // Generate the ASS overlay file
        const assPath = generateRehookASSFile(
          job.rehookText,
          job.rehookConfig,
          visuals,
          job.rehookAppearTime,
          frameWidth,
          frameHeight,
          yPositionPx
        )
        assPathMap.set(job.clipId, assPath)

        return { tempFiles: [assPath], modified: true }
      } catch (err) {
        console.error(`[Rehook] Failed to generate ASS overlay for clip ${job.clipId}:`, err)
        return { tempFiles: [], modified: false }
      }
    },

    overlayPass(job: RenderClipJob, _context: OverlayContext): OverlayPassResult | null {
      const assPath = assPathMap.get(job.clipId)
      if (!assPath) return null

      // Clean up map entry — this clip is done
      assPathMap.delete(job.clipId)

      return {
        name: 'rehook',
        filter: buildASSFilter(assPath)
      }
    }
  }
}

/**
 * Pick the archetype that owns the rehook's on-screen position.
 *
 * Segmented clips: find the segment whose clip-relative window covers the
 * rehook's midpoint (`rehookAppearTime + displayDuration/2`). Non-segmented
 * clips default to 'talking-head' (the catch-all speaker layout).
 */
function resolveClipRehookArchetype(job: RenderClipJob): Archetype {
  const segments = job.segmentedSegments
  if (!segments || segments.length === 0) return 'talking-head'

  const appearTime = job.rehookAppearTime ?? 2.5
  const rehookDuration = job.rehookConfig?.displayDuration ?? 2.5
  const midpoint = appearTime + rehookDuration / 2

  let cumulative = 0
  for (const seg of segments) {
    const segDuration = seg.endTime - seg.startTime
    const winStart = cumulative
    const winEnd = cumulative + segDuration
    if (midpoint >= winStart && midpoint <= winEnd) {
      return seg.archetype
    }
    cumulative = winEnd
  }

  // Past the last segment — use it as the fallback.
  return segments[segments.length - 1].archetype
}
