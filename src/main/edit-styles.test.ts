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
  it('registers exactly one edit style (prestyj) as the default', () => {
    expect(EDIT_STYLES).toHaveLength(1)
    expect(EDIT_STYLES[0].id).toBe('prestyj')
    expect(DEFAULT_EDIT_STYLE_ID).toBe('prestyj')
  })

  it('exposes a single STYLE_TEMPLATES key for prestyj', () => {
    const keys = Object.keys(STYLE_TEMPLATES)
    expect(keys).toEqual(['prestyj'])
  })

  it('uses the brand violet (#9f75ff) as the prestyj accent color', () => {
    expect(EDIT_STYLES[0].accentColor.toLowerCase()).toBe('#9f75ff')
  })
})

describe('edit-styles archetype coverage', () => {
  it('defines a template for every archetype in prestyjTemplates', () => {
    for (const archetype of ARCHETYPE_KEYS) {
      expect(prestyjTemplates[archetype]).toBeDefined()
    }
    expect(Object.keys(prestyjTemplates)).toHaveLength(ARCHETYPE_KEYS.length)
    expect(ARCHETYPE_KEYS).toHaveLength(8)
  })

  it('resolveTemplate returns a non-null result for every archetype', () => {
    for (const archetype of ARCHETYPE_KEYS) {
      const resolved = resolveTemplate(archetype, 'prestyj')
      expect(resolved).not.toBeNull()
      expect(resolved).toBeDefined()
      expect(resolved.archetype).toBe(archetype)
      expect(resolved.editStyleId).toBe('prestyj')
      expect(resolved.variant).toBeDefined()
    }
  })
})
