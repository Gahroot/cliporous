// ---------------------------------------------------------------------------
// Tests for the V2 caption builder (`buildAssLines`).
//
// One fixture of word-timed input is fed through each of the three caption
// modes and the resulting ASS Dialogue lines are asserted to contain (or omit)
// the right inline override tags.
//
//   • standard           — no per-word \fn or \c / \1c overrides
//   • emphasis           — accent colour (\1c) on emphasized words, no font swap
//   • emphasis_highlight — both \fn<FANCY_FONT> AND the accent colour in BGR
// Every line is prefixed with a \blur override so the black outline reads as
// a soft 0-offset halo behind the text.
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

    it('emits the accent colour override on emphasized words', () => {
      expect(lines[0]).toMatch(COLOR_OVERRIDE_RE)
      expect(lines[0]).toContain(DEFAULT_ACCENT_BGR_HEX)
    })

    it('does not swap the font on emphasized words (font swap is reserved for emphasis_highlight)', () => {
      expect(lines[0]).not.toContain(`\\fn${FANCY_FONT}`)
    })

    it('does not apply the accent colour to normal words', () => {
      // `this` and `cool` should appear without an immediately-preceding \1c override.
      expect(lines[0]).not.toMatch(/\\1c&H[0-9A-F]{6,8}\}this\b/)
      expect(lines[0]).not.toMatch(/\\1c&H[0-9A-F]{6,8}\}cool\b/)
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

  describe('drop-shadow halo', () => {
    it('prefixes every dialogue line with a \\blur override', () => {
      for (const mode of ['standard', 'emphasis', 'emphasis_highlight'] as const) {
        const [line] = buildAssLines(FIXTURE, mode, DEFAULT_ACCENT, 4)
        // The line text starts after the 9th comma; the very first override
        // block on the text payload should be a \blur tag.
        expect(line).toMatch(/,\{\\blur\d+\}/)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Snapshot tests — one full sample dialogue line per mode.
// ---------------------------------------------------------------------------

// Snapshots are regenerated whenever the V2 caption look changes; treat the
// snap file as derived output rather than a spec.
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
