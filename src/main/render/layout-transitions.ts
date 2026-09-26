// ---------------------------------------------------------------------------
// Layout-aware boundary transitions for the segmented (9:16) render.
// ---------------------------------------------------------------------------
//
// `ARCHETYPE_DEFAULT_TRANSITION_IN` picks a transition from the INCOMING
// archetype alone, so a split-screen → full-screen change (talking-head's
// default is `hard-cut`) or a b-roll → speaker return snapped with a hard cut,
// and every soft transition ran on a linear ramp.
//
// This module resolves each boundary from the (outgoing, incoming) PAIR:
//
//   same layout family         → keep the style's choice; crossfades are eased
//   speaker   → split          → panel-in  (b-roll panel slides down, face settles)
//   split     → speaker        → panel-out (b-roll panel slides up, reveals face)
//   any other family change    → eased dissolve
//   flash-cut / color-wash     → kept (deliberate style accents)
//
// Resolution is pure; `xfadeTransitionFor` / `boundaryStepSeconds` are the
// ONLY places that decide what xfade emits and how much timeline each
// boundary consumes, so the concat pass and the caption timeline cannot drift.
// ---------------------------------------------------------------------------

import type { Archetype, TransitionType } from '@shared/types';
import {
  buildPanelInExpr,
  buildPanelOutExpr,
  buildSmoothDissolveExpr,
  quantizeToFrames,
  xfadeCustomTransition,
} from './transition-easing';

export type LayoutFamily = 'speaker' | 'split' | 'graphic';

/** Resolved transition at a segment boundary. */
export type BoundaryTransition =
  | 'hard-cut'
  | 'smooth-dissolve'
  | 'panel-in'
  | 'panel-out'
  | 'flash-cut'
  | 'color-wash';

/** Fraction of the frame height covered by the split-image media panel. */
export const SPLIT_IMAGE_SEAM_FRACTION = 0.5;

/** Layout changes get a touch more time than same-layout dissolves. */
const LAYOUT_CHANGE_MIN_SECONDS = 0.35;

export function layoutFamilyOf(archetype: Archetype): LayoutFamily {
  switch (archetype) {
    case 'split-image':
      return 'split';
    case 'fullscreen-image':
    case 'fullscreen-quote':
      return 'graphic';
    default:
      return 'speaker';
  }
}

/**
 * Pick the transition for the boundary `prev → next`. `requested` is the
 * incoming segment's `transitionIn` (edit-style / archetype default).
 */
export function resolveBoundaryTransition(
  prev: Archetype,
  next: Archetype,
  requested: TransitionType,
): BoundaryTransition {
  if (requested === 'flash-cut' || requested === 'color-wash') return requested;

  const from = layoutFamilyOf(prev);
  const to = layoutFamilyOf(next);

  if (from === to) {
    return requested === 'crossfade' ? 'smooth-dissolve' : 'hard-cut';
  }
  if (from === 'speaker' && to === 'split') return 'panel-in';
  if (from === 'split' && to === 'speaker') return 'panel-out';
  return 'smooth-dissolve';
}

/**
 * Resolve every boundary of a segment list. Index 0 is always `hard-cut`
 * (nothing transitions INTO the first segment). With `enabled === false`
 * (user turned shot transitions off) every boundary is a hard cut.
 */
export function resolveSegmentTransitions(
  segments: ReadonlyArray<{ archetype: Archetype; transitionIn: TransitionType }>,
  enabled: boolean,
): BoundaryTransition[] {
  return segments.map((seg, i) => {
    const prev = segments[i - 1];
    if (!enabled || !prev) return 'hard-cut';
    return resolveBoundaryTransition(prev.archetype, seg.archetype, seg.transitionIn);
  });
}

/**
 * Pick fadewhite vs fadeblack from a hex color's perceived brightness.
 * ffmpeg-static 6.0 lacks the `fadecolor` xfade transition (FFmpeg 7.1+).
 */
export function pickFadeByBrightness(hex: string): 'fadewhite' | 'fadeblack' {
  const m = hex.replace(/^#/, '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m?.[1] || !m[2] || !m[3]) return 'fadewhite';
  const luma =
    0.299 * Number.parseInt(m[1], 16) +
    0.587 * Number.parseInt(m[2], 16) +
    0.114 * Number.parseInt(m[3], 16);
  return luma >= 128 ? 'fadewhite' : 'fadeblack';
}

/**
 * xfade `transition=` value for a boundary, or `null` for a hard cut.
 * Custom values are already quoted for use inside a filter_complex.
 */
export function xfadeTransitionFor(
  transition: BoundaryTransition,
  flashColor?: string,
): string | null {
  switch (transition) {
    case 'hard-cut':
      return null;
    case 'smooth-dissolve':
      return xfadeCustomTransition(buildSmoothDissolveExpr());
    case 'panel-in':
      return xfadeCustomTransition(buildPanelInExpr(SPLIT_IMAGE_SEAM_FRACTION));
    case 'panel-out':
      return xfadeCustomTransition(buildPanelOutExpr(SPLIT_IMAGE_SEAM_FRACTION));
    case 'flash-cut':
      return flashColor ? pickFadeByBrightness(flashColor) : 'fadewhite';
    case 'color-wash':
      return flashColor ? pickFadeByBrightness(flashColor) : 'fadeblack';
  }
}

/**
 * Seconds of overlap a boundary consumes in the xfade chain. Hard cuts inside
 * an xfade chain are a one-frame fade (visually a butt splice). Durations are
 * frame-quantized so offsets land on frame boundaries.
 */
export function boundaryStepSeconds(
  transition: BoundaryTransition,
  baseSeconds: number,
  fps: number,
): number {
  const frame = 1 / Math.max(1, fps);
  switch (transition) {
    case 'hard-cut':
      return frame;
    case 'panel-in':
    case 'panel-out':
      return quantizeToFrames(Math.max(baseSeconds, LAYOUT_CHANGE_MIN_SECONDS), fps);
    default:
      return quantizeToFrames(baseSeconds, fps);
  }
}
