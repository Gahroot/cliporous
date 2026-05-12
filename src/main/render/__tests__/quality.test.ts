import { describe, it, expect } from 'vitest'
import { resolveQualityParams, parseResolution, getIntermediateQuality } from '../quality'

// ---------------------------------------------------------------------------
// resolveQualityParams
// ---------------------------------------------------------------------------

describe('resolveQualityParams', () => {
  it('returns normal defaults when no quality provided', () => {
    expect(resolveQualityParams()).toEqual({ crf: 20, preset: 'medium' })
  })

  it('returns normal defaults for preset "normal"', () => {
    const result = resolveQualityParams({
      preset: 'normal',
      customCrf: 10,
      outputResolution: '1080x1920',
      outputFormat: 'mp4',
      encodingPreset: 'slow'
    })
    expect(result).toEqual({ crf: 20, preset: 'medium' })
  })

  it('returns draft settings', () => {
    const result = resolveQualityParams({
      preset: 'draft',
      customCrf: 10,
      outputResolution: '1080x1920',
      outputFormat: 'mp4',
      encodingPreset: 'slow'
    })
    expect(result).toEqual({ crf: 28, preset: 'veryfast' })
  })

  it('returns high settings', () => {
    const result = resolveQualityParams({
      preset: 'high',
      customCrf: 10,
      outputResolution: '1080x1920',
      outputFormat: 'mp4',
      encodingPreset: 'slow'
    })
    expect(result).toEqual({ crf: 17, preset: 'slow' })
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
    expect(result).toEqual({ crf: 20, preset: 'medium' })
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

// ---------------------------------------------------------------------------
// getIntermediateQuality — near-lossless params for transient segment / xfade
// outputs that will be immediately re-encoded by the overlay pass.
// ---------------------------------------------------------------------------

describe('getIntermediateQuality', () => {
  it('returns near-lossless params for transient intermediates', () => {
    expect(getIntermediateQuality()).toEqual({ crf: 12, preset: 'veryfast' })
  })
})
