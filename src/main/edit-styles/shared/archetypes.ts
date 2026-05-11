/**
 * Segment archetypes — the 7 stable slots every edit style must fill.
 *
 * Archetypes are the user-facing picker's labels and drive the per-segment
 * visual layout. Each archetype is a self-contained layout — there are no
 * style variants underneath them anymore.
 */

import type { TransitionType } from '@shared/types'

export const ARCHETYPE_KEYS = [
  'talking-head',
  'tight-punch',
  'wide-breather',
  'quote-lower',
  'split-image',
  'fullscreen-image',
  'fullscreen-quote'
] as const

export type Archetype = (typeof ARCHETYPE_KEYS)[number]

export const ARCHETYPE_TO_CATEGORY: Record<Archetype, SegmentStyleCategory> = {
  'talking-head': 'main-video',
  'tight-punch': 'main-video',
  'wide-breather': 'main-video',
  'quote-lower': 'main-video-text',
  'split-image': 'main-video-images',
  'fullscreen-image': 'fullscreen-image',
  'fullscreen-quote': 'fullscreen-text'
}

/**
 * The transition-in each archetype uses when a segment starts. This is the
 * single source of truth at render time; older per-segment transitionIn
 * overrides are ignored. Each archetype "owns" its intro.
 */
export const ARCHETYPE_DEFAULT_TRANSITION_IN: Record<Archetype, TransitionType> = {
  'talking-head': 'hard-cut',
  'tight-punch': 'flash-cut',
  'wide-breather': 'crossfade',
  'quote-lower': 'crossfade',
  'split-image': 'hard-cut',
  'fullscreen-image': 'crossfade',
  'fullscreen-quote': 'color-wash'
}

/** Human-readable metadata for the picker UI. */
export const ARCHETYPE_META: Record<
  Archetype,
  { name: string; description: string }
> = {
  'talking-head': {
    name: 'Talking Head',
    description: 'Standard speaker framing with lower-third captions.'
  },
  'tight-punch': {
    name: 'Tight Punch',
    description: 'Tight crop on the speaker for intimate, emphasized beats.'
  },
  'wide-breather': {
    name: 'Wide Breather',
    description: 'Pulled-back framing to relieve pacing.'
  },
  'quote-lower': {
    name: 'Quote Lower',
    description: 'Speaker framing with captions emphasised at the lower-third.'
  },
  'split-image': {
    name: 'Split Image',
    description: 'Speaker on the bottom, b-roll video on top.'
  },
  'fullscreen-image': {
    name: 'Fullscreen Image',
    description: 'B-roll video fills the frame, captions on top.'
  },
  'fullscreen-quote': {
    name: 'Fullscreen Quote',
    description: 'Solid brand-bg card with hero-sized captions.'
  }
}

/**
 * Speaker-fullscreen archetypes — the three that frame a full-screen view
 * of the speaker. These are the only archetypes whose caption / hook /
 * rehook positioning can be moved by the global template editor. The
 * remaining archetypes (`quote-lower`, `split-image`, `fullscreen-image`,
 * `fullscreen-quote`) have purpose-built layouts that ignore the global
 * `templateLayout` overrides.
 */
export const SPEAKER_FULLSCREEN_ARCHETYPES: ReadonlySet<Archetype> = new Set<Archetype>([
  'talking-head',
  'tight-punch',
  'wide-breather'
])

/** Convenience predicate — reads better at call sites than `.has(...)`. */
export function isSpeakerFullscreen(archetype: Archetype): boolean {
  return SPEAKER_FULLSCREEN_ARCHETYPES.has(archetype)
}

/**
 * Reverse lookup: category → preferred archetype. Used by the "no API key"
 * fallback to map a variant category back into archetype space.
 */
export function categoryToDefaultArchetype(
  category: SegmentStyleCategory
): Archetype {
  switch (category) {
    case 'main-video':
      return 'talking-head'
    case 'main-video-text':
      return 'quote-lower'
    case 'main-video-images':
      return 'split-image'
    case 'fullscreen-image':
      return 'fullscreen-image'
    case 'fullscreen-text':
      return 'fullscreen-quote'
    default:
      return 'talking-head'
  }
}
