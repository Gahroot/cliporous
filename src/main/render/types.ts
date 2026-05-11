// ---------------------------------------------------------------------------
// Shared render types — extracted from render-pipeline.ts
// ---------------------------------------------------------------------------

import type { SoundDesignOptions, EditEvent } from '../sound-design'
import type { ZoomSettings, EmphasisKeyframe } from '../auto-zoom'
import type { OutputAspectRatio } from '../aspect-ratios'
import type { HookTitleConfig } from '../hook-title'
import type { RehookConfig, OverlayVisualSettings } from '../overlays/rehook'
import type { ClipDescription } from '../ai/description-generator'
import type { BRollPlacement, BRollDisplayMode, BRollTransition } from '../broll-placement'
import type { FillerDetectionSettings } from '../filler-detection'
import type { CaptionStyleInput } from '../captions'
// SegmentRole — inlined from the legacy clip-stitcher module (feature dropped
// in this build but the type is still referenced by the stitched-render path).
export type SegmentRole =
  | 'hook'
  | 'rehook'
  | 'context'
  | 'why'
  | 'what'
  | 'how'
  | 'mini-payoff'
  | 'main-payoff'
  | 'bonus-payoff'
  | 'bridge'
import type { EmphasizedWord, ShotStyleConfig, ColorGradeConfig, ShotTransitionConfig } from '@shared/types'

// Re-export pass-through types so consumers can import from one place
export type {
  SoundDesignOptions,
  EditEvent,
  ZoomSettings,
  EmphasisKeyframe,
  HookTitleConfig,
  RehookConfig,
  OverlayVisualSettings,
  ClipDescription,
  BRollPlacement,
  BRollDisplayMode,
  BRollTransition,
  FillerDetectionSettings,
  CaptionStyleInput,
  OutputAspectRatio,
  EmphasizedWord,
  ShotStyleConfig,
  ColorGradeConfig,
  ShotTransitionConfig
}

export interface RenderClipJob {
  clipId: string
  sourceVideoPath: string
  startTime: number
  endTime: number
  cropRegion?: {
    x: number
    y: number
    width: number
    height: number
  }
  /**
   * Per-scene crop timeline in source-video absolute seconds. When >1 entry
   * is present, the render pipeline emits an expression-based crop filter
   * that switches rectangles at scene boundaries.
   */
  cropTimeline?: Array<{
    startTime: number
    endTime: number
    x: number
    y: number
    width: number
    height: number
    faceDetected: boolean
  }>
  /**
   * Frame-accurate face-tracking timeline in clip-relative seconds. When >=2
   * entries are present the render pipeline emits an animated crop filter
   * that follows the face across the clip duration.
   */
  faceTimeline?: Array<{
    /** Time in clip-relative seconds. */
    t: number
    /** Face bounding box in source pixels. */
    x: number
    y: number
    w: number
    h: number
  }>
  /** Path to a pre-generated .ass subtitle file to burn in */
  assFilePath?: string
  /** Optional override for the output filename (without extension) */
  outputFileName?: string
  /** Word timestamps for sound design (relative to source video, not clip) */
  wordTimestamps?: { text: string; start: number; end: number }[]
  /**
   * Hook title text to overlay in the first few seconds. Populated by the IPC
   * handler from ClipCandidate.hookText when hook title overlay is enabled.
   */
  hookTitleText?: string
  /**
   * Hook title display config injected from global RenderBatchOptions.hookTitleOverlay.
   * Set by startBatchRender when hookTitleOverlay.enabled is true.
   */
  hookTitleConfig?: HookTitleConfig
  /**
   * Pre-generated re-hook / pattern interrupt text for the mid-clip overlay.
   * If omitted, startBatchRender picks a deterministic default phrase.
   */
  rehookText?: string
  /**
   * Re-hook overlay display config injected from global RenderBatchOptions.rehookOverlay.
   * Set by startBatchRender when rehookOverlay.enabled is true.
   */
  rehookConfig?: RehookConfig
  /**
   * Appear time for the re-hook overlay in seconds relative to clip start (0-based).
   * Computed by startBatchRender via identifyRehookPoint.
   */
  rehookAppearTime?: number
  /**
   * Pre-generated description for this clip. When set, a .txt file is written
   * alongside the rendered .mp4 with platform-ready descriptions and hashtags.
   */
  description?: ClipDescription
  /**
   * B-Roll placement data for inserting stock footage overlays.
   * Pre-computed by the IPC handler using broll-placement.ts.
   * Applied as a post-processing pass after the main clip is rendered.
   */
  brollPlacements?: BRollPlacement[]
  /**
   * Emphasis keyframes computed during the captions prepare phase (or by the
   * auto-zoom feature as a fallback when captions are disabled). Times are
   * clip-relative (0-based, in seconds). Consumed by reactive zoom mode to
   * drive the keyframe-driven push-in zoom filter.
   */
  emphasisKeyframes?: EmphasisKeyframe[]
  /**
   * Loop optimization strategy applied to this clip. When set to 'crossfade'
   * and crossfadeDuration is provided, the render pipeline applies an audio
   * crossfade at the loop boundary to create a seamless loop.
   */
  loopStrategy?: string
  /**
   * Duration of the audio crossfade in seconds for loop optimization.
   * Only used when loopStrategy === 'crossfade'.
   */
  crossfadeDuration?: number
  /**
   * Per-clip overrides for global render settings. Each key controls whether
   * a specific global feature is enabled or disabled for this clip only.
   * If a key is absent, the global setting applies.
   *
   * `layout` controls whether to apply blur-background treatment instead of
   * the standard face-centred crop. When 'blur-background', the standard
   * cropRegion is ignored and the clip is rendered as a letterboxed 9:16 with
   * a blurred copy of the source filling the background.
   */
  clipOverrides?: {
    enableCaptions?: boolean
    enableHookTitle?: boolean
    enableAutoZoom?: boolean
    enableSoundDesign?: boolean
    enableBrandKit?: boolean
    layout?: 'default' | 'blur-background'
    /** Per-clip accent color — overrides highlight colors across all visual elements */
    accentColor?: string
  }
  /**
   * Metadata used when generating the export manifest (manifest.json / manifest.csv).
   * Populated by the IPC handler from ClipCandidate data before calling startBatchRender.
   */
  manifestMeta?: {
    score: number
    reasoning: string
    transcriptText: string
    loopScore?: number
  }
  /**
   * When present, this job represents a stitched (multi-segment) clip.
   * The pipeline assembles the segments into a single MP4 (per-segment
   * crop/layout + concat) then runs the regular feature pipeline on the
   * assembled output. Stitched clips go through the exact same edit
   * pipeline as regular clips — captions, hook title, rehook, color grade,
   * sound design, etc. Source-time wordTimestamps/wordEmphasis are remapped
   * to the concatenated timeline during assembly.
   */
  stitchedSegments?: RenderStitchedClipSegment[]
  /**
   * AI Edit Plan word emphasis override.
   * When present, the captions feature uses this instead of running
   * the heuristic emphasis analysis, providing AI-quality word tagging.
   * Times are clip-relative (0-based, in seconds).
   */
  wordEmphasisOverride?: EmphasizedWord[]
  /**
   * AI Edit Plan SFX suggestions.
   * When present and sound design is enabled, these are injected as
   * additional edit events into the sound design placement engine.
   * Times are clip-relative (0-based, in seconds).
   */
  aiSfxSuggestions?: Array<{ timestamp: number; type: string }>
  /**
   * AI Edit Plan B-Roll suggestions.
   * When present and B-Roll is enabled, the IPC handler uses these to
   * seed the Pexels keyword search and placement engine instead of
   * running keyword extraction from scratch. Each suggestion specifies
   * a timestamp, duration, keyword, display mode, and transition style.
   * Times are clip-relative (0-based, in seconds).
   */
  brollSuggestions?: Array<{
    timestamp: number
    duration: number
    keyword: string
    displayMode: BRollDisplayMode
    transition: BRollTransition
    /** Suggested source for this B-Roll moment (from AI edit plan) */
    suggestedSource?: 'stock' | 'ai-generated'
  }>
  /**
   * Pre-computed emphasis data for this clip.
   *
   * When present, the captions feature uses this as the canonical word
   * emphasis source instead of running the heuristic analysis or matching
   * wordEmphasisOverride by timestamp. This carries the full emphasis
   * resolution (normal/emphasis/supersize for every word) and is used by
   * captions, reactive zoom, and sound design features.
   *
   * If absent, emphasis is derived from wordEmphasisOverride (AI edit plan)
   * or the heuristic fallback — no behavioural change for existing clips.
   */
  wordEmphasis?: EmphasizedWord[]
  /**
   * Pre-computed emphasis keyframes for reactive zoom.
   *
   * Normally computed at render time by the captions feature (or by the
   * auto-zoom feature as a fallback). When provided on the job, the
   * auto-zoom feature skips its own computation and uses these directly.
   *
   * Times are clip-relative (0-based, in seconds).
   * If absent, auto-zoom computes keyframes normally — no behavioural change.
   */
  emphasisKeyframesInput?: EmphasisKeyframe[]
  /**
   * Pre-computed edit events for sound design synchronisation.
   *
   * When present and sound design is enabled, the IPC handler merges these
   * with its own derived edit events (from B-Roll placements and jump-cut
   * points). This allows external callers to inject content-aware edit
   * events that trigger synchronised SFX placement.
   *
   * Times should be clip-relative (0-based, in seconds).
   * If absent, sound design uses only its internally derived edit events.
   */
  editEvents?: EditEvent[]
  /**
   * ID of the active edit style preset when the job was created.
   *
   * Used by the AI edit plan system to tag generated plans and by the
   * render manifest to record which creative style was applied. Not
   * consumed directly by any render feature — purely informational.
   *
   * If absent, no style preset was active (user used manual settings).
   */
  stylePresetId?: string
  /**
   * Resolved per-shot style configurations for piecewise rendering.
   *
   * When present, the render pipeline applies different caption animations,
   * zoom behaviors, and other style parameters to different time ranges
   * within this single clip. Each config maps to a `ShotSegment` by index
   * and carries the concrete rendering parameters for that time window.
   *
   * Shot indices not present in this array fall back to the global
   * `RenderBatchOptions` style. When the entire array is absent or empty,
   * the clip renders with uniform global style (no per-shot variation).
   *
   * Built by `resolveShotStyles()` at IPC time from `ShotStyleAssignment[]`
   * on the clip + preset definitions from the store.
   */
  shotStyleConfigs?: ShotStyleConfig[]
  /**
   * Raw per-shot style assignments from the renderer (preset IDs).
   * Resolved to `shotStyleConfigs` by the IPC handler using `resolveShotStyles()`.
   * Not consumed directly by render features — they read `shotStyleConfigs`.
   */
  shotStyles?: Array<{ shotIndex: number; presetId: string }>
  /**
   * Shot segmentation for this clip. Used by the IPC handler to resolve
   * per-shot style assignments into concrete time-ranged configs.
   * When absent, per-shot style assignments have no effect.
   */
  shots?: Array<{ startTime: number; endTime: number }>
  /**
   * Pre-computed filler segments (user-curated, with restored ones already excluded).
   * When present, the filler-removal feature uses these instead of running detection.
   */
  precomputedFillerSegments?: Array<{
    start: number
    end: number
    type: 'filler' | 'silence' | 'repeat'
    label: string
  }>
  /**
   * When present, this job represents a segmented clip with per-segment visual
   * treatment. The render pipeline routes these to renderSegmentedClip() instead
   * of the normal single-segment or stitched render paths.
   */
  segmentedSegments?: SegmentedSegment[]
}

/**
 * A single segment within a segmented clip render job.
 * Each segment has its own layout, zoom, caption, and transition settings.
 */
export interface SegmentedSegment {
  /** Stable segment id (matches VideoSegment.id on the renderer). Used as the
   *  cache key for inline image generation in the segmented render path. */
  id?: string
  /** Spoken caption text for this segment. Used as the seed for Gemini search
   *  queries when generating images for image-archetype segments. */
  captionText?: string
  /** Segment time range in source video (absolute seconds) */
  startTime: number
  endTime: number
  /** Archetype key — resolved against the active edit style's template set at render time. */
  archetype: import('@shared/types').Archetype
  /** Zoom style for this segment */
  zoomStyle: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out'
  /** Zoom intensity multiplier (1.0 = no zoom) */
  zoomIntensity: number
  /** Transition INTO this segment (hard-cut on first segment is ignored) */
  transitionIn: TransitionType
  /** Path to a contextual image (for image-based layouts) */
  imagePath?: string
  /** Path to a contextual b-roll video (for split-image / fullscreen-image layouts). */
  videoPath?: string
  /** Per-segment face crop override */
  cropRect?: { x: number; y: number; width: number; height: number }
}

export interface RenderStitchedClipSegment {
  startTime: number
  endTime: number
  role?: SegmentRole
  /** Optional contextual image path for image-based layouts. */
  imagePath?: string
  /** Per-segment face crop override. */
  cropRect?: { x: number; y: number; width: number; height: number }
}

export interface RenderStitchedClipJob {
  clipId: string
  sourceVideoPath: string
  segments: RenderStitchedClipSegment[]
  cropRegion?: { x: number; y: number; width: number; height: number }
  cropTimeline?: Array<{
    startTime: number
    endTime: number
    x: number
    y: number
    width: number
    height: number
    faceDetected: boolean
  }>
  outputFileName?: string
  hookTitleText?: string
  /** Hook title overlay config from batch options. */
  hookTitleConfig?: HookTitleConfig
  /** Re-hook overlay config from batch options. */
  rehookConfig?: RehookConfig
  /** Re-hook text content (AI-generated or default phrase). */
  rehookText?: string
  /** Appear time for the re-hook overlay in seconds (absolute, relative to stitched clip start). */
  rehookAppearTime?: number
  /** Caption style for generating per-segment captions. */
  captionStyle?: CaptionStyleInput
  /** Whether captions are enabled. */
  captionsEnabled?: boolean
  /** Word timestamps from the source video transcription (absolute times). */
  wordTimestamps?: { text: string; start: number; end: number }[]
  /** Pre-computed word emphasis data (from AI edit plan or heuristic). */
  wordEmphasis?: EmphasizedWord[]
  /** AI Edit Plan word emphasis override. */
  wordEmphasisOverride?: EmphasizedWord[]
  /** Template layout positions for on-screen text elements (percentage-based). */
  templateLayout?: { titleText: { x: number; y: number }; subtitles: { x: number; y: number }; rehookText: { x: number; y: number } }
  /**
   * Active edit style id — used by the stitched render path to look up
   * text animation / color grade defaults when building per-segment
   * filter_complex via buildSegmentLayout().
   */
  stylePresetId?: string
}

export interface RenderBatchOptions {
  jobs: RenderClipJob[]
  outputDirectory: string
  /** Global sound design settings — used by IPC handler to compute placements */
  soundDesign?: SoundDesignOptions
  /** Ken Burns auto-zoom settings applied to every rendered clip */
  autoZoom?: ZoomSettings
  /** Hook title overlay settings — draws AI-generated hook text in first few seconds */
  hookTitleOverlay?: HookTitleConfig
  /** Re-hook / pattern interrupt overlay — draws mid-clip attention-reset text */
  rehookOverlay?: RehookConfig
  /** Filler & silence removal settings — detects and removes fillers/silences/repeats */
  fillerRemoval?: FillerDetectionSettings & { enabled: boolean }
  /** Caption style for re-generating captions after filler removal */
  captionStyle?: CaptionStyleInput
  /** Whether captions are enabled (needed to know whether to re-sync captions) */
  captionsEnabled?: boolean
  /**
   * B-Roll overlay settings. When enabled, the IPC handler generates B-Roll
   * placements for each clip (using AI edit plan suggestions or keyword
   * extraction), downloads Pexels footage, and stores placements on each job
   * for the broll feature's postProcess phase.
   */
  broll?: {
    enabled: boolean
    pexelsApiKey: string
    intervalSeconds: number
    clipDuration: number
    displayMode: BRollDisplayMode
    transition: BRollTransition
    pipSize: number
    pipPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    /** B-Roll source preference: 'stock' (Pexels), 'ai-generated' (Gemini), or 'auto' (per-moment). Default: 'auto' */
    sourceMode?: 'stock' | 'ai-generated' | 'auto'
  }
  /** Gemini API key — used for AI-generated B-Roll images and other AI features */
  geminiApiKey?: string
  /** Pexels API key — used by the segmented render path to fetch stock images
   *  for image-archetype segments (split-image / fullscreen-image). Distinct
   *  from `broll.pexelsApiKey` so segment images work even when B-roll is off. */
  pexelsApiKey?: string
  /** Style category hint for AI image generation (e.g. 'custom', 'cinematic', 'anime') */
  styleCategory?: string
  /**
   * Source video metadata for the export manifest. When provided, the render
   * pipeline writes manifest.json + manifest.csv to the output directory at
   * the end of each completed batch.
   */
  sourceMeta?: {
    name: string
    path: string
    duration: number
  }
  /**
   * When true, every FFmpeg command string is captured and sent back in
   * render:clipError events (always) and also logged to the error log via
   * the renderer (developer mode). Defaults to false.
   */
  developerMode?: boolean
  /**
   * Number of clips to render concurrently (1–4). For GPU encoders (NVENC/QSV)
   * the pipeline enforces a cap of 2 to avoid exhausting hardware session limits.
   * For software encoding (libx264) up to 4 concurrent renders are allowed, with
   * per-process thread count reduced proportionally to avoid CPU oversubscription.
   * Defaults to 1 (sequential).
   */
  renderConcurrency?: number
  /**
   * Render quality and encoding-format settings. Output resolution is locked
   * to 1080×1920 (9:16) at 30fps; only CRF/preset/container are configurable.
   * When omitted, defaults to normal quality (CRF 23, veryfast preset, MP4).
   */
  renderQuality?: {
    preset: 'draft' | 'normal' | 'high' | 'custom'
    customCrf: number
    /** Locked to 1080×1920 — value is accepted for backward compat but ignored. */
    outputResolution: '1080x1920'
    outputFormat: 'mp4' | 'webm'
    encodingPreset: 'ultrafast' | 'veryfast' | 'medium' | 'slow'
  }
  /**
   * Output aspect ratio is locked to 9:16 vertical (1080×1920 @ 30fps).
   * Field retained for backward compatibility; value is ignored.
   */
  outputAspectRatio?: OutputAspectRatio
  /**
   * Template layout positions for on-screen text elements.
   * Controls where hook title, re-hook text, and subtitles are placed
   * on the canvas. Values are percentages (0–100) from the top-left corner.
   */
  templateLayout?: {
    titleText: { x: number; y: number }
    subtitles: { x: number; y: number }
    rehookText: { x: number; y: number }
  }
  /**
   * Filename template for rendered clips. Supports these variables:
   *   {source}   — source video name without extension
   *   {index}    — clip number, zero-padded (01, 02, …)
   *   {score}    — AI viral score (0–100)
   *   {hook}     — hook text slugified (lowercase, spaces→hyphens, max 30 chars)
   *   {duration} — clip duration in seconds (rounded)
   *   {start}    — clip start time as MM-SS
   *   {end}      — clip end time as MM-SS
   *   {date}     — render date as YYYY-MM-DD
   *   {quality}  — render quality preset name (draft / normal / high / custom)
   *
   * Default (when omitted): '{source}_clip{index}_{score}'
   */
  filenameTemplate?: string
  /**
   * Style presets available for per-shot style resolution.
   * When clips have `shotStyles` assignments, the IPC handler uses these presets
   * to resolve preset IDs into concrete `ShotStyleConfig` objects.
   * Each preset carries the caption and zoom configuration for a named style.
   * When omitted, per-shot style assignments on jobs have no effect.
   */
  stylePresets?: Array<{
    id: string
    captions: {
      enabled: boolean
      style: {
        animation: import('@shared/types').CaptionAnimation
        primaryColor: string
        highlightColor: string
        outlineColor: string
        emphasisColor?: string
        supersizeColor?: string
        fontSize: number
        outline: number
        shadow: number
        borderStyle: number
        wordsPerLine: number
        fontName: string
        backColor: string
      }
    }
    zoom: {
      enabled: boolean
      mode: import('@shared/types').ZoomMode
      intensity: import('@shared/types').ZoomIntensity
      intervalSeconds: number
    }
    colorGrade?: import('@shared/types').ColorGradeConfig
    transitionIn?: import('@shared/types').ShotTransitionConfig
    transitionOut?: import('@shared/types').ShotTransitionConfig
    brollMode?: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip'
  }>
}
