// ---------------------------------------------------------------------------
// Tests for the V2 caption builder (`buildAssLines`).
//
// One fixture of word-timed input is fed through each of the three caption
// modes and the resulting ASS Dialogue lines are asserted to contain (or omit)
// the right inline override tags.
//
//   • standard           — no \fn or color (\c / \1c) override on any word
//   • emphasis           — \fn<FANCY_FONT> on emphasized words, no color
//   • emphasis_highlight — both \fn<FANCY_FONT> AND the accent color in BGR
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import {
  buildAssLines,
  FANCY_FONT,
  DEFAULT_ACCENT,
  type WordInput
} from './captions'

// ---------------------------------------------------------------------------
// Fixture — four words, the middle two are emphasized.
// ---------------------------------------------------------------------------

const FIXTURE: WordInput[] = [
  { text: 'this', start: 0.0, end: 0.3, emphasis: 'normal' },
  { text: 'is',   start: 0.3, end: 0.5, emphasis: 'emphasis' },
  { text: 'very', start: 0.5, end: 0.9, emphasis: 'emphasis' },
  { text: 'cool', start: 0.9, end: 1.4, emphasis: 'normal' }
]

/** `#9f75ff` → ASS &HAABBGGRR with alpha=00 → &H00FF759F */
const DEFAULT_ACCENT_BGR_HEX = 'FF759F'

// Match a primary-colour override targeting any of the BGR hex pairs the
// builder might emit. The emitted form is `\1c&HAABBGGRR` (no trailing `&`,
// since `hexToASS` returns the bare token). We keep the regex flexible
// (`\1?c`) so the assertion still reads as "any \c-style primary colour
// override".
const COLOR_OVERRIDE_RE = /\\1?c&H[0-9A-F]{6,8}/

describe('buildAssLines — caption mode tag emission', () => {
  describe('standard mode', () => {
    const lines = buildAssLines(FIXTURE, 'standard', DEFAULT_ACCENT, 4)

    it('produces exactly one dialogue line for the fixture', () => {
      expect(lines).toHaveLength(1)
    })

    it('emits no \\fn font override on any word', () => {
      expect(lines[0]).not.toContain('\\fn')
    })

    it('emits no \\c / \\1c colour override on any word', () => {
      expect(lines[0]).not.toMatch(COLOR_OVERRIDE_RE)
    })

    it('contains all four word texts in order', () => {
      expect(lines[0]).toMatch(/this is very cool$/)
    })
  })

  describe('emphasis mode', () => {
    const lines = buildAssLines(FIXTURE, 'emphasis', DEFAULT_ACCENT, 4)

    it('produces exactly one dialogue line for the fixture', () => {
      expect(lines).toHaveLength(1)
    })

    it('emits a \\fn<FANCY_FONT> override on emphasized words', () => {
      expect(lines[0]).toContain(`{\\fn${FANCY_FONT}}is`)
      expect(lines[0]).toContain(`{\\fn${FANCY_FONT}}very`)
    })

    it('emits no colour override on any word', () => {
      expect(lines[0]).not.toMatch(COLOR_OVERRIDE_RE)
    })

    it('does not wrap normal words with a font override', () => {
      expect(lines[0]).not.toContain(`{\\fn${FANCY_FONT}}this`)
      expect(lines[0]).not.toContain(`{\\fn${FANCY_FONT}}cool`)
    })
  })

  describe('emphasis_highlight mode', () => {
    const lines = buildAssLines(FIXTURE, 'emphasis_highlight', DEFAULT_ACCENT, 4)

    it('produces exactly one dialogue line for the fixture', () => {
      expect(lines).toHaveLength(1)
    })

    it('emits BOTH a \\fn override and the accent colour in BGR on emphasized words', () => {
      // Each emphasized word should carry the fancy font swap.
      expect(lines[0]).toContain(`\\fn${FANCY_FONT}`)
      // …and the accent colour written as BGR (the builder uses \1c&HBBGGRR&).
      expect(lines[0]).toMatch(COLOR_OVERRIDE_RE)
      expect(lines[0]).toContain(DEFAULT_ACCENT_BGR_HEX)
    })

    it('does not apply font or colour overrides to normal words', () => {
      // Normal words are emitted as bare text — no override block precedes
      // them. We assert this by confirming that the literal word `this` and
      // `cool` appear without an immediately-preceding emphasis override.
      expect(lines[0]).not.toMatch(new RegExp(`\\\\fn${FANCY_FONT}[^}]*\\}this\\b`))
      expect(lines[0]).not.toMatch(new RegExp(`\\\\fn${FANCY_FONT}[^}]*\\}cool\\b`))
    })
  })
})

// ---------------------------------------------------------------------------
// Snapshot tests — one full sample dialogue line per mode.
// ---------------------------------------------------------------------------

describe('buildAssLines — snapshot of one full dialogue line per mode', () => {
  it('standard — full Dialogue line', () => {
    const [line] = buildAssLines(FIXTURE, 'standard', DEFAULT_ACCENT, 4)
    expect(line).toMatchSnapshot()
  })

  it('emphasis — full Dialogue line', () => {
    const [line] = buildAssLines(FIXTURE, 'emphasis', DEFAULT_ACCENT, 4)
    expect(line).toMatchSnapshot()
  })

  it('emphasis_highlight — full Dialogue line', () => {
    const [line] = buildAssLines(FIXTURE, 'emphasis_highlight', DEFAULT_ACCENT, 4)
    expect(line).toMatchSnapshot()
  })
})
