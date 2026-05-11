/**
 * Edit-styles re-export shim. The implementation lives in
 * src/main/edit-styles/. Keep this file around for importers that still
 * reference the flat path (`../edit-styles`).
 */

export {
  EDIT_STYLES,
  STYLE_TEMPLATES,
  DEFAULT_EDIT_STYLE_ID,
  getEditStyleById,
  resolveTransition,
  resolveTemplate,
  getTemplatesForEditStyle,
  ARCHETYPE_KEYS,
  ARCHETYPE_TO_CATEGORY,
  ARCHETYPE_META,
  SPEAKER_FULLSCREEN_ARCHETYPES,
  isSpeakerFullscreen
} from './edit-styles/index'

export type {
  Archetype,
  EditStyleTemplate,
  EditStyleTemplateView,
  ResolvedTemplate
} from './edit-styles/index'
