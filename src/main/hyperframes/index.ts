// ---------------------------------------------------------------------------
// HyperFrames overlay system — barrel export
// ---------------------------------------------------------------------------

export { renderComposition, resolveHyperFramesCli } from './engine'
export type { RenderCompositionOptions, RenderCompositionResult } from './engine'
export { renderOverlay, renderOverlays } from './renderer'
export type {
  OverlayBlockName,
  OverlayPosition,
  OverlayTiming,
  OverlayRequest,
  OverlayRenderResult,
  BaseOverlayProps,
  PopupCardProps,
  IconCalloutProps,
  AnimatedLabelProps,
  ProgressBarProps,
  GlowingBadgeProps,
  OverlayPropsMap
} from './types'
