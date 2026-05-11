import { describe, it, expect } from 'vitest'
import { resolveQualityParams, parseResolution } from '../quality'

// ---------------------------------------------------------------------------
// resolveQualityParams
// ---------------------------------------------------------------------------

describe('resolveQualityParams', () => {
  it('returns normal defaults when no quality provided', () => {
    expect(resolveQualityParams()).toEqual({ crf: 23, preset: 'veryfast' })
  })

  it('returns normal defaults for preset "normal"', () => {
    const result = resolveQualityParams({
      preset: 'normal',
      customCrf: 10,
      outputResolution: '1080x1920',
      outputFormat: 'mp4',
      encodingPreset: 'slow'
    })
    expect(result).toEqual({ crf: 23, preset: 'veryfast' })
  })

  it('returns draft settings', () => {
    const result = resolveQualityParams({
      preset: 'draft',
      customCrf: 10,
      outputResolution: '1080x1920',
      outputFormat: 'mp4',
      encodingPreset: 'slow'
    })
    expect(result).toEqual({ crf: 30, preset: 'ultrafast' })
  })

  it('returns high settings', () => {
    const result = resolveQualityParams({
      preset: 'high',
      customCrf: 10,
      outputResolution: '1080x1920',
      outputFormat: 'mp4',
      encodingPreset: 'slow'
    })
    expect(result).toEqual({ crf: 18, preset: 'medium' })
  })

  it('returns custom settings from user values', () => {
    const result = resolveQualityParams({
      preset: 'custom',
      customCrf: 15,
      outputResolution: '1080x1920',
      outputFormat: 'mp4',
      encodingPreset: 'slow'
    })
    expect(result).toEqual({ crf: 15, preset: 'slow' })
  })

  it('returns normal defaults for unknown preset', () => {
    const result = resolveQualityParams({
      preset: 'unknown' as any,
      customCrf: 10,
      outputResolution: '1080x1920',
      outputFormat: 'mp4',
      encodingPreset: 'slow'
    })
    expect(result).toEqual({ crf: 23, preset: 'veryfast' })
  })
})

// ---------------------------------------------------------------------------
// parseResolution — locked to 1080×1920 (9:16 vertical)
// ---------------------------------------------------------------------------

describe('parseResolution (locked to 1080×1920)', () => {
  it('always returns 1080×1920 regardless of input', () => {
    expect(parseResolution('1080x1920')).toEqual({ width: 1080, height: 1920 })
    expect(parseResolution('720x1280')).toEqual({ width: 1080, height: 1920 })
    expect(parseResolution('invalid')).toEqual({ width: 1080, height: 1920 })
    expect(parseResolution('720x')).toEqual({ width: 1080, height: 1920 })
  })
})
