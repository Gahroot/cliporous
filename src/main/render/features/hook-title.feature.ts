// ---------------------------------------------------------------------------
// Hook title feature — ASS overlay for AI-generated hook text
// ---------------------------------------------------------------------------

import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { RenderFeature, PrepareResult, OverlayContext, OverlayPassResult } from './feature'
import type { RenderClipJob, RenderBatchOptions, HookTitleConfig } from '../types'
import type { Archetype } from '@shared/types'
import { formatASSTimestamp, cssHexToASS, buildASSFilter } from '../helpers'
import { resolveTemplate, isSpeakerFullscreen, DEFAULT_EDIT_STYLE_ID } from '../../edit-styles'

// ---------------------------------------------------------------------------
// ASS generation — self-contained within this feature
// ---------------------------------------------------------------------------

/**
 * Generate an ASS subtitle file for the hook title overlay.
 *
 * Renders a heavily rounded white pill behind black Inter text. The pill is
 * drawn as an ASS vector path (\p1) so the corners stay crisp at any scale,
 * and the text is a separate Dialogue line layered on top — no FFmpeg
 * drawtext, no Windows escaping headaches.
 *
 * @returns Path to the generated .ass file in the temp directory.
 */
export function generateHookTitleASSFile(
  text: string,
  config: HookTitleConfig,
  frameWidth = 1080,
  frameHeight = 1920,
  yPositionPx?: number,
  appearTime = 0,
  filenamePrefix = 'batchcontent-hooktitle'
): string {
  const { displayDuration, fadeIn, fadeOut, fontSize } = config

  const fadeInMs = Math.round(fadeIn * 1000)
  const fadeOutMs = Math.round(fadeOut * 1000)

  // Dead-simple look: solid white pill, black Inter text. textColor and
  // outlineColor from config are intentionally ignored — the hook is
  // visually locked so it always reads the same.
  const blackASS = cssHexToASS('#000000')
  const whiteASS = cssHexToASS('#FFFFFF')

  // Y position from top: provided value, or fall back to ~11.46% of frame
  // height (220px @ 1920) — inside the union 9:16 vertical safe zone.
  const marginV = yPositionPx ?? Math.round(frameHeight * 0.1146)

  // ---- Pill geometry --------------------------------------------------
  // No real font metrics here. Inter regular's average glyph advance is
  // ~0.52em; bumped to 0.55 for a small safety margin. Wide caps may push
  // a hair past the estimate but the corner radius is generous enough that
  // it still reads as a clean pill.
  const avgAdvance = 0.55
  const padX = Math.round(fontSize * 0.55)
  const padY = Math.round(fontSize * 0.30)
  const lineHeight = Math.round(fontSize * 1.15)
  const sideMargin = 40 // px from each frame edge
  const maxBoxWidth = frameWidth - sideMargin * 2
  // Maximum text width inside the pill, in pixels.
  const maxTextWidth = maxBoxWidth - padX * 2

  // Estimate the rendered pixel width of a string at this font size.
  const estWidth = (s: string): number => Math.ceil(s.length * fontSize * avgAdvance)

  // Greedy word-wrap: pack words into lines so each line stays under
  // maxTextWidth. A single word longer than the line budget gets its own
  // line (it'll still be clamped by the pill's max width below — in practice
  // this never happens for hook copy at 72px on a 720px canvas).
  const wrapText = (raw: string, maxWidth: number): string[] => {
    const words = raw.split(/\s+/).filter(Boolean)
    if (words.length === 0) return [raw]
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (estWidth(candidate) <= maxWidth || !current) {
        current = candidate
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
    return lines
  }

  const lines = wrapText(text, maxTextWidth)
  const widestLineWidth = Math.max(...lines.map(estWidth))
  const boxWidth = Math.min(widestLineWidth + padX * 2, maxBoxWidth)
  const boxHeight = lineHeight * lines.length + padY * 2
  // Fully rounded ends: corner radius = half the box height. With multiple
  // lines this turns into a pleasantly tall rounded rect rather than a pill,
  // which is exactly what we want.
  const radius = Math.round(Math.min(boxHeight, lineHeight + padY * 2) / 2)

  // ---- Styles ---------------------------------------------------------
  // Box style: white fill, no outline, no shadow. Tiny font + Alignment 7
  // so the dialogue line is treated as raw drawing only — no glyphs render.
  const boxStyleLine = `Style: HookBox,Arial,1,${whiteASS},${whiteASS},${whiteASS},${whiteASS},0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`
  // Text style: black Inter Bold (weight 700), no outline, no box, top-center anchor.
  // Bold flag = -1 (ASS "true") — libass picks the Inter-Bold face from resources/fonts.
  const textStyleLine = `Style: HookTitle,Inter,${fontSize},${blackASS},${blackASS},${blackASS},${whiteASS},-1,0,0,0,100,100,0,0,1,0,0,8,40,40,${marginV},1`

  // ---- Rounded-rect path ---------------------------------------------
  // libass aligns the drawing's bounding box at \pos according to \an, but
  // it does NOT shift the path coordinates themselves — the path is treated
  // as having its origin at (0,0) regardless of where its glyphs sit. To
  // dodge that quirk we anchor with \an7 (top-left) and lay every coord
  // out positively from (0,0) to (boxWidth, boxHeight), then position the
  // top-left corner at ((frameWidth - boxWidth) / 2, marginV).
  const r = radius
  const c = Math.round(r * 0.5523)
  const w = boxWidth
  const h = boxHeight
  const path = [
    `m ${r} 0`,                              // start: top edge after left corner
    `l ${w - r} 0`,                          // top straight edge
    `b ${w - r + c} 0 ${w} ${r - c} ${w} ${r}`,                  // top-right corner
    `l ${w} ${h - r}`,                       // right straight edge
    `b ${w} ${h - r + c} ${w - r + c} ${h} ${w - r} ${h}`,        // bottom-right corner
    `l ${r} ${h}`,                           // bottom straight edge
    `b ${r - c} ${h} 0 ${h - r + c} 0 ${h - r}`,                  // bottom-left corner
    `l 0 ${r}`,                              // left straight edge
    `b 0 ${r - c} ${r - c} 0 ${r} 0`         // top-left corner
  ].join(' ')

  // ---- Dialogue lines -------------------------------------------------
  const boxX = Math.round((frameWidth - boxWidth) / 2)
  const boxY = marginV
  const textCenterX = Math.round(frameWidth / 2)
  // Box: anchored top-left; \p1 enters drawing mode; \bord0 \shad0 strip
  // any inherited stroke/shadow. \fad gives matched in/out timing.
  const boxDialogueText = `{\\an7\\pos(${boxX},${boxY})\\fad(${fadeInMs},${fadeOutMs})\\p1\\bord0\\shad0}${path}{\\p0}`

  // Text: top-center anchored at (frameWidth/2, boxY + padY) so the first
  // line sits visually centered against the top of the pill, and any
  // additional lines stack downward via ASS \N hard-break separators.
  const textY = boxY + padY
  const wrappedText = lines.join('\\N')
  const textDialogueText = `{\\an8\\pos(${textCenterX},${textY})\\fad(${fadeInMs},${fadeOutMs})}${wrappedText}`

  const startTime = formatASSTimestamp(appearTime)
  const endTime = formatASSTimestamp(appearTime + displayDuration)

  const ass = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${frameWidth}`,
    `PlayResY: ${frameHeight}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    boxStyleLine,
    textStyleLine,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    // Layer 0 = pill (drawn first, behind); Layer 1 = text (drawn on top).
    `Dialogue: 0,${startTime},${endTime},HookBox,,0,0,0,,${boxDialogueText}`,
    `Dialogue: 1,${startTime},${endTime},HookTitle,,0,0,0,,${textDialogueText}`,
    ''
  ].join('\n')

  const assPath = join(tmpdir(), `${filenamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ass`)
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
        const frameWidth = 1080
        const frameHeight = 1920

        // Resolve the clip's effective archetype. Segmented clips: the
        // archetype of the segment that covers the hook's midpoint
        // (clip-relative time = displayDuration / 2). Non-segmented clips
        // default to 'talking-head' (the catch-all speaker layout).
        const editStyleId = job.stylePresetId ?? DEFAULT_EDIT_STYLE_ID
        const hookArchetype = resolveClipHookArchetype(job)
        const tpl = resolveTemplate(hookArchetype, editStyleId)

        // Speaker-fullscreen archetypes let the user's global template
        // editor move the pill; non-speaker layouts ignore it and use the
        // per-archetype default.
        const yPositionPx = isSpeakerFullscreen(hookArchetype) && batchOptions.templateLayout?.titleText
          ? Math.round((batchOptions.templateLayout.titleText.y / 100) * frameHeight)
          : tpl.hookTitleY

        const assPath = generateHookTitleASSFile(job.hookTitleText, job.hookTitleConfig, frameWidth, frameHeight, yPositionPx)
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

/**
 * Pick the archetype that owns the hook title's on-screen position.
 *
 * Segmented clips carry per-segment archetype data — the hook lives in the
 * first ~hookDuration seconds of the clip (clip-relative time), so we find
 * the segment that covers the hook's midpoint. Non-segmented clips have no
 * per-segment archetype: they fall back to 'talking-head' (the catch-all
 * speaker layout).
 */
function resolveClipHookArchetype(job: RenderClipJob): Archetype {
  const segments = job.segmentedSegments
  if (!segments || segments.length === 0) return 'talking-head'

  const hookDuration = job.hookTitleConfig?.displayDuration ?? 2.5
  const midpoint = hookDuration / 2

  // segmentedSegments are stored in source-video absolute time. Convert to
  // clip-relative time by subtracting the clip start (the first segment's
  // startTime is the clip start for segmented clips).
  const clipStart = segments[0].startTime
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

  // Fall through: hook midpoint sits past the last segment. Use the first
  // segment's archetype — the hook necessarily started inside it.
  void clipStart
  return segments[0].archetype
}
