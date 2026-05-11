import { ElectronAPI } from '@electron-toolkit/preload'

// ---------------------------------------------------------------------------
// Source — FFmpeg / dialog
// ---------------------------------------------------------------------------

interface VideoMetadata {
  duration: number
  width: number
  height: number
  codec: string
  fps: number
  audioCodec: string
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

interface YouTubeDownloadResult {
  path: string
  title: string
  duration: number
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

interface WordTimestamp {
  text: string
  start: number
  end: number
}

interface SegmentTimestamp {
  text: string
  start: number
  end: number
}

interface TranscriptionResult {
  text: string
  words: WordTimestamp[]
  segments: SegmentTimestamp[]
}

interface TranscriptionProgress {
  stage: 'extracting-audio' | 'downloading-model' | 'loading-model' | 'transcribing'
  message: string
  /** 0–100, present during downloading-model stage */
  percent?: number
}

// ---------------------------------------------------------------------------
// AI scoring & generation
// ---------------------------------------------------------------------------

interface ScoredSegment {
  startTime: number
  endTime: number
  text: string
  score: number
  hookText: string
  reasoning: string
}

interface ScoringResult {
  segments: ScoredSegment[]
  summary: string
  keyTopics: string[]
}

interface ScoringProgress {
  stage: 'sending' | 'analyzing' | 'validating'
  message: string
}

// ---------------------------------------------------------------------------
// Curiosity Gap Detector
// ---------------------------------------------------------------------------

interface CuriosityGap {
  openTimestamp: number
  resolveTimestamp: number
  type: 'question' | 'story' | 'claim' | 'pivot' | 'tease'
  score: number
  description: string
}

interface ClipBoundary {
  start: number
  end: number
  reason: string
}

interface CuriosityClipCandidate {
  startTime: number
  endTime: number
  score: number
  text?: string
  hookText?: string
  reasoning?: string
  curiosityScore?: number
  combinedScore?: number
}

// ---------------------------------------------------------------------------
// Description Generator
// ---------------------------------------------------------------------------

interface PlatformDescription {
  platform: 'youtube-shorts' | 'instagram-reels' | 'tiktok'
  text: string
  hashtags: string[]
}

interface ClipDescription {
  shortDescription: string
  hashtag: string
  longDescription?: string
  platforms: PlatformDescription[]
}

interface DescriptionClipInput {
  transcript: string
  hookText?: string
  reasoning?: string
}

// ---------------------------------------------------------------------------
// Word Emphasis
// ---------------------------------------------------------------------------

interface EmphasizedWord {
  text: string
  start: number
  end: number
  emphasis: 'normal' | 'emphasis' | 'supersize'
}

interface WordEmphasisResult {
  words: EmphasizedWord[]
  usedAI: boolean
}

// ---------------------------------------------------------------------------
// Face detection
// ---------------------------------------------------------------------------

interface CropRegion {
  x: number
  y: number
  width: number
  height: number
  faceDetected: boolean
}

/**
 * A time-ranged crop for a single scene within a clip. Times are in source-
 * video absolute seconds. Produced by face_detect.py when PySceneDetect finds
 * multiple scenes inside a clip's [start, end] window.
 */
interface CropTimelineEntry {
  startTime: number
  endTime: number
  x: number
  y: number
  width: number
  height: number
  faceDetected: boolean
}

/** What detectFaceCrops returns per input segment. */
interface FaceCropResult {
  crop: CropRegion
  timeline?: CropTimelineEntry[]
}

interface FaceDetectionProgress {
  segment: number
  total: number
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

interface CaptionStyleInput {
  fontName: string
  fontSize: number
  primaryColor: string
  highlightColor: string
  outlineColor: string
  backColor: string
  outline: number
  shadow: number
  borderStyle: number
  wordsPerLine: number
  animation: string
  emphasisColor?: string
  supersizeColor?: string
}

// ---------------------------------------------------------------------------
// Render pipeline
// ---------------------------------------------------------------------------

interface AutoZoomSettings {
  enabled: boolean
  mode: 'ken-burns' | 'reactive' | 'jump-cut'
  intensity: 'subtle' | 'medium' | 'dynamic'
  intervalSeconds: number
}

interface HookTitleOverlaySettings {
  enabled: boolean
  style: 'centered-bold' | 'top-bar' | 'slide-in'
  displayDuration: number
  fadeIn: number
  fadeOut: number
  fontSize: number
  textColor: string
  outlineColor: string
  outlineWidth: number
}

interface RehookOverlaySettings {
  enabled: boolean
  style: 'bar' | 'text-only' | 'slide-up'
  displayDuration: number
  fadeIn: number
  fadeOut: number
  positionFraction: number
}

interface RenderClipJob {
  clipId: string
  sourceVideoPath: string
  startTime: number
  endTime: number
  cropRegion?: { x: number; y: number; width: number; height: number }
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
  /** Path to a pre-generated .ass subtitle file to burn in */
  assFilePath?: string
  /** Optional override for the output filename (without extension) */
  outputFileName?: string
  /** Word-level timestamps (relative to source video). */
  wordTimestamps?: { text: string; start: number; end: number }[]
  /**
   * AI-generated hook title text to overlay in the first few seconds.
   * Corresponds to ClipCandidate.hookText from the scoring step.
   */
  hookTitleText?: string
  /**
   * Pre-generated re-hook / pattern interrupt text for the mid-clip overlay.
   * If omitted, the main process picks a deterministic default phrase.
   */
  rehookText?: string
  /** AI edit plan B-Roll suggestions — seeds keyword search for B-Roll placement engine. */
  brollSuggestions?: Array<{
    timestamp: number
    duration: number
    keyword: string
    displayMode: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip'
    transition: 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down'
  }>
  /**
   * When present, this job represents a segmented clip with per-segment
   * archetype treatment. The render pipeline routes to renderSegmentedClip()
   * instead of the normal single-segment path.
   */
  segmentedSegments?: Array<{
    id?: string
    captionText?: string
    startTime: number
    endTime: number
    archetype: import('@shared/types').Archetype
    zoomStyle?: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out'
    zoomIntensity?: number
    transitionIn?: import('@shared/types').TransitionType
    imagePath?: string
  }>
}

interface RenderBatchOptions {
  jobs: RenderClipJob[]
  outputDirectory: string
  /** Ken Burns auto-zoom settings applied to every rendered clip */
  autoZoom?: AutoZoomSettings
  /** Hook title overlay — burns AI-generated hook text into first 1-3 seconds of each clip */
  hookTitleOverlay?: HookTitleOverlaySettings
  /** Re-hook overlay — burns mid-clip pattern interrupt text to reset viewer attention */
  rehookOverlay?: RehookOverlaySettings
  /** When true, all FFmpeg commands are sent back in render events for debug logging. */
  developerMode?: boolean
  /** Number of clips to render concurrently (1–4). GPU encoders are capped at 2. */
  renderConcurrency?: number
  /** Render quality and output format settings. */
  renderQuality?: {
    preset: 'draft' | 'normal' | 'high' | 'custom'
    customCrf: number
    outputResolution: '1080x1920' | '720x1280' | '540x960'
    outputFormat: 'mp4' | 'webm'
    encodingPreset: 'ultrafast' | 'veryfast' | 'medium' | 'slow'
  }
  /**
   * Template layout — controls on-screen placement (% of canvas) for the
   * hook title and burned-in subtitles. The mid-clip re-hook overlay always
   * mirrors the title position; pass it through here on a render call.
   */
  templateLayout?: {
    titleText: { x: number; y: number }
    subtitles: { x: number; y: number }
    /** @deprecated Always mirrors titleText — do not set independently */
    rehookText: { x: number; y: number }
  }
  /** Whether captions are enabled (needed to know whether to re-sync captions) */
  captionsEnabled?: boolean
  /** Caption style for re-generating captions after filler removal */
  captionStyle?: CaptionStyleInput
  /** Filler / silence / repeat removal settings. */
  fillerRemoval?: {
    enabled: boolean
    removeFillerWords: boolean
    trimSilences: boolean
    removeRepeats: boolean
    silenceThreshold: number
    fillerWords: string[]
  }
  /** B-Roll overlay settings — when enabled, generates AI image placements */
  broll?: {
    enabled: boolean
    intervalSeconds: number
    clipDuration: number
    displayMode: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip'
    transition: 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down'
    pipSize: number
    pipPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  }
  /** Gemini API key — used for AI-generated B-Roll images and other AI features */
  geminiApiKey?: string
  /** Pexels API key — used at render time to fetch stock images for image-
   *  archetype segments (split-image / fullscreen-image). */
  pexelsApiKey?: string
  /** Style category hint for AI image generation (e.g. 'custom', 'cinematic', 'anime') */
  styleCategory?: string
  /** Source video metadata for auto-manifest generation */
  sourceMeta?: {
    name: string
    path: string
    duration: number
  }
  /** Output aspect ratio for rendered clips */
  outputAspectRatio?: '9:16' | '1:1' | '4:5' | '16:9'
  /** Filename template for rendered clips */
  filenameTemplate?: string
}

interface RenderClipStartEvent {
  clipId: string
  index: number
  total: number
  encoder: string
  encoderIsHardware: boolean
}

interface RenderClipProgressEvent {
  clipId: string
  percent: number
}

interface RenderClipDoneEvent {
  clipId: string
  outputPath: string
}

interface RenderClipErrorEvent {
  clipId: string
  error: string
  /** Full FFmpeg command string (always present; included on error and in developer mode). */
  ffmpegCommand?: string
}

interface RenderBatchResultEvent {
  completed: number
  failed: number
  total: number
}

// ---------------------------------------------------------------------------
// Project / Recent Projects
// ---------------------------------------------------------------------------

interface RecentProjectEntry {
  path: string
  name: string
  lastOpened: number
  clipCount: number
  sourceCount: number
}

// ---------------------------------------------------------------------------
// Python Setup
// ---------------------------------------------------------------------------

interface PythonSetupStatus {
  ready: boolean
  stage: string
  venvPath: string | null
  embeddedPythonAvailable: boolean
}

interface PythonSetupProgress {
  stage: 'downloading-python' | 'extracting' | 'creating-venv' | 'installing-packages' | 'verifying'
  message: string
  percent: number
  /** Current package being downloaded/installed (installing-packages stage only) */
  package?: string
  /** Number of packages installed so far */
  currentPackage?: number
  /** Total packages to install (estimated) */
  totalPackages?: number
}

// ---------------------------------------------------------------------------
// Api — exposed on window.api by the preload bridge
// ---------------------------------------------------------------------------

interface Api {
  // Source — file dialogs + FFmpeg metadata/extraction
  openFiles: () => Promise<string[]>
  openDirectory: () => Promise<string | null>
  getPathForFile: (file: File) => string
  getMetadata: (filePath: string) => Promise<VideoMetadata>
  extractAudio: (videoPath: string) => Promise<string>
  getThumbnail: (videoPath: string, timeSec?: number) => Promise<string>
  /** Extract audio amplitude peaks for the trim editor waveform visualizer. Returns ~500 normalized [0,1] values. */
  getWaveform: (
    videoPath: string,
    startTime: number,
    endTime: number,
    numPoints?: number
  ) => Promise<number[]>

  // YouTube
  downloadYouTube: (url: string) => Promise<YouTubeDownloadResult>
  onYouTubeProgress: (callback: (data: { percent: number }) => void) => () => void

  // Transcription
  transcribeVideo: (videoPath: string) => Promise<TranscriptionResult>
  formatTranscriptForAI: (result: TranscriptionResult) => Promise<string>
  onTranscribeProgress: (callback: (data: TranscriptionProgress) => void) => () => void

  // AI scoring & generation
  scoreTranscript: (
    apiKey: string,
    transcript: string,
    duration: number,
    targetDuration?: string,
    targetAudience?: string
  ) => Promise<ScoringResult>
  onScoringProgress: (callback: (data: ScoringProgress) => void) => () => void
  generateHookText: (
    apiKey: string,
    transcript: string,
    videoSummary?: string,
    keyTopics?: string[]
  ) => Promise<string>
  rescoreSingleClip: (
    apiKey: string,
    clipText: string,
    clipDuration: number
  ) => Promise<{ score: number; reasoning: string; hookText: string }>
  generateRehookText: (
    apiKey: string,
    transcript: string,
    clipStart: number,
    clipEnd: number,
    videoSummary?: string,
    keyTopics?: string[]
  ) => Promise<string>
  validateGeminiKey: (
    apiKey: string
  ) => Promise<{ valid: boolean; error?: string; warning?: string }>
  // Curiosity Gap Detector
  detectCuriosityGaps: (
    apiKey: string,
    transcript: TranscriptionResult,
    formattedTranscript: string,
    videoDuration: number
  ) => Promise<CuriosityGap[]>
  optimizeClipBoundaries: (
    gap: CuriosityGap,
    originalStart: number,
    originalEnd: number,
    transcript: TranscriptionResult
  ) => Promise<ClipBoundary>
  optimizeClipEndpoints: (
    mode: string,
    clipStart: number,
    clipEnd: number,
    transcript: TranscriptionResult,
    gap?: CuriosityGap
  ) => Promise<ClipBoundary>
  rankClipsByCuriosity: (
    clips: CuriosityClipCandidate[],
    gaps: CuriosityGap[]
  ) => Promise<CuriosityClipCandidate[]>

  // Description Generator
  generateClipDescription: (
    apiKey: string,
    transcript: string,
    clipContext?: string,
    hookTitle?: string
  ) => Promise<ClipDescription>
  generateBatchDescriptions: (
    apiKey: string,
    clips: DescriptionClipInput[]
  ) => Promise<ClipDescription[]>

  // Word Emphasis
  analyzeWordEmphasis: (words: WordTimestamp[], apiKey?: string) => Promise<WordEmphasisResult>

  // Face detection
  detectFaceCrops: (
    videoPath: string,
    segments: { start: number; end: number }[]
  ) => Promise<FaceCropResult[]>
  onFaceDetectionProgress: (callback: (data: FaceDetectionProgress) => void) => () => void

  // Captions
  generateCaptions: (
    words: WordTimestamp[],
    style: CaptionStyleInput,
    outputPath?: string
  ) => Promise<string>

  // Render pipeline
  startBatchRender: (options: RenderBatchOptions) => Promise<{ started: boolean }>
  cancelRender: () => Promise<void>
  onRenderClipStart: (callback: (data: RenderClipStartEvent) => void) => () => void
  onRenderClipPrepare: (
    callback: (data: { clipId: string; message: string; percent: number }) => void
  ) => () => void
  onRenderClipProgress: (callback: (data: RenderClipProgressEvent) => void) => () => void
  onRenderClipDone: (callback: (data: RenderClipDoneEvent) => void) => () => void
  onRenderClipError: (callback: (data: RenderClipErrorEvent) => void) => () => void
  onRenderBatchDone: (callback: (data: RenderBatchResultEvent) => void) => () => void
  onRenderCancelled: (callback: (data: RenderBatchResultEvent) => void) => () => void
  /**
   * Fired when an image-archetype segment falls back to talking-head at
   * render time (e.g. no image available). UI can surface a notice.
   */
  onSegmentFallback: (
    callback: (data: {
      clipId: string
      segmentIndex: number
      archetype: string
      reason: string
    }) => void
  ) => () => void
  /** Fast low-quality preview with all overlays applied (540×960, ultrafast). */
  renderPreview: (config: {
    sourceVideoPath: string
    startTime: number
    endTime: number
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
    wordTimestamps?: WordTimestamp[]
    hookTitleText?: string
    captionsEnabled?: boolean
    captionStyle?: CaptionStyleInput
    hookTitleOverlay?: HookTitleOverlaySettings
    autoZoom?: AutoZoomSettings
    /** Per-clip accent color — overrides highlight/emphasis colors across all overlays */
    accentColor?: string
  }) => Promise<{ previewPath: string }>
  cleanupPreview: (previewPath: string) => Promise<void>

  // B-Roll
  generateBRollPlacements: (
    geminiApiKey: string,
    transcriptText: string,
    wordTimestamps: WordTimestamp[],
    clipStart: number,
    clipEnd: number,
    settings: {
      intervalSeconds: number
      clipDuration: number
      displayMode?: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip'
      transition?: 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down'
      pipSize?: number
      pipPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    }
  ) => Promise<
    Array<{
      startTime: number
      duration: number
      videoPath: string
      keyword: string
      displayMode: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip'
      transition: 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down'
      pipSize: number
      pipPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    }>
  >
  generateBRollImage: (
    geminiApiKey: string,
    keyword: string,
    transcriptContext: string,
    styleCategory: string,
    duration: number
  ) => Promise<{
    filePath: string
    keyword: string
    width: number
    height: number
    source: 'ai-generated'
    videoPath: string
  } | null>
  regenerateBRollImage: (
    geminiApiKey: string,
    keyword: string,
    transcriptContext: string,
    styleCategory: string,
    duration: number
  ) => Promise<{
    filePath: string
    keyword: string
    width: number
    height: number
    source: 'ai-generated'
    videoPath: string
  } | null>

  // fal.ai Image Generation
  generateFalImage: (params: {
    prompt: string
    aspectRatio: '9:16' | '1:1' | '16:9'
    apiKey: string
  }) => Promise<string>

  // Export descriptions — write descriptions.{csv,json,txt} to outputDirectory
  exportDescriptions: (
    clips: Array<{
      clipName: string
      score: number
      duration: number
      hookText: string
      platforms: Array<{ platform: string; text: string; hashtags: string[] }>
      shortDescription: string
      hashtag: string
    }>,
    outputDirectory: string,
    format: 'csv' | 'json' | 'txt'
  ) => Promise<string>

  // Project save / load / recent
  saveProject: (json: string) => Promise<string | null>
  loadProject: () => Promise<string | null>
  loadProjectFromPath: (filePath: string) => Promise<string | null>
  autoSaveProject: (json: string) => Promise<string>
  loadRecovery: () => Promise<string | null>
  clearRecovery: () => Promise<void>
  getRecentProjects: () => Promise<RecentProjectEntry[]>
  addRecentProject: (entry: RecentProjectEntry) => Promise<void>
  removeRecentProject: (path: string) => Promise<void>
  clearRecentProjects: () => Promise<void>

  // System
  getDiskSpace: (dirPath: string) => Promise<{ free: number; total: number }>
  getEncoder: () => Promise<{ encoder: string; isHardware: boolean }>
  getAvailableFonts: () => Promise<
    Array<{
      name: string
      path: string
      source: 'bundled' | 'system'
      category?: string
      weight?: string
    }>
  >
  /** Get font file data as base64 string for renderer FontFace loading. */
  getFontData: (fontPath: string) => Promise<string | null>
  sendNotification: (opts: { title: string; body: string; silent?: boolean }) => Promise<void>
  getTempSize: () => Promise<{ bytes: number; count: number }>
  cleanupTemp: () => Promise<{ deleted: number; freed: number }>
  getCacheSize: () => Promise<{ bytes: number }>
  setAutoCleanup: (enabled: boolean) => Promise<void>
  getLogPath: () => Promise<string>
  getLogSize: () => Promise<number>
  exportLogs: (
    rendererErrors: Array<{ timestamp: number; source: string; message: string; details?: string }>
  ) => Promise<{ exportPath: string } | null>
  openLogFolder: () => Promise<void>
  getResourceUsage: () => Promise<{
    cpu: { percent: number }
    ram: { usedBytes: number; totalBytes: number; appBytes: number }
    gpu: { percent: number; usedMB: number; totalMB: number; name: string } | null
  }>

  // Shell
  openPath: (path: string) => Promise<string>
  showItemInFolder: (path: string) => Promise<void>
  /**
   * Open the rendered-output directory in the OS file manager.
   * If `dirPath` is omitted, the main process opens the default location.
   * Returns an empty string on success or an error message on failure
   * (matches the underlying Electron `shell.openPath` contract).
   */
  openOutputFolder: (dirPath?: string) => Promise<string>

  // Python setup
  getPythonStatus: () => Promise<PythonSetupStatus>
  startPythonSetup: () => Promise<{ started: boolean }>
  onPythonSetupProgress: (callback: (data: PythonSetupProgress) => void) => () => void
  onPythonSetupDone: (callback: (data: { success: boolean; error?: string }) => void) => () => void

  // AI Token Usage
  onAiTokenUsage: (
    callback: (data: {
      source: string
      promptTokens: number
      completionTokens: number
      totalTokens: number
      model: string
      timestamp: number
    }) => void
  ) => () => void

  // Settings Window
  openSettingsWindow: () => Promise<void>
  closeSettingsWindow: () => Promise<void>
  isSettingsWindowOpen: () => Promise<boolean>
  onSettingsWindowClosed: (callback: (data: Record<string, never>) => void) => () => void

  // Secrets — encrypted API key storage (safeStorage-backed)
  secrets: {
    get: (name: string) => Promise<string | null>
    set: (name: string, value: string) => Promise<void>
    has: (name: string) => Promise<boolean>
    clear: (name: string) => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
