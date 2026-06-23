// ---------------------------------------------------------------------------
// HyperFrames overlay system — barrel export
// ---------------------------------------------------------------------------

export { renderComposition, resolveHyperFramesCli } from './engine'
export type { RenderCompositionOptions, RenderCompositionResult } from './engine'
export { renderOverlay, renderOverlays, renderPreset, resolvePreset, listPresets } from './renderer'
export type {
  OverlayBlockName,
  OverlayPosition,
  OverlayTiming,
  OverlayRequest,
  OverlayRenderResult,
  BaseOverlayProps,
  OverlayPropsMap,
  HyperFramePreset,
  PresetCategory,
  PresetMetadata,
  GlassCardProps,
  BigStatProps,
  TerminalWindowProps,
  ChecklistProps,
  PillBadgeProps,
  BeforeAfterProps,
  IconLabelProps,
  NumberedStepProps,
  IconGridProps,
  ProgressRingProps
} from './types'
