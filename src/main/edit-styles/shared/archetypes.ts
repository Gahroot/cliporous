/**
 * Segment archetypes — the 8 stable slots every edit style must fill.
 *
 * Archetypes are the AI segment-styler's vocabulary and the user-facing
 * picker's labels. Each archetype resolves (per active edit style) to one
 * of the 13 existing SegmentStyleVariants in src/main/segment-styles.ts.
 */

import type { TransitionType } from '@shared/types'

export const ARCHETYPE_KEYS = [
  'talking-head',
  'tight-punch',
  'wide-breather',
  'quote-lower',
  'split-image',
  'fullscreen-image',
  'fullscreen-quote',
  'fullscreen-headline'
] as const

export type Archetype = (typeof ARCHETYPE_KEYS)[number]

export const ARCHETYPE_TO_CATEGORY: Record<Archetype, SegmentStyleCategory> = {
  'talking-head': 'main-video',
  'tight-punch': 'main-video',
  'wide-breather': 'main-video',
  'quote-lower': 'main-video-text',
  'split-image': 'main-video-images',
  'fullscreen-image': 'fullscreen-image',
  'fullscreen-quote': 'fullscreen-text',
  'fullscreen-headline': 'fullscreen-text'
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
  'fullscreen-quote': 'color-wash',
  'fullscreen-headline': 'flash-cut'
}

/** Fallback variant id per archetype, used when a template omits variantId. */
export const ARCHETYPE_DEFAULT_VARIANT: Record<Archetype, string> = {
  'talking-head': 'main-video-normal',
  'tight-punch': 'main-video-tight',
  'wide-breather': 'main-video-wide',
  'quote-lower': 'main-video-text-lower',
  'split-image': 'main-video-images-topbottom',
  'fullscreen-image': 'fullscreen-image-dark',
  'fullscreen-quote': 'fullscreen-text-center',
  'fullscreen-headline': 'fullscreen-text-headline'
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
    description: 'Speaker plus a large lower-third text overlay.'
  },
  'split-image': {
    name: 'Split Image',
    description:
      'Speaker plus a contextual image (style picks PiP / side-by-side / top-bottom / behind).'
  },
  'fullscreen-image': {
    name: 'Fullscreen Image',
    description:
      'B-roll only — image fills the frame, captions and edits still on.'
  },
  'fullscreen-quote': {
    name: 'Fullscreen Quote',
    description: 'Solid background with a centered big-text quote.'
  },
  'fullscreen-headline': {
    name: 'Fullscreen Headline',
    description: 'Solid background with a title + subtext hero card.'
  }
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
