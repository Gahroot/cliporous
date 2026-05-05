// ---------------------------------------------------------------------------
// Ambient global types for the main process.
//
// Several main-process files reference shared domain types (EditStyle,
// SegmentStyleVariant, TransitionType, etc.) without importing them — this
// matches the convention used in the original BatchContent codebase.  This
// file re-publishes the canonical definitions from `@shared/types` as global
// type aliases so those files type-check without requiring an import per
// usage site.
//
// IMPORTANT: This file declares no runtime values.  It only adds type names
// to the global scope at compile time.
// ---------------------------------------------------------------------------

import type {
  EditStyle as _EditStyle,
  SegmentStyleCategory as _SegmentStyleCategory,
  SegmentStyleVariant as _SegmentStyleVariant,
  TransitionType as _TransitionType,
  Archetype as _Archetype,
  CaptionStyleInput as _CaptionStyleInput,
  HeadlineStyleConfig as _HeadlineStyleConfig,
  TextAnimationStyle as _TextAnimationStyle,
  ColorGradeParams as _ColorGradeParams,
  VFXOverlay as _VFXOverlay,
  VFXOverlayType as _VFXOverlayType,
  OverlayBlendMode as _OverlayBlendMode,
  ZoomKeyframe as _ZoomKeyframe,
  VideoSegment as _VideoSegment,
  ShotSegment as _ShotSegment,
  ShotBreakReason as _ShotBreakReason,
  ShotSegmentationResult as _ShotSegmentationResult,
  WordTimestamp as _WordTimestamp,
  EmphasizedWord as _EmphasizedWord,
  CaptionAnimation as _CaptionAnimation,
} from '@shared/types'

declare global {
  type EditStyle = _EditStyle
  type SegmentStyleCategory = _SegmentStyleCategory
  type SegmentStyleVariant = _SegmentStyleVariant
  type TransitionType = _TransitionType
  type Archetype = _Archetype
  type CaptionStyleInput = _CaptionStyleInput
  type HeadlineStyleConfig = _HeadlineStyleConfig
  type TextAnimationStyle = _TextAnimationStyle
  type ColorGradeParams = _ColorGradeParams
  type VFXOverlay = _VFXOverlay
  type VFXOverlayType = _VFXOverlayType
  type OverlayBlendMode = _OverlayBlendMode
  type ZoomKeyframe = _ZoomKeyframe
  type VideoSegment = _VideoSegment
  type ShotSegment = _ShotSegment
  type ShotBreakReason = _ShotBreakReason
  type ShotSegmentationResult = _ShotSegmentationResult
  type WordTimestamp = _WordTimestamp
  type EmphasizedWord = _EmphasizedWord
  type CaptionAnimation = _CaptionAnimation
}

export {}
