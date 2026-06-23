// ---------------------------------------------------------------------------
// Tests for the edit-styles registry (single-style PRESTYJ build).
//
// Locks in the invariants the rest of the pipeline relies on:
//   • exactly one registered style, id `prestyj`, also the default
//   • STYLE_TEMPLATES has a single keyed entry for that style
//   • the prestyj accent color resolves to the brand violet `#9f75ff`
//   • every archetype in ARCHETYPE_KEYS has a template defined and
//     resolveTemplate() returns a non-null result for each
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import {
  EDIT_STYLES,
  STYLE_TEMPLATES,
  DEFAULT_EDIT_STYLE_ID,
  ARCHETYPE_KEYS,
  resolveTemplate
} from './edit-styles'
import { prestyjTemplates } from './edit-styles/prestyj'

describe('edit-styles registry', () => {
  it('keeps prestyj as the first/default edit style', () => {
    // prestyj is the locked 9:16 short-form style and must remain the default.
    // hormozi is additive (long-form 16:9 only) and must not displace it.
    expect(EDIT_STYLES[0].id).toBe('prestyj')
    expect(DEFAULT_EDIT_STYLE_ID).toBe('prestyj')
  })

  it('registers the additive hormozi long-form style without a 9:16 template set', () => {
    expect(EDIT_STYLES.map((s) => s.id)).toEqual(['prestyj', 'hormozi'])
    // The 9:16 STYLE_TEMPLATES (keyed on the Archetype union) stays prestyj-only;
    // hormozi's long-form tuning lives in the separate LONGFORM_TEMPLATES map.
    expect(Object.keys(STYLE_TEMPLATES)).toEqual(['prestyj'])
  })

  it('uses the brand violet (#9f75ff) as the prestyj accent color', () => {
    const prestyj = EDIT_STYLES.find((s) => s.id === 'prestyj')!
    expect(prestyj.accentColor.toLowerCase()).toBe('#9f75ff')
  })
})

describe('edit-styles archetype coverage', () => {
  it('defines a template for every archetype in prestyjTemplates', () => {
    for (const archetype of ARCHETYPE_KEYS) {
      expect(prestyjTemplates[archetype]).toBeDefined()
    }
    expect(Object.keys(prestyjTemplates)).toHaveLength(ARCHETYPE_KEYS.length)
    expect(ARCHETYPE_KEYS).toHaveLength(7)
  })

  it('resolveTemplate returns a non-null result for every archetype', () => {
    for (const archetype of ARCHETYPE_KEYS) {
      const resolved = resolveTemplate(archetype, 'prestyj')
      expect(resolved).not.toBeNull()
      expect(resolved).toBeDefined()
      expect(resolved.archetype).toBe(archetype)
      expect(resolved.editStyleId).toBe('prestyj')
    }
  })
})
