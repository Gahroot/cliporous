import type { TokenUsageAggregate, TokenUsageEvent } from '@shared/ai-usage';
import type { StructuredError, StructuredErrorInput } from '@shared/errors';
import type { CreatorJob } from '@shared/jobs';
import type { Palette } from '@shared/palettes';
import type { ProjectIdentity, ProjectSaveStatus } from '@shared/project';
import type { PythonSetupProgress, PythonSetupStatus } from '@shared/python-setup';
import type {
  CaptionAnimation,
  CaptionBackgroundBox,
  CaptionEmphasisStyle,
  CaptionShadowStyle,
  CaptionStyleSchema,
  CaptionSupersizeStyle,
  ClipBoundary,
  ClipEndMode,
  CropRegion,
  CropRegionSource,
  CropTimelineEntry,
  CuriosityClipCandidate,
  CuriosityGap,
  FaceDetectionProgress,
  HookTitleStyle,
  LongformSkinId,
  OutputAspectRatio,
  Platform,
  RehookStyle,
  ScoredSegment,
  ScoringProgress,
  ScoringResult,
  SegmentTimestamp,
  ShotBreakReason,
  ShotSegment,
  ShotSegmentationResult,
  SourceRange,
  StitchedClipRole,
  TargetDuration,
  TextCase,
  TranscriptionResult,
  WordAnimationType,
  WordTimestamp,
  ZoomIntensity,
  ZoomMode,
} from '@shared/types';

// Re-export shared types so existing component imports from store don't break
export type {
  CaptionAnimation,
  CaptionBackgroundBox,
  CaptionEmphasisStyle,
  CaptionShadowStyle,
  CaptionStyleSchema,
  CaptionSupersizeStyle,
  ClipBoundary,
  ClipEndMode,
  CropRegion,
  CropRegionSource,
  CropTimelineEntry,
  CuriosityClipCandidate,
  CuriosityGap,
  FaceDetectionProgress,
  HookTitleStyle,
  OutputAspectRatio,
  Platform,
  RehookStyle,
  ScoredSegment,
  ScoringProgress,
  ScoringResult,
  SegmentTimestamp,
  ShotBreakReason,
  ShotSegment,
  ShotSegmentationResult,
  SourceRange,
  StitchedClipRole,
  TargetDuration,
  TextCase,
  TranscriptionResult,
  WordAnimationType,
  WordTimestamp,
  ZoomIntensity,
  ZoomMode,
};

/**
 * Template Layout — on-canvas placement (percentage of 1080×1920) for the
 * two repositionable text overlays. Edited via the Template Editor dialog
 * and forwarded to the render pipeline as `BatchRenderOptions.templateLayout`.
 *
 * Coordinates are 0–100 and represent the centre of the element relative to
 * the top-left of the canvas. Render-side code clamps to the platform
 * safe-zone before applying.
 */
export interface TemplateLayout {
  /** Hook / on-screen title text — read by the hook-title and rehook features. */
  titleText: { x: number; y: number };
  /** Burned-in subtitles / captions baseline — read by the captions feature. */
  subtitles: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type MediaAvailability = 'checking' | 'online' | 'offline';

export interface SourceVideo {
  id: string;
  path: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  thumbnail?: string;
  origin: 'file' | 'youtube';
  youtubeUrl?: string;
  /** Runtime availability, refreshed whenever a project opens. */
  mediaStatus?: MediaAvailability;
}

/** Extends the shared TranscriptionResult with the pre-formatted AI transcript. */
export interface TranscriptionData extends TranscriptionResult {
  formattedForAI: string;
}

export interface PartInfoUI {
  arcId: string;
  partNumber: number;
  totalParts: number;
  partTitle: string;
  endCardText: string;
}

/**
 * Per-clip render setting overrides.
 * Each key is either `true` (force on), `false` (force off), or absent (use global).
 */
export interface ClipRenderSettings {
  enableFillerRemoval?: boolean;
  enableCaptions?: boolean;
  enableHookTitle?: boolean;
  /** Per-clip control for the registered mid-clip re-hook render feature. */
  enableRehook?: boolean;
  /** Creator-approved re-hook copy. An empty value keeps the renderer fallback. */
  rehookText?: string;
  enableAutoZoom?: boolean;
  enableBroll?: boolean;
  enableWordEmphasis?: boolean;
  enableShotTransitions?: boolean;
  enableHyperframes?: boolean;
  /** 'default' = face-centred crop; 'blur-background' = letterboxed with blurred background */
  layout?: 'default' | 'blur-background';
  /**
   * Per-clip accent color (CSS hex, e.g. '#FF6B35').
   * When set, overrides highlight/emphasis colors in captions, hook title
   * text color, and rehook text color — painting the whole edit with one colour.
   */
  accentColor?: string;
  /**
   * Per-clip caption mode. Overrides the global PRESTYJ caption mode at
   * render time for this clip only. One of the three V2 caption modes.
   */
  captionMode?: 'standard' | 'emphasis' | 'emphasis_highlight' | 'editorial';
}

export interface ClipCandidate {
  id: string;
  sourceId: string;
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
  score: number;
  /** Transcript-created candidates remain explicitly unscored until a creator requests an AI read. */
  scoreSource?: 'ai' | 'manual';
  /** The score assigned by the initial AI scoring pass — never overwritten after first set. */
  originalScore?: number;
  hookText: string;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected';
  cropRegion?: CropRegion;
  /**
   * Per-scene crops in source-video absolute seconds. Produced by face
   * detection when PySceneDetect finds more than one scene inside the clip.
   */
  cropTimeline?: CropTimelineEntry[];
  /** Who set the crop — 'auto' (face detection) or 'manual' (user drag). */
  cropRegionSource?: CropRegionSource;
  thumbnail?: string;
  customThumbnail?: string;
  wordTimestamps?: WordTimestamp[];
  loopScore?: number;
  loopStrategy?: string;
  loopOptimized?: boolean;
  crossfadeDuration?: number;
  partInfo?: PartInfoUI;
  /** Per-clip render overrides — take precedence over global settings at render time. */
  overrides?: ClipRenderSettings;
  /** Original AI-selected start/end — set once in setClips, never overwritten. */
  aiStartTime?: number;
  aiEndTime?: number;
  /** AI Edit Plan for this clip. Generated by a single Gemini call. */
  aiEditPlan?: import('@shared/types').AIEditPlan;
  /** Shot segmentation — breaks this clip into 4-6 second "shots" at natural break points. */
  shots?: import('@shared/types').ShotSegment[];
  /** Per-shot style assignments — maps each shot to a style preset ID. */
  shotStyles?: import('@shared/types').ShotStyleAssignment[];
  /** Detected filler segments for this clip (absolute timestamps from source) */
  fillerSegments?: FillerSegmentUI[];
  /** Indices of filler segments the user has restored (won't be cut) */
  restoredFillerIndices?: number[];
  /** Time saved by filler removal (seconds) */
  fillerTimeSaved?: number;
  /** Face-tracking timeline for animated crop. */
  faceTimeline?: Array<{ t: number; x: number; y: number; w: number; h: number }>;
  /** Per-scene archetype-stamped segments. Produced by the segmenting stage and
   *  consumed by render-service when building segmentedSegments on the render job. */
  segments?: import('@shared/types').VideoSegment[];
}

/**
 * A stitched clip candidate — a single coherent short composed of multiple
 * non-contiguous source ranges. Parallel to ClipCandidate; carried in its own
 * slice so scalar-range fields on ClipCandidate stay untouched.
 */
export interface StitchedClipCandidate {
  id: string;
  sourceId: string;
  /** 2+ non-contiguous source ranges that compose this clip. */
  sourceRanges: SourceRange[];
  /** Sum of all (endTime - startTime) over sourceRanges. */
  duration: number;
  /** Concatenated transcript across all ranges, in narrative order. */
  text: string;
  score: number;
  /** Set once when stitched clip is first created; never overwritten. */
  originalScore?: number;
  hookText: string;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected';
  /**
   * Pre-filtered word timestamps from the source transcription — every word
   * whose [start, end] falls inside any range. Times are still absolute
   * source-video time; the render pipeline remaps to concat-time at render.
   */
  wordTimestamps?: WordTimestamp[];
  thumbnail?: string;
  customThumbnail?: string;
  /** Per-clip render overrides — identical semantics to ClipCandidate.overrides. */
  overrides?: ClipRenderSettings;
  /**
   * In-clip archetype rotation, produced by the stitched segmenting pass on
   * the clip-local word list (after virtual remap). Times are clip-local
   * (0-based on the concatenated timeline), not source-time.
   */
  segments?: import('@shared/types').VideoSegment[];
  /** Face crop region applied as a fallback when no per-range crop is available. */
  cropRegion?: CropRegion;
  /** Per-range face crops (one per sourceRanges entry, same index order). */
  rangeCropRects?: Array<{ x: number; y: number; width: number; height: number }>;
}

/** Filler segment as stored in the renderer — mirrors the main-process FillerSegment type. */
export interface FillerSegmentUI {
  start: number;
  end: number;
  type: 'filler' | 'silence' | 'repeat';
  label: string;
}

export type PipelineStage =
  | 'idle'
  | 'downloading'
  | 'transcribing'
  | 'scoring'
  | 'stitching'
  | 'optimizing-loops'
  | 'detecting-faces'
  | 'ai-editing'
  | 'segmenting'
  | 'ready'
  | 'rendering'
  | 'done'
  | 'error';

export interface PipelineProgress {
  stage: PipelineStage;
  message: string;
  percent: number;
}

export type RenderQueueItemKind = 'clip' | 'stitched' | 'longform';

export interface RenderPreparationActivity {
  id: string;
  label: string;
  status: 'running' | 'done';
  timestamp: number;
}

export interface RenderFallbackWarning {
  id: string;
  message: string;
  reason: string;
  actionable: boolean;
  timestamp: number;
}

export interface RenderProgress {
  clipId: string;
  kind?: RenderQueueItemKind;
  label?: string;
  sourceId?: string;
  durationSeconds?: number;
  requiresVisualAssets?: boolean;
  queuePosition?: number;
  optionsHash?: string;
  percent: number;
  status: 'queued' | 'preparing' | 'rendering' | 'done' | 'error' | 'cancelled';
  error?: StructuredError;
  outputPath?: string;
  /** FFmpeg command string captured at render time (populated on error, or always in developer mode). */
  ffmpegCommand?: string;
  /** Current creator-facing preparation activity. */
  prepareMessage?: string;
  /** Current and recent preparation events, newest last. */
  preparationActivities?: RenderPreparationActivity[];
  /** Visual substitutions made while preserving a playable output. */
  fallbacks?: RenderFallbackWarning[];
  /** Safe milestones retained across save, recovery, and restart. */
  checkpoints?: Array<'prepared' | 'encoded' | 'output-verified'>;
  queuedAt?: number;
  startedAt?: number;
  completedAt?: number;
  estimatedRenderSeconds?: number;
  estimatedSizeBytes?: number;
  /** One-line post-render note: what rendered vs. what was unavailable (RF-008). */
  summary?: string;
}

export interface ZoomSettings {
  enabled: boolean;
  mode: ZoomMode;
  intensity: ZoomIntensity;
  intervalSeconds: number;
}

export interface HookTitleOverlaySettings {
  enabled: boolean;
  style: HookTitleStyle;
  displayDuration: number;
  fadeIn: number;
  fadeOut: number;
  fontSize: number;
  textColor: string;
  outlineColor: string;
  outlineWidth: number;
}

/** Settings for the mid-clip re-hook / pattern interrupt text overlay. */
export interface RehookOverlaySettings {
  enabled: boolean;
  style: RehookStyle;
  displayDuration: number;
  fadeIn: number;
  fadeOut: number;
  positionFraction: number;
}

export interface BRollSettings {
  enabled: boolean;
  intervalSeconds: number;
  clipDuration: number;
  displayMode: BRollDisplayMode;
  transition: BRollTransition;
  pipSize: number;
  pipPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export type BRollDisplayMode = 'fullscreen' | 'split-top' | 'split-bottom' | 'pip';
export type BRollTransition = 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down';

/**
 * Promo Mode — talking-head "evidence pop-up" render mode. When enabled the
 * render pipeline ignores stock B-Roll and injects Media Master / Skool
 * evidence pops plus a forced Skool CTA. Mirrors `RenderBatchOptions.promo`
 * on the main side (`src/main/render/types.ts`).
 */
export interface PromoSettings {
  enabled: boolean;
  /** Force the Skool CTA onto every clip's end. */
  forceCta: boolean;
  /** Accent color for evidence templates. Defaults to PRESTYJ violet. */
  accentColor: string;
}

/**
 * Preset for filler/silence removal aggressiveness.
 *
 * - `let-it-ride` (default): keep discourse markers, trim only long pauses,
 *   leave breath. Optimised for coherence in long-form explanatory speech.
 * - `tight`: cut hesitation + discourse markers + short pauses. Optimised
 *   for short hook-driven clips where every second matters.
 * - `custom`: user has hand-tuned individual fields.
 */
export type FillerRemovalPreset = 'let-it-ride' | 'tight' | 'custom';

export interface FillerRemovalSettings {
  enabled: boolean;
  /** Which named preset these values reflect. */
  preset: FillerRemovalPreset;
  removeFillerWords: boolean;
  trimSilences: boolean;
  removeRepeats: boolean;
  /** Minimum gap (seconds) considered a removable silence. */
  silenceThreshold: number;
  /** Target gap (seconds) to leave after trimming a silence. */
  silenceTargetGap: number;
  fillerWords: string[];
}

export type RenderQualityPreset = 'draft' | 'normal' | 'high' | 'custom';
export type OutputResolution = '1080x1920' | '720x1280' | '540x960';
export type OutputFormat = 'mp4' | 'webm';
export type EncodingPreset = 'ultrafast' | 'veryfast' | 'medium' | 'slow';

export interface RenderQualitySettings {
  preset: RenderQualityPreset;
  customCrf: number;
  outputResolution: OutputResolution;
  outputFormat: OutputFormat;
  encodingPreset: EncodingPreset;
}

export type CreatorPresetId = 'clean' | 'signature' | 'visual' | 'custom';
export type CaptionMode = 'standard' | 'emphasis' | 'emphasis_highlight' | 'editorial';

export interface AppSettings {
  geminiApiKey: string;
  /** fal.ai API key for AI-generated B-roll images. */
  falApiKey: string;
  /** Pexels API key for stock B-roll fetch. Loaded from safeStorage. */
  pexelsApiKey: string;
  outputDirectory: string | null;
  /** App-scoped autosave debounce interval, hydrated from safeStorage. */
  autosaveIntervalMs: number;
  minScore: number;
  /** Creator-facing recipe. Advanced changes move this to `custom`. */
  creatorPreset: CreatorPresetId;
  captionsEnabled: boolean;
  captionMode: CaptionMode;
  wordEmphasisEnabled: boolean;
  shotTransitionsEnabled: boolean;
  /** Transcript-driven animated explainer scenes on the top half of shorts. */
  explainerScenesEnabled: boolean;
  autoZoom: ZoomSettings;
  hookTitleOverlay: HookTitleOverlaySettings;
  rehookOverlay: RehookOverlaySettings;
  broll: BRollSettings;
  promo: PromoSettings;
  fillerRemoval: FillerRemovalSettings;
  enableNotifications: boolean;
  /** When true, all FFmpeg commands are logged to the error log during rendering. */
  developerMode: boolean;
  renderQuality: RenderQualitySettings;
  outputAspectRatio: OutputAspectRatio;
  /** Template for rendered clip filenames. */
  filenameTemplate: string;
  /** Number of clips to render in parallel (1–4). */
  renderConcurrency: number;
  /** On-canvas placement for the hook title and subtitle overlays. */
  templateLayout: TemplateLayout;
  /** Platform whose UI dead-zones are previewed in the Template Editor. */
  targetPlatform: Platform;
  /**
   * Output mode for a dropped source.
   *   • 'short'    — the locked 9:16 clip-extraction pipeline (default).
   *   • 'longform' — the Hormozi-style 16:9 single-video edit pipeline.
   */
  outputMode: OutputMode;
  /** Visual skin applied to every long-form content block. */
  longformSkin: LongformSkinId;
  /**
   * Id of the color palette applied to long-form block renders. Resolved
   * against `customPalettes` then the built-in presets (see
   * `getPaletteById` in `@shared/palettes`). Separate axis from the skin.
   */
  longformPaletteId: string;
  /** User-created color palettes (in addition to the built-in presets). */
  customPalettes: Palette[];
}

/** Output mode for a dropped source video. */
export type OutputMode = 'short' | 'longform';

export type { Palette } from '@shared/palettes';
export type { LongformSkinId } from '@shared/types';

export interface ProcessingConfig {
  targetDuration: TargetDuration;
  enablePerfectLoop: boolean;
  clipEndMode: ClipEndMode;
  enableMultiPart: boolean;
  /** Run the AI edit orchestrator after scoring — generates word emphasis, B-Roll, and SFX plans for every clip. */
  enableAiEdit: boolean;
  /** Target audience description used to filter clips for relevance. */
  targetAudience: string;
  /**
   * Promo Mode ("Media Master demo mode"). When true, the clip-creation path
   * bypasses AI scoring and splits the recording on spoken markers
   * ("clip one … clip two …") — one clip candidate per segment.
   */
  promoMode: boolean;
}

export type ClipFilter = 'all' | 'unreviewed' | 'approved' | 'rejected' | 'stitched';
export type ClipSort = 'score' | 'source-time' | 'duration' | 'status';
export type InspectorTab = 'edit' | 'transcript';

export type CreativeBriefFields = {
  audience: string;
  goal: string;
  callToAction: string;
  tone: string;
  mustInclude: string;
  prohibitedClaims: string;
  notes: string;
};

export interface CreativeBrief extends CreativeBriefFields {
  /** Last creator-approved snapshot used by AI prompts. Draft fields still autosave with the project. */
  committed: CreativeBriefFields | null;
  savedAt: string | null;
  updatedAt: string | null;
}

export interface ProjectCreatorProfile {
  /** Reusable app-scoped profile selected for this project. */
  profileId: string | null;
  /** Explicit project-only values. Clearing a key returns to the selected profile default. */
  overrides: Partial<{
    audience: string;
    tone: string;
    callToAction: string;
    targetPlatform: Platform;
    templateLayout: TemplateLayout;
    longformSkin: LongformSkinId;
    longformPaletteId: string;
  }>;
}

export type PromoEvidenceCategory = 'none' | 'app-ui' | 'community-proof' | 'growth-stat';
export type PromoCtaSource = 'profile' | 'brief' | 'none';

export interface PromoScriptBeat {
  id: string;
  /** Approved spoken copy for one clip. The recorder says the generated marker before this copy. */
  script: string;
  /** Visual evidence family that should support this clip's claim. */
  evidenceCategory: PromoEvidenceCategory;
  /** Optional Creator Profile capture assigned to this beat. */
  evidenceAssetPath: string | null;
}

export interface PromoProjectPlan {
  beats: PromoScriptBeat[];
  /** Where the spoken/written CTA copy comes from. */
  ctaSource: PromoCtaSource;
  /** Creator Profile asset used for the forced visual CTA. */
  ctaAssetPath: string | null;
  /** Last time the creator explicitly reviewed the workflow. Editing clears it. */
  reviewedAt: string | null;
}

export interface ProjectWorkspace {
  stage: PipelineStage;
  activeSourceId: string | null;
  selectedClipId: string | null;
  clipFilter: ClipFilter;
  clipSort: ClipSort;
  inspectorTab: InspectorTab;
  gridScrollTop: number;
  previewPlayheadByClip: Record<string, number>;
}

export interface ErrorLogEntry extends StructuredError {
  id: string;
  timestamp: number;
}

export type CancellationStatus = 'idle' | 'cancelling' | 'failed';

export interface CancellationState {
  status: CancellationStatus;
  error: StructuredError | null;
}

export type PythonSetupState =
  | 'checking'
  | 'not-setup'
  | 'repair-needed'
  | 'installing'
  | 'cancelling'
  | 'ready'
  | 'skipped'
  | 'error';

// ---------------------------------------------------------------------------
// Full AppState
// ---------------------------------------------------------------------------

export interface AppState {
  // Source videos
  sources: SourceVideo[];
  activeSourceId: string | null;

  // Transcriptions (keyed by source ID)
  transcriptions: Record<string, TranscriptionData>;

  // Clip candidates (keyed by source ID)
  clips: Record<string, ClipCandidate[]>;

  // Stitched clip candidates (keyed by source ID)
  stitchedClips: Record<string, StitchedClipCandidate[]>;

  // Long-form edit plans (keyed by source ID)
  longformPlans: Record<string, import('./longform-slice').LongformPlanRecord>;
  longformReviewFocus: import('./longform-slice').LongformReviewFocus | null;

  // Exact project workspace and creator guidance
  workspace: ProjectWorkspace;
  creativeBrief: CreativeBrief;
  creatorProfile: ProjectCreatorProfile;
  promoPlan: PromoProjectPlan;

  // Pipeline and durable creator jobs
  pipeline: PipelineProgress;
  creatorJobs: CreatorJob[];
  currentProcessingJobId: string | null;
  /** Which pipeline stage failed (enables "Retry from stage" UI). */
  failedPipelineStage: PipelineStage | null;
  /** Stages that completed successfully — used to skip them on retry. */
  completedPipelineStages: Set<PipelineStage>;
  /** Cached sourcePath from download step — avoids re-downloading on retry. */
  cachedSourcePath: string | null;

  // Render
  renderProgress: RenderProgress[];
  isRendering: boolean;
  renderCancellation: CancellationState;
  activeEncoder: { encoder: string; isHardware: boolean } | null;
  renderStartedAt: number | null;
  renderCompletedAt: number | null;
  clipRenderTimes: Record<string, { started: number; completed: number; duration: number }>;
  /** Per-clip structured render errors, keyed by clipId. */
  renderErrors: Record<string, StructuredError>;

  // Single-clip render
  singleRenderClipId: string | null;
  singleRenderProgress: number;
  singleRenderStatus: 'idle' | 'rendering' | 'done' | 'error';
  singleRenderOutputPath: string | null;
  singleRenderError: string | null;

  // Settings
  settings: AppSettings;

  // Python setup
  pythonStatus: PythonSetupState;
  pythonSetupDetails: PythonSetupStatus | null;
  pythonSetupError: string | null;
  pythonSetupProgress: PythonSetupProgress | null;

  // Processing config
  processingConfig: ProcessingConfig;

  // Errors and long-running work cancellation
  errorLog: ErrorLogEntry[];
  processingCancellation: CancellationState;

  // Clip selection (keyboard navigation)
  selectedClipIndex: number;

  // Undo / Redo — global (batch operations)
  _undoStack: import('./history-slice').UndoableSnapshot[];
  _redoStack: import('./history-slice').UndoableSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => import('./history-slice').HistoryResult | null;
  redo: () => import('./history-slice').HistoryResult | null;

  // Undo / Redo — per-clip (edit actions)
  _clipUndoStacks: Record<string, import('./history-slice').ClipUndoEntry[]>;
  _clipRedoStacks: Record<string, import('./history-slice').ClipUndoEntry[]>;
  /** ID of the most recently edited clip — used to target keyboard undo/redo. */
  _lastEditedClipId: string | null;
  _lastEditedSourceId: string | null;
  canUndoClip: (clipId: string) => boolean;
  canRedoClip: (clipId: string) => boolean;
  undoClip: (sourceId: string, clipId: string) => import('./history-slice').HistoryResult | null;
  redoClip: (sourceId: string, clipId: string) => import('./history-slice').HistoryResult | null;
  clearClipUndoHistory: (clipId: string) => void;

  // Actions — Project workspace
  setWorkspaceStage: (stage: PipelineStage) => void;
  setWorkspaceSelectedClip: (clipId: string | null) => void;
  setWorkspaceFilter: (filter: ClipFilter) => void;
  setWorkspaceSort: (sort: ClipSort) => void;
  setWorkspaceInspectorTab: (tab: InspectorTab) => void;
  setWorkspaceGridScrollTop: (scrollTop: number) => void;
  setWorkspacePlayhead: (clipId: string, seconds: number) => void;
  setCreativeBrief: (brief: Partial<CreativeBriefFields>) => void;
  commitCreativeBrief: () => void;
  setCreatorProfile: (profileId: string | null) => void;
  setCreatorProfileOverride: <K extends keyof ProjectCreatorProfile['overrides']>(
    key: K,
    value: ProjectCreatorProfile['overrides'][K],
  ) => void;
  clearCreatorProfileOverride: (key: keyof ProjectCreatorProfile['overrides']) => void;
  clearCreatorProfileOverrides: () => void;
  setPromoPlan: (patch: Partial<PromoProjectPlan>) => void;

  // Actions — Sources
  addSource: (source: SourceVideo) => void;
  updateSource: (id: string, updates: Partial<SourceVideo>) => void;
  removeSource: (id: string) => void;
  setActiveSource: (id: string | null) => void;

  // Actions — Transcription
  setTranscription: (sourceId: string, data: TranscriptionData) => void;

  // Actions — Long-form edit plans
  setLongformReviewFocus: (target: import('./longform-slice').LongformReviewFocus | null) => void;
  focusLongformScene: (sourceId: string, sceneId: string) => boolean;
  setLongformPlan: (
    sourceId: string,
    record: import('./longform-slice').LongformPlanRecord,
  ) => void;
  addLongformPlanVersion: (
    sourceId: string,
    plan: import('@shared/types').LongformEditPlan,
    origin: import('./longform-slice').LongformPlanVersionOrigin,
    note?: string,
  ) => void;
  restoreLongformPlanVersion: (sourceId: string, versionId: string) => void;
  acceptLongformPlan: (sourceId: string, skin: LongformSkinId, paletteId: string) => void;
  setLongformPlanStyle: (sourceId: string, skin: LongformSkinId, paletteId: string) => void;
  rejectLongformPlan: (sourceId: string) => void;
  addLongformPlanFeedback: (
    sourceId: string,
    feedback: Omit<import('./longform-slice').LongformPlanFeedback, 'id' | 'createdAt' | 'status'>,
  ) => void;
  markLongformFeedbackApplied: (sourceId: string) => void;
  setLongformPreservedItems: (
    sourceId: string,
    items: import('@/lib/longform-plan').PreservedLongformItem[],
  ) => void;
  setLongformReconciliation: (
    sourceId: string,
    reconciliation: import('@shared/types').LongformRenderReconciliation | null,
  ) => void;
  clearLongformPlan: (sourceId: string) => void;
  getLongformPlan: (sourceId: string) => import('./longform-slice').LongformPlanRecord | null;

  // Actions — Clips
  setClips: (sourceId: string, clips: ClipCandidate[]) => void;
  addClipCandidate: (sourceId: string, clip: ClipCandidate) => void;
  updateClipStatus: (sourceId: string, clipId: string, status: ClipCandidate['status']) => void;
  updateClipTrim: (sourceId: string, clipId: string, startTime: number, endTime: number) => void;
  updateClipThumbnail: (sourceId: string, clipId: string, thumbnail: string) => void;
  setClipCustomThumbnail: (sourceId: string, clipId: string, thumbnail: string | null) => void;
  updateClipCrop: (
    sourceId: string,
    clipId: string,
    crop: CropRegion,
    opts?: { timeline?: CropTimelineEntry[]; source?: CropRegionSource },
  ) => void;
  /** User manually dragged the crop — sets cropRegion, clears timeline, marks manual. */
  setClipManualCrop: (sourceId: string, clipId: string, crop: CropRegion) => void;
  /** Clear the manual flag so the next face-detection pass can re-populate. */
  resetClipCropSource: (sourceId: string, clipId: string) => void;
  updateClipHookText: (sourceId: string, clipId: string, hookText: string) => void;
  updateClipLoop: (
    sourceId: string,
    clipId: string,
    loopData: {
      loopScore: number;
      loopStrategy: string;
      loopOptimized: boolean;
      crossfadeDuration?: number;
    },
  ) => void;
  setClipPartInfo: (sourceId: string, clipId: string, partInfo: PartInfoUI) => void;
  setClipOverride: (
    sourceId: string,
    clipId: string,
    key: keyof ClipRenderSettings,
    value: ClipRenderSettings[keyof ClipRenderSettings],
  ) => void;
  clearClipOverrides: (sourceId: string, clipId: string) => void;
  resetClipBoundaries: (sourceId: string, clipId: string) => void;
  rescoreClip: (
    sourceId: string,
    clipId: string,
    newScore: number,
    newReasoning: string,
    newHookText?: string,
  ) => void;
  setClipAIEditPlan: (
    sourceId: string,
    clipId: string,
    plan: import('@shared/types').AIEditPlan,
  ) => void;
  clearClipAIEditPlan: (sourceId: string, clipId: string) => void;
  setClipShots: (
    sourceId: string,
    clipId: string,
    shots: import('@shared/types').ShotSegment[],
  ) => void;
  clearClipShots: (sourceId: string, clipId: string) => void;
  setClipSegments: (
    sourceId: string,
    clipId: string,
    segments: import('@shared/types').VideoSegment[],
  ) => void;
  setShotStyle: (sourceId: string, clipId: string, shotIndex: number, presetId: string) => void;
  clearShotStyle: (sourceId: string, clipId: string, shotIndex: number) => void;
  setClipShotStyles: (
    sourceId: string,
    clipId: string,
    assignments: import('@shared/types').ShotStyleAssignment[],
  ) => void;
  clearAllShotStyles: (sourceId: string, clipId: string) => void;
  setClipFillers: (
    sourceId: string,
    clipId: string,
    segments: FillerSegmentUI[],
    timeSaved: number,
  ) => void;
  toggleFillerRestore: (sourceId: string, clipId: string, segmentIndex: number) => void;
  clearClipFillers: (sourceId: string, clipId: string) => void;
  approveAll: (sourceId: string) => void;
  approveClipsAboveScore: (
    sourceId: string,
    minScore: number,
  ) => { approved: number; rejected: number };
  rejectAll: (sourceId: string) => void;
  setSelectedClipIndex: (index: number) => void;

  // Actions — Batch multi-select
  selectedClipIds: Set<string>;
  toggleClipSelection: (clipId: string) => void;
  selectAllVisible: (clipIds: string[]) => void;
  clearSelection: () => void;
  batchUpdateClips: (
    sourceId: string,
    clipIds: string[],
    updates: Partial<
      Pick<ClipCandidate, 'status'> & {
        trimOffsetSeconds: number;
        overrides: Partial<ClipRenderSettings>;
      }
    >,
  ) => void;
  batchUpdateReviewItems: (
    sourceId: string,
    clipIds: string[],
    updates: Partial<Pick<ClipCandidate, 'status'> & { overrides: Partial<ClipRenderSettings> }>,
  ) => boolean;

  // Actions — Pipeline
  setPipeline: (progress: PipelineProgress) => void;
  startProcessingJob: (source: SourceVideo) => string;
  resumeProcessingJob: (jobId: string) => void;
  pauseProcessingJob: (failedStage: PipelineStage, message: string) => void;
  syncRenderJob: () => void;
  dismissCreatorJob: (jobId: string) => void;
  discardProcessingWork: (jobId: string) => void;
  setProcessingCancellation: (state: CancellationState) => void;
  setFailedPipelineStage: (stage: PipelineStage) => void;
  setCachedSourcePath: (path: string) => void;
  markStageCompleted: (stage: PipelineStage) => void;
  clearPipelineCache: () => void;

  // Actions — Render
  setRenderProgress: (progress: RenderProgress[]) => void;
  setIsRendering: (rendering: boolean) => void;
  setRenderCancellation: (state: CancellationState) => void;
  setRenderError: (clipId: string, error: StructuredError) => void;
  clearRenderErrors: () => void;
  setSingleRenderState: (patch: {
    clipId?: string | null;
    progress?: number;
    status?: 'idle' | 'rendering' | 'done' | 'error';
    outputPath?: string | null;
    error?: string | null;
  }) => void;

  // Actions — Settings
  setGeminiApiKey: (key: string) => void;
  setFalApiKey: (key: string) => void;
  setOutputDirectory: (dir: string) => void;
  setMinScore: (score: number) => void;
  setAutoZoomEnabled: (enabled: boolean) => void;
  setAutoZoomMode: (mode: ZoomMode) => void;
  setAutoZoomIntensity: (intensity: ZoomIntensity) => void;
  setAutoZoomInterval: (seconds: number) => void;

  // Actions — Hook Title Overlay
  setHookTitleEnabled: (enabled: boolean) => void;
  setHookTitleStyle: (style: HookTitleStyle) => void;
  setHookTitleDisplayDuration: (seconds: number) => void;
  setHookTitleFontSize: (px: number) => void;
  setHookTitleTextColor: (color: string) => void;
  setHookTitleOutlineColor: (color: string) => void;
  setHookTitleOutlineWidth: (px: number) => void;
  setHookTitleFadeIn: (seconds: number) => void;
  setHookTitleFadeOut: (seconds: number) => void;

  // Actions — Re-hook Overlay
  setRehookEnabled: (enabled: boolean) => void;
  setRehookStyle: (style: RehookStyle) => void;
  setRehookDisplayDuration: (seconds: number) => void;
  setRehookPositionFraction: (fraction: number) => void;

  // Actions — B-Roll
  setBRollEnabled: (enabled: boolean) => void;
  setBRollIntervalSeconds: (seconds: number) => void;
  setBRollClipDuration: (seconds: number) => void;
  setBRollDisplayMode: (mode: BRollDisplayMode) => void;
  setBRollTransition: (transition: BRollTransition) => void;
  setBRollPipSize: (size: number) => void;
  setBRollPipPosition: (
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  ) => void;

  // Actions — Promo Mode
  setPromoEnabled: (enabled: boolean) => void;
  setPromoForceCta: (forceCta: boolean) => void;
  setPromoAccentColor: (color: string) => void;

  // Actions — Filler Removal
  setFillerRemovalEnabled: (enabled: boolean) => void;
  setFillerRemovalPreset: (preset: FillerRemovalPreset) => void;
  setFillerRemovalFillerWords: (enabled: boolean) => void;
  setFillerRemovalSilences: (enabled: boolean) => void;
  setFillerRemovalRepeats: (enabled: boolean) => void;
  setFillerRemovalSilenceThreshold: (seconds: number) => void;
  setFillerRemovalSilenceTargetGap: (seconds: number) => void;
  setFillerRemovalWordList: (words: string[]) => void;

  // Actions — Notifications
  setEnableNotifications: (enabled: boolean) => void;

  // Actions — Developer Mode
  setDeveloperMode: (enabled: boolean) => void;

  // Actions — Render Quality
  setRenderQuality: (quality: Partial<RenderQualitySettings>) => void;
  setOutputAspectRatio: (ratio: OutputAspectRatio) => void;
  setFilenameTemplate: (template: string) => void;
  setRenderConcurrency: (concurrency: number) => void;

  // Actions — Output mode + long-form skin / palette (16:9 path)
  setOutputMode: (mode: OutputMode) => void;
  setLongformSkin: (skin: LongformSkinId) => void;
  setLongformPaletteId: (id: string) => void;
  addCustomPalette: (palette: Palette) => void;
  updateCustomPalette: (id: string, patch: Partial<Palette>) => void;
  removeCustomPalette: (id: string) => void;

  // Actions — Template Layout (on-screen text positioning)
  setTemplateLayout: (layout: TemplateLayout) => void;
  setTargetPlatform: (platform: Platform) => void;
  resetTemplateLayout: () => void;

  // Actions — Reset
  resetSettings: () => void;
  resetSection: (
    section:
      | 'autoZoom'
      | 'hookTitle'
      | 'rehook'
      | 'fillerRemoval'
      | 'broll'
      | 'promo'
      | 'aiSettings'
      | 'renderQuality',
  ) => void;

  // Actions — Python setup
  setPythonStatus: (status: PythonSetupState) => void;
  setPythonSetupDetails: (details: PythonSetupStatus | null) => void;
  setPythonSetupError: (error: string | null) => void;
  setPythonSetupProgress: (progress: PythonSetupProgress | null) => void;

  // Actions — Processing Config
  setProcessingConfig: (config: Partial<ProcessingConfig>) => void;
  resetProcessingConfig: () => void;

  // Network status
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;

  // Actions — Errors
  addError: (entry: StructuredErrorInput | StructuredError) => ErrorLogEntry;
  clearErrors: () => void;

  // Actions — Stitched Clips
  setStitchedClips: (sourceId: string, clips: StitchedClipCandidate[]) => void;
  updateStitchedClipStatus: (
    sourceId: string,
    clipId: string,
    status: StitchedClipCandidate['status'],
  ) => void;
  updateStitchedClipThumbnail: (sourceId: string, clipId: string, thumbnail: string) => void;
  setStitchedClipCustomThumbnail: (
    sourceId: string,
    clipId: string,
    thumbnail: string | null,
  ) => void;
  updateStitchedClipHookText: (sourceId: string, clipId: string, hookText: string) => void;
  setStitchedClipSegments: (
    sourceId: string,
    clipId: string,
    segments: import('@shared/types').VideoSegment[],
  ) => void;
  setStitchedClipFaceCrops: (
    sourceId: string,
    clipId: string,
    cropRegion: CropRegion | undefined,
    rangeCropRects: Array<{ x: number; y: number; width: number; height: number }> | undefined,
  ) => void;
  setStitchedClipOverride: (
    sourceId: string,
    clipId: string,
    key: keyof ClipRenderSettings,
    value: ClipRenderSettings[keyof ClipRenderSettings],
  ) => void;
  approveAllStitched: (sourceId: string) => void;
  rejectAllStitched: (sourceId: string) => void;
  getApprovedStitchedClips: (sourceId: string) => StitchedClipCandidate[];
  getActiveStitchedClips: () => StitchedClipCandidate[];

  // Computed
  getApprovedClips: (sourceId: string) => ClipCandidate[];
  getActiveSource: () => SourceVideo | null;
  getActiveTranscription: () => TranscriptionData | null;
  getActiveClips: () => ClipCandidate[];

  // Project identity and save truth
  currentProject: ProjectIdentity;
  isDirty: boolean;
  projectRevision: number;
  savedRevision: number;
  saveStatus: ProjectSaveStatus;
  lastSavedAt: number | null;
  lastSaveError: string | null;

  // Project (pure state — persistence lives in services/project-service.ts)
  setProjectDisplayName: (displayName: string) => void;
  reset: () => void;

  // Recovery acknowledgement is scoped to one autosave identity.
  acknowledgedRecoverySnapshotId: string | null;
  acknowledgeRecoverySnapshot: (snapshotId: string) => void;

  // AI Token Usage
  aiUsage: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCalls: number;
    callHistory: TokenUsageEvent[];
    byModel: Record<string, TokenUsageAggregate>;
    bySource: Record<string, TokenUsageAggregate>;
    sessionStarted: number;
  };
  trackTokenUsage: (event: TokenUsageEvent) => void;
  resetAiUsage: () => void;

  // Secrets hydration (Electron safeStorage)
  hydrateSecretsFromMain: () => Promise<void>;
}
