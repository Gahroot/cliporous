// ---------------------------------------------------------------------------
// Hook title feature — ASS overlay for AI-generated hook text
// ---------------------------------------------------------------------------

import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { RenderFeature, PrepareResult, OverlayContext, OverlayPassResult } from './feature'
import type { RenderClipJob, RenderBatchOptions, HookTitleConfig } from '../types'
import { formatASSTimestamp, cssHexToASS, buildASSFilter } from '../helpers'

// ---------------------------------------------------------------------------
// ASS generation — self-contained within this feature
// ---------------------------------------------------------------------------

/**
 * Generate an ASS subtitle file for the hook title overlay.
 *
 * Uses ASS native features (fonts by name, \fad, alignment, margins) instead
 * of FFmpeg drawtext — completely avoids Windows command-line escaping issues.
 *
 * @returns Path to the generated .ass file in the temp directory.
 */
export function generateHookTitleASSFile(
  text: string,
  config: HookTitleConfig,
  frameWidth = 1080,
  frameHeight = 1920,
  yPositionPx?: number
): string {
  const {
    displayDuration,
    fadeIn,
    fadeOut,
    fontSize,
    textColor,
    outlineColor
  } = config

  const fadeInMs = Math.round(fadeIn * 1000)
  const fadeOutMs = Math.round(fadeOut * 1000)
  const primaryASS = cssHexToASS(textColor)
  const outlineASS = cssHexToASS(outlineColor)

  // Y position from top: use provided value or fall back to 220px
  const marginV = yPositionPx ?? 220

  // Filled rounded-rect look: BorderStyle 3 = opaque box behind text.
  // White box background, black text, with generous outline (padding).
  // BackColour = white (fully opaque)
  const boxBackColor = cssHexToASS(outlineColor === '#000000' ? '#FFFFFF' : outlineColor)
  // Alignment 8 = top-center in ASS (numpad layout: 7=TL 8=TC 9=TR)
  // Outline=16 gives padding around the text inside the box; Shadow=6 gives rounded-corner illusion
  const boxPadding = Math.round(fontSize * 0.22)
  const boxShadow = Math.round(fontSize * 0.08)
  const styleLine = `Style: HookTitle,Arial,${fontSize},${primaryASS},${primaryASS},${outlineASS},${boxBackColor},-1,0,0,0,100,100,0,0,3,${boxPadding},${boxShadow},8,40,40,${marginV},1`
  const dialogueText = `{\\fad(${fadeInMs},${fadeOutMs})}${text}`

  const startTime = formatASSTimestamp(0)
  const endTime = formatASSTimestamp(displayDuration)

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
    `Dialogue: 0,${startTime},${endTime},HookTitle,,0,0,0,,${dialogueText}`,
    ''
  ].join('\n')

  const assPath = join(tmpdir(), `batchcontent-hooktitle-${Date.now()}.ass`)
  writeFileSync(assPath, ass, 'utf-8')
  return assPath
}

// ---------------------------------------------------------------------------
// Feature implementation
// ---------------------------------------------------------------------------

/**
 * Create a hook title render feature.
 *
 * The hook title is an AI-generated text overlay shown in the first few
 * seconds of each clip, rendered as an ASS subtitle burned in during a
 * separate FFmpeg pass.
 */
export function createHookTitleFeature(): RenderFeature {
  /** Map from clipId → generated ASS file path (survives across prepare → overlayPass) */
  const assPathMap = new Map<string, string>()

  return {
    name: 'hook-title',

    async prepare(job: RenderClipJob, batchOptions: RenderBatchOptions, _onProgress?: (message: string, percent: number) => void): Promise<PrepareResult> {
      // Resolve per-clip override vs global setting
      const ov = job.clipOverrides?.enableHookTitle
      const hookEnabled = ov === undefined
        ? (batchOptions.hookTitleOverlay?.enabled ?? false)
        : ov

      // Inject hookTitleConfig from batch options when enabled
      if (hookEnabled && batchOptions.hookTitleOverlay) {
        job.hookTitleConfig = batchOptions.hookTitleOverlay
      }

      // Guard: need both config and text
      if (!job.hookTitleConfig?.enabled || !job.hookTitleText) {
        if (hookEnabled && !job.hookTitleText) {
          console.warn(`[HookTitle] Clip ${job.clipId} has no hookTitleText — hook overlay will be skipped`)
        }
        return { tempFiles: [], modified: false }
      }

      try {
        const frameHeight = 1920
        const yPositionPx = batchOptions.templateLayout?.titleText
          ? Math.round((batchOptions.templateLayout.titleText.y / 100) * frameHeight)
          : undefined

        const assPath = generateHookTitleASSFile(job.hookTitleText, job.hookTitleConfig, 1080, frameHeight, yPositionPx)
        assPathMap.set(job.clipId, assPath)
        console.log(`[HookTitle] Generated ASS overlay: ${assPath}`)
        return { tempFiles: [assPath], modified: true }
      } catch (err) {
        console.error(`[HookTitle] Failed to generate ASS overlay for clip ${job.clipId}:`, err)
        return { tempFiles: [], modified: false }
      }
    },

    overlayPass(job: RenderClipJob, _context: OverlayContext): OverlayPassResult | null {
      const assPath = assPathMap.get(job.clipId)
      if (!assPath) return null

      // Clean up map entry — this clip is done
      assPathMap.delete(job.clipId)

      return {
        name: 'hook-title',
        filter: buildASSFilter(assPath)
      }
    }
  }
}
