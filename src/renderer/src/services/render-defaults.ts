/**
 * render-defaults — renderer-side mirror of the PRESTYJ edit-style caption
 * config and brand accent.
 *
 * The main process owns the canonical edit-style registry (single style:
 * PRESTYJ — see `src/main/edit-styles/prestyj/index.ts`). The renderer can't
 * import from `src/main` so we mirror the small surface area the render
 * pipeline needs from the renderer side here.
 *
 * Keep these constants in sync with:
 *   - `src/main/edit-styles/shared/brand.ts`         (BRAND_ACCENT)
 *   - `src/main/edit-styles/prestyj/index.ts`        (captionStyle)
 *
 * If those drift, captions and accent colours will diverge between the
 * single-clip preview path and the batch-render path.
 */
import type { CaptionStyleInput } from '@shared/types'

/** PRESTYJ brand accent — must match BRAND_ACCENT in main/edit-styles/shared/brand.ts. */
export const PRESTYJ_ACCENT = '#9f75ff'

/**
 * Default caption style sent on every batch render. Mirrors
 * `prestyjEditStyle.captionStyle` exactly so the V2 caption builder picks
 * 'emphasis_highlight' mode and the PRESTYJ accent.
 */
export const PRESTYJ_CAPTION_STYLE: CaptionStyleInput = {
  fontName: 'Inter',
  fontSize: 0.065,
  primaryColor: '#FFFFFF',
  highlightColor: PRESTYJ_ACCENT,
  outlineColor: '#000000',
  backColor: '#00000000',
  outline: 6,
  shadow: 0,
  borderStyle: 1,
  wordsPerLine: 4,
  animation: 'captions-ai',
  captionMode: 'emphasis_highlight',
  accentColor: PRESTYJ_ACCENT,
  emphasisColor: PRESTYJ_ACCENT,
  supersizeColor: PRESTYJ_ACCENT,
  shadowDistance: 3,
  shadowAngle: 69,
  shadowSoftness: 80,
  shadowOpacity: 0.95,
  shadowColor: '#000000',
}
