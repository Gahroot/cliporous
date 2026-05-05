import { describe, it, expect } from 'vitest'
import { slugify, formatMMSS, zeroPad, resolveFilenameTemplate } from '../filename'

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('strips special characters', () => {
    expect(slugify('What?! Really...')).toBe('what-really')
  })

  it('collapses multiple hyphens', () => {
    expect(slugify('a  --  b')).toBe('a-b')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  - hello - ')).toBe('hello')
  })

  it('truncates to maxLen', () => {
    const long = 'this is a very long hook title that exceeds thirty characters'
    expect(slugify(long, 10).length).toBeLessThanOrEqual(10)
  })

  it('returns empty string for all-special input', () => {
    expect(slugify('!!!@@@')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// formatMMSS
// ---------------------------------------------------------------------------

describe('formatMMSS', () => {
  it('formats 0 seconds', () => {
    expect(formatMMSS(0)).toBe('00-00')
  })

  it('formats 125 seconds as 02-05', () => {
    expect(formatMMSS(125)).toBe('02-05')
  })

  it('formats 59.7 seconds as 01-00 (rounds)', () => {
    expect(formatMMSS(59.7)).toBe('01-00')
  })

  it('formats 3661 seconds', () => {
    expect(formatMMSS(3661)).toBe('61-01')
  })
})

// ---------------------------------------------------------------------------
// zeroPad
// ---------------------------------------------------------------------------

describe('zeroPad', () => {
  it('pads single digit', () => {
    expect(zeroPad(1)).toBe('01')
  })

  it('leaves double digit as-is', () => {
    expect(zeroPad(10)).toBe('10')
  })

  it('leaves triple digit as-is', () => {
    expect(zeroPad(100)).toBe('100')
  })
})

// ---------------------------------------------------------------------------
// resolveFilenameTemplate
// ---------------------------------------------------------------------------

describe('resolveFilenameTemplate', () => {
  const baseVars = {
    source: 'my_video',
    index: 1,
    score: 85,
    hook: 'This is amazing',
    duration: 30,
    startTime: 120,
    endTime: 150,
    quality: 'normal'
  }

  it('resolves default template', () => {
    const result = resolveFilenameTemplate('{source}_clip{index}_{score}', baseVars)
    expect(result).toBe('my_video_clip01_85')
  })

  it('resolves all variables', () => {
    const result = resolveFilenameTemplate(
      '{source}-{index}-{score}-{hook}-{duration}s-{start}-{end}-{quality}',
      baseVars
    )
    expect(result).toContain('my_video')
    expect(result).toContain('01')
    expect(result).toContain('85')
    expect(result).toContain('this-is-amazing')
    expect(result).toContain('30')
    expect(result).toContain('02-00') // 120s = 02:00
    expect(result).toContain('02-30') // 150s = 02:30
    expect(result).toContain('normal')
  })

  it('includes {date} as YYYY-MM-DD', () => {
    const result = resolveFilenameTemplate('{date}', baseVars)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('handles empty hook text', () => {
    const result = resolveFilenameTemplate('{hook}_clip', { ...baseVars, hook: '' })
    expect(result).toBe('_clip')
  })

  it('handles zero score', () => {
    const result = resolveFilenameTemplate('score_{score}', { ...baseVars, score: 0 })
    expect(result).toBe('score_0')
  })

  it('sanitizes illegal filename characters from source', () => {
    const result = resolveFilenameTemplate('{source}', { ...baseVars, source: 'my<video>:test' })
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).not.toContain(':')
  })

  it('truncates to 200 characters', () => {
    const longTemplate = '{source}'.repeat(100)
    const result = resolveFilenameTemplate(longTemplate, baseVars)
    expect(result.length).toBeLessThanOrEqual(200)
  })

  it('returns "clip" when template resolves to empty', () => {
    const result = resolveFilenameTemplate('{hook}', { ...baseVars, hook: '' })
    // Empty hook slugifies to '', sanitize to '', then fallback to 'clip'
    expect(result).toBe('clip')
  })
})
