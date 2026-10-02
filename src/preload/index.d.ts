import { ElectronAPI } from '@electron-toolkit/preload';
import type { TokenUsageEvent } from '@shared/ai-usage';
import type {
  AppRestartReason,
  LifecyclePrepareRequest,
  LifecyclePrepareResult,
  LifecycleSnapshot,
} from '@shared/app-lifecycle';
import type { ConnectionValidationResult } from '@shared/connections';
import type { StructuredError } from '@shared/errors';
import type { HistoryMenuState } from '@shared/history';
import type {
  NativeJobProgress,
  NativeNotificationClick,
  NativeNotificationOptions,
} from '@shared/jobs';
import type {
  LongformGenerationRequest,
  LongformPlanningProgress,
  LongformScenePreviewRequest,
} from '@shared/longform-scenes';
import type { MediaPathStatus, MediaSearchResult, MediaSearchSource } from '@shared/media';
import type { ProjectLoadResult, ProjectSaveOptions } from '@shared/project';
import type {
  PythonSetupDone,
  PythonSetupProgress,
  PythonSetupStartResult,
  PythonSetupStatus,
} from '@shared/python-setup';
import type { RecentProjectEntry, RecentProjectRenameResult } from '@shared/recent-projects';
import type { LongformEditPlan, LongformRenderReconciliation } from '@shared/types';
import type { AppUpdateState } from '@shared/updater';

// ---------------------------------------------------------------------------
// Source — FFmpeg / dialog
// ---------------------------------------------------------------------------

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
  fps: number;
  audioCodec: string;
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

interface YouTubeDownloadResult {
  path: string;
  title: string;
  duration: number;
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

interface WordTimestamp {
  text: string;
  start: number;
  end: number;
}

interface SegmentTimestamp {
  text: string;
  start: number;
  end: number;
}

interface TranscriptionResult {
  text: string;
  words: WordTimestamp[];
  segments: SegmentTimestamp[];
}

/** Promo Mode clip candidate seed (mirrors main/promo/promo-clips.ts PromoClip). */
interface PromoClip {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  label: string;
  wordTimestamps: WordTimestamp[];
}

interface TranscriptionProgress {
  stage: 'extracting-audio' | 'downloading-model' | 'loading-model' | 'transcribing';
  message: string;
  /** 0–100, present during downloading-model stage */
  percent?: number;
}

// ---------------------------------------------------------------------------
// AI scoring & generation
// ---------------------------------------------------------------------------

interface ScoredSegment {
  startTime: number;
  endTime: number;
  text: string;
  score: number;
  hookText: string;
  reasoning: string;
}

interface ScoringResult {
  segments: ScoredSegment[];
  summary: string;
  keyTopics: string[];
}

interface ScoringProgress {
  stage: 'sending' | 'analyzing' | 'validating';
  message: string;
}

// ---------------------------------------------------------------------------
// Curiosity Gap Detector
// ---------------------------------------------------------------------------

interface CuriosityGap {
  openTimestamp: number;
  resolveTimestamp: number;
  type: 'question' | 'story' | 'claim' | 'pivot' | 'tease';
  score: number;
  description: string;
}

interface ClipBoundary {
  start: number;
  end: number;
  reason: string;
}

interface CuriosityClipCandidate {
  startTime: number;
  endTime: number;
  score: number;
  text?: string;
  hookText?: string;
  reasoning?: string;
  curiosityScore?: number;
  combinedScore?: number;
}

// ---------------------------------------------------------------------------
// Description Generator
// ---------------------------------------------------------------------------

interface PlatformDescription {
  platform: 'youtube-shorts' | 'instagram-reels' | 'tiktok';
  text: string;
  hashtags: string[];
}

interface ClipDescription {
  shortDescription: string;
  hashtag: string;
  longDescription?: string;
  platforms: PlatformDescription[];
}

interface DescriptionClipInput {
  transcript: string;
  hookText?: string;
  reasoning?: string;
}

// ---------------------------------------------------------------------------
// Word Emphasis
// ---------------------------------------------------------------------------

interface EmphasizedWord {
  text: string;
  start: number;
  end: number;
  emphasis: 'normal' | 'emphasis' | 'supersize';
}

interface WordEmphasisResult {
  words: EmphasizedWord[];
  usedAI: boolean;
}

// ---------------------------------------------------------------------------
// Stitched Clips
// ---------------------------------------------------------------------------

interface StitchedClipPlanIPC {
  ranges: Array<{ startTime: number; endTime: number; role: string }>;
  text: string;
  score: number;
  hookText: string;
  reasoning: string;
}

interface StitchGenerationResultIPC {
  clips: StitchedClipPlanIPC[];
}

interface StitchGenerationProgressIPC {
  stage: 'sending' | 'analyzing' | 'validating';
  message: string;
}

// ---------------------------------------------------------------------------
// Face detection
// ---------------------------------------------------------------------------

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  faceDetected: boolean;
}

/**
 * A time-ranged crop for a single scene within a clip. Times are in source-
 * video absolute seconds. Produced by face_detect.py when PySceneDetect finds
 * multiple scenes inside a clip's [start, end] window.
 */
interface CropTimelineEntry {
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  width: number;
  height: number;
  faceDetected: boolean;
}

/** What detectFaceCrops returns per input segment. */
interface FaceCropResult {
  crop: CropRegion;
  timeline?: CropTimelineEntry[];
  /** Rows (source px) the tracked face covers; absent when no face was found. */
  faceBand?: { top: number; bottom: number };
  /** True when the accurate face detector ran. */
  facesReliable?: boolean;
}

interface FaceDetectionProgress {
  segment: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

interface CaptionStyleInput {
  fontName: string;
  fontSize: number;
  primaryColor: string;
  highlightColor: string;
  outlineColor: string;
  backColor: string;
  outline: number;
  shadow: number;
  borderStyle: number;
  wordsPerLine: number;
  animation: string;
  captionMode?: 'standard' | 'emphasis' | 'emphasis_highlight' | 'editorial';
  accentColor?: string;
  emphasisColor?: string;
  supersizeColor?: string;
}

// ---------------------------------------------------------------------------
// Render pipeline
// ---------------------------------------------------------------------------

interface AutoZoomSettings {
  enabled: boolean;
  mode: 'ken-burns' | 'reactive' | 'jump-cut';
  intensity: 'subtle' | 'medium' | 'dynamic';
  intervalSeconds: number;
}

interface HookTitleOverlaySettings {
  enabled: boolean;
  style: 'centered-bold' | 'top-bar' | 'slide-in';
  displayDuration: number;
  fadeIn: number;
  fadeOut: number;
  fontSize: number;
  textColor: string;
  outlineColor: string;
  outlineWidth: number;
}

interface RehookOverlaySettings {
  enabled: boolean;
  style: 'bar' | 'text-only' | 'slide-up';
  displayDuration: number;
  fadeIn: number;
  fadeOut: number;
  positionFraction: number;
}

interface RenderClipJob {
  clipId: string;
  sourceVideoPath: string;
  startTime: number;
  endTime: number;
  cropRegion?: { x: number; y: number; width: number; height: number };
  /**
   * Per-scene crop timeline in source-video absolute seconds. When >1 entry
   * is present, the render pipeline emits an expression-based crop filter
   * that switches rectangles at scene boundaries.
   */
  cropTimeline?: Array<{
    startTime: number;
    endTime: number;
    x: number;
    y: number;
    width: number;
    height: number;
    faceDetected: boolean;
  }>;
  /** Path to a pre-generated .ass subtitle file to burn in */
  assFilePath?: string;
  /** Optional override for the output filename (without extension) */
  outputFileName?: string;
  /** Word-level timestamps (relative to source video). */
  wordTimestamps?: { text: string; start: number; end: number }[];
  /**
   * AI-generated hook title text to overlay in the first few seconds.
   * Corresponds to ClipCandidate.hookText from the scoring step.
   */
  hookTitleText?: string;
  /**
   * Pre-generated re-hook / pattern interrupt text for the mid-clip overlay.
   * If omitted, the main process picks a deterministic default phrase.
   */
  rehookText?: string;
  /** AI edit plan B-Roll suggestions — seeds keyword search for B-Roll placement engine. */
  brollSuggestions?: Array<{
    timestamp: number;
    duration: number;
    keyword: string;
    displayMode: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip';
    transition: 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down';
  }>;
  /**
   * When present, this job represents a segmented clip with per-segment
   * archetype treatment. The render pipeline routes to renderSegmentedClip()
   * instead of the normal single-segment path.
   */
  segmentedSegments?: Array<{
    id?: string;
    captionText?: string;
    startTime: number;
    endTime: number;
    archetype: import('@shared/types').Archetype;
    zoomStyle?: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out';
    zoomIntensity?: number;
    transitionIn?: import('@shared/types').TransitionType;
    imagePath?: string;
  }>;
  /**
   * When present, this job represents a stitched clip composed of multiple
   * non-contiguous source-video ranges. The render pipeline assembles them
   * into a single MP4 and rewrites the job to look like a regular clip on
   * the assembled timeline before running the feature pipeline.
   */
  stitchedSegments?: Array<{
    startTime: number;
    endTime: number;
    role?: import('@shared/types').StitchedClipRole;
    imagePath?: string;
    cropRect?: { x: number; y: number; width: number; height: number };
  }>;
  /**
   * Per-clip overrides for global render settings. Forwarded from
   * ClipCandidate.overrides; only the fields the render pipeline reads are
   * carried. Absent keys fall back to the global render settings.
   */
  clipOverrides?: {
    enableFillerRemoval?: boolean;
    enableCaptions?: boolean;
    enableHookTitle?: boolean;
    enableRehook?: boolean;
    rehookText?: string;
    enableAutoZoom?: boolean;
    enableBroll?: boolean;
    enableWordEmphasis?: boolean;
    enableShotTransitions?: boolean;
    enableHyperframes?: boolean;
    layout?: 'default' | 'blur-background';
    /** Per-clip accent color — overrides highlight colors across all visual elements. */
    accentColor?: string;
    /** Per-clip caption mode — forces one of the three V2 caption modes. */
    captionMode?: 'standard' | 'emphasis' | 'emphasis_highlight' | 'editorial';
  };
}

interface RenderBatchOptions {
  jobs: RenderClipJob[];
  outputDirectory: string;
  /**
   * Output profile. `undefined` / `'vertical'` runs the locked 9:16 short-form
   * pipeline; `'longform'` routes to the 16:9 long-form pipeline.
   */
  outputProfile?: import('@shared/types').OutputProfile;
  /** AI-generated long-form edit plan. Required when `outputProfile` is `'longform'`. */
  longformEditPlan?: LongformEditPlan;
  longformEditsEnabled?: boolean;
  /**
   * User-chosen visual skin for long-form content blocks. Falls back to the
   * default block skin on the main side. Ignored outside `'longform'`.
   */
  longformSkinId?: import('@shared/types').LongformSkinId;
  /**
   * User-chosen color palette id (background / foreground / accent axis) for
   * long-form content blocks. Resolved via `getPaletteById`. Ignored outside
   * `'longform'`.
   */
  longformPaletteId?: string;
  /**
   * User-created custom palettes, searched first when resolving
   * `longformPaletteId`. Ignored outside `'longform'`.
   */
  customPalettes?: import('@shared/palettes').Palette[];
  /** Whether word emphasis contributes caption and reactive-zoom keyframes. */
  wordEmphasisEnabled?: boolean;
  /** Whether segmented and per-shot edits use transitions instead of hard cuts. */
  shotTransitionsEnabled?: boolean;
  /** Whether shorts get transcript-driven animated explainer scenes (needs a Gemini key). */
  explainerScenesEnabled?: boolean;
  /** Whether queued HyperFrames overlays are composited. */
  hyperframesEnabled?: boolean;
  /** Ken Burns auto-zoom settings applied to every rendered clip */
  autoZoom?: AutoZoomSettings;
  /** Hook title overlay — burns AI-generated hook text into first 1-3 seconds of each clip */
  hookTitleOverlay?: HookTitleOverlaySettings;
  /** Re-hook overlay — burns mid-clip pattern interrupt text to reset viewer attention */
  rehookOverlay?: RehookOverlaySettings;
  /** When true, all FFmpeg commands are sent back in render events for debug logging. */
  developerMode?: boolean;
  /** Number of clips to render concurrently (1–4). GPU encoders are capped at 2. */
  renderConcurrency?: number;
  /** Render quality and output format settings. */
  renderQuality?: {
    preset: 'draft' | 'normal' | 'high' | 'custom';
    customCrf: number;
    outputResolution: '1080x1920' | '720x1280' | '540x960';
    outputFormat: 'mp4' | 'webm';
    encodingPreset: 'ultrafast' | 'veryfast' | 'medium' | 'slow';
  };
  /**
   * Template layout — controls on-screen placement (% of canvas) for the
   * hook title and burned-in subtitles. The mid-clip re-hook overlay always
   * mirrors the title position; pass it through here on a render call.
   */
  templateLayout?: {
    titleText: { x: number; y: number };
    subtitles: { x: number; y: number };
    /** @deprecated Always mirrors titleText — do not set independently */
    rehookText: { x: number; y: number };
  };
  /** Whether captions are enabled (needed to know whether to re-sync captions) */
  captionsEnabled?: boolean;
  /** Caption style for re-generating captions after filler removal */
  captionStyle?: CaptionStyleInput;
  /** Filler / silence / repeat removal settings. */
  fillerRemoval?: {
    enabled: boolean;
    /**
     * Named preset ("let-it-ride" / "tight" / "custom"). Forwarded for
     * telemetry / UI only — the main process reads only the granular
     * fields below.
     */
    preset?: 'let-it-ride' | 'tight' | 'custom';
    removeFillerWords: boolean;
    trimSilences: boolean;
    removeRepeats: boolean;
    silenceThreshold: number;
    /** Target gap (seconds) left after trimming a silence. */
    silenceTargetGap?: number;
    fillerWords: string[];
  };
  /** B-Roll overlay settings — when enabled, generates AI image placements */
  broll?: {
    enabled: boolean;
    intervalSeconds: number;
    clipDuration: number;
    displayMode: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip';
    transition: 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down';
    pipSize: number;
    pipPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
  /** HyperFrames evidence-overlay settings. Takes precedence over stock B-roll. */
  promo?: {
    enabled: boolean;
    forceCta?: boolean;
    accentColor?: string;
    brandAssets?: Array<{
      id: string;
      category: 'app-ui' | 'community-proof' | 'growth-stat' | 'cta';
      mediaPath: string;
      tags?: string[];
    }>;
    ctaAssetId?: string;
  };
  /** Gemini API key — used for AI-generated B-Roll images and other AI features */
  geminiApiKey?: string;
  /** Pexels API key — used at render time to fetch stock images for image-
   *  archetype segments (split-image / fullscreen-image). */
  pexelsApiKey?: string;
  /** Style category hint for AI image generation (e.g. 'custom', 'cinematic', 'anime') */
  styleCategory?: string;
  /** Source video metadata for auto-manifest generation */
  sourceMeta?: {
    name: string;
    path: string;
    duration: number;
  };
  /** Output aspect ratio for rendered clips */
  outputAspectRatio?: '9:16' | '1:1' | '4:5' | '16:9';
  /** Filename template for rendered clips */
  filenameTemplate?: string;
}

interface RenderClipStartEvent {
  clipId: string;
  index: number;
  total: number;
  encoder: string;
  encoderIsHardware: boolean;
}

interface RenderClipProgressEvent {
  clipId: string;
  percent: number;
}

interface RenderClipDoneEvent {
  clipId: string;
  outputPath: string;
  /** One-line "what rendered vs. unavailable" note shown on the done row (RF-008). */
  summary?: string;
  /** Structured planned-versus-rendered proof for an approved long-form plan. */
  reconciliation?: LongformRenderReconciliation;
}

interface RenderClipErrorEvent {
  clipId: string;
  error: StructuredError;
  /** Full FFmpeg command string (included only in technical diagnostics). */
  ffmpegCommand?: string;
}

interface RenderBatchResultEvent {
  completed: number;
  failed: number;
  cancelled?: number;
  total: number;
  /** Absolute path to the exported manifest.csv, when one was written. */
  manifestCsvPath?: string;
  /** Absolute path to the exported manifest.json, when one was written. */
  manifestJsonPath?: string;
}

// ---------------------------------------------------------------------------
// Project / Recent Projects
// ---------------------------------------------------------------------------

interface LegacyProjectCleanupResult {
  status: 'already-clean' | 'cleaned';
  outputPath?: string;
  removedFieldCount: number;
}

// ---------------------------------------------------------------------------
// Api — exposed on window.api by the preload bridge
// ---------------------------------------------------------------------------

interface Api {
  platform: NodeJS.Platform;
  /** Apply native Chromium page zoom so layout breakpoints reflow at 200%. */
  setUiZoom: (factor: number) => void;

  // Source — file dialogs + FFmpeg metadata/extraction
  openFiles: () => Promise<string[]>;
  openDirectory: () => Promise<string | null>;
  selectCreatorAsset: (kind: 'logo' | 'evidence' | 'cta' | 'reference') => Promise<string | null>;
  checkCreatorAssets: (paths: string[]) => Promise<Array<{ path: string; exists: boolean }>>;
  getPathForFile: (file: File) => string;
  getMetadata: (filePath: string) => Promise<VideoMetadata>;
  extractAudio: (videoPath: string) => Promise<string>;
  getThumbnail: (videoPath: string, timeSec?: number) => Promise<string>;
  /** Extract audio amplitude peaks for the trim editor waveform visualizer. Returns ~500 normalized [0,1] values. */
  getWaveform: (
    videoPath: string,
    startTime: number,
    endTime: number,
    numPoints?: number,
  ) => Promise<number[]>;

  // YouTube
  downloadYouTube: (url: string) => Promise<YouTubeDownloadResult>;
  onYouTubeProgress: (callback: (data: { percent: number }) => void) => () => void;

  // Transcription
  transcribeVideo: (videoPath: string) => Promise<TranscriptionResult>;
  formatTranscriptForAI: (result: TranscriptionResult) => Promise<string>;
  onTranscribeProgress: (callback: (data: TranscriptionProgress) => void) => () => void;

  // Python process cancellation — SIGTERMs any in-flight Python child
  // (transcribe.py / download.py / face_detect.py). Resolves with the count killed.
  cancelPython: () => Promise<number>;

  // AI scoring & generation
  scoreTranscript: (
    apiKey: string,
    transcript: string,
    duration: number,
    targetDuration?: string,
    targetAudience?: string,
  ) => Promise<ScoringResult>;
  promoSplit: (
    words: WordTimestamp[],
    options?: { triggerWord?: string; minDurationSeconds?: number },
  ) => Promise<PromoClip[]>;
  onScoringProgress: (callback: (data: ScoringProgress) => void) => () => void;
  generateHookText: (
    apiKey: string,
    transcript: string,
    videoSummary?: string,
    keyTopics?: string[],
  ) => Promise<string>;
  rescoreSingleClip: (
    apiKey: string,
    clipText: string,
    clipDuration: number,
  ) => Promise<{ score: number; reasoning: string; hookText: string }>;
  generateRehookText: (
    apiKey: string,
    transcript: string,
    clipStart: number,
    clipEnd: number,
    videoSummary?: string,
    keyTopics?: string[],
  ) => Promise<string>;
  validateGeminiKey: (apiKey: string) => Promise<ConnectionValidationResult>;
  validatePexelsKey: (apiKey: string) => Promise<ConnectionValidationResult>;
  // Curiosity Gap Detector
  detectCuriosityGaps: (
    apiKey: string,
    transcript: TranscriptionResult,
    formattedTranscript: string,
    videoDuration: number,
  ) => Promise<CuriosityGap[]>;
  optimizeClipBoundaries: (
    gap: CuriosityGap,
    originalStart: number,
    originalEnd: number,
    transcript: TranscriptionResult,
  ) => Promise<ClipBoundary>;
  optimizeClipEndpoints: (
    mode: string,
    clipStart: number,
    clipEnd: number,
    transcript: TranscriptionResult,
    gap?: CuriosityGap,
  ) => Promise<ClipBoundary>;
  rankClipsByCuriosity: (
    clips: CuriosityClipCandidate[],
    gaps: CuriosityGap[],
  ) => Promise<CuriosityClipCandidate[]>;

  // Description Generator
  generateClipDescription: (
    apiKey: string,
    transcript: string,
    clipContext?: string,
    hookTitle?: string,
  ) => Promise<ClipDescription>;
  generateBatchDescriptions: (
    apiKey: string,
    clips: DescriptionClipInput[],
  ) => Promise<ClipDescription[]>;

  // Word Emphasis
  analyzeWordEmphasis: (words: WordTimestamp[], apiKey?: string) => Promise<WordEmphasisResult>;

  // Stitched Clips
  generateStitchedClips: (
    apiKey: string,
    formattedTranscript: string,
    videoDuration: number,
    existingClips: Array<{ startTime: number; endTime: number; score: number; text: string }>,
    targetAudience?: string,
  ) => Promise<StitchGenerationResultIPC>;
  onStitchProgress: (callback: (data: StitchGenerationProgressIPC) => void) => () => void;

  // Long-form (Hormozi 16:9) edit plan
  generateLongformEditPlan: (
    apiKey: string,
    words: WordTimestamp[],
    videoDuration: number,
    feedback?: string[],
    options?: Pick<
      LongformGenerationRequest,
      'requestId' | 'mode' | 'storyboardStyle' | 'previousPlan' | 'preservedSceneIds' | 'sectionIds'
    >,
  ) => Promise<LongformEditPlan>;
  cancelLongformEditPlan: (requestId?: string) => Promise<void>;
  onLongformEditProgress: (
    callback: (data: LongformPlanningProgress & { stage: 'ai-editing' }) => void,
  ) => () => void;
  renderLongformScenePreview: (request: LongformScenePreviewRequest) => Promise<string>;
  cancelLongformScenePreview: (requestId: string) => Promise<void>;
  cleanupLongformScenePreview: (path: string) => Promise<void>;

  // Face detection
  detectFaceCrops: (
    videoPath: string,
    segments: { start: number; end: number }[],
  ) => Promise<FaceCropResult[]>;
  onFaceDetectionProgress: (callback: (data: FaceDetectionProgress) => void) => () => void;

  // Captions
  generateCaptions: (
    words: WordTimestamp[],
    style: CaptionStyleInput,
    outputPath?: string,
  ) => Promise<string>;

  // Render pipeline
  startBatchRender: (options: RenderBatchOptions) => Promise<{ started: boolean }>;
  cancelRender: () => Promise<void>;
  stopRenderAfterCurrent: () => Promise<void>;
  cancelQueuedRenderJob: (clipId: string) => Promise<void>;
  onRenderClipStart: (callback: (data: RenderClipStartEvent) => void) => () => void;
  onRenderClipPrepare: (
    callback: (data: { clipId: string; message: string; percent: number }) => void,
  ) => () => void;
  onRenderClipProgress: (callback: (data: RenderClipProgressEvent) => void) => () => void;
  onRenderClipDone: (callback: (data: RenderClipDoneEvent) => void) => () => void;
  onRenderClipError: (callback: (data: RenderClipErrorEvent) => void) => () => void;
  onRenderClipCancelled: (callback: (data: { clipId: string }) => void) => () => void;
  onRenderBatchDone: (callback: (data: RenderBatchResultEvent) => void) => () => void;
  onRenderCancelled: (callback: (data: RenderBatchResultEvent) => void) => () => void;
  /**
   * Fired when an image-archetype segment falls back to talking-head at
   * render time (e.g. no image available). UI can surface a notice.
   */
  onSegmentFallback: (
    callback: (data: {
      clipId: string;
      segmentIndex: number;
      archetype: string;
      reason: string;
    }) => void,
  ) => () => void;
  /** Fast preview with all overlays at the locked 1080×1920 canvas. */
  renderPreview: (config: {
    sourceVideoPath: string;
    startTime: number;
    endTime: number;
    cropRegion?: { x: number; y: number; width: number; height: number };
    cropTimeline?: Array<{
      startTime: number;
      endTime: number;
      x: number;
      y: number;
      width: number;
      height: number;
      faceDetected: boolean;
    }>;
    wordTimestamps?: WordTimestamp[];
    hookTitleText?: string;
    rehookText?: string;
    captionsEnabled?: boolean;
    captionStyle?: CaptionStyleInput;
    /** Percentage centers shared by the editor, preview, and export. */
    templateLayout?: {
      titleText: { x: number; y: number };
      subtitles: { x: number; y: number };
    };
    hookTitleOverlay?: HookTitleOverlaySettings;
    rehookOverlay?: RehookOverlaySettings;
    wordEmphasisEnabled?: boolean;
    shotTransitionsEnabled?: boolean;
    autoZoom?: AutoZoomSettings;
    /** Per-clip accent color — overrides highlight/emphasis colors across all overlays */
    accentColor?: string;
    segments?: import('@shared/types').VideoSegment[];
    stylePresetId?: string;
    wordEmphasis?: import('@shared/types').EmphasizedWord[];
  }) => Promise<{ previewPath: string }>;
  cleanupPreview: (previewPath: string) => Promise<void>;

  // B-Roll
  generateBRollPlacements: (
    geminiApiKey: string,
    transcriptText: string,
    wordTimestamps: WordTimestamp[],
    clipStart: number,
    clipEnd: number,
    settings: {
      intervalSeconds: number;
      clipDuration: number;
      displayMode?: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip';
      transition?: 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down';
      pipSize?: number;
      pipPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    },
  ) => Promise<
    Array<{
      startTime: number;
      duration: number;
      videoPath: string;
      keyword: string;
      displayMode: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip';
      transition: 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down';
      pipSize: number;
      pipPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    }>
  >;
  generateBRollImage: (
    geminiApiKey: string,
    keyword: string,
    transcriptContext: string,
    styleCategory: string,
    duration: number,
  ) => Promise<{
    filePath: string;
    keyword: string;
    width: number;
    height: number;
    source: 'ai-generated';
    videoPath: string;
  } | null>;
  regenerateBRollImage: (
    geminiApiKey: string,
    keyword: string,
    transcriptContext: string,
    styleCategory: string,
    duration: number,
  ) => Promise<{
    filePath: string;
    keyword: string;
    width: number;
    height: number;
    source: 'ai-generated';
    videoPath: string;
  } | null>;

  // fal.ai Image Generation
  generateFalImage: (params: {
    prompt: string;
    aspectRatio: '9:16' | '1:1' | '16:9';
    apiKey: string;
  }) => Promise<string>;

  // HyperFrames overlays
  renderHyperFramesOverlay: (payload: {
    block:
      | 'popup-card'
      | 'icon-callout'
      | 'animated-label'
      | 'progress-indicator'
      | 'glowing-badge';
    props: {
      text?: string;
      color?: string;
      fontSize?: number;
      position?: { x: number; y: number };
      subtitle?: string;
      icon?: string;
      iconSize?: number;
      borderRadius?: number;
      animation?: 'typewriter' | 'slide' | 'fade';
      steps?: number;
      currentStep?: number;
      style?: 'dots' | 'bar' | 'circle';
      glowIntensity?: number;
      shape?: 'pill' | 'circle';
    };
    timing: { start: number; duration: number };
  }) => Promise<{
    movPath: string;
    duration: number;
    width: number;
    height: number;
  }>;

  // Export descriptions — write descriptions.{csv,json,txt} to outputDirectory
  exportDescriptions: (
    clips: Array<{
      clipName: string;
      score: number;
      duration: number;
      hookText: string;
      platforms: Array<{ platform: string; text: string; hashtags: string[] }>;
      shortDescription: string;
      hashtag: string;
    }>,
    outputDirectory: string,
    format: 'csv' | 'json' | 'txt',
  ) => Promise<string>;

  // Project save / load / recent
  saveProject: (json: string, options: ProjectSaveOptions) => Promise<string | null>;
  loadProject: () => Promise<ProjectLoadResult | null>;
  loadProjectFromPath: (filePath: string) => Promise<ProjectLoadResult | null>;
  autoSaveProject: (json: string, currentPath: string | null) => Promise<string>;
  loadRecovery: () => Promise<string | null>;
  clearRecovery: () => Promise<void>;
  cleanLegacyProject: () => Promise<LegacyProjectCleanupResult | null>;
  getRecentProjects: () => Promise<RecentProjectEntry[]>;
  addRecentProject: (entry: RecentProjectEntry) => Promise<void>;
  removeRecentProject: (path: string) => Promise<void>;
  setRecentProjectPinned: (path: string, pinned: boolean) => Promise<RecentProjectEntry[]>;
  renameRecentProject: (path: string, displayName: string) => Promise<RecentProjectRenameResult>;
  duplicateRecentProject: (path: string) => Promise<RecentProjectEntry>;
  deleteRecentProject: (path: string) => Promise<void>;
  consumePendingProjectOpen: () => Promise<string | null>;
  clearRecentProjects: () => Promise<void>;
  checkMediaPaths: (paths: string[]) => Promise<MediaPathStatus[]>;
  searchMediaFolder: (
    folderPath: string,
    sources: MediaSearchSource[],
  ) => Promise<MediaSearchResult>;
  onProjectNewRequest: (callback: () => void) => () => void;
  onProjectSaveRequest: (callback: () => void) => () => void;
  onProjectSaveAsRequest: (callback: () => void) => () => void;
  onProjectOpenRequest: (callback: () => void) => () => void;
  onProjectOpenRecentRequest: (callback: (data: { path: string }) => void) => () => void;

  // Native application menu
  onSettingsOpenRequest: (callback: () => void) => () => void;
  onKeyboardShortcutsRequest: (callback: () => void) => () => void;
  onWhatsNewRequest: (callback: () => void) => () => void;
  onUpdateCheckRequest: (callback: () => void) => () => void;
  onUiZoomRequest: (callback: (data: { direction: 'in' | 'out' | 'reset' }) => void) => () => void;
  setHistoryMenuState: (state: HistoryMenuState) => Promise<void>;
  onEditUndoRequest: (callback: () => void) => () => void;
  onEditRedoRequest: (callback: () => void) => () => void;

  // System
  getDiskSpace: (dirPath: string) => Promise<{ free: number; total: number }>;
  getEncoder: () => Promise<{ encoder: string; isHardware: boolean }>;
  getAvailableFonts: () => Promise<
    Array<{
      name: string;
      path: string;
      source: 'bundled' | 'system';
      category?: string;
      weight?: string;
    }>
  >;
  /** Get font file data as base64 string for renderer FontFace loading. */
  getFontData: (fontPath: string) => Promise<string | null>;
  sendNotification: (opts: NativeNotificationOptions) => Promise<void>;
  setNativeProgress: (update: NativeJobProgress) => Promise<void>;
  setPowerSaveActive: (active: boolean) => Promise<void>;
  onNotificationClicked: (callback: (data: NativeNotificationClick) => void) => () => void;
  getTempSize: () => Promise<{ bytes: number; count: number }>;
  cleanupTemp: () => Promise<{ deleted: number; freed: number }>;
  getCacheSize: () => Promise<{ bytes: number }>;
  setAutoCleanup: (enabled: boolean) => Promise<void>;
  getLogPath: () => Promise<string>;
  getLogSize: () => Promise<number>;
  exportLogs: (
    rendererErrors: Array<{ timestamp: number; source: string; message: string; details?: string }>,
  ) => Promise<{ exportPath: string } | null>;
  openLogFolder: () => Promise<void>;
  getResourceUsage: () => Promise<{
    cpu: { percent: number };
    ram: { usedBytes: number; totalBytes: number; appBytes: number };
    gpu: { percent: number; usedMB: number; totalMB: number; name: string } | null;
  }>;
  logToMain: (level: 'debug' | 'info' | 'warn' | 'error', source: string, message: string) => void;

  // Shell
  openPath: (path: string) => Promise<string>;
  showItemInFolder: (path: string) => Promise<void>;
  /**
   * Open the rendered-output directory in the OS file manager.
   * If `dirPath` is omitted, the main process opens the default location.
   * Returns an empty string on success or an error message on failure
   * (matches the underlying Electron `shell.openPath` contract).
   */
  openOutputFolder: (dirPath?: string) => Promise<string>;
  /**
   * Resolve the app-wide default output directory (`<OS Videos>/BatchClip`).
   * Used to seed `settings.outputDirectory` for zero-config rendering.
   */
  getDefaultOutputDirectory: () => Promise<string>;

  // Python setup
  getPythonStatus: () => Promise<PythonSetupStatus>;
  startPythonSetup: () => Promise<PythonSetupStartResult>;
  cancelPythonSetup: () => Promise<{ canceled: boolean }>;
  onPythonSetupProgress: (callback: (data: PythonSetupProgress) => void) => () => void;
  onPythonSetupDone: (callback: (data: PythonSetupDone) => void) => () => void;

  // AI Token Usage
  onAiTokenUsage: (callback: (data: TokenUsageEvent) => void) => () => void;

  // Settings Window
  openSettingsWindow: () => Promise<void>;
  closeSettingsWindow: () => Promise<void>;
  isSettingsWindowOpen: () => Promise<boolean>;
  onSettingsWindowClosed: (callback: (data: Record<string, never>) => void) => () => void;

  // Desktop lifecycle safety
  reportLifecycleState: (snapshot: LifecycleSnapshot) => Promise<void>;
  completeLifecyclePreparation: (result: LifecyclePrepareResult) => Promise<void>;
  requestAppRestart: (reason: AppRestartReason) => Promise<boolean>;
  onLifecyclePrepare: (callback: (request: LifecyclePrepareRequest) => void) => () => void;

  // Signed updates
  getUpdateState: () => Promise<AppUpdateState>;
  checkForUpdates: () => Promise<AppUpdateState>;
  downloadUpdate: () => Promise<AppUpdateState>;
  installUpdate: () => Promise<boolean>;
  onUpdateState: (callback: (state: AppUpdateState) => void) => () => void;

  // Secrets — encrypted API key storage (safeStorage-backed)
  secrets: {
    get: (name: string) => Promise<string | null>;
    set: (name: string, value: string) => Promise<void>;
    has: (name: string) => Promise<boolean>;
    clear: (name: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: Api;
  }
}
