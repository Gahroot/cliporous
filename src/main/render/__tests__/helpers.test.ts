import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  toFFmpegPath,
  sanitizeFilename,
  formatASSTimestamp,
  cssHexToASS,
  buildASSFilter,
  buildASSFilterForComplex
} from '../helpers'

// ---------------------------------------------------------------------------
// toFFmpegPath
// ---------------------------------------------------------------------------

describe('toFFmpegPath', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('converts backslashes to forward slashes on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    expect(toFFmpegPath('C:\\Users\\Groot\\video.mp4')).toBe('C:/Users/Groot/video.mp4')
  })

  it('handles already-forward-slashed paths on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    expect(toFFmpegPath('C:/Users/Groot/video.mp4')).toBe('C:/Users/Groot/video.mp4')
  })

  it('leaves paths unchanged on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    expect(toFFmpegPath('/home/groot/video.mp4')).toBe('/home/groot/video.mp4')
  })

  it('leaves paths unchanged on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(toFFmpegPath('/Users/groot/video.mp4')).toBe('/Users/groot/video.mp4')
  })
})

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

describe('sanitizeFilename', () => {
  it('strips < > : " / \\ | ? *', () => {
    expect(sanitizeFilename('file<>:"/\\|?*name')).toBe('file_________name')
  })

  it('strips control characters', () => {
    expect(sanitizeFilename('a\x00b\x1Fc')).toBe('a_b_c')
  })

  it('trims whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello')
  })

  it('returns empty for all-illegal input', () => {
    expect(sanitizeFilename('<>:""')).toBe('_____')
  })

  it('preserves valid characters', () => {
    expect(sanitizeFilename('My Clip (2026) - v1.0')).toBe('My Clip (2026) - v1.0')
  })
})

// ---------------------------------------------------------------------------
// formatASSTimestamp
// ---------------------------------------------------------------------------

describe('formatASSTimestamp', () => {
  it('formats 0 seconds', () => {
    expect(formatASSTimestamp(0)).toBe('0:00:00.00')
  })

  it('formats 1.5 seconds', () => {
    expect(formatASSTimestamp(1.5)).toBe('0:00:01.50')
  })

  it('formats 65.75 seconds (1 min 5.75 sec)', () => {
    expect(formatASSTimestamp(65.75)).toBe('0:01:05.75')
  })

  it('formats 3661.99 seconds (1 hr 1 min 1.99 sec)', () => {
    expect(formatASSTimestamp(3661.99)).toBe('1:01:01.99')
  })

  it('clamps negative values to 0', () => {
    expect(formatASSTimestamp(-5)).toBe('0:00:00.00')
  })

  it('handles exact minute boundary', () => {
    expect(formatASSTimestamp(60)).toBe('0:01:00.00')
  })

  it('handles exact hour boundary', () => {
    expect(formatASSTimestamp(3600)).toBe('1:00:00.00')
  })
})

// ---------------------------------------------------------------------------
// cssHexToASS
// ---------------------------------------------------------------------------

describe('cssHexToASS', () => {
  it('converts #FFFFFF (white) → &H00FFFFFF', () => {
    expect(cssHexToASS('#FFFFFF')).toBe('&H00FFFFFF')
  })

  it('converts #FF0000 (red) → &H000000FF (ASS BGR swapped)', () => {
    expect(cssHexToASS('#FF0000')).toBe('&H000000FF')
  })

  it('converts #00FF00 (green) → &H0000FF00', () => {
    expect(cssHexToASS('#00FF00')).toBe('&H0000FF00')
  })

  it('converts #0000FF (blue) → &H00FF0000', () => {
    expect(cssHexToASS('#0000FF')).toBe('&H00FF0000')
  })

  it('converts 8-char hex with alpha: #80FF00FF → &H80FF00FF', () => {
    expect(cssHexToASS('#80FF00FF')).toBe('&H80FF00FF')
  })

  it('converts 8-char hex #80000000 → &H80000000', () => {
    expect(cssHexToASS('#80000000')).toBe('&H80000000')
  })

  it('falls back to white for invalid hex', () => {
    expect(cssHexToASS('#ZZZ')).toBe('&H00FFFFFF')
  })

  it('works without # prefix', () => {
    expect(cssHexToASS('FF0000')).toBe('&H000000FF')
  })
})

// ---------------------------------------------------------------------------
// buildASSFilter
// ---------------------------------------------------------------------------

describe('buildASSFilter', () => {
  it('builds basic ass filter', () => {
    expect(buildASSFilter('/tmp/test.ass')).toBe("ass='/tmp/test.ass'")
  })

  it('converts Windows backslashes to forward slashes and escapes the drive colon', () => {
    // C:\Users\test.ass → C\:/Users/test.ass (matches the drawtext/fontfile
    // pattern the rest of the codebase uses; libavfilter chokes on \\-escaped
    // Windows paths inside single-quoted filter values).
    expect(buildASSFilter('C:\\Users\\test.ass')).toBe(
      "ass='C\\:/Users/test.ass'"
    )
  })

  it('escapes colons in forward-slash path', () => {
    expect(buildASSFilter('C:/Users/test.ass')).toBe(
      "ass='C\\:/Users/test.ass'"
    )
  })

  it('includes fontsdir when provided', () => {
    const result = buildASSFilter('/tmp/test.ass', '/fonts')
    expect(result).toBe("ass='/tmp/test.ass':fontsdir='/fonts'")
  })

  it('normalizes fontsdir path too', () => {
    // C:\Fonts\Dir → C\:/Fonts/Dir
    const result = buildASSFilter('/tmp/test.ass', 'C:\\Fonts\\Dir')
    expect(result).toBe("ass='/tmp/test.ass':fontsdir='C\\:/Fonts/Dir'")
  })
})

// ---------------------------------------------------------------------------
// buildASSFilterForComplex
// ---------------------------------------------------------------------------

describe('buildASSFilterForComplex', () => {
  it('produces the same result as buildASSFilter (colons must be escaped)', () => {
    const path = 'C:/Users/test.ass'
    const fontsDir = 'C:/Users/Groot/Desktop/BatchContent/resources/fonts'
    expect(buildASSFilterForComplex(path, fontsDir)).toBe(buildASSFilter(path, fontsDir))
  })

  it('escapes Windows drive-letter colon in both ass path and fontsdir', () => {
    const result = buildASSFilterForComplex(
      'C:/Users/test.ass',
      'C:/Users/Groot/Desktop/BatchContent/resources/fonts'
    )
    expect(result).toBe(
      "ass='C\\:/Users/test.ass':fontsdir='C\\:/Users/Groot/Desktop/BatchContent/resources/fonts'"
    )
  })

  it('handles Linux paths (no colons to escape)', () => {
    const result = buildASSFilterForComplex('/tmp/test.ass', '/usr/share/fonts')
    expect(result).toBe("ass='/tmp/test.ass':fontsdir='/usr/share/fonts'")
  })

  it('works without fontsdir', () => {
    const result = buildASSFilterForComplex('C:/Users/test.ass')
    expect(result).toBe("ass='C\\:/Users/test.ass'")
  })
})
