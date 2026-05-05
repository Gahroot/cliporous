// ---------------------------------------------------------------------------
// Re-hook feature — mid-clip pattern interrupt ASS overlay
// ---------------------------------------------------------------------------

import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { RenderFeature, PrepareResult, OverlayContext, OverlayPassResult } from './feature'
import type { RenderClipJob, RenderBatchOptions, RehookConfig, OverlayVisualSettings } from '../types'
import { formatASSTimestamp, cssHexToASS, buildASSFilter } from '../helpers'
import { getDefaultRehookPhrase } from '../../overlays/rehook'

/** Default visual settings used when hook title overlay is not configured. */
const DEFAULT_OVERLAY_VISUALS: OverlayVisualSettings = {
  fontSize: 72,
  textColor: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 4
}

// ---------------------------------------------------------------------------
// ASS generation — self-contained within this feature
// ---------------------------------------------------------------------------

/**
 * Generate an ASS subtitle file for the re-hook / pattern interrupt overlay.
 *
 * The re-hook appears after the hook title ends, positioned just below the
 * hook title area (marginV=340) to reset viewer attention mid-clip.
 *
 * Uses ASS native features (\fad, alignment, margins, BorderStyle 3 opaque box)
 * instead of FFmpeg drawtext — avoids Windows command-line escaping issues.
 *
 * @returns Path to the generated .ass file in the temp directory.
 */
function generateRehookASSFile(
  text: string,
  config: RehookConfig,
  visuals: OverlayVisualSettings,
  appearTime: number,
  frameWidth = 1080,
  frameHeight = 1920,
  yPositionPx?: number
): string {
  const {
    displayDuration,
    fadeIn,
    fadeOut
  } = config

  const { fontSize, textColor, outlineColor } = visuals

  const fadeInMs = Math.round(fadeIn * 1000)
  const fadeOutMs = Math.round(fadeOut * 1000)
  const primaryASS = cssHexToASS(textColor)
  const outlineASS = cssHexToASS(outlineColor)

  // Y position from top: use provided value or fall back to 220px (same default as hook title)
  const marginV = yPositionPx ?? 220

  // Filled rounded-rect look: same as hook title — BorderStyle 3 = opaque box.
  // White box background, black text, with generous outline (padding).
  const boxBackColor = cssHexToASS(outlineColor === '#000000' ? '#FFFFFF' : outlineColor)
  // Alignment 8 = top-center in ASS (numpad layout)
  const boxPadding = Math.round(fontSize * 0.22)
  const boxShadow = Math.round(fontSize * 0.08)
  const styleLine = `Style: Rehook,Arial,${fontSize},${primaryASS},${primaryASS},${outlineASS},${boxBackColor},-1,0,0,0,100,100,0,0,3,${boxPadding},${boxShadow},8,40,40,${marginV},1`
  const dialogueText = `{\\fad(${fadeInMs},${fadeOutMs})}${text}`

  const startTime = formatASSTimestamp(appearTime)
  const endTime = formatASSTimestamp(appearTime + displayDuration)

  const ass = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${frameWidth}`,
    `PlayResY: ${frameHeight}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    styleLine,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,${startTime},${endTime},Rehook,,0,0,0,,${dialogueText}`,
    ''
  ].join('\n')

  const assPath = join(tmpdir(), `batchcontent-rehook-${Date.now()}.ass`)
  writeFileSync(assPath, ass, 'utf-8')
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
        // Compute Y position from template layout
        const frameHeight = 1920
        const yPositionPx = batchOptions.templateLayout?.rehookText
          ? Math.round((batchOptions.templateLayout.rehookText.y / 100) * frameHeight)
          : undefined

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
          1080,
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
