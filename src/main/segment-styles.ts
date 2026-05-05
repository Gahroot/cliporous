/**
 * Segment Style Variants
 *
 * Defines all visual layout types that a video segment can use, matching the
 * 5 categories found in Captions.ai-style editors:
 *   - Main video
 *   - Main video + text
 *   - Main video + images
 *   - Fullscreen image
 *   - Fullscreen text
 *
 * Each variant describes how the 9:16 frame is composed for that segment,
 * including zoom behaviour, caption placement, and optional image layout.
 */

// Types are declared globally in src/preload/index.d.ts
// (SegmentStyleCategory, SegmentStyleVariant)

// ---------------------------------------------------------------------------
// Variant definitions
// ---------------------------------------------------------------------------

export const SEGMENT_STYLE_VARIANTS: SegmentStyleVariant[] = [
  // ── Category: main-video (3 variants) ──────────────────────────────────

  {
    id: 'main-video-normal',
    category: 'main-video',
    name: 'Normal',
    description:
      'Speaker fills the 9:16 frame with a standard crop around the face. Captions in lower third. This is the default.',
    zoomStyle: 'none',
    zoomIntensity: 1.0,
    captionPosition: 'lower-third'
  },
  {
    id: 'main-video-tight',
    category: 'main-video',
    name: 'Tight',
    description:
      "Tighter zoom on the speaker's face (1.15x crop) for intimacy and emphasis. Captions in lower third.",
    zoomStyle: 'snap',
    zoomIntensity: 1.15,
    captionPosition: 'lower-third'
  },
  {
    id: 'main-video-wide',
    category: 'main-video',
    name: 'Wide',
    description:
      'Slightly wider shot (0.9× crop) showing more of the scene. Captions in lower third.',
    zoomStyle: 'drift',
    zoomIntensity: 0.9,
    captionPosition: 'lower-third'
  },

  // ── Category: main-video-text (2 variants) ─────────────────────────────

  {
    id: 'main-video-text-center',
    category: 'main-video-text',
    name: 'Center Text',
    description:
      'Speaker visible with a large text overlay centred on screen. Text is the primary focus (2–4 words, large font).',
    zoomStyle: 'drift',
    zoomIntensity: 1.0,
    captionPosition: 'center'
  },
  {
    id: 'main-video-text-lower',
    category: 'main-video-text',
    name: 'Lower Text',
    description:
      'Speaker visible with large text in the lower 40% of the frame.',
    zoomStyle: 'drift',
    zoomIntensity: 1.0,
    captionPosition: 'lower-third'
  },

  // ── Category: main-video-images (3 variants) ───────────────────────────

  {
    id: 'main-video-images-pip',
    category: 'main-video-images',
    name: 'PiP Image',
    description:
      'Speaker in main frame with a contextual image in a small picture-in-picture window (~30% frame width, top-right or bottom-right corner).',
    zoomStyle: 'none',
    zoomIntensity: 1.0,
    captionPosition: 'lower-third',
    imageLayout: 'pip',
    imagePlacement: 'right'
  },
  {
    id: 'main-video-images-side',
    category: 'main-video-images',
    name: 'Side by Side',
    description:
      'Split screen: speaker on the left (50%), contextual image on the right (50%).',
    zoomStyle: 'none',
    zoomIntensity: 1.0,
    captionPosition: 'lower-third',
    imageLayout: 'side-by-side',
    imagePlacement: 'right'
  },
  {
    id: 'main-video-images-behind',
    category: 'main-video-images',
    name: 'Behind Speaker',
    description:
      'Contextual image fills the background; speaker overlaid in a smaller window (centre-bottom, ~60% width).',
    zoomStyle: 'none',
    zoomIntensity: 1.0,
    captionPosition: 'lower-third',
    imageLayout: 'behind-speaker',
    imagePlacement: 'bottom'
  },
  {
    id: 'main-video-images-topbottom',
    category: 'main-video-images',
    name: 'Top/Bottom',
    description:
      'Speaker fills the top half (960px), contextual image fills the bottom half (960px). The most common Captions.ai layout for engagement — keeps the speaker visible while adding visual context below.',
    zoomStyle: 'drift',
    zoomIntensity: 1.05,
    captionPosition: 'center',
    imageLayout: 'top-bottom',
    imagePlacement: 'bottom'
  },

  // ── Category: fullscreen-image (2 variants) ────────────────────────────

  {
    id: 'fullscreen-image-dark',
    category: 'fullscreen-image',
    name: 'Dark Overlay',
    description:
      'AI/stock image fills the entire frame with a 40% opacity dark overlay. Caption text rendered on top.',
    zoomStyle: 'drift',
    zoomIntensity: 1.0,
    captionPosition: 'center',
    imageLayout: 'fullscreen'
  },
  {
    id: 'fullscreen-image-clean',
    category: 'fullscreen-image',
    name: 'Clean',
    description:
      'AI/stock image fills the frame with caption text at the bottom. No dark overlay.',
    zoomStyle: 'drift',
    zoomIntensity: 1.0,
    captionPosition: 'lower-third',
    imageLayout: 'fullscreen'
  },

  // ── Category: fullscreen-text (2 variants) ─────────────────────────────

  {
    id: 'fullscreen-text-center',
    category: 'fullscreen-text',
    name: 'Centred Text',
    description:
      'Solid dark background with large centred text (the caption/quote for this segment).',
    zoomStyle: 'none',
    zoomIntensity: 1.0,
    captionPosition: 'center'
  },
  {
    id: 'fullscreen-text-headline',
    category: 'fullscreen-text',
    name: 'Headline',
    description:
      'Solid dark background with headline-style text at the top and smaller subtext below.',
    zoomStyle: 'none',
    zoomIntensity: 1.0,
    captionPosition: 'top'
  }
]

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Returns all variants belonging to a given category.
 */
export function getVariantsForCategory(
  category: SegmentStyleCategory
): SegmentStyleVariant[] {
  return SEGMENT_STYLE_VARIANTS.filter((v) => v.category === category)
}

/**
 * Looks up a single variant by its unique `id`.
 */
export function getVariantById(id: string): SegmentStyleVariant | undefined {
  return SEGMENT_STYLE_VARIANTS.find((v) => v.id === id)
}

/**
 * Returns the default (first) variant for a category.
 * Falls back to `main-video-normal` if the category is empty or unknown.
 */
export function getDefaultVariant(
  category: SegmentStyleCategory
): SegmentStyleVariant {
  const variants = getVariantsForCategory(category)
  if (variants.length > 0) return variants[0]
  // Fallback — main-video-normal always exists
  return SEGMENT_STYLE_VARIANTS[0]
}
