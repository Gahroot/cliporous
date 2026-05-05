// ---------------------------------------------------------------------------
// Shared Domain Types
//
// Canonical type definitions used across both the Electron main process and
// the React renderer. Import from '@shared/types' (aliased) or via relative
// path '../../shared/types'.
//
// RULE: Only types that genuinely cross the IPC boundary belong here.
//       UI-only types stay in store.ts; main-only types stay in their module.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

/** A single word with its start/end timestamps from ASR transcription. */
export interface WordTimestamp {
  text: string
  /** Start time in seconds */
  start: number
  /** End time in seconds */
  end: number
}

/** A sentence/paragraph segment from ASR transcription. */
export interface SegmentTimestamp {
  text: string
  /** Start time in seconds */
  start: number
  /** End time in seconds */
  end: number
}

/** Raw transcription output from the ASR pipeline. */
export interface TranscriptionResult {
  /** Full transcript text */
  text: string
  /** Word-level timestamps */
  words: WordTimestamp[]
  /** Sentence/segment-level timestamps */
  segments: SegmentTimestamp[]
}

// ---------------------------------------------------------------------------
// Face Detection
// ---------------------------------------------------------------------------

/** A 9:16 crop rectangle for face-centered framing. */
export interface CropRegion {
  x: number
  y: number
  width: number
  height: number
  /** Whether a face was actually detected (false = fallback center crop). */
  faceDetected: boolean
}

/**
 * A time-ranged crop for a single scene within a clip. Times are in source-
 * video absolute seconds. Produced by face_detect.py when PySceneDetect finds
 * multiple scenes inside a clip's [start, end] window; the render pipeline
 * switches crop rectangles at scene boundaries via an expression-based crop
 * filter.
 */
export interface CropTimelineEntry {
  /** Source-video absolute start time (seconds). */
  startTime: number
  /** Source-video absolute end time (seconds). */
  endTime: number
  x: number
  y: number
  width: number
  height: number
  faceDetected: boolean
}

/** Who set the crop — 'auto' from face detection, 'manual' from user drag. */
export type CropRegionSource = 'auto' | 'manual'

/** Progress callback data for multi-segment face detection. */
export interface FaceDetectionProgress {
  segment: number
  total: number
}

// ---------------------------------------------------------------------------
// AI Scoring
// ---------------------------------------------------------------------------

/** Target clip duration range for AI transcript scoring. */
export type TargetDuration = 'auto' | '15-30' | '30-60' | '60-90' | '90-120'

/** A single scored segment returned by the Gemini AI scoring pass. */
export interface ScoredSegment {
  /** Start time in seconds */
  startTime: number
  /** End time in seconds */
  endTime: number
  /** Transcript text for this segment */
  text: string
  /** Viral potential score 0–100 */
  score: number
  /** AI-generated hook/title text for the clip */
  hookText: string
  /** AI reasoning for the score */
  reasoning: string
}

/** Full result from the AI transcript scoring pipeline. */
export interface ScoringResult {
  segments: ScoredSegment[]
  summary: string
  keyTopics: string[]
}

/** Progress callback data for the AI scoring stage. */
export interface ScoringProgress {
  stage: 'sending' | 'analyzing' | 'validating'
  message: string
}

// ---------------------------------------------------------------------------
// Curiosity Gap
// ---------------------------------------------------------------------------

/** A detected curiosity gap moment in the transcript. */
export interface CuriosityGap {
  /** Timestamp (seconds) where the gap opens — question asked, story begins, claim made */
  openTimestamp: number
  /** Timestamp (seconds) where the gap resolves — answer given, payoff lands */
  resolveTimestamp: number
  /** Structural type of the curiosity trigger */
  type: 'question' | 'story' | 'claim' | 'pivot' | 'tease'
  /** Engagement strength 1–10 */
  score: number
  /** Human-readable explanation of what makes this moment compelling */
  description: string
}

/** Adjusted clip boundaries after curiosity gap optimization. */
export interface ClipBoundary {
  /** Adjusted clip start in seconds */
  start: number
  /** Adjusted clip end in seconds */
  end: number
  /** Short explanation of why the boundaries were chosen */
  reason: string
}

/**
 * Simplified clip candidate used for curiosity-gap ranking and variant generation.
 * This is NOT the full UI ClipCandidate from store.ts — it only carries the
 * fields needed for AI analysis passes.
 */
export interface CuriosityClipCandidate {
  startTime: number
  endTime: number
  /** Original virality score 0–100 */
  score: number
  text?: string
  hookText?: string
  reasoning?: string
  /** Curiosity gap strength 1–10 injected by rankClipsByCuriosity */
  curiosityScore?: number
  /** Combined engagement rank score used for final ordering */
  combinedScore?: number
}

// ---------------------------------------------------------------------------
// Clip End Mode
// ---------------------------------------------------------------------------

/** Strategy for optimizing clip endpoints. */
export type ClipEndMode = 'loop-first' | 'completion-first' | 'cliffhanger'

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

/** Animation style for word-level captions. */
export type CaptionAnimation = 'captions-ai' | 'karaoke-fill' | 'word-pop' | 'fade-in' | 'glow' | 'word-box' | 'elastic-bounce' | 'typewriter' | 'impact-two' | 'cascade'

/**
 * Full caption visual identity for an EditStyle — self-contained, independent
 * of the user's basic caption preset system.
 */
export interface CaptionStyleInput {
  fontName: string
  /** Fraction of frame height (e.g. 0.065). */
  fontSize: number
  /** Base text color hex (e.g. '#FFFFFF'). */
  primaryColor: string
  /** Currently-speaking word color hex. */
  highlightColor: string
  /** Outline/shadow color hex. */
  outlineColor: string
  /** Background box color with alpha (AARRGGBB, e.g. '#40000000'). */
  backColor: string
  outline: number
  shadow: number
  /** 1 = outline+shadow, 3 = opaque box behind text. */
  borderStyle: number
  wordsPerLine: number
  animation: CaptionAnimation
  /** Emphasis-level word color. Defaults to highlightColor. */
  emphasisColor?: string
  /** Supersize word color. Defaults to '#FFD700'. */
  supersizeColor?: string
  /** Drop-shadow offset distance in pixels (extended shadow controls). */
  shadowDistance?: number
  /** Drop-shadow angle in degrees (0 = right, 90 = down). */
  shadowAngle?: number
  /** Drop-shadow softness / blur radius in pixels. */
  shadowSoftness?: number
  /** Drop-shadow opacity (0–1). */
  shadowOpacity?: number
  /** Drop-shadow color hex. */
  shadowColor?: string
}

/** Word animation type for the live preview and CSS-based rendering. */
export type WordAnimationType = 'none' | 'fade' | 'pop' | 'slide' | 'bounce' | 'typewriter'

/** Text case transformation applied to caption words. */
export type TextCase = 'normal' | 'upper' | 'lower'

/** Shadow style applied behind caption text. */
export interface CaptionShadowStyle {
  /** Shadow rendering type. 'drop' = directional shadow, 'glow' = omnidirectional blur. */
  type: 'drop' | 'glow'
  /** Shadow color in hex (e.g. '#000000'). */
  color: string
  /** Horizontal offset in pixels (ignored for 'glow'). */
  offsetX: number
  /** Vertical offset in pixels (ignored for 'glow'). */
  offsetY: number
  /** Blur radius in pixels. */
  blur: number
}

/** Background box rendered behind each word or line of caption text. */
export interface CaptionBackgroundBox {
  /** Whether the background box is enabled. */
  enabled: boolean
  /** Box fill color in hex (e.g. '#000000'). */
  color: string
  /** Box opacity from 0 (transparent) to 1 (opaque). */
  opacity: number
  /** Corner radius in pixels. 0 = sharp corners. */
  cornerRadius: number
  /** Inner padding in pixels between text and box edge. */
  padding: number
}

/** Emphasis tier overrides — applied to words tagged 'emphasis' by the AI edit plan. */
export interface CaptionEmphasisStyle {
  /** Scale multiplier for emphasis words relative to base fontSize (e.g. 1.25 = 25% larger). */
  scaleFactor: number
  /** Override text color for emphasis words. Hex string. Falls back to highlightColor if omitted. */
  color?: string
  /** Override font weight for emphasis words. Falls back to base fontWeight if omitted. */
  fontWeight?: number
}

/** Supersize tier overrides — applied to words tagged 'supersize' by the AI edit plan. */
export interface CaptionSupersizeStyle {
  /** Scale multiplier for supersize words relative to base fontSize (e.g. 1.6 = 60% larger). */
  scaleFactor: number
  /** Override text color for supersize words. Hex string. Defaults to '#FFD700' gold. */
  color: string
  /** Override font weight for supersize words. Defaults to 800 (extra-bold). */
  fontWeight: number
}

/** Box emphasis tier overrides — word sits on a colored opaque rectangle. */
export interface CaptionBoxEmphasisStyle {
  /** Box fill color in hex (e.g. '#FF0000'). Falls back to highlightColor if omitted. */
  color?: string
  /** Box opacity from 0 (transparent) to 1 (opaque). Defaults to 0.85. */
  opacity: number
  /** Padding around the text in pixels. Defaults to 10. */
  padding: number
  /** Override text color for box-emphasis words. Falls back to base textColor if omitted. */
  textColor?: string
  /** Override font weight for box-emphasis words. Falls back to base fontWeight if omitted. */
  fontWeight?: number
}

/**
 * Rich caption style schema — the complete DNA of how words look on screen.
 *
 * Captures every visual property needed to render captions in both the ASS
 * burn-in pipeline (FFmpeg) and the CSS-based live preview overlay. Used by
 * basic "captions only" presets and as the caption layer of premium AI edit
 * style presets alike.
 *
 * Grouped into logical sections: typography, colors, outline/shadow/box,
 * emphasis tiers, animation, layout, and positioning.
 */
export interface CaptionStyleSchema {
  // ---------------------------------------------------------------------------
  // Typography
  // ---------------------------------------------------------------------------

  /** Font family name (e.g. 'Montserrat', 'Inter', 'Poppins'). */
  fontFamily: string
  /** Font weight as a numeric value (100–900). 400 = normal, 700 = bold. */
  fontWeight: number
  /** Text case transformation applied to all caption words. */
  textCase: TextCase
  /** Base font size as a fraction of frame height (e.g. 0.07 = 7%). */
  fontSize: number
  /** Letter spacing in pixels. 0 = normal. Positive values spread characters. */
  letterSpacing: number

  // ---------------------------------------------------------------------------
  // Colors
  // ---------------------------------------------------------------------------

  /** Primary text color in hex (e.g. '#FFFFFF'). */
  textColor: string
  /** Highlight color for the currently-spoken word in hex. */
  highlightColor: string

  // ---------------------------------------------------------------------------
  // Outline, Shadow & Background Box
  // ---------------------------------------------------------------------------

  /** Outline (stroke) color around each glyph in hex. */
  outlineColor: string
  /** Outline (stroke) width in pixels. 0 = no outline. */
  outlineWidth: number
  /** Text shadow configuration. `null` = no shadow. */
  shadow: CaptionShadowStyle | null
  /** Background box behind text. When disabled, no box is drawn. */
  backgroundBox: CaptionBackgroundBox

  // ---------------------------------------------------------------------------
  // Emphasis & Supersize Tiers
  // ---------------------------------------------------------------------------

  /** Visual overrides for words tagged 'emphasis' by the AI edit plan. */
  emphasis: CaptionEmphasisStyle
  /** Visual overrides for words tagged 'supersize' by the AI edit plan. */
  supersize: CaptionSupersizeStyle
  /** Visual overrides for words tagged 'box' — opaque background rectangle. */
  boxEmphasis: CaptionBoxEmphasisStyle

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  /** Word-level entrance animation type. */
  wordAnimation: WordAnimationType
  /** Animation duration in milliseconds (e.g. 150). */
  animationDurationMs: number

  // ---------------------------------------------------------------------------
  // Layout & Positioning
  // ---------------------------------------------------------------------------

  /** Maximum number of words displayed at once per caption group/line. */
  wordsPerLine: number
  /**
   * Vertical position of the caption block as a fraction of frame height
   * measured from the bottom (0 = bottom edge, 1 = top edge).
   * Typical range: 0.08–0.25. Default ~0.12.
   */
  verticalPosition: number
}

// ---------------------------------------------------------------------------
// Word Emphasis
// ---------------------------------------------------------------------------

/** Emphasis level for a single word in the transcript. */
export type EmphasisLevel = 'normal' | 'emphasis' | 'supersize' | 'box'

/** A word with its emphasis level determined by AI or heuristic analysis. */
export interface EmphasizedWord {
  text: string
  /** Start time in seconds */
  start: number
  /** End time in seconds */
  end: number
  /** Emphasis classification for caption styling. */
  emphasis: EmphasisLevel
}

/** Result of word emphasis analysis for a clip or segment. */
export interface WordEmphasisResult {
  words: EmphasizedWord[]
  /** Whether AI was used (true) or heuristic fallback (false). */
  usedAI: boolean
}

// ---------------------------------------------------------------------------
// Sound Design
// ---------------------------------------------------------------------------

/** Built-in background music track identifier. */
export type MusicTrack =
  // Legacy generic tracks
  | 'ambient-tech'
  | 'ambient-motivational'
  | 'ambient-chill'
  // Style-curated tracks — each matches a preset's creative personality
  | 'cinematic-ambient'       // Film: atmospheric, slow-burn orchestral pads
  | 'cinematic-noir'          // Film Noir variant: jazzy, smoky, mysterious
  | 'cinematic-golden'        // Film Golden Hour: warm strings, hopeful
  | 'high-energy-beats'       // Velocity: punchy electronic, 140+ BPM
  | 'high-energy-trap'        // Velocity Bold: aggressive 808s, dark energy
  | 'gritty-lofi'             // Rebel: lo-fi with vinyl crackle, grungy bass
  | 'gritty-dark'             // Rebel Blackout: industrial, distorted, raw
  | 'synthwave-neon'          // Neon: retro synthwave, 80s arpeggios
  | 'synthwave-vapor'         // Neon Ice: vaporwave, dreamy pads
  | 'impact-hype'             // Impact: hard-hitting hip-hop instrumental
  | 'corporate-upbeat'        // Growth/Prime: clean, professional, uplifting
  | 'ember-warm'              // Ember: warm indie acoustic, soulful
  | 'volt-electric'           // Volt: electro house, driving bassline
  | 'clarity-focus'           // Clarity: minimal piano + soft pads, educational

// ---------------------------------------------------------------------------
// Platform & Layout
// ---------------------------------------------------------------------------

/** Target social media platform for safe-zone calculations. */
export type Platform = 'tiktok' | 'reels' | 'shorts' | 'universal'

/**
 * Output aspect ratio for rendered clips.
 * - '9:16' — 1080×1920, vertical (TikTok, Reels, Shorts)
 * - '1:1'  — 1080×1080, square (Instagram Feed, Facebook)
 * - '4:5'  — 1080×1350, portrait (Instagram Post)
 * - '16:9' — 1920×1080, landscape (YouTube, Twitter)
 */
export type OutputAspectRatio = '9:16' | '1:1' | '4:5' | '16:9'

// ---------------------------------------------------------------------------
// Auto-Zoom
// ---------------------------------------------------------------------------

/** Zoom motion intensity for Ken Burns effect. */
export type ZoomIntensity = 'subtle' | 'medium' | 'dynamic'

/**
 * Zoom animation mode.
 * - ken-burns:  smooth sinusoidal breathing zoom (default)
 * - reactive:   zoom responds to word emphasis moments (keyframe-driven)
 * - jump-cut:   instant zoom level changes that simulate multi-camera editing
 */
export type ZoomMode = 'ken-burns' | 'reactive' | 'jump-cut'

// ---------------------------------------------------------------------------
// Hook Title Overlay
// ---------------------------------------------------------------------------

/** Visual style for the hook title overlay. */
export type HookTitleStyle = 'centered-bold' | 'top-bar' | 'slide-in'

// ---------------------------------------------------------------------------
// Re-Hook Overlay
// ---------------------------------------------------------------------------

/** Visual style for the mid-clip re-hook / pattern interrupt overlay. */
export type RehookStyle = 'bar' | 'text-only' | 'slide-up'

// ---------------------------------------------------------------------------
// Brand Kit
// ---------------------------------------------------------------------------

/** Position of the brand logo watermark on the frame. */
export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

// ---------------------------------------------------------------------------
// Shot Segmentation
//
// Within each clip, the transcript is split into 4–6 second "shots" at
// natural break points (sentence boundaries, pauses, topic shifts).
// Each shot is a coherent thought that can receive independent styling.
// ---------------------------------------------------------------------------

/** Reason why a shot boundary was placed at this point. */
export type ShotBreakReason =
  | 'sentence-end'      // Period, question mark, or exclamation at word end
  | 'pause'             // Silent gap > threshold between consecutive words
  | 'clause-boundary'   // Comma, semicolon, or colon followed by a pause
  | 'topic-shift'       // Vocabulary / subject change detected across window
  | 'max-duration'      // Shot exceeded target max (forced split)
  | 'start'             // First shot of the clip (synthetic boundary)
  | 'end'               // Last shot of the clip (synthetic boundary)

/** A single shot segment within a clip — a coherent visual thought unit. */
export interface ShotSegment {
  /** Clip-relative start time in seconds (0 = clip start). */
  startTime: number
  /** Clip-relative end time in seconds. */
  endTime: number
  /** Transcript text for this shot. */
  text: string
  /** Index of the first word (in the clip's wordTimestamps array) belonging to this shot. */
  startWordIndex: number
  /** Exclusive index of the last word belonging to this shot. */
  endWordIndex: number
  /** Why the boundary at the END of this shot was placed. */
  breakReason: ShotBreakReason
  /** Confidence score for this boundary (0–1). Higher = more natural break. */
  confidence: number
}

/** Result of shot segmentation for a single clip. */
export interface ShotSegmentationResult {
  shots: ShotSegment[]
  /** Total number of shots produced. */
  shotCount: number
  /** Average shot duration in seconds. */
  avgDuration: number
}

// ---------------------------------------------------------------------------
// AI Edit Plan
//
// A complete per-clip edit plan produced by a single Gemini AI call.
// Contains word emphasis tags, B-Roll placement suggestions, and SFX
// recommendations — all calibrated to the active style preset.
// ---------------------------------------------------------------------------

/** A word tagged for emphasis by the AI edit plan. */
export interface AIEditPlanWordEmphasis {
  /** 0-based index in the clip's word timestamps array (for fast lookup). */
  wordIndex: number
  /** Word text — used to validate the index match at apply time. */
  text: string
  /** Clip-relative start timestamp in seconds. */
  start: number
  /** Clip-relative end timestamp in seconds. */
  end: number
  /** How much visual weight this word should carry in captions. */
  level: 'emphasis' | 'supersize' | 'box'
}

/** A B-Roll placement suggestion from the AI edit plan. */
export interface AIEditPlanBRollSuggestion {
  /** Clip-relative start time in seconds. */
  timestamp: number
  /** How long the B-Roll should run in seconds (2–6). */
  duration: number
  /** Pexels search query for this visual moment. */
  keyword: string
  /** Recommended layout for this B-Roll moment. */
  displayMode: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip'
  /** Recommended transition style. */
  transition: 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down'
  /** Brief editorial justification (1 sentence). */
  reason: string
}

/** SFX type identifiers that cross the IPC boundary in the edit plan. */
export type AIEditPlanSFXType =
  | 'whoosh-soft'
  | 'whoosh-hard'
  | 'impact-low'
  | 'impact-high'
  | 'rise-tension'
  | 'notification-pop'
  | 'word-pop'
  | 'bass-drop'
  | 'rise-tension-short'

/** A sound effect recommendation from the AI edit plan. */
export interface AIEditPlanSFXSuggestion {
  /** Clip-relative timestamp in seconds. */
  timestamp: number
  /** SFX type to trigger. */
  type: AIEditPlanSFXType
  /** Brief editorial justification (1 sentence). */
  reason: string
}

/**
 * A complete AI-generated edit plan for a single clip.
 *
 * Produced by a single Gemini call that analyzes the clip transcript through
 * the lens of the active style preset and returns all three edit layers in
 * one shot: word emphasis, B-Roll suggestions, and SFX recommendations.
 */
export interface AIEditPlan {
  /** ID of the clip this plan belongs to. */
  clipId: string
  /** ID of the style preset that was active when the plan was generated. */
  stylePresetId: string
  /** Human-readable name of that style preset (for display). */
  stylePresetName: string
  /**
   * Word emphasis overrides.
   * Applied to captions at render time instead of the heuristic analysis.
   */
  wordEmphasis: AIEditPlanWordEmphasis[]
  /**
   * B-Roll placement suggestions.
   * Used to seed the Pexels keyword search when B-Roll is enabled.
   */
  brollSuggestions: AIEditPlanBRollSuggestion[]
  /**
   * SFX placement recommendations.
   * Shown in the UI and passed as edit events to the sound design engine.
   */
  sfxSuggestions: AIEditPlanSFXSuggestion[]
  /** 2–3 sentence overall editorial reasoning from the AI. */
  reasoning: string
  /** Unix timestamp (ms) when the plan was generated. */
  generatedAt: number
}

// ---------------------------------------------------------------------------
// Color Grade
//
// Per-shot or global color treatment applied as FFmpeg eq/hue filters.
// ---------------------------------------------------------------------------

/** Named color grade preset that maps to concrete FFmpeg eq/hue parameters. */
export type ColorGradePreset =
  | 'none'           // No color treatment
  | 'warm'           // Warm golden tones
  | 'cool'           // Cool blue-shifted
  | 'cinematic'      // Desaturated, crushed blacks
  | 'vintage'        // Faded, lifted blacks
  | 'high-contrast'  // Punchy, vivid
  | 'bw'             // Black and white
  | 'film'           // Film grain look (slight desaturation + warm shift)

/** Color grade configuration with optional fine-tuning overrides. */
export interface ColorGradeConfig {
  /** Named preset. Optional — when omitted, treated as 'none' and only the explicit fine-tune fields apply. */
  preset?: ColorGradePreset
  /** Fine-tune brightness adjustment (-1.0 to 1.0). Default: 0 */
  brightness?: number
  /** Fine-tune contrast adjustment (0.0 to 3.0). Default: 1.0 */
  contrast?: number
  /** Fine-tune saturation adjustment (0.0 to 3.0). Default: 1.0 */
  saturation?: number
  /** Warmth shift: -1.0 (cool/blue) to 1.0 (warm/orange). 0 = neutral */
  warmth?: number
  /** Black level lift: 0.0 (deep blacks) to 0.15 (lifted/faded shadows) */
  blackLift?: number
  /** Highlight rolloff: 0.0 (harsh) to 1.0 (soft highlight rolloff) */
  highlightSoftness?: number
}

// ---------------------------------------------------------------------------
// Shot Transitions
//
// Visual transitions applied at shot boundaries within a clip.
// Implemented as time-limited FFmpeg filter effects at boundary points.
// ---------------------------------------------------------------------------

/** Visual transition type between shots within a clip. */
export type ShotTransitionType =
  | 'none'         // Hard cut (no transition effect)
  | 'crossfade'    // Alpha dissolve between shots
  | 'dip-black'    // Fade to black then fade up
  | 'swipe-left'   // Horizontal wipe left
  | 'swipe-up'     // Vertical wipe up
  | 'swipe-down'   // Vertical wipe down
  | 'zoom-in'      // Gentle zoom push into next shot
  | 'zoom-punch'   // Aggressive snap-zoom at boundary (punchy, energetic)
  | 'glitch'       // Brief digital glitch distortion (RGB shift + noise burst)

/** Transition configuration for a shot boundary. */
export interface ShotTransitionConfig {
  type: ShotTransitionType
  /** Transition duration in seconds (0.15–1.0). Default: 0.3 */
  duration?: number
}

/**
 * Maps each shot transition type to its signature SFX name.
 * The sound design system uses this to automatically place the right
 * audio hit at each transition boundary — making transitions feel intentional.
 * `null` means no SFX (hard cut is silent by design).
 */
export const SHOT_TRANSITION_SFX: Record<ShotTransitionType, string | null> = {
  'none':        null,                // Hard cut — silence IS the sound
  'crossfade':   'whoosh-soft',       // Gentle breath to match the dissolve
  'dip-black':   'whoosh-soft',       // Soft whoosh into darkness
  'swipe-left':  'swipe-transition',  // Directional swipe swoosh
  'swipe-up':    'swipe-transition',  // Directional swipe swoosh
  'swipe-down':  'swipe-transition',  // Directional swipe swoosh
  'zoom-in':     'impact-low',        // Subtle punch on the zoom push
  'zoom-punch':  'impact-high',       // Hard slam — the signature Velocity hit
  'glitch':      'glitch-hit',        // Digital crunch/static burst
}

// ---------------------------------------------------------------------------
// Per-Shot Style Assignments
//
// Maps each shot segment within a clip to a style preset ID, enabling
// piecewise style variation within a single clip render. A 45-second clip
// with 8 shots can assign different caption animations, zoom behaviors,
// and B-Roll display modes to each shot.
// ---------------------------------------------------------------------------

/**
 * Assignment of a style preset to a single shot segment within a clip.
 *
 * The `shotIndex` corresponds to the index in the `ClipCandidate.shots` array.
 * When present on a `RenderClipJob`, the render pipeline resolves the preset
 * by ID and applies its settings only during that shot's time range.
 *
 * Shot indices not present in the array fall back to the global batch style.
 */
export interface ShotStyleAssignment {
  /** 0-based index into the clip's `shots` array. */
  shotIndex: number
  /**
   * ID of the EditStylePreset to apply during this shot's time range.
   * Must match a preset in the store's `editStylePresets` array.
   * When empty or undefined, the global batch style is used for this shot.
   */
  presetId: string
}

/**
 * Resolved style configuration for a single shot — the concrete rendering
 * parameters extracted from a style preset, ready for the render engine.
 *
 * Built by `resolveShotStyles()` at IPC time from `ShotStyleAssignment[]`
 * + the preset definitions. Carried on `RenderClipJob.shotStyleConfigs`.
 */
export interface ShotStyleConfig {
  /** 0-based shot index (matches ShotSegment position in clip.shots). */
  shotIndex: number
  /** Clip-relative start time in seconds. */
  startTime: number
  /** Clip-relative end time in seconds. */
  endTime: number
  /** Caption style override for this shot. `null` = use global. */
  captionStyle?: {
    animation: CaptionAnimation
    primaryColor: string
    highlightColor: string
    outlineColor: string
    emphasisColor?: string
    supersizeColor?: string
    emphasisScale?: number
    emphasisFontWeight?: number
    supersizeScale?: number
    supersizeFontWeight?: number
    boxColor?: string
    boxOpacity?: number
    boxPadding?: number
    boxTextColor?: string
    boxFontWeight?: number
    fontSize: number
    outline: number
    shadow: number
    borderStyle: number
    wordsPerLine: number
    fontName: string
    backColor: string
  } | null
  /** Zoom settings override for this shot. `null` = use global. */
  zoom?: {
    mode: ZoomMode
    intensity: ZoomIntensity
    intervalSeconds: number
  } | null
  /** Color treatment for this shot. `null` = use global. */
  colorGrade?: ColorGradeConfig | null
  /** Transition INTO this shot (from previous shot). `null` = hard cut. */
  transitionIn?: ShotTransitionConfig | null
  /** Transition OUT of this shot (to next shot). `null` = hard cut. */
  transitionOut?: ShotTransitionConfig | null
  /** B-Roll display mode override for this shot. `null` = use global. */
  brollMode?: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip' | null
  /** Background music track for this shot. `null` = use global. */
  musicTrack?: MusicTrack | null
}

// ---------------------------------------------------------------------------
// Segment Editor types (Captions.ai-style per-segment editing)
// ---------------------------------------------------------------------------

/** Category of visual treatment for a segment within a clip. */
export type SegmentStyleCategory =
  | 'main-video'
  | 'main-video-text'
  | 'main-video-images'
  | 'fullscreen-image'
  | 'fullscreen-text'

/** A named style variant that can be applied to a segment. */
export interface SegmentStyleVariant {
  id: string
  category: SegmentStyleCategory
  name: string
  description: string
  zoomStyle: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out'
  zoomIntensity: number
  captionPosition: 'lower-third' | 'center' | 'top'
  imageLayout?: 'pip' | 'side-by-side' | 'behind-speaker' | 'fullscreen' | 'top-bottom'
  imagePlacement?: 'left' | 'right' | 'top' | 'bottom'
}

/** A single zoom/pan keyframe within a segment. */
export interface ZoomKeyframe {
  /** Time in seconds relative to segment start. */
  time: number
  /** Scale factor: 1.0 = normal, 1.15 = zoomed in. */
  scale: number
  /** Normalized horizontal pan position (0–1). */
  x: number
  /** Normalized vertical pan position (0–1). */
  y: number
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'snap'
}

/** How a segment transitions in or out. */
export type TransitionType = 'none' | 'hard-cut' | 'crossfade' | 'flash-cut' | 'color-wash'

/** The 8 archetype keys every edit style must implement (see src/main/edit-styles/shared/archetypes.ts). */
export type Archetype =
  | 'talking-head'
  | 'tight-punch'
  | 'wide-breather'
  | 'quote-lower'
  | 'split-image'
  | 'fullscreen-image'
  | 'fullscreen-quote'
  | 'fullscreen-headline'

/** A single segment within a clip, with its own style, captions, and zoom. */
export interface VideoSegment {
  id: string
  clipId: string
  /** Order within the clip (0-based). */
  index: number
  startTime: number
  endTime: number
  /** Editable burned-in caption text for this segment. */
  captionText: string
  /** Word-level timestamps scoped to this segment. */
  words: WordTimestamp[]
  /** Archetype assigned by the AI segment styler (or user). Resolved at render time
   *  into a concrete SegmentStyleVariant via the active edit style's template set. */
  archetype: Archetype
  /** Denormalized mirror of ARCHETYPE_TO_CATEGORY[archetype]. Kept for the image
   *  generation gate in segment-splitting-stage.ts and render pipeline consumers. */
  segmentStyleCategory: SegmentStyleCategory
  /** Per-segment zoom keyframes. */
  zoomKeyframes: ZoomKeyframe[]
  /** How this segment starts. */
  transitionIn: TransitionType
  /** How this segment ends. */
  transitionOut: TransitionType
  /**
   * Absolute path to a locally-cached image file for this segment.
   * Populated after fal.ai image generation during the segmenting pipeline stage.
   * Used by the render pipeline when segmentStyleCategory is 'main-video-images'
   * or 'fullscreen-image'. Absent until generation completes (or if key not set).
   */
  imagePath?: string
  /**
   * Large-text content for hero archetypes (fullscreen-headline,
   * fullscreen-quote, quote-lower). Populated by the segment styler from
   * captionText when the archetype is first assigned, editable by the user
   * via the SegmentTemplatePicker hero text input. Without this field the
   * hero ASS builder returns empty and those archetypes render as a blank
   * solid background.
   */
  overlayText?: string
  /**
   * Set by the render pipeline when a segment's requested archetype could
   * not be honored and it was silently degraded to a different layout.
   * Typical cause: fullscreen-image / split-image chosen but no fal.ai
   * imagePath exists. Surfaced in the UI so the user knows why the render
   * doesn't match the picked archetype.
   */
  fallbackReason?: string
}

/** Headline / drawtext overlay configuration shared across edit styles. */
export interface HeadlineStyleConfig {
  /** Font size in pixels on the 1080×1920 canvas. */
  fontSize: number
  textColor: string
  outlineColor: string
  outlineWidth: number
  shadowDepth: number
  borderStyle: number
  bold: boolean
  animation: 'fade' | 'snap' | 'scale' | 'scale-pop' | 'slide' | 'none'
  animationDurationMs: number
  fadeOutMs: number
  /** Vertical position as a fraction of the canvas height (0 = top, 1 = bottom). */
  verticalPosition: number
}

/** Reveal animation styles for drawtext / headline overlays. */
export type TextAnimationStyle =
  | 'fade-in'
  | 'snap-in'
  | 'scale-up'
  | 'slide-up'
  | 'none'

/** Per-style color grading parameters applied to every segment in an edit style. */
export interface ColorGradeParams {
  /** Warmth shift: -1.0 (cool/blue) to 1.0 (warm/orange). 0 = neutral */
  warmth: number
  /** Contrast: 0.8 (flat) to 1.4 (punchy). 1.0 = no change */
  contrast: number
  /** Saturation: 0.0 (grayscale) to 1.5 (oversaturated). 1.0 = no change */
  saturation: number
  /** Black level lift: 0.0 (deep blacks) to 0.15 (lifted/faded shadows) */
  blackLift: number
  /** Highlight rolloff: 0.0 (harsh) to 1.0 (soft highlight rolloff) */
  highlightSoftness: number
}

/** VFX overlay layer applied to a segment. */
export type VFXOverlayType =
  | 'glowing-ring'
  | 'bokeh-blobs'
  | 'diagonal-slash'
  | 'color-vignette'
  | 'gradient-bar-bottom'
  | 'gradient-bar-top'
  | 'color-tint'
  | 'grid-overlay'
  | 'scan-line'
  | 'corner-brackets'
  | 'pulse-border'
  | 'image-overlay'
  | 'video-overlay'

export type OverlayBlendMode = 'normal' | 'screen' | 'multiply'

export interface VFXOverlay {
  type: VFXOverlayType
  opacity: number
  /** Which segment categories this overlay applies to. 'all' matches every category. */
  applyToCategories: SegmentStyleCategory[] | 'all'
  /** Path relative to resources/overlays/ for asset-based overlays. */
  assetPath?: string
  /** Blend mode for asset-based overlays (default: 'normal'). */
  blendMode?: OverlayBlendMode
}

/** A complete edit style preset controlling the overall clip look & feel. */
export interface EditStyle {
  id: string
  name: string
  energy: 'low' | 'medium' | 'high'
  /** Accent color in CSS hex (e.g. '#FF6B35'). */
  accentColor: string
  /** Caption background opacity (0.0–1.0). */
  captionBgOpacity: number
  letterbox: 'none' | 'bottom' | 'both'
  defaultZoomStyle: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out'
  defaultZoomIntensity: number
  defaultTransition: TransitionType
  /** Color for flash-cut and color-wash transitions (CSS hex). */
  flashColor: string
  /** Target visual edits per second (controls segment pacing). */
  targetEditsPerSecond: number
  /** Full caption visual identity — self-contained, overrides basic caption preset. */
  captionStyle: CaptionStyleInput
  /** Headline / drawtext overlay style for text-heavy segments. */
  headlineStyle: HeadlineStyleConfig
  /** IDs of SegmentStyleVariants available in this edit style. */
  availableSegmentStyles: string[]
  /** One-sentence summary of the style's visual character, shown as a tooltip. */
  description?: string
  /** VFX overlay layers applied per segment (optional — empty = no overlays). */
  vfxOverlays?: VFXOverlay[]
  /** Per-style color grading applied to every segment rendered with this style. */
  colorGrade?: ColorGradeParams
  /** Text reveal animation for drawtext overlays in text-based segment layouts. */
  textAnimation?: TextAnimationStyle
  /** Per-energy-tier segment duration target for viewer retention optimization. */
  segmentDurationTarget?: { min: number; max: number; ideal: number }
  /** Duration in seconds for xfade/color-wash transitions between segments. */
  transitionDuration?: number
  /** Per-(outCategory→inCategory) transition overrides. Key format: "out→in". */
  transitionMap?: Record<string, TransitionType>
}
