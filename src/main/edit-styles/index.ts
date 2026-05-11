/**
 * Edit style registry + template resolver.
 *
 * Single-style build: only PRESTYJ is registered. The barrel still exposes
 * the registry shape (EDIT_STYLES, STYLE_TEMPLATES) so consumers that look
 * up by id keep working — there's just one entry.
 */

import { ARCHETYPE_KEYS } from './shared/archetypes'
import type { Archetype } from './shared/archetypes'
import type {
  EditStyleTemplate,
  EditStyleTemplateView,
  ResolvedTemplate
} from './shared/types'
import { ARCHETYPE_META, ARCHETYPE_TO_CATEGORY } from './shared/archetypes'

import { prestyjEditStyle, prestyjTemplates } from './prestyj'

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const EDIT_STYLES: EditStyle[] = [prestyjEditStyle]

export const STYLE_TEMPLATES: Record<
  string,
  Record<Archetype, EditStyleTemplate>
> = {
  prestyj: prestyjTemplates
}

export const DEFAULT_EDIT_STYLE_ID = 'prestyj'

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function getEditStyleById(id: string): EditStyle | undefined {
  return EDIT_STYLES.find((s) => s.id === id)
}

/**
 * Resolve the transition type for a segment boundary from the edit style's
 * transition matrix. Looks up "outCategory→inCategory" in the style's
 * transitionMap; falls back to defaultTransition if no override exists.
 */
export function resolveTransition(
  style: EditStyle,
  outCategory: SegmentStyleCategory,
  inCategory: SegmentStyleCategory
): TransitionType {
  if (style.transitionMap) {
    const key = `${outCategory}→${inCategory}`
    const override = style.transitionMap[key]
    if (override) return override
  }
  return style.defaultTransition
}

// ---------------------------------------------------------------------------
// Template resolver
// ---------------------------------------------------------------------------

function getTemplate(
  archetype: Archetype,
  editStyleId: string
): EditStyleTemplate {
  const byStyle =
    STYLE_TEMPLATES[editStyleId] ?? STYLE_TEMPLATES[DEFAULT_EDIT_STYLE_ID]
  return byStyle[archetype] ?? { archetype }
}

/**
 * Resolve a (archetype, editStyleId) pair into a concrete zoom +
 * caption-position + caption-margin bundle. Archetypes own their layout —
 * there are no style variants underneath.
 */
/**
 * Defaults applied when a template does not declare a value. These mirror
 * the legacy hardcoded values that previously lived inside the render
 * pipeline (captions.ts ARCHETYPE_MARGIN_V, hook-title.ts y=147).
 *
 * Speaker archetypes anchor low (lower-third, ~230px above the bottom of
 * a 1920px canvas). Image / quote archetypes anchor near the vertical
 * midpoint (960 = 1920/2).
 */
const DEFAULT_CAPTION_MARGIN_V: Record<Archetype, number> = {
  'talking-head': 230,
  'tight-punch': 230,
  'wide-breather': 230,
  'quote-lower': 230,
  'split-image': 960,
  'fullscreen-image': 960,
  'fullscreen-quote': 960
}

/** Default hook title Y position — 220px on the 1920px canvas (≈11.46%). */
const DEFAULT_HOOK_TITLE_Y = 220
/** Default rehook pill Y position — mirrors the hook title default. */
const DEFAULT_REHOOK_Y = 220

export function resolveTemplate(
  archetype: Archetype,
  editStyleId: string
): ResolvedTemplate {
  const editStyle =
    getEditStyleById(editStyleId) ?? getEditStyleById(DEFAULT_EDIT_STYLE_ID)!
  const tpl = getTemplate(archetype, editStyle.id)

  return {
    archetype,
    editStyleId: editStyle.id,
    zoomStyle: tpl.zoomStyle ?? editStyle.defaultZoomStyle,
    zoomIntensity: tpl.zoomIntensity ?? editStyle.defaultZoomIntensity,
    captionPosition: tpl.captionPosition ?? 'lower-third',
    captionMarginV: tpl.captionMarginV ?? DEFAULT_CAPTION_MARGIN_V[archetype],
    hookTitleY: tpl.hookTitleY ?? DEFAULT_HOOK_TITLE_Y,
    rehookY: tpl.rehookY ?? DEFAULT_REHOOK_Y,
    captionMode: tpl.captionMode
  }
}

/**
 * Returns an array of display-ready templates for a given edit style.
 * Used by the renderer's SegmentTemplatePicker via IPC.
 */
export function getTemplatesForEditStyle(
  editStyleId: string
): EditStyleTemplateView[] {
  const style = getEditStyleById(editStyleId)
  if (!style) return []

  return ARCHETYPE_KEYS.map((archetype) => {
    const resolved = resolveTemplate(archetype, style.id)
    const meta = ARCHETYPE_META[archetype]
    return {
      archetype,
      editStyleId: style.id,
      name: meta.name,
      description: meta.description,
      category: ARCHETYPE_TO_CATEGORY[archetype],
      zoomStyle: resolved.zoomStyle,
      zoomIntensity: resolved.zoomIntensity,
      captionPosition: resolved.captionPosition
    }
  })
}

// Re-exports for consumers that used to import from ../edit-styles
export {
  ARCHETYPE_KEYS,
  ARCHETYPE_TO_CATEGORY,
  ARCHETYPE_META,
  SPEAKER_FULLSCREEN_ARCHETYPES,
  isSpeakerFullscreen
} from './shared/archetypes'
export type { Archetype } from './shared/archetypes'
export type {
  EditStyleTemplate,
  EditStyleTemplateView,
  ResolvedTemplate
} from './shared/types'
