/**
 * Barrel shim — re-exports the trimmed store surface.
 *
 * Prefer importing from `@/store` (this shim) rather than reaching into
 * `./store/*` directly, so the public API stays small and stable.
 */

export { useStore } from './store/index'
export { selectActiveClips } from './store/selectors'
export {
  DEFAULT_SETTINGS,
  DEFAULT_PROCESSING_CONFIG,
  DEFAULT_PIPELINE,
  DEFAULT_AUTO_ZOOM,
  DEFAULT_HOOK_TITLE_OVERLAY,
  DEFAULT_REHOOK_OVERLAY,
  DEFAULT_BROLL,
  DEFAULT_FILLER_REMOVAL,
  DEFAULT_RENDER_QUALITY,
  DEFAULT_TARGET_AUDIENCE,
  updateItemById,
} from './store/helpers'
export type { ProjectFileData } from './store/helpers'

export type {
  AppState,
  AppSettings,
  ProcessingConfig,
  SourceVideo,
  TranscriptionData,
  ClipCandidate,
  ClipRenderSettings,
  PartInfoUI,
  FillerSegmentUI,
  PipelineProgress,
  PipelineStage,
  PythonSetupState,
  RenderProgress,
  RenderQualitySettings,
  RenderQualityPreset,
  OutputResolution,
  OutputFormat,
  EncodingPreset,
  ZoomSettings,
  HookTitleOverlaySettings,
  RehookOverlaySettings,
  BRollSettings,
  BRollDisplayMode,
  BRollTransition,
  FillerRemovalSettings,
  ErrorLogEntry,
  // Re-exported shared types
  WordTimestamp,
  SegmentTimestamp,
  TranscriptionResult,
  CropRegion,
  CropTimelineEntry,
  CropRegionSource,
  TargetDuration,
  ClipEndMode,
  CaptionAnimation,
  CaptionStyleSchema,
  WordAnimationType,
  TextCase,
  CaptionShadowStyle,
  CaptionBackgroundBox,
  CaptionEmphasisStyle,
  CaptionSupersizeStyle,
  OutputAspectRatio,
  ZoomIntensity,
  ZoomMode,
  HookTitleStyle,
  RehookStyle,
  ScoredSegment,
  ScoringResult,
  ScoringProgress,
  FaceDetectionProgress,
  CuriosityGap,
  ClipBoundary,
  CuriosityClipCandidate,
  ShotBreakReason,
  ShotSegment,
  ShotSegmentationResult,
} from './store/types'

export type { UndoableSnapshot, ClipUndoEntry } from './store/history-slice'
