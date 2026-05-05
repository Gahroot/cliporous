// ---------------------------------------------------------------------------
// Segment-based render pipeline — renders each segment independently then
// concatenates with configurable transitions.
// ---------------------------------------------------------------------------
//
// Sits alongside the existing render pipeline. Invoked when a RenderClipJob
// contains a `segmentedSegments` array. Each segment gets its own layout,
// zoom, and caption treatment. Segments are concatenated via FFmpeg concat
// demuxer (hard cuts) or xfade (crossfade/flash/color-wash transitions).
// ---------------------------------------------------------------------------

import { join } from 'path'
import { unlinkSync, writeFileSync, renameSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { ffmpeg, getEncoder, getSoftwareEncoder, isGpuSessionError, isGpuEncoderDisabled, disableGpuEncoderForSession, getVideoMetadata } from '../ffmpeg'
import type { BrandKitRenderOptions, HookTitleConfig } from './types'
import type { CaptionStyleInput } from '../captions'
import type { EmphasizedWord } from '@shared/types'
import { toFFmpegPath, buildASSFilter, buildASSFilterForComplex, formatASSTimestamp } from './helpers'
import { generateCaptions } from '../captions'
import { analyzeEmphasisHeuristic } from '../word-emphasis'
import { resolveFontsDir } from '../font-registry'
import { buildCaptionBackground, buildLetterboxBars } from '../overlays/caption-background'
import { buildSnapZoom, buildWordPulseZoom, buildDriftZoom, buildZoomOutReveal } from '../zoom-filters'
import { applyFilterPass, applyFilterComplexPass } from './overlay-runner'
import { buildLogoOnlyFilterComplex } from './features/brand-kit.feature'
import { generateHookTitleASSFile } from './features/hook-title.feature'
import { resolveSfxPath } from '../sound-design'
import type { SoundPlacementData } from '../sound-design'
import { buildSegmentLayout, type SegmentLayoutParams } from '../layouts/segment-layouts'
import { buildVFXFilterChain, buildVFXOverlays, type VFXBuildResult } from './vfx-filters'
import { buildFaceTrackCropFilter, type FaceTrackEntry } from './face-track-filter'
import { buildSceneCropFilter } from './scene-crop-filter'
import { buildEditStyleColorGradeFilter } from './color-grade-filter'
import { buildArchetypeHero, writeHeroAssFile } from './archetype-hero'
import type { Archetype } from '../edit-styles/shared/archetypes'
import { getVariantById } from '../segment-styles'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedSegment {
  /** Segment time range in source video (absolute seconds) */
  startTime: number
  endTime: number
  /** Segment style variant resolved from segment-styles.ts */
  styleVariant: SegmentStyleVariant
  /** Zoom parameters resolved from style + edit style */
  zoom: {
    style: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out'
    intensity: number
  }
  /** Transition IN to this segment (hard-cut on first segment is ignored) */
  transitionIn: TransitionType
  /** Overlay text for text-based layouts */
  overlayText?: string
  /** Accent color for this segment */
  accentColor?: string
  /** Caption bg opacity for this segment */
  captionBgOpacity?: number
  /** Contextual image path (for image-based layouts) */
  imagePath?: string
  /** Per-segment face crop override */
  cropRect?: { x: number; y: number; width: number; height: number }
  /**
   * Archetype (PRESTYJ-style template). Drives hero/center-glow/push-center
   * ASS generation in archetype-hero.ts. Absent on legacy callers that
   * routed by variant id alone — hero builder treats that as "no hero".
   */
  archetype?: Archetype
  /**
   * Per-archetype caption vertical margin in pixels (from the bottom for
   * Alignment=2). Overrides the template-layout-derived marginV.
   */
  captionMarginV?: number
  /**
   * Set by the render pipeline when a requested archetype could not be
   * honored (e.g. split-image / fullscreen-image with no generated image)
   * and the segment was silently degraded to a different layout. Mirrors
   * VideoSegment.fallbackReason so upstream callers can surface this in
   * the UI via render events.
   */
  fallbackReason?: string
}

export interface SegmentRenderConfig {
  /** Source video path */
  sourceVideoPath: string
  /** Per-segment render instructions */
  segments: ResolvedSegment[]
  /** Edit style providing defaults for zoom/transition/caption bg */
  editStyle: EditStyle
  /** Target output dimensions */
  width: number
  height: number
  /** Video FPS */
  fps: number
  /** Source video metadata */
  sourceWidth: number
  sourceHeight: number
  /** Face detection crop rect (fallback when segment has none) */
  defaultCropRect?: { x: number; y: number; width: number; height: number }
  /**
   * Per-scene crop timeline (source-absolute seconds). When present and this
   * segment's source-time window intersects more than one scene, the crop
   * filter becomes an expression that switches rectangles at scene
   * boundaries.
   */
  defaultCropTimeline?: Array<{
    startTime: number
    endTime: number
    x: number
    y: number
    width: number
    height: number
    faceDetected: boolean
  }>
  /**
   * Face-tracking timeline for animated crop (clip-relative, seconds).
   * When present and has ≥ 2 entries, the segment render uses an animated
   * crop instead of the static defaultCropRect / segment cropRect.
   */
  faceTimeline?: FaceTrackEntry[]
  /** Word timestamps (absolute, for caption generation) */
  wordTimestamps?: { text: string; start: number; end: number }[]
  /** Word emphasis data */
  wordEmphasis?: EmphasizedWord[]
  /** Caption style */
  captionStyle?: CaptionStyleInput
  /** Whether captions are enabled */
  captionsEnabled?: boolean
  /** Brand kit settings */
  brandKit?: BrandKitRenderOptions
  /** Template layout positions */
  templateLayout?: { titleText: { x: number; y: number }; subtitles: { x: number; y: number }; rehookText: { x: number; y: number } }
  /**
   * User-chosen accent color (from AI Edit settings).
   * When set, overrides the edit style's default accentColor for all segments
   * that don't have a per-segment accentColor.
   */
  userAccentColor?: string
  /** AI-suggested SFX placements (clip-relative timestamps) */
  soundPlacements?: SoundPlacementData[]
  /** Hook title text to display at the start of the clip */
  hookTitleText?: string
  /** Hook title styling + timing config */
  hookTitleConfig?: HookTitleConfig
  /**
   * Called when a segment's requested archetype/layout cannot be honored
   * and is degraded to another layout at render time (e.g. image-based
   * archetype with no generated image → quote-lower fallback). Receives
   * the segment index, the original archetype, and a human-readable
   * reason string. Implementations typically forward this as an IPC
   * event via `Ch.Send.SEGMENT_FALLBACK`.
   */
  onFallback?: (info: { segmentIndex: number; archetype: string; reason: string }) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a lighter tint from a hex color.
 * Blends the input color toward white by the given amount (0–1).
 * Mirrors the same function in accent-color.feature.ts.
 */
function lightenColor(hex: string, amount = 0.4): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  const lr = Math.round(r + (255 - r) * amount)
  const lg = Math.round(g + (255 - g) * amount)
  const lb = Math.round(b + (255 - b) * amount)
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
}

/**
 * Build a crop+scale filter for a segment based on its crop rect, optional
 * scene-aware crop timeline, or default.
 *
 * Precedence:
 *   1. Per-segment `seg.cropRect` (explicit override) → static crop.
 *   2. `defaultCropTimeline` when it contains >1 scene intersecting the
 *      segment's source-time window → expression-based step crop.
 *   3. `defaultCropRect` → static crop.
 *   4. Centre-crop fallback.
 *
 * FFmpeg resets timestamps at `seekInput`, so times in expressions are
 * segment-local (0-based).
 */
function buildCropScaleFilter(
  seg: ResolvedSegment,
  defaultCropRect: { x: number; y: number; width: number; height: number } | undefined,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  defaultCropTimeline?: Array<{
    startTime: number
    endTime: number
    x: number
    y: number
    width: number
    height: number
    faceDetected: boolean
  }>,
  fps?: number
): string {
  // 1. Explicit per-segment override
  if (seg.cropRect) {
    const cw = Math.min(seg.cropRect.width, sourceWidth)
    const ch = Math.min(seg.cropRect.height, sourceHeight)
    const cx = Math.max(0, Math.min(seg.cropRect.x, sourceWidth - cw))
    const cy = Math.max(0, Math.min(seg.cropRect.y, sourceHeight - ch))
    return `crop=${cw}:${ch}:${cx}:${cy},scale=${targetWidth}:${targetHeight}`
  }

  // 2. Scene timeline spanning this segment
  if (defaultCropTimeline && defaultCropTimeline.length > 1) {
    const segDuration = seg.endTime - seg.startTime
    const sceneFilter = buildSceneCropFilter(
      defaultCropTimeline,
      defaultCropRect,
      seg.startTime,
      0,
      segDuration,
      sourceWidth,
      sourceHeight,
      fps ?? 30
    )
    if (sceneFilter) {
      return `${sceneFilter},scale=${targetWidth}:${targetHeight}`
    }
  }

  // 3. Static default crop
  if (defaultCropRect) {
    const cw = Math.min(defaultCropRect.width, sourceWidth)
    const ch = Math.min(defaultCropRect.height, sourceHeight)
    const cx = Math.max(0, Math.min(defaultCropRect.x, sourceWidth - cw))
    const cy = Math.max(0, Math.min(defaultCropRect.y, sourceHeight - ch))
    return `crop=${cw}:${ch}:${cx}:${cy},scale=${targetWidth}:${targetHeight}`
  }

  // 4. Centre-crop fallback to target aspect ratio
  const targetAspect = targetWidth / targetHeight
  const sourceAspect = sourceWidth / sourceHeight
  if (sourceAspect > targetAspect) {
    const cropWidth = Math.round(sourceHeight * targetAspect)
    const cropX = Math.round((sourceWidth - cropWidth) / 2)
    return `crop=${cropWidth}:${sourceHeight}:${cropX}:0,scale=${targetWidth}:${targetHeight}`
  } else {
    const cropHeight = Math.round(sourceWidth / targetAspect)
    const cropY = Math.round((sourceHeight - cropHeight) / 2)
    return `crop=${sourceWidth}:${cropHeight}:0:${cropY},scale=${targetWidth}:${targetHeight}`
  }
}

/**
 * Build a zoom filter for a segment based on its zoom style.
 * Returns an FFmpeg filter string or empty string for 'none'.
 */
function buildSegmentZoomFilter(
  seg: ResolvedSegment,
  segDuration: number,
  targetWidth: number,
  targetHeight: number,
  fps: number,
  wordTimestamps?: { text: string; start: number; end: number }[],
  wordEmphasis?: EmphasizedWord[]
): string {
  const { style, intensity } = seg.zoom
  if (style === 'none' || intensity <= 1.001) return ''

  switch (style) {
    case 'snap': {
      // Per-word snap zoom: jump IN on emphasis words, HOLD for the word
      // duration, then SNAP back to 1.0×.
      // Filter emphasis words that fall within this segment's time range and
      // convert to segment-local time (0-based).
      const segStart = seg.startTime
      const segEnd = seg.endTime
      const localEmphasis: { time: number; duration: number }[] = []
      if (wordEmphasis) {
        for (const em of wordEmphasis) {
          if (em.emphasis === 'normal') continue
          if (em.end > segStart && em.start < segEnd) {
            const clampedStart = Math.max(em.start, segStart)
            const clampedEnd = Math.min(em.end, segEnd)
            localEmphasis.push({
              time: clampedStart - segStart,
              duration: clampedEnd - clampedStart,
            })
          }
        }
      }

      if (localEmphasis.length > 0) {
        return buildSnapZoom({
          width: targetWidth,
          height: targetHeight,
          fps,
          duration: segDuration,
          zoomIntensity: intensity,
          startTime: 0,
          emphasisTimestamps: localEmphasis,
        })
      }

      // Fallback: no emphasis data — degrade to drift zoom instead of static
      // crop so the segment still has motion.
      console.warn(`[Segment Render] Snap zoom degraded to drift — no emphasis data for segment at ${seg.startTime}s`)
      return buildDriftZoom({
        width: targetWidth,
        height: targetHeight,
        fps,
        duration: segDuration,
        zoomIntensity: intensity,
        startTime: 0,
      })
    }
    case 'drift': {
      // Gentle Ken Burns drift: slow linear zoom-in over the segment duration.
      // Delegates to the canonical buildDriftZoom() builder so the output is
      // consistent with the standalone zoom-filter tests.
      return buildDriftZoom({
        width: targetWidth,
        height: targetHeight,
        fps,
        duration: segDuration,
        zoomIntensity: intensity,
        startTime: 0, // segment-local: FFmpeg resets t=0 at seekInput
      })
    }
    case 'zoom-out': {
      // Start zoomed in, slowly pull back to 1.0×.
      // Delegates to the canonical buildZoomOutReveal() builder.
      return buildZoomOutReveal({
        width: targetWidth,
        height: targetHeight,
        fps,
        duration: segDuration,
        zoomIntensity: intensity,
        startTime: 0,
      })
    }
    case 'word-pulse': {
      // Filter word timestamps to this segment's time range and convert to
      // segment-local time (relative to segment start).
      const segStart = seg.startTime
      const segEnd = seg.endTime
      const localWords: { time: number; duration: number }[] = []
      if (wordTimestamps) {
        for (const w of wordTimestamps) {
          if (w.end > segStart && w.start < segEnd) {
            const clampedStart = Math.max(w.start, segStart)
            const clampedEnd = Math.min(w.end, segEnd)
            localWords.push({
              time: clampedStart - segStart,
              duration: clampedEnd - clampedStart,
            })
          }
        }
      }
      // Delegate to the proper word-pulse zoom builder
      return buildWordPulseZoom({
        width: targetWidth,
        height: targetHeight,
        fps,
        duration: segDuration,
        zoomIntensity: intensity,
        startTime: 0,
        allWordTimestamps: localWords.length > 0 ? localWords : undefined,
        emphasisTimestamps: localWords.length === 0 ? [{ time: 0, duration: segDuration }] : undefined,
      })
    }
    default:
      return ''
  }
}

type SegmentLocalWord = {
  text: string
  start: number
  end: number
  emphasis: 'normal' | 'emphasis' | 'supersize' | 'box'
}

/**
 * Build the segment-local word list with emphasis resolved. Returned words are
 * in 0-based segment time, clamped at segment boundaries. Returns [] when
 * there are no word timestamps or none fall in range.
 */
function resolveSegmentLocalWords(
  segStartTime: number,
  segEndTime: number,
  wordTimestamps: { text: string; start: number; end: number }[] | undefined,
  wordEmphasis: EmphasizedWord[] | undefined
): SegmentLocalWord[] {
  if (!wordTimestamps) return []
  const segWords = wordTimestamps.filter(
    (w) => w.end > segStartTime && w.start < segEndTime
  )
  if (segWords.length === 0) return []

  const localBase = segWords.map((w) => ({
    text: w.text,
    start: Math.max(w.start, segStartTime) - segStartTime,
    end: Math.min(w.end, segEndTime) - segStartTime
  }))

  let levels: string[]
  if (wordEmphasis && wordEmphasis.length > 0) {
    levels = localBase.map((w) => {
      const match = wordEmphasis.find(
        (ov) => Math.abs(ov.start - (w.start + segStartTime)) < 0.05
            || Math.abs(ov.start - w.start) < 0.05
      )
      return match?.emphasis ?? 'normal'
    })
  } else {
    const heuristic = analyzeEmphasisHeuristic(localBase)
    levels = heuristic.map((h) => h.emphasis)
  }

  return localBase.map((w, idx) => ({
    ...w,
    emphasis: levels[idx] as SegmentLocalWord['emphasis']
  }))
}

/**
 * Generate per-segment captions as an ASS file path.
 * Returns null if captions are disabled or no words fall in the segment range.
 */
async function generateSegmentCaptions(
  seg: ResolvedSegment,
  localWords: SegmentLocalWord[],
  captionStyle: CaptionStyleInput | undefined,
  captionsEnabled: boolean | undefined,
  targetWidth: number,
  targetHeight: number,
  userAccentColor?: string,
  templateLayout?: { subtitles: { x: number; y: number } }
): Promise<string | null> {
  if (!captionsEnabled || !captionStyle || localWords.length === 0) return null

  try {
    // Per-archetype override takes precedence over the template layout Y.
    let marginVOverride: number | undefined
    if (typeof seg.captionMarginV === 'number') {
      marginVOverride = seg.captionMarginV
    } else if (templateLayout?.subtitles) {
      marginVOverride = Math.round((1 - templateLayout.subtitles.y / 100) * targetHeight)
    }

    // Apply per-segment accent color to caption highlight/emphasis/supersize colors.
    // Resolution order: per-segment → user-chosen → edit-style default.
    let effectiveCaptionStyle = captionStyle
    const segAccent = seg.accentColor ?? userAccentColor
    if (segAccent) {
      effectiveCaptionStyle = {
        ...captionStyle,
        highlightColor: segAccent,
        emphasisColor: segAccent,
        supersizeColor: lightenColor(segAccent, 0.4)
      }
    }

    return await generateCaptions(localWords, effectiveCaptionStyle, undefined, targetWidth, targetHeight, marginVOverride)
  } catch (err) {
    console.warn(`[SegmentRender] Failed to generate captions for segment:`, err)
    return null
  }
}

/**
 * Build the per-archetype hero ASS (or custom caption ASS) for a segment.
 * Returns temp file paths ready to be burned. Caller is responsible for
 * cleanup via the returned paths.
 */
function generateSegmentHeroAss(
  seg: ResolvedSegment,
  segDuration: number,
  localWords: SegmentLocalWord[],
  editStyle: EditStyle,
  targetWidth: number,
  targetHeight: number,
  userAccentColor?: string
): { heroAssPath?: string; captionAssPath?: string; skipDefaultCaptions: boolean } {
  if (!seg.archetype) {
    return { skipDefaultCaptions: false }
  }

  const accentColor = seg.accentColor ?? userAccentColor ?? editStyle.accentColor ?? '#7058E3'
  const primaryColor = editStyle.captionStyle?.primaryColor ?? '#FFFFFF'
  const bodyFont = editStyle.captionStyle?.fontName ?? 'Geist'
  // Quote uses the script font.
  const scriptFont = 'Style Script'

  const result = buildArchetypeHero({
    archetype: seg.archetype,
    durationSec: segDuration,
    frameWidth: targetWidth,
    frameHeight: targetHeight,
    words: localWords,
    heroText: seg.overlayText,
    accentColor,
    primaryColor,
    bodyFont,
    scriptFont
  })

  const out: { heroAssPath?: string; captionAssPath?: string; skipDefaultCaptions: boolean } = {
    skipDefaultCaptions: result.skipDefaultCaptions ?? false
  }
  if (result.heroAssContent) {
    out.heroAssPath = writeHeroAssFile(result.heroAssContent, seg.archetype)
  }
  if (result.captionAssContent) {
    out.captionAssPath = writeHeroAssFile(result.captionAssContent, `cap-${seg.archetype}`)
  }
  return out
}

/**
 * Build overlay text ASS for a segment.
 */
function generateSegmentOverlayASS(
  text: string,
  frameWidth: number,
  frameHeight: number
): string {
  const displayDuration = 2.0
  const fadeInMs = 300
  const fadeOutMs = 400
  const yPos = Math.round(frameHeight * 0.45)

  const styleLine = `Style: SegOverlay,Arial,56,&H0000FFFF,&H0000FFFF,&H00000000,&H4D000000,-1,0,0,0,100,100,0,0,1,3,3,5,40,40,${yPos},1`
  const dialogueText = `{\\fad(${fadeInMs},${fadeOutMs})}${text}`

  const startTime = formatASSTimestamp(0)
  const endTime = formatASSTimestamp(displayDuration)

  return [
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
    `Dialogue: 0,${startTime},${endTime},SegOverlay,,0,0,0,,${dialogueText}`,
    ''
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Layout category routing
// ---------------------------------------------------------------------------

/**
 * Returns true for categories that should use buildSegmentLayout() from
 * segment-layouts.ts instead of the default crop/scale/zoom pipeline.
 *
 * `main-video-text` is included so the `quote-lower` (and `quote-center`)
 * archetype layouts actually draw their large on-screen text boxes via the
 * layout builder instead of silently falling through to the plain
 * main-video pipeline.
 */
function isLayoutCategory(category: SegmentStyleCategory): boolean {
  return (
    category === 'main-video-text' ||
    category === 'main-video-images' ||
    category === 'fullscreen-image' ||
    category === 'fullscreen-text'
  )
}

/**
 * Encode a segment using a layout-based filter_complex from segment-layouts.ts.
 *
 * Handles image inputs, caption overlays, overlay text, and audio mapping.
 * The layout builder produces a filter_complex with output label [outv]; this
 * function appends optional caption + overlay-text filters after that.
 */
async function encodeLayoutSegment(
  config: SegmentRenderConfig,
  seg: ResolvedSegment,
  segIndex: number,
  segDuration: number,
  tempPath: string,
  onProgress: (percent: number) => void
): Promise<string[]> {
  const segmentTempFiles: string[] = []
  const fontsDir = resolveFontsDir()
  const { encoder: detectedEncoder, presetFlag: detectedPresetFlag } = getEncoder()
  // If a prior segment crashed the GPU encoder this session, go straight to software
  const useSwFallback = isGpuEncoderDisabled() && detectedEncoder !== 'libx264'
  const sw = useSwFallback ? getSoftwareEncoder() : null
  const encoder = sw ? sw.encoder : detectedEncoder
  const presetFlag = sw ? sw.presetFlag : detectedPresetFlag
  const { width: tw, height: th, sourceWidth, sourceHeight } = config
  const category = seg.styleVariant.category

  // ── Build layout parameters ────────────────────────────────────────────
  const layoutParams: SegmentLayoutParams = {
    width: tw,
    height: th,
    segmentDuration: segDuration,
    imagePath: seg.imagePath,
    overlayText: seg.overlayText,
    accentColor: seg.accentColor ?? config.userAccentColor,
    captionBgOpacity: seg.captionBgOpacity,
    sourceWidth,
    sourceHeight,
    cropRect: seg.cropRect ?? config.defaultCropRect,
    textAnimation: config.editStyle.textAnimation ?? 'none'
  }

  // Get the filter_complex from the layout builder
  const layoutResult = await buildSegmentLayout(seg.styleVariant, layoutParams)
  let filterComplex = layoutResult.filterComplex

  // For fullscreen-image, the layout uses [0:v] for the image, but we supply
  // the source video as input 0 (for audio) and the image as input 1.
  // Remap [0:v] → [1:v] so the filter reads from the image input.
  if (category === 'fullscreen-image') {
    filterComplex = filterComplex.replace(/\[0:v\]/g, '[1:v]')
  }

  // ── Append caption + overlay-text filters after [outv] ─────────────────
  let currentLabel = 'outv'
  const extraFilters: string[] = []

  // Edit style color grade — applied first, before VFX and captions
  if (config.editStyle?.colorGrade) {
    const gradeFilter = buildEditStyleColorGradeFilter(config.editStyle.colorGrade)
    if (gradeFilter) {
      extraFilters.push(`[${currentLabel}]${gradeFilter}[grade]`)
      currentLabel = 'grade'
    }
  }

  // VFX overlays — inserted before captions so VFX renders under text
  // Build both procedural and asset-based overlays
  let layoutVfxResult: VFXBuildResult | undefined
  if (config.editStyle?.vfxOverlays && config.editStyle.vfxOverlays.length > 0) {
    const effectiveAccent = seg.accentColor ?? config.userAccentColor ?? config.editStyle.accentColor ?? '#FF6B35'
    layoutVfxResult = buildVFXOverlays(config.editStyle.vfxOverlays, effectiveAccent, tw, th, category)
    // Procedural filters chain directly in the filter graph
    if (layoutVfxResult.proceduralFilters) {
      extraFilters.push(`[${currentLabel}]${layoutVfxResult.proceduralFilters}[vfx]`)
      currentLabel = 'vfx'
    }
  }

  // Resolve per-segment words + archetype hero ASS once; reuse for both the
  // default caption pass and the hero/custom caption pass.
  const localWords = resolveSegmentLocalWords(
    seg.startTime,
    seg.endTime,
    config.wordTimestamps,
    config.wordEmphasis
  )
  const heroAss = generateSegmentHeroAss(
    seg,
    segDuration,
    localWords,
    config.editStyle,
    tw,
    th,
    config.userAccentColor
  )

  // Archetype-supplied custom captions (fullscreen-image center-glow,
  // split-image push-center). Replaces the default caption pass when set.
  if (heroAss.captionAssPath) {
    segmentTempFiles.push(heroAss.captionAssPath)
    const customFilter = buildASSFilterForComplex(heroAss.captionAssPath, fontsDir)
    extraFilters.push(`[${currentLabel}]${customFilter}[cap]`)
    currentLabel = 'cap'
  } else if (!heroAss.skipDefaultCaptions) {
    const captionAssPath = await generateSegmentCaptions(
      seg,
      localWords,
      config.captionStyle,
      config.captionsEnabled,
      tw,
      th,
      config.userAccentColor,
      config.templateLayout
    )
    if (captionAssPath) {
      segmentTempFiles.push(captionAssPath)
      const captionFilter = buildASSFilterForComplex(captionAssPath, fontsDir)
      extraFilters.push(`[${currentLabel}]${captionFilter}[cap]`)
      currentLabel = 'cap'
    }
  }

  // Archetype hero overlay (fullscreen-headline drop-in,
  // fullscreen-quote Style Script slide-up).
  if (heroAss.heroAssPath) {
    segmentTempFiles.push(heroAss.heroAssPath)
    const heroFilter = buildASSFilterForComplex(heroAss.heroAssPath, fontsDir)
    extraFilters.push(`[${currentLabel}]${heroFilter}[hero]`)
    currentLabel = 'hero'
  }

  // Legacy overlay-text drawtext pass — skip for fullscreen-text (hero ASS
  // now draws the text) and for any archetype that produced a hero overlay.
  const hasHeroOverlay = !!heroAss.heroAssPath
  if (seg.overlayText && category !== 'fullscreen-text' && !hasHeroOverlay) {
    const overlayAss = generateSegmentOverlayASS(seg.overlayText, tw, th)
    const overlayAssPath = join(tmpdir(), `batchcontent-seg-overlay-${Date.now()}-${segIndex}.ass`)
    writeFileSync(overlayAssPath, overlayAss, 'utf-8')
    segmentTempFiles.push(overlayAssPath)
    const overlayFilter = buildASSFilterForComplex(overlayAssPath, fontsDir)
    extraFilters.push(`[${currentLabel}]${overlayFilter}[ovl]`)
    currentLabel = 'ovl'
  }

  // Asset-based VFX overlays (image-overlay, video-overlay types) are not
  // currently wired — VFXBuildResult.assetInputs carries path/blendMode/opacity
  // but the per-overlay filter composition + input-option plumbing hasn't been
  // implemented.  Procedural filters (drawbox, color-tint, etc.) still apply
  // via the earlier proceduralFilters branch.
  if (layoutVfxResult && layoutVfxResult.assetInputs.length > 0) {
    console.warn(
      `[SegmentRender] Skipping ${layoutVfxResult.assetInputs.length} asset VFX overlay(s) — feature not yet wired`
    )
  }

  // Combine layout filter_complex with any extra filters.
  // When extra filters are present (color grade, ASS captions, VFX, overlay
  // text), they may change the pixel format away from the yuv420p that the
  // layout builder's finalize() set.  Force yuv420p again at the very end so
  // the encoder always receives a compatible format.
  let fullFilterComplex: string
  if (extraFilters.length > 0) {
    fullFilterComplex = filterComplex + ';' + extraFilters.join(';')
    fullFilterComplex += `;[${currentLabel}]format=yuv420p[finalv]`
    currentLabel = 'finalv'
  } else {
    fullFilterComplex = filterComplex
  }

  // ── Run FFmpeg with filter_complex ─────────────────────────────────────
  await new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false

    function runEncode(enc: string, flags: string[], useHwAccel = true): void {
      const cmd = ffmpeg(toFFmpegPath(config.sourceVideoPath))
      let stderrOutput = ''

      if (useHwAccel) {
        cmd.inputOptions(['-hwaccel', 'auto'])
      }

      // Seek source video to segment start
      cmd.seekInput(seg.startTime)
      cmd.duration(segDuration)

      // Add image as input for image-based layouts (looped for duration)
      const needsImageInput =
        seg.imagePath &&
        (category === 'main-video-images' || category === 'fullscreen-image')

      if (needsImageInput) {
        cmd.input(toFFmpegPath(seg.imagePath))
        cmd.inputOptions(['-loop', '1'])
      }

      // Asset VFX overlay inputs are intentionally not added — see the
      // "feature not yet wired" branch above that gates the filter expressions.

      cmd
        .outputOptions([
          '-filter_complex', fullFilterComplex,
          '-map', `[${currentLabel}]`,
          '-map', '0:a',
          '-c:v', enc,
          ...flags,
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-y'
        ])
        .on('progress', (progress: { percent?: number }) => {
          onProgress(Math.min(99, progress.percent ?? 0))
        })
        .on('stderr', (line: string) => { stderrOutput += line + '\n' })
        .on('end', () => {
          onProgress(100)
          resolve()
        })
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            console.warn(`[SegmentRender] GPU error in layout segment encode, falling back to software encoder: ${err.message}`)
            const sw = getSoftwareEncoder()
            runEncode(sw.encoder, sw.presetFlag, false)
          } else {
            const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
            reject(new Error(`${err.message}\n[stderr tail] ${stderrTail}`))
          }
        })
        .save(toFFmpegPath(tempPath))
    }

    runEncode(encoder, presetFlag)
  })

  return segmentTempFiles
}

/**
 * Encode a single segment as a temp MP4 file.
 * Returns an array of temp file paths created during encoding (for cleanup).
 */
async function encodeSegment(
  config: SegmentRenderConfig,
  seg: ResolvedSegment,
  segIndex: number,
  segDuration: number,
  tempPath: string,
  onProgress: (percent: number) => void
): Promise<string[]> {
  const category = seg.styleVariant.category

  // ── Route layout-based segments to the layout encoder ───────────────────
  // Layout-based categories use buildSegmentLayout() for their filter_complex
  // instead of the default crop/scale/zoom pipeline.
  if (isLayoutCategory(category)) {
    // Image-based layouts require imagePath. When it's missing, degrade to
    // `main-video-text-lower` (quote-lower look) so the user still sees a
    // visual difference instead of an indistinguishable talking-head frame.
    if (
      (category === 'main-video-images' || category === 'fullscreen-image') &&
      (!seg.imagePath || !existsSync(seg.imagePath))
    ) {
      const originalId = seg.styleVariant.id
      const originalArchetype = seg.archetype
      const fallbackVariant = getVariantById('main-video-text-lower')
      const reason = `No fal.ai image; showing quote-lower instead`
      console.warn(
        `[SegmentRender] Segment ${segIndex} has layout '${originalId}' ` +
        `but imagePath is missing or does not exist — degrading to main-video-text-lower. ` +
        `[SEGMENT_FALLBACK] segmentIndex=${segIndex} archetype=${originalArchetype ?? 'unknown'} reason="${reason}"`
      )

      if (fallbackVariant) {
        // Derive overlayText when none is set: first ~8 words of the
        // segment's local transcript. Guarantees a non-empty text so the
        // drawtext pass still renders.
        let overlayText = seg.overlayText
        if (!overlayText || !overlayText.trim()) {
          const localWords = resolveSegmentLocalWords(
            seg.startTime,
            seg.endTime,
            config.wordTimestamps,
            config.wordEmphasis
          )
          if (localWords.length > 0) {
            overlayText = localWords
              .slice(0, 8)
              .map((w) => w.text)
              .join(' ')
              .trim()
          }
          if (!overlayText) overlayText = '—'
        }

        const patchedSeg: ResolvedSegment = {
          ...seg,
          styleVariant: fallbackVariant,
          overlayText,
          fallbackReason: reason
        }

        config.onFallback?.({
          segmentIndex: segIndex,
          archetype: originalArchetype ?? originalId,
          reason
        })

        return encodeLayoutSegment(config, patchedSeg, segIndex, segDuration, tempPath, onProgress)
      }

      // Fallback variant itself missing — fall through to main-video pipeline
      // rather than crash (preserves previous behaviour as a safety net).
      console.warn(
        `[SegmentRender] main-video-text-lower variant not found; ` +
        `falling through to main-video pipeline`
      )
    } else {
      return encodeLayoutSegment(config, seg, segIndex, segDuration, tempPath, onProgress)
    }
  }

  // ── Main-video / main-video-text pipeline (crop/scale/zoom + ASS) ──────
  const segmentTempFiles: string[] = []
  const fontsDir = resolveFontsDir()
  const { encoder: detectedEncoder2, presetFlag: detectedPresetFlag2 } = getEncoder()
  // If a prior segment crashed the GPU encoder this session, go straight to software
  const useSwFallback2 = isGpuEncoderDisabled() && detectedEncoder2 !== 'libx264'
  const sw2 = useSwFallback2 ? getSoftwareEncoder() : null
  const encoder = sw2 ? sw2.encoder : detectedEncoder2
  const presetFlag = sw2 ? sw2.presetFlag : detectedPresetFlag2
  const { width: tw, height: th, sourceWidth, sourceHeight } = config

  // Build filter chain: crop/scale → zoom → caption bg → letterbox → ASS
  const filterChain: string[] = []

  // 1. Crop + scale — prefer animated face-track crop when available
  //
  // The full face timeline covers the entire clip, but each segment only spans
  // a small portion.  We must (a) trim to entries near this segment and
  // (b) shift timestamps to segment-local time because -ss (seekInput) resets
  // FFmpeg's `t` to ≈0.  Without trimming, the nested if(between(...)) expression
  // can exceed Windows' 32 767-char command-line limit and FFmpeg receives a
  // truncated command → "Option not found".
  if (config.faceTimeline && config.faceTimeline.length >= 2 && !seg.cropRect) {
    const segStart = seg.startTime
    const segEnd = seg.endTime

    // Find the sub-range of timeline entries that bracket this segment.
    // Include one entry before/after for smooth interpolation at edges.
    let firstIdx = config.faceTimeline.findIndex(e => e.t >= segStart)
    let lastIdx = -1
    for (let fi = config.faceTimeline.length - 1; fi >= 0; fi--) {
      if (config.faceTimeline[fi].t <= segEnd) { lastIdx = fi; break }
    }
    if (firstIdx < 0) firstIdx = config.faceTimeline.length - 1
    if (lastIdx < 0) lastIdx = 0
    if (firstIdx > 0) firstIdx--
    if (lastIdx < config.faceTimeline.length - 1) lastIdx++

    // Shift timestamps to segment-local time (0-based)
    const localTimeline: FaceTrackEntry[] = config.faceTimeline
      .slice(firstIdx, lastIdx + 1)
      .map(e => ({ ...e, t: e.t - segStart }))

    const animated = localTimeline.length >= 2
      ? buildFaceTrackCropFilter(localTimeline, sourceWidth, sourceHeight, tw, th)
      : null
    if (animated !== null) {
      filterChain.push(animated)
    } else {
      filterChain.push(buildCropScaleFilter(seg, config.defaultCropRect, sourceWidth, sourceHeight, tw, th, config.defaultCropTimeline, config.fps))
    }
  } else {
    filterChain.push(buildCropScaleFilter(seg, config.defaultCropRect, sourceWidth, sourceHeight, tw, th, config.defaultCropTimeline, config.fps))
  }

  // 2. Zoom
  const zoomFilter = buildSegmentZoomFilter(seg, segDuration, tw, th, config.fps, config.wordTimestamps, config.wordEmphasis)
  if (zoomFilter) filterChain.push(zoomFilter)

  // 2a. Edit style color grade (after crop/scale/zoom, before VFX overlays)
  if (config.editStyle?.colorGrade) {
    const gradeFilter = buildEditStyleColorGradeFilter(config.editStyle.colorGrade)
    if (gradeFilter) filterChain.push(gradeFilter)
  }

  // 2b. VFX overlays (after crop/scale/zoom, before caption background)
  // Build both procedural filters and asset-based overlay inputs.
  let vfxResult: VFXBuildResult | undefined
  if (config.editStyle?.vfxOverlays && config.editStyle.vfxOverlays.length > 0) {
    const effectiveAccent = seg.accentColor ?? config.userAccentColor ?? config.editStyle.accentColor ?? '#FF6B35'
    vfxResult = buildVFXOverlays(config.editStyle.vfxOverlays, effectiveAccent, tw, th, category)
    // Procedural filters go directly into the -vf chain
    if (vfxResult.proceduralFilters) filterChain.push(vfxResult.proceduralFilters)
  }

  // Asset VFX overlays not yet wired — keep the procedural -vf path.
  if (vfxResult && vfxResult.assetInputs.length > 0) {
    console.warn(
      `[SegmentRender] Skipping ${vfxResult.assetInputs.length} asset VFX overlay(s) — feature not yet wired`
    )
  }
  const hasAssetOverlays = false

  // 3. Caption background
  const bgOpacity = seg.captionBgOpacity ?? config.editStyle.captionBgOpacity ?? 0
  if (bgOpacity > 0.01) {
    const bgFilter = buildCaptionBackground({ width: tw, height: th, opacity: bgOpacity })
    if (bgFilter) filterChain.push(bgFilter)
  }

  // 4. Letterbox bars
  if (config.editStyle.letterbox && config.editStyle.letterbox !== 'none') {
    const lbFilter = buildLetterboxBars({ width: tw, height: th, mode: config.editStyle.letterbox })
    if (lbFilter) filterChain.push(lbFilter)
  }

  // 5. Per-segment captions + archetype hero overlay
  const localWords = resolveSegmentLocalWords(
    seg.startTime,
    seg.endTime,
    config.wordTimestamps,
    config.wordEmphasis
  )
  const heroAss = generateSegmentHeroAss(
    seg,
    segDuration,
    localWords,
    config.editStyle,
    tw,
    th,
    config.userAccentColor
  )

  if (heroAss.captionAssPath) {
    segmentTempFiles.push(heroAss.captionAssPath)
    filterChain.push(buildASSFilter(heroAss.captionAssPath, fontsDir))
  } else if (!heroAss.skipDefaultCaptions) {
    const captionAssPath = await generateSegmentCaptions(
      seg,
      localWords,
      config.captionStyle,
      config.captionsEnabled,
      tw,
      th,
      config.userAccentColor,
      config.templateLayout
    )
    if (captionAssPath) {
      segmentTempFiles.push(captionAssPath)
      filterChain.push(buildASSFilter(captionAssPath, fontsDir))
    }
  }

  if (heroAss.heroAssPath) {
    segmentTempFiles.push(heroAss.heroAssPath)
    filterChain.push(buildASSFilter(heroAss.heroAssPath, fontsDir))
  }

  // 6. Legacy overlay-text drawtext pass — suppressed when a hero overlay
  // already rendered the archetype's hero text.
  const hasHeroOverlay = !!heroAss.heroAssPath
  if (seg.overlayText && !hasHeroOverlay) {
    const overlayAss = generateSegmentOverlayASS(seg.overlayText, tw, th)
    const overlayAssPath = join(tmpdir(), `batchcontent-seg-overlay-${Date.now()}-${segIndex}.ass`)
    writeFileSync(overlayAssPath, overlayAss, 'utf-8')
    segmentTempFiles.push(overlayAssPath)
    filterChain.push(buildASSFilter(overlayAssPath, fontsDir))
  }

  // ── Encode: choose simple -vf or filter_complex based on asset overlays ──

  await new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false

    function runEncode(enc: string, flags: string[], useHwAccel = true): void {
      const cmd = ffmpeg(toFFmpegPath(config.sourceVideoPath))
      let stderrOutput = ''

      if (useHwAccel) {
        cmd.inputOptions(['-hwaccel', 'auto'])
      }

      cmd.seekInput(seg.startTime)
      cmd.duration(segDuration)

      if (hasAssetOverlays) {
        // Unreachable — hasAssetOverlays is hard-coded false above. Retained
        // as a compile-time anchor for when asset-overlay composition lands.
        throw new Error('Asset VFX overlay encode path is not yet implemented')
      }
      // ── Simple -vf path ─────────────────────────────────────────────────
      const videoFilter = filterChain.join(',')
      cmd.videoFilters(videoFilter)
      cmd.outputOptions([
        '-y',
        '-c:v', enc,
        ...flags,
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart'
      ])

      cmd
        .on('progress', (progress) => {
          onProgress(Math.min(99, progress.percent ?? 0))
        })
        .on('stderr', (line: string) => { stderrOutput += line + '\n' })
        .on('end', () => {
          onProgress(100)
          resolve()
        })
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            console.warn(`[SegmentRender] GPU error in segment encode, falling back to software encoder: ${err.message}`)
            const sw = getSoftwareEncoder()
            runEncode(sw.encoder, sw.presetFlag, false)
          } else {
            const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
            reject(new Error(`${err.message}\n[stderr tail] ${stderrTail}`))
          }
        })
        .save(toFFmpegPath(tempPath))
    }

    runEncode(encoder, presetFlag)
  })

  return segmentTempFiles
}

// ---------------------------------------------------------------------------
// Concatenation
// ---------------------------------------------------------------------------

/**
 * Concatenate segment files using FFmpeg concat demuxer (stream copy, fast).
 * Used when all transitions are hard-cut (or none).
 */
async function concatWithDemuxer(
  segmentFiles: string[],
  outputPath: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const listFile = join(tmpdir(), `batchcontent-seg-list-${Date.now()}.txt`)
  const listContent = segmentFiles
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')
  writeFileSync(listFile, listContent, 'utf-8')

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy', '-movflags', '+faststart', '-y'])
        .on('progress', () => onProgress(95))
        .on('end', () => {
          try { unlinkSync(listFile) } catch { /* ignore */ }
          resolve()
        })
        .on('error', (err: Error) => {
          try { unlinkSync(listFile) } catch { /* ignore */ }
          reject(err)
        })
        .save(toFFmpegPath(outputPath))
    })
  } catch {
    try { unlinkSync(listFile) } catch { /* ignore */ }
    throw new Error('Concat demuxer failed for segmented clip')
  }
}

/**
 * Get the xfade transition name for a TransitionType.
 * Returns null for hard-cut (use concat demuxer instead).
 *
 * When flashColor is provided and not white (#FFFFFF), flash-cut uses
 * fadecolor instead of fadewhite so the flash color can be customised.
 */
function getXfadeType(transition: TransitionType, flashColor?: string): string | null {
  switch (transition) {
    case 'crossfade':
      return 'fade'
    case 'flash-cut': {
      if (flashColor && flashColor.toUpperCase() !== '#FFFFFF') {
        return 'fadecolor'
      }
      return 'fadewhite'
    }
    case 'color-wash':
      return 'fadecolor'
    case 'hard-cut':
    case 'none':
    default:
      return null
  }
}

/**
 * Concatenate segment files using xfade filter_complex for non-hard transitions.
 * Chains segments pairwise with transition filters.
 */
async function concatWithXfade(
  segmentFiles: string[],
  transitions: TransitionType[],
  outputPath: string,
  onProgress: (percent: number) => void,
  flashColor?: string,
  transitionDuration?: number
): Promise<void> {
  if (segmentFiles.length === 0) throw new Error('No segments to concatenate')
  if (segmentFiles.length === 1) {
    // Single segment — just copy/rename
    const { copyFileSync } = await import('fs')
    copyFileSync(segmentFiles[0], outputPath)
    return
  }

  // Get durations of each segment file
  const durations: number[] = []
  for (const f of segmentFiles) {
    const meta = await getVideoMetadata(f)
    durations.push(meta.duration)
  }

  // Build xfade filter chain
  // xfade chains: [0][1] → [v0], then [v0][2] → [v1], etc.
  const filterParts: string[] = []
  const xfadeDuration = transitionDuration ?? 0.3

  let inputLabel = '0:v'
  let outputLabel = 'v0'
  let accumulatedDuration = durations[0]

  for (let i = 1; i < segmentFiles.length; i++) {
    const transition = transitions[i] ?? 'hard-cut'
    const xfadeType = getXfadeType(transition, flashColor)

    if (xfadeType === null) {
      // Hard cut — still need to concatenate via xfade with a minimal duration
      // Use fade with 0.01s duration (essentially a hard cut in xfade chain)
      const offset = Math.max(0, accumulatedDuration - 0.01)
      filterParts.push(
        `[${inputLabel}][${i}:v]xfade=transition=fade:duration=0.01:offset=${offset.toFixed(3)}[${outputLabel}]`
      )
      accumulatedDuration += durations[i] - 0.01
    } else {
      const offset = Math.max(0, accumulatedDuration - xfadeDuration)
      let filterStr = `[${inputLabel}][${i}:v]xfade=transition=${xfadeType}:duration=${xfadeDuration.toFixed(3)}:offset=${offset.toFixed(3)}`

      if (transition === 'color-wash' || (transition === 'flash-cut' && xfadeType === 'fadecolor')) {
        // color-wash / custom-color flash-cut: use fadecolor with the edit style's flashColor
        const ffmpegColor = flashColor
          ? '0x' + flashColor.replace(/^#/, '').toUpperCase()
          : 'black'
        filterStr += `:color=${ffmpegColor}`
      }

      filterStr += `[${outputLabel}]`
      filterParts.push(filterStr)
      accumulatedDuration += durations[i] - xfadeDuration
    }

    inputLabel = outputLabel
    outputLabel = `v${i}`
  }

  // The last output label becomes [outv]
  // Note: `outputLabel` was incremented past the last filter's actual output
  // label at the end of the loop (line outputLabel = `v${i}`). The label
  // written into the last filter part is `v${segmentFiles.length - 2}`.
  const lastOutputLabel = `v${segmentFiles.length - 2}`
  const lastFilter = filterParts[filterParts.length - 1]
  filterParts[filterParts.length - 1] = lastFilter.replace(
    new RegExp(`\\[${lastOutputLabel}\\]$`),
    '[outv]'
  )

  const filterComplex = filterParts.join(';')

  // Build ffmpeg command with all segment inputs
  await new Promise<void>((resolve, reject) => {
    const { encoder: xfDetectedEnc, presetFlag: xfDetectedFlags } = getEncoder()
    const xfUseSw = isGpuEncoderDisabled() && xfDetectedEnc !== 'libx264'
    const xfSw = xfUseSw ? getSoftwareEncoder() : null
    const xfEncoder = xfSw ? xfSw.encoder : xfDetectedEnc
    const xfPresetFlag = xfSw ? xfSw.presetFlag : xfDetectedFlags
    let fallbackAttempted = false
    let stderrOutput = ''

    function runXfade(enc: string, flags: string[], useHwAccel = true): void {
      const cmd = ffmpeg()

      // Add each segment file as an input
      for (let fi = 0; fi < segmentFiles.length; fi++) {
        cmd.input(toFFmpegPath(segmentFiles[fi]))
        // Apply hwaccel to the first input (must come after input() call)
        if (fi === 0 && useHwAccel) {
          cmd.inputOptions(['-hwaccel', 'auto'])
        }
      }

      cmd
        .outputOptions([
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-map', '0:a',
          '-c:v', enc,
          ...flags,
          '-c:a', 'copy',
          '-movflags', '+faststart',
          '-y'
        ])
        .on('start', (cmdLine: string) => {
          console.log(`[SegmentRender] xfade command: ${cmdLine}`)
        })
        .on('stderr', (line: string) => { stderrOutput += line + '\n' })
        .on('progress', (progress) => {
          onProgress(Math.min(95, progress.percent ?? 0))
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          console.error(`[SegmentRender] xfade stderr:\n${stderrOutput}`)
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            const sw = getSoftwareEncoder()
            runXfade(sw.encoder, sw.presetFlag, false)
          } else {
            const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
            reject(new Error(`xfade concat failed: ${err.message}\n[stderr tail] ${stderrTail}`))
          }
        })
        .save(toFFmpegPath(outputPath))
    }

    runXfade(xfEncoder, xfPresetFlag, !xfUseSw)
  })
}

// ---------------------------------------------------------------------------
// Logo overlay helper
// ---------------------------------------------------------------------------

/**
 * Run a logo overlay as a separate FFmpeg pass with two inputs:
 * [0] = rendered video, [1] = logo image (looped).
 */
function runLogoOverlay(
  inputPath: string,
  logoPath: string,
  outputPath: string,
  bk: BrandKitRenderOptions,
  targetWidth: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const { encoder: logoDetEnc, presetFlag: logoDetFlags } = getEncoder()
    const logoUseSw = isGpuEncoderDisabled() && logoDetEnc !== 'libx264'
    const logoSw = logoUseSw ? getSoftwareEncoder() : null
    let fallbackAttempted = false
    let stderrOutput = ''

    const filterComplex = buildLogoOnlyFilterComplex('null', bk, targetWidth)

    function run(enc: string, flags: string[], useHwAccel = true): void {
      const cmd = ffmpeg(toFFmpegPath(inputPath))

      if (useHwAccel) {
        cmd.inputOptions(['-hwaccel', 'auto'])
      }

      // Add logo as second input (looped for full video duration)
      cmd.input(toFFmpegPath(logoPath)).inputOptions(['-loop', '1'])

      cmd
        .outputOptions([
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-map', '0:a',
          '-c:v', enc,
          ...flags,
          '-c:a', 'copy',
          '-movflags', '+faststart',
          '-y'
        ])
        .on('start', (cmdLine: string) => {
          console.log(`[SegmentRender] Logo overlay command: ${cmdLine}`)
        })
        .on('stderr', (line: string) => { stderrOutput += line + '\n' })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          console.error(`[SegmentRender] Logo overlay stderr:\n${stderrOutput}`)
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            const sw = getSoftwareEncoder()
            run(sw.encoder, sw.presetFlag, false)
          } else {
            reject(err)
          }
        })
        .save(toFFmpegPath(outputPath))
    }

    run(logoSw ? logoSw.encoder : logoDetEnc, logoSw ? logoSw.presetFlag : logoDetFlags, !logoUseSw)
  })
}

// ---------------------------------------------------------------------------
// Transition SFX helpers
// ---------------------------------------------------------------------------

const DEFAULT_XFADE_DURATION = 0.3

/**
 * Compute SFX placements for segment transitions.
 *
 * Mirrors the offset accumulation logic inside concatWithXfade so that
 * SFX hit times land on the same frame as the visual xfade transition.
 *
 * Volume levels (not scaled by sfxVolume — the segment render has no global
 * sound-design options, so fixed levels are used as per the spec):
 *   - crossfade  → whoosh-soft  at 0.40
 *   - flash-cut  → impact-high  at 0.75
 *   - color-wash → whoosh-hard  at 0.55
 *
 * Missing SFX files are silently skipped.
 */
function computeTransitionSfxPlacements(
  segments: ResolvedSegment[],
  transitions: TransitionType[],
  fps: number,
  xfadeDuration: number = DEFAULT_XFADE_DURATION
): SoundPlacementData[] {
  const placements: SoundPlacementData[] = []

  // Resolve SFX file paths once — skip silently when file is absent
  function tryResolve(name: string): string | null {
    const p = resolveSfxPath(name)
    return existsSync(p) ? p : null
  }
  const whooshSoft = tryResolve('whoosh-soft')
  const impactHigh = tryResolve('impact-high')
  const whooshHard = tryResolve('whoosh-hard')

  // Walk the same offset accumulation as concatWithXfade
  let accumulatedDuration = segments[0].endTime - segments[0].startTime

  for (let i = 1; i < segments.length; i++) {
    const transition = transitions[i] ?? 'hard-cut'
    const segDuration = segments[i].endTime - segments[i].startTime

    if (transition === 'crossfade') {
      const offset = Math.max(0, accumulatedDuration - xfadeDuration)
      const midpoint = offset + xfadeDuration / 2
      const sfxTime = Math.round(midpoint * fps) / fps

      if (whooshSoft) {
        placements.push({
          type: 'sfx',
          filePath: whooshSoft,
          startTime: sfxTime,
          duration: 0.4,
          volume: 0.4,
        })
      }
      accumulatedDuration += segDuration - xfadeDuration

    } else if (transition === 'flash-cut') {
      const offset = Math.max(0, accumulatedDuration - xfadeDuration)
      const sfxTime = Math.round(offset * fps) / fps

      if (impactHigh) {
        placements.push({
          type: 'sfx',
          filePath: impactHigh,
          startTime: sfxTime,
          duration: 0.35,
          volume: 0.75,
        })
      }
      accumulatedDuration += segDuration - xfadeDuration

    } else if (transition === 'color-wash') {
      const offset = Math.max(0, accumulatedDuration - xfadeDuration)
      const rawMid = offset + xfadeDuration / 2 - 0.1  // 0.1s before midpoint = "rise into"
      const sfxTime = Math.round(Math.max(0, rawMid) * fps) / fps

      if (whooshHard) {
        placements.push({
          type: 'sfx',
          filePath: whooshHard,
          startTime: sfxTime,
          duration: 0.5,
          volume: 0.55,
        })
      }
      accumulatedDuration += segDuration - xfadeDuration

    } else {
      // hard-cut / none — no SFX; minimal xfade duration consumed
      accumulatedDuration += segDuration - 0.01
    }
  }

  return placements
}

/**
 * Mix transition SFX into the audio track of a concatenated video.
 *
 * Uses adelay + amix (the same pattern as sound-design.feature.ts).
 * Video is stream-copied — no re-encode of picture data.
 * Missing SFX files in the placements array are treated as caller errors;
 * callers should filter them out via computeTransitionSfxPlacements.
 */
function mixTransitionSfx(
  inputPath: string,
  outputPath: string,
  placements: SoundPlacementData[]
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let stderrOutput = ''

    // Build filter_complex: delay + volume each SFX, then amix with original audio
    const filterParts: string[] = []
    const mixInputs: string[] = ['[0:a]']

    placements.forEach((p, i) => {
      const inputIdx = i + 1
      const label = `[sfx${i}]`
      const delayMs = Math.round(p.startTime * 1000)
      filterParts.push(
        `[${inputIdx}:a]adelay=delays=${delayMs}:all=1,volume=${p.volume.toFixed(3)}${label}`
      )
      mixInputs.push(label)
    })

    // duration=first → output length matches original audio (0:a)
    // normalize=0   → don't halve volume by input count
    filterParts.push(
      `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:normalize=0[outa]`
    )

    const filterComplex = filterParts.join(';')

    const cmd = ffmpeg(toFFmpegPath(inputPath))

    for (const p of placements) {
      cmd.input(toFFmpegPath(p.filePath))
    }

    cmd
      .outputOptions([
        '-filter_complex', filterComplex,
        '-map', '0:v',
        '-map', '[outa]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-y',
      ])
      .on('start', (cmdLine: string) => {
        console.log(`[SegmentRender] SFX mix command: ${cmdLine}`)
      })
      .on('stderr', (line: string) => { stderrOutput += line + '\n' })
      .on('end', () => resolve())
      .on('error', (err: Error) => {
        console.error(`[SegmentRender] SFX mix stderr:\n${stderrOutput}`)
        reject(new Error(`Transition SFX mix failed: ${err.message}`))
      })
      .save(toFFmpegPath(outputPath))
  })
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render a segmented clip: encode each segment independently, then concatenate
 * with configurable transitions, and apply post-concat overlays.
 *
 * @param config   Per-segment render configuration.
 * @param outputPath  Destination path for the final clip.
 * @param onProgress  Progress callback (0–100).
 * @returns           Path to the rendered file (always outputPath on success).
 */
export async function renderSegmentedClip(
  config: SegmentRenderConfig,
  outputPath: string,
  onProgress: (percent: number) => void
): Promise<string> {
  const tempDir = tmpdir()
  const tempFiles: string[] = []
  const { width: tw, height: th, editStyle } = config

  // Track transitions (indexed by segment, transitions[0] is for first segment = ignored)
  const transitions: TransitionType[] = config.segments.map((s) => s.transitionIn)

  // Check if we need xfade (any non-hard-cut transition after first segment)
  const needsXfade = transitions.slice(1).some((t) => t !== 'hard-cut' && t !== 'none')

  // Pre-compute SFX placements for non-hard-cut transitions (empty when no xfade)
  const transitionSfxPlacements: SoundPlacementData[] = needsXfade
    ? computeTransitionSfxPlacements(config.segments, transitions, config.fps, config.editStyle.transitionDuration)
    : []

  // Merge transition SFX with AI-suggested SFX for a single mix pass
  const allSfxPlacements: SoundPlacementData[] = [
    ...transitionSfxPlacements,
    ...(config.soundPlacements ?? [])
  ]

  const hasSfxTransitions = allSfxPlacements.length > 0

  // Progress allocation: 80% segments, 5% concat, 5% SFX mix (if any), 10% post-concat
  const hasPostConcat = !!(config.brandKit?.logoPath || hasSfxTransitions)
  const segmentWeight = hasPostConcat ? 75 : 85
  const concatBase = segmentWeight
  const postConcatBase = concatBase + 5

  // Track segment output files
  const segmentOutputFiles: string[] = []

  try {
    // ── Phase 1: Encode each segment ──────────────────────────────────────────
    for (let i = 0; i < config.segments.length; i++) {
      const seg = config.segments[i]
      const segDuration = seg.endTime - seg.startTime
      const tempPath = join(tempDir, `batchcontent-seg-${Date.now()}-${i}.mp4`)
      tempFiles.push(tempPath)
      segmentOutputFiles.push(tempPath)

      const segProgress = (percent: number): void => {
        const weight = segmentWeight / config.segments.length
        const base = weight * i
        onProgress(Math.round(base + (percent * weight / 100)))
      }

      const segTempFiles = await encodeSegment(config, seg, i, segDuration, tempPath, segProgress)
      tempFiles.push(...segTempFiles)
    }

    onProgress(concatBase)

    // ── Phase 2: Concatenate ──────────────────────────────────────────────────
    let concatOutputPath: string
    if (hasPostConcat) {
      concatOutputPath = join(tempDir, `batchcontent-seg-concat-${Date.now()}.mp4`)
      tempFiles.push(concatOutputPath)
    } else {
      concatOutputPath = outputPath
    }

    if (needsXfade) {
      console.log(`[SegmentRender] Using xfade concat for ${config.segments.length} segments`)
      await concatWithXfade(
        segmentOutputFiles,
        transitions,
        concatOutputPath,
        (percent) => onProgress(concatBase + (percent - concatBase) * 0.05),
        config.editStyle.flashColor,
        config.editStyle.transitionDuration
      )
    } else {
      console.log(`[SegmentRender] Using concat demuxer for ${config.segments.length} segments`)
      await concatWithDemuxer(
        segmentOutputFiles,
        concatOutputPath,
        (percent) => onProgress(concatBase + 3)
      )
    }

    onProgress(postConcatBase)

    // ── Phase 3: Post-concat overlays ─────────────────────────────────────────

    let currentPath = concatOutputPath

    // SFX mix — transition SFX + AI-suggested SFX mixed into the concatenated audio
    if (hasSfxTransitions) {
      console.log(
        `[SegmentRender] Mixing ${allSfxPlacements.length} SFX ` +
        `(${transitionSfxPlacements.length} transition, ${(config.soundPlacements ?? []).length} AI)`
      )
      const sfxMixPath = join(tempDir, `batchcontent-seg-sfxmix-${Date.now()}.mp4`)
      tempFiles.push(sfxMixPath)
      try {
        await mixTransitionSfx(currentPath, sfxMixPath, allSfxPlacements)
        currentPath = sfxMixPath
      } catch (err) {
        // SFX mix failure is non-fatal — skip and continue with unmixed audio
        console.warn(`[SegmentRender] SFX mix failed, skipping:`, err)
      }
      onProgress(postConcatBase + 5)
    }

    // Brand logo overlay
    if (config.brandKit?.logoPath && existsSync(config.brandKit.logoPath)) {
      console.log(`[SegmentRender] Applying brand logo post-concat pass`)
      const logoTempPath = join(tempDir, `batchcontent-seg-logo-${Date.now()}.mp4`)
      if (currentPath !== concatOutputPath) tempFiles.push(currentPath)
      tempFiles.push(logoTempPath)

      await runLogoOverlay(currentPath, config.brandKit.logoPath, logoTempPath, config.brandKit, tw)
      currentPath = logoTempPath
      onProgress(95)
    }

    // Hook title overlay — ASS subtitle burned into first N seconds of the final clip
    if (config.hookTitleText && config.hookTitleConfig?.enabled) {
      console.log(`[SegmentRender] Applying hook title overlay`)
      const yPositionPx = config.templateLayout?.titleText
        ? Math.round((config.templateLayout.titleText.y / 100) * th)
        : undefined
      const assPath = generateHookTitleASSFile(config.hookTitleText, config.hookTitleConfig, tw, th, yPositionPx)
      const hookTempPath = join(tempDir, `batchcontent-seg-hooktitle-${Date.now()}.mp4`)
      if (currentPath !== concatOutputPath) tempFiles.push(currentPath)
      tempFiles.push(assPath)
      tempFiles.push(hookTempPath)
      try {
        await applyFilterPass(currentPath, hookTempPath, buildASSFilter(assPath))
        currentPath = hookTempPath
      } catch (err) {
        console.warn(`[SegmentRender] Hook title overlay failed, skipping:`, err)
      }
      onProgress(97)
    }

    // Move final result to output path
    if (currentPath !== outputPath) {
      if (existsSync(outputPath)) {
        try { unlinkSync(outputPath) } catch { /* ignore */ }
      }
      renameSync(currentPath, outputPath)
    }

    onProgress(100)
    return outputPath
  } finally {
    // ── Cleanup all temp files ──────────────────────────────────────────────
    for (const tf of tempFiles) {
      try { unlinkSync(tf) } catch { /* ignore */ }
    }
  }
}
