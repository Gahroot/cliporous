/**
 * Edit style registry + template resolver.
 *
 * Single-style build: only PRESTYJ is registered. The barrel still exposes
 * the registry shape (EDIT_STYLES, STYLE_TEMPLATES) so consumers that look
 * up by id keep working — there's just one entry.
 */

import { getVariantById } from '../segment-styles'
import { ARCHETYPE_DEFAULT_VARIANT, ARCHETYPE_KEYS } from './shared/archetypes'
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
  const byStyle = STYLE_TEMPLATES[editStyleId] ?? STYLE_TEMPLATES[DEFAULT_EDIT_STYLE_ID]
  return (
    byStyle[archetype] ?? {
      archetype,
      variantId: ARCHETYPE_DEFAULT_VARIANT[archetype],
      layoutParamOverrides: {}
    }
  )
}

/**
 * Resolve a (archetype, editStyleId) pair into a concrete variant + zoom +
 * caption-position + layout-param overrides. This is the single merge point
 * between the authored template and the render pipeline's consumption.
 */
export function resolveTemplate(
  archetype: Archetype,
  editStyleId: string
): ResolvedTemplate {
  const editStyle =
    getEditStyleById(editStyleId) ?? getEditStyleById(DEFAULT_EDIT_STYLE_ID)!
  const tpl = getTemplate(archetype, editStyle.id)
  const baseVariant =
    getVariantById(tpl.variantId) ??
    getVariantById(ARCHETYPE_DEFAULT_VARIANT[archetype])!

  const variant: SegmentStyleVariant = {
    ...baseVariant,
    captionPosition: tpl.captionPosition ?? baseVariant.captionPosition,
    imageLayout: tpl.imageLayout ?? baseVariant.imageLayout,
    imagePlacement: tpl.imagePlacement ?? baseVariant.imagePlacement
  }

  return {
    archetype,
    editStyleId: editStyle.id,
    variant,
    zoomStyle:
      tpl.zoomStyle ?? baseVariant.zoomStyle ?? editStyle.defaultZoomStyle,
    zoomIntensity:
      tpl.zoomIntensity ??
      baseVariant.zoomIntensity ??
      editStyle.defaultZoomIntensity,
    captionPosition: variant.captionPosition,
    layoutParamOverrides: tpl.layoutParamOverrides ?? {},
    captionMarginV: tpl.captionMarginV
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
      variantId: resolved.variant.id,
      zoomStyle: resolved.zoomStyle,
      zoomIntensity: resolved.zoomIntensity,
      captionPosition: resolved.captionPosition,
      imageLayout: resolved.variant.imageLayout,
      imagePlacement: resolved.variant.imagePlacement
    }
  })
}

// Re-exports for consumers that used to import from ../edit-styles
export { ARCHETYPE_KEYS, ARCHETYPE_TO_CATEGORY, ARCHETYPE_META } from './shared/archetypes'
export type { Archetype } from './shared/archetypes'
export type {
  EditStyleTemplate,
  EditStyleTemplateView,
  ResolvedTemplate
} from './shared/types'
