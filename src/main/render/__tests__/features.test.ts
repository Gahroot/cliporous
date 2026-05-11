import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be defined before imports that reference them
// ---------------------------------------------------------------------------

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  writeFileSync: vi.fn()
}))

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') }
}))

vi.mock('../../captions', () => ({
  generateCaptions: vi.fn().mockResolvedValue('/tmp/batchcontent-captions-1234.ass')
}))

vi.mock('../../word-emphasis', () => ({
  analyzeEmphasisHeuristic: vi.fn((words: Array<{ text: string; start: number; end: number }>) =>
    words.map((w) => ({ ...w, emphasis: 'normal' }))
  )
}))

vi.mock('../../auto-zoom', () => ({
  generateZoomFilter: vi.fn(() => 'crop=trunc(iw*1.1):trunc(ih*1.1):0:0,scale=1080:1920')
}))

vi.mock('../../overlays/rehook', () => ({
  getDefaultRehookPhrase: vi.fn(() => 'Wait for it...')
}))

vi.mock('../../filler-detection', () => ({
  detectFillers: vi.fn(() => ({
    segments: [],
    counts: { filler: 0, silence: 0, repeat: 0 },
    timeSaved: 0
  }))
}))

vi.mock('../../filler-cuts', () => ({
  buildKeepSegments: vi.fn(() => []),
  remapWordTimestamps: vi.fn(() => [])
}))

vi.mock('../../ffmpeg', () => ({
  ffmpeg: vi.fn(),
  getEncoder: vi.fn(() => ({ encoder: 'libx264', presetFlag: ['-preset', 'veryfast'] })),
  getSoftwareEncoder: vi.fn(() => ({ encoder: 'libx264', presetFlag: ['-preset', 'veryfast'] })),
  isGpuSessionError: vi.fn(() => false)
}))

vi.mock('../../aspect-ratios', () => ({
  // Locked to 9:16 vertical at 1080×1920 @ 30fps. No other ratios are supported.
  ASPECT_RATIO_CONFIGS: {
    '9:16': { width: 1080, height: 1920 }
  },
  OUTPUT_WIDTH: 1080,
  OUTPUT_HEIGHT: 1920,
  OUTPUT_FPS: 30,
  computeCenterCropForRatio: (sw: number, sh: number) => ({
    x: 0, y: 0, width: sw, height: sh
  })
}))

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { createCaptionsFeature } from '../features/captions.feature'
import { createHookTitleFeature } from '../features/hook-title.feature'
import { createRehookFeature } from '../features/rehook.feature'
import { autoZoomFeature } from '../features/auto-zoom.feature'
import { createFillerRemovalFeature } from '../features/filler-removal.feature'
import { wordEmphasisFeature } from '../features/word-emphasis.feature'
import { brollFeature } from '../features/broll.feature'
import { accentColorFeature, restoreBatchOptions } from '../features/accent-color.feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<RenderClipJob> = {}): RenderClipJob {
  return {
    clipId: 'test-clip-1',
    sourceVideoPath: '/videos/source.mp4',
    startTime: 10,
    endTime: 40,
    wordTimestamps: [
      { text: 'Hello', start: 10, end: 10.5 },
      { text: 'world', start: 10.5, end: 11 },
      { text: 'this', start: 11, end: 11.3 },
      { text: 'is', start: 11.3, end: 11.5 },
      { text: 'a', start: 11.5, end: 11.6 },
      { text: 'test', start: 11.6, end: 12 }
    ],
    ...overrides
  }
}

function makeOptions(overrides: Partial<RenderBatchOptions> = {}): RenderBatchOptions {
  return {
    jobs: [],
    outputDirectory: '/output',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// CaptionsFeature
// ---------------------------------------------------------------------------

describe('CaptionsFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips when captionsEnabled is false', async () => {
    const feature = createCaptionsFeature()
    const result = await feature.prepare!(makeJob(), makeOptions({ captionsEnabled: false }))
    expect(result.modified).toBe(false)
    expect(result.tempFiles).toHaveLength(0)
  })

  it('skips when captionStyle is not provided', async () => {
    const feature = createCaptionsFeature()
    const result = await feature.prepare!(makeJob(), makeOptions({ captionsEnabled: true }))
    expect(result.modified).toBe(false)
  })

  it('skips when per-clip override disables captions', async () => {
    const feature = createCaptionsFeature()
    const job = makeJob({ clipOverrides: { enableCaptions: false } })
    const result = await feature.prepare!(
      job,
      makeOptions({
        captionsEnabled: true,
        captionStyle: {
          fontName: 'Arial',
          fontSize: 0.07,
          primaryColor: '#FFFFFF',
          highlightColor: '#00FF00',
          outlineColor: '#000000',
          backColor: '#80000000',
          outline: 2,
          shadow: 1,
          borderStyle: 1,
          wordsPerLine: 3,
          animation: 'karaoke-fill'
        }
      })
    )
    expect(result.modified).toBe(false)
  })

  it('skips when no word timestamps in clip range', async () => {
    const feature = createCaptionsFeature()
    const job = makeJob({ wordTimestamps: [] })
    const result = await feature.prepare!(
      job,
      makeOptions({
        captionsEnabled: true,
        captionStyle: {
          fontName: 'Arial',
          fontSize: 0.07,
          primaryColor: '#FFFFFF',
          highlightColor: '#00FF00',
          outlineColor: '#000000',
          backColor: '#80000000',
          outline: 2,
          shadow: 1,
          borderStyle: 1,
          wordsPerLine: 3,
          animation: 'karaoke-fill'
        }
      })
    )
    expect(result.modified).toBe(false)
  })

  it('generates captions and sets assFilePath when enabled', async () => {
    const feature = createCaptionsFeature()
    const job = makeJob()
    const result = await feature.prepare!(
      job,
      makeOptions({
        captionsEnabled: true,
        captionStyle: {
          fontName: 'Arial',
          fontSize: 0.07,
          primaryColor: '#FFFFFF',
          highlightColor: '#00FF00',
          outlineColor: '#000000',
          backColor: '#80000000',
          outline: 2,
          shadow: 1,
          borderStyle: 1,
          wordsPerLine: 3,
          animation: 'karaoke-fill'
        }
      })
    )
    expect(result.modified).toBe(true)
    expect(result.tempFiles).toHaveLength(1)
    expect(job.assFilePath).toBeDefined()
  })

  it('overlayPass returns ass filter when assFilePath is set', () => {
    const feature = createCaptionsFeature()
    const job = makeJob({ assFilePath: '/tmp/test.ass' })
    const result = feature.overlayPass!(job, {
      clipDuration: 30,
      targetWidth: 1080,
      targetHeight: 1920
    })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('captions')
    expect(result!.filter).toContain('ass=')
  })

  it('overlayPass returns null when no assFilePath', () => {
    const feature = createCaptionsFeature()
    const job = makeJob()
    const result = feature.overlayPass!(job, {
      clipDuration: 30,
      targetWidth: 1080,
      targetHeight: 1920
    })
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// HookTitleFeature
// ---------------------------------------------------------------------------

describe('HookTitleFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips when hook title overlay is not enabled', async () => {
    const feature = createHookTitleFeature()
    const result = await feature.prepare!(makeJob(), makeOptions())
    expect(result.modified).toBe(false)
  })

  it('skips when hookTitleText is missing', async () => {
    const feature = createHookTitleFeature()
    const result = await feature.prepare!(
      makeJob(),
      makeOptions({
        hookTitleOverlay: {
          enabled: true,
          displayDuration: 3,
          fadeIn: 0.3,
          fadeOut: 0.3,
          fontSize: 48,
          textColor: '#FFFFFF',
          outlineColor: '#000000'
        }
      })
    )
    expect(result.modified).toBe(false)
  })

  it('generates ASS file when enabled with text', async () => {
    const feature = createHookTitleFeature()
    const job = makeJob({ hookTitleText: 'You won\'t believe this!' })
    const result = await feature.prepare!(
      job,
      makeOptions({
        hookTitleOverlay: {
          enabled: true,
          displayDuration: 3,
          fadeIn: 0.3,
          fadeOut: 0.3,
          fontSize: 48,
          textColor: '#FFFFFF',
          outlineColor: '#000000'
        }
      })
    )
    expect(result.modified).toBe(true)
    expect(result.tempFiles).toHaveLength(1)
  })

  it('overlayPass returns filter after prepare', async () => {
    const feature = createHookTitleFeature()
    const job = makeJob({ hookTitleText: 'Hook text here' })
    await feature.prepare!(
      job,
      makeOptions({
        hookTitleOverlay: {
          enabled: true,
          displayDuration: 3,
          fadeIn: 0.3,
          fadeOut: 0.3,
          fontSize: 48,
          textColor: '#FFFFFF',
          outlineColor: '#000000'
        }
      })
    )
    const result = feature.overlayPass!(job, {
      clipDuration: 30,
      targetWidth: 1080,
      targetHeight: 1920
    })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('hook-title')
    expect(result!.filter).toContain('ass=')
  })

  it('overlayPass returns null without prepare', () => {
    const feature = createHookTitleFeature()
    const job = makeJob()
    const result = feature.overlayPass!(job, {
      clipDuration: 30,
      targetWidth: 1080,
      targetHeight: 1920
    })
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// RehookFeature
// ---------------------------------------------------------------------------

describe('RehookFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips when rehook overlay is not enabled', async () => {
    const feature = createRehookFeature()
    const result = await feature.prepare!(makeJob(), makeOptions())
    expect(result.modified).toBe(false)
  })

  it('skips when per-clip override disables hook title', async () => {
    const feature = createRehookFeature()
    const job = makeJob({ clipOverrides: { enableHookTitle: false } })
    const result = await feature.prepare!(
      job,
      makeOptions({
        rehookOverlay: {
          enabled: true,
          displayDuration: 2,
          fadeIn: 0.2,
          fadeOut: 0.2,
          fontSize: 36,
          textColor: '#FFFFFF',
          outlineColor: '#000000'
        }
      })
    )
    expect(result.modified).toBe(false)
  })

  it('computes appear time from hook title duration', async () => {
    const feature = createRehookFeature()
    const job = makeJob()
    await feature.prepare!(
      job,
      makeOptions({
        hookTitleOverlay: {
          enabled: true,
          displayDuration: 4,
          fadeIn: 0.3,
          fadeOut: 0.3,
          fontSize: 48,
          textColor: '#FFFFFF',
          outlineColor: '#000000'
        },
        rehookOverlay: {
          enabled: true,
          displayDuration: 2,
          fadeIn: 0.2,
          fadeOut: 0.2,
          fontSize: 36,
          textColor: '#FFFFFF',
          outlineColor: '#000000'
        }
      })
    )
    // Hook title is 4s, so rehook should appear at 4s
    expect(job.rehookAppearTime).toBe(4)
  })

  it('uses default 2.5s appear time when no hook title config', async () => {
    const feature = createRehookFeature()
    const job = makeJob()
    await feature.prepare!(
      job,
      makeOptions({
        rehookOverlay: {
          enabled: true,
          displayDuration: 2,
          fadeIn: 0.2,
          fadeOut: 0.2,
          fontSize: 36,
          textColor: '#FFFFFF',
          outlineColor: '#000000'
        }
      })
    )
    // Default hookDuration is 2.5s
    expect(job.rehookAppearTime).toBe(2.5)
  })

  it('sets default rehook text when none provided', async () => {
    const feature = createRehookFeature()
    const job = makeJob()
    await feature.prepare!(
      job,
      makeOptions({
        rehookOverlay: {
          enabled: true,
          displayDuration: 2,
          fadeIn: 0.2,
          fadeOut: 0.2,
          fontSize: 36,
          textColor: '#FFFFFF',
          outlineColor: '#000000'
        }
      })
    )
    expect(job.rehookText).toBe('Wait for it...')
  })
})

// ---------------------------------------------------------------------------
// AutoZoomFeature
// ---------------------------------------------------------------------------

describe('AutoZoomFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips when auto-zoom not configured', async () => {
    const result = await autoZoomFeature.prepare!(makeJob(), makeOptions())
    expect(result.modified).toBe(false)
  })

  it('skips when auto-zoom disabled', async () => {
    const result = await autoZoomFeature.prepare!(
      makeJob(),
      makeOptions({
        autoZoom: { enabled: false, mode: 'ken-burns', intensity: 'medium', intervalSeconds: 3 }
      })
    )
    expect(result.modified).toBe(false)
  })

  it('stores settings when enabled', async () => {
    const result = await autoZoomFeature.prepare!(
      makeJob(),
      makeOptions({
        autoZoom: { enabled: true, mode: 'ken-burns', intensity: 'medium', intervalSeconds: 3 }
      })
    )
    expect(result.modified).toBe(true)
  })

  it('skips when per-clip override disables', async () => {
    const job = makeJob({ clipOverrides: { enableAutoZoom: false } })
    const result = await autoZoomFeature.prepare!(
      job,
      makeOptions({
        autoZoom: { enabled: true, mode: 'ken-burns', intensity: 'medium', intervalSeconds: 3 }
      })
    )
    expect(result.modified).toBe(false)
  })

  it('videoFilter returns zoom string when enabled', async () => {
    const job = makeJob()
    await autoZoomFeature.prepare!(
      job,
      makeOptions({
        autoZoom: { enabled: true, mode: 'ken-burns', intensity: 'medium', intervalSeconds: 3 }
      })
    )
    const filter = autoZoomFeature.videoFilter!(job, {
      sourceWidth: 1920,
      sourceHeight: 1080,
      targetWidth: 1080,
      targetHeight: 1920,
      clipDuration: 30,
      outputAspectRatio: '9:16'
    })
    expect(filter).toBeTruthy()
    expect(typeof filter).toBe('string')
  })

  it('videoFilter returns null when disabled', async () => {
    const job = makeJob()
    await autoZoomFeature.prepare!(job, makeOptions())
    const filter = autoZoomFeature.videoFilter!(job, {
      sourceWidth: 1920,
      sourceHeight: 1080,
      targetWidth: 1080,
      targetHeight: 1920,
      clipDuration: 30,
      outputAspectRatio: '9:16'
    })
    expect(filter).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// FillerRemovalFeature
// ---------------------------------------------------------------------------

describe('FillerRemovalFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips when filler removal not enabled', async () => {
    const feature = createFillerRemovalFeature()
    const result = await feature.prepare!(makeJob(), makeOptions())
    expect(result.modified).toBe(false)
  })

  it('skips when no word timestamps', async () => {
    const feature = createFillerRemovalFeature()
    const job = makeJob({ wordTimestamps: [] })
    const result = await feature.prepare!(
      job,
      makeOptions({
        fillerRemoval: {
          enabled: true,
          removeFillerWords: true,
          trimSilences: false,
          removeRepeats: false,
          silenceThreshold: 0.5
        }
      })
    )
    expect(result.modified).toBe(false)
  })

  it('skips when no fillers detected', async () => {
    const feature = createFillerRemovalFeature()
    const result = await feature.prepare!(
      makeJob(),
      makeOptions({
        fillerRemoval: {
          enabled: true,
          removeFillerWords: true,
          trimSilences: false,
          removeRepeats: false,
          silenceThreshold: 0.5
        }
      })
    )
    // detectFillers mock returns empty segments
    expect(result.modified).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// WordEmphasisFeature
// ---------------------------------------------------------------------------

describe('WordEmphasisFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('computes emphasis from word timestamps', async () => {
    const job = makeJob()
    const result = await wordEmphasisFeature.prepare!(job, makeOptions())
    expect(result).toBeDefined()
    expect(job.wordEmphasis).toBeDefined()
    expect(job.emphasisKeyframes).toBeDefined()
  })

  it('uses pre-computed wordEmphasis when available', async () => {
    const job = makeJob({
      wordEmphasis: [
        { text: 'Hello', start: 0, end: 0.5, emphasis: 'emphasis' },
        { text: 'world', start: 0.5, end: 1, emphasis: 'normal' }
      ]
    })
    await wordEmphasisFeature.prepare!(job, makeOptions())
    // Should keep the pre-computed emphasis data
    expect(job.wordEmphasis).toHaveLength(2)
    expect(job.emphasisKeyframes).toBeDefined()
    expect(job.emphasisKeyframes!.length).toBeGreaterThanOrEqual(1)
  })

  it('skips when no word timestamps', async () => {
    const job = makeJob({ wordTimestamps: [] })
    const result = await wordEmphasisFeature.prepare!(job, makeOptions())
    expect(result.modified).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BRollFeature
// ---------------------------------------------------------------------------

describe('BRollFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('emits edit events from broll placements', async () => {
    const job = makeJob({
      brollPlacements: [
        {
          startTime: 5,
          duration: 3,
          videoPath: '/broll.mp4',
          keyword: 'test',
          displayMode: 'fullscreen',
          transition: 'crossfade'
        }
      ]
    })
    const result = await brollFeature.prepare!(job, makeOptions())
    expect(result.modified).toBe(true)
    expect(job.editEvents).toHaveLength(1)
    expect(job.editEvents![0].type).toBe('broll-transition')
    expect(job.editEvents![0].time).toBe(5)
  })

  it('does not duplicate existing edit events', async () => {
    const job = makeJob({
      brollPlacements: [
        {
          startTime: 5,
          duration: 3,
          videoPath: '/broll.mp4',
          keyword: 'test',
          displayMode: 'fullscreen',
          transition: 'crossfade'
        }
      ],
      editEvents: [{ type: 'broll-transition', time: 5 }]
    })
    const result = await brollFeature.prepare!(job, makeOptions())
    expect(job.editEvents).toHaveLength(1) // not duplicated
  })

  it('skips when no broll placements', async () => {
    const job = makeJob()
    const result = await brollFeature.prepare!(job, makeOptions())
    expect(result.modified).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AccentColorFeature
// ---------------------------------------------------------------------------

describe('AccentColorFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips when no accentColor override is set', async () => {
    const job = makeJob()
    const options = makeOptions({
      captionStyle: {
        fontName: 'Arial', fontSize: 0.07, primaryColor: '#FFFFFF',
        highlightColor: '#00FF00', outlineColor: '#000000', backColor: '#80000000',
        outline: 4, shadow: 0, borderStyle: 4, wordsPerLine: 3, animation: 'word-pop'
      }
    })
    const result = await accentColorFeature.prepare!(job, options)
    expect(result.modified).toBe(false)
    expect(options.captionStyle!.highlightColor).toBe('#00FF00') // unchanged
  })

  it('overrides caption highlightColor, emphasisColor, and supersizeColor', async () => {
    const job = makeJob({ clipOverrides: { accentColor: '#FF6B35' } })
    const options = makeOptions({
      captionStyle: {
        fontName: 'Arial', fontSize: 0.07, primaryColor: '#FFFFFF',
        highlightColor: '#00FF00', outlineColor: '#000000', backColor: '#80000000',
        outline: 4, shadow: 0, borderStyle: 4, wordsPerLine: 3, animation: 'word-pop'
      }
    })
    const result = await accentColorFeature.prepare!(job, options)
    expect(result.modified).toBe(true)
    expect(options.captionStyle!.highlightColor).toBe('#FF6B35')
    expect(options.captionStyle!.emphasisColor).toBe('#FF6B35')
    // supersizeColor should be a lighter tint
    expect(options.captionStyle!.supersizeColor).not.toBe('#FF6B35')
    expect(options.captionStyle!.supersizeColor).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('overrides hook title textColor', async () => {
    const job = makeJob({ clipOverrides: { accentColor: '#2563EB' } })
    const options = makeOptions({
      hookTitleOverlay: {
        enabled: true, style: 'centered-bold' as any, textColor: '#FFFFFF',
        outlineColor: '#000000', fontSize: 64, outlineWidth: 3,
        displayDuration: 2, fadeIn: 0.3, fadeOut: 0.3, position: 'center' as any
      }
    })
    const result = await accentColorFeature.prepare!(job, options)
    expect(result.modified).toBe(true)
    expect(options.hookTitleOverlay!.textColor).toBe('#2563EB')
    // outlineColor should be untouched
    expect(options.hookTitleOverlay!.outlineColor).toBe('#000000')
  })

  it('overrides per-shot caption style colors', async () => {
    const job = makeJob({
      clipOverrides: { accentColor: '#FF2D2D' },
      shotStyleConfigs: [
        {
          shotIndex: 0,
          captionStyle: {
            animation: 'word-pop', primaryColor: '#FFFFFF', highlightColor: '#00FF00',
            outlineColor: '#000000'
          }
        }
      ]
    })
    const result = await accentColorFeature.prepare!(job, makeOptions())
    expect(result.modified).toBe(true)
    expect(job.shotStyleConfigs![0].captionStyle!.highlightColor).toBe('#FF2D2D')
    expect(job.shotStyleConfigs![0].captionStyle!.emphasisColor).toBe('#FF2D2D')
  })

  it('does not touch options when accentColor is absent from clipOverrides', async () => {
    const job = makeJob({ clipOverrides: { enableCaptions: true } })
    const options = makeOptions({
      captionStyle: {
        fontName: 'Arial', fontSize: 0.07, primaryColor: '#FFFFFF',
        highlightColor: '#00FF00', outlineColor: '#000000', backColor: '#80000000',
        outline: 4, shadow: 0, borderStyle: 4, wordsPerLine: 3, animation: 'word-pop'
      }
    })
    const result = await accentColorFeature.prepare!(job, options)
    expect(result.modified).toBe(false)
    expect(options.captionStyle!.highlightColor).toBe('#00FF00')
  })

  it('restores batch options so clip B does not inherit clip A accent color', async () => {
    // Clip A has accent color
    const originalCaptionStyle = {
      fontName: 'Arial', fontSize: 0.07, primaryColor: '#FFFFFF',
      highlightColor: '#00FF00', outlineColor: '#000000', backColor: '#80000000',
      outline: 4, shadow: 0, borderStyle: 4, wordsPerLine: 3, animation: 'word-pop' as const
    }
    const originalHookTitle = {
      enabled: true, style: 'centered-bold' as const, textColor: '#FFFFFF',
      outlineColor: '#000000', fontSize: 64, outlineWidth: 3,
      displayDuration: 2, fadeIn: 0.3, fadeOut: 0.3, position: 'center' as const
    }
    const options = makeOptions({
      captionStyle: { ...originalCaptionStyle },
      hookTitleOverlay: { ...originalHookTitle }
    })

    // Process clip A with accent color
    const jobA = makeJob({ clipId: 'clip-a', clipOverrides: { accentColor: '#FF6B35' } })
    await accentColorFeature.prepare!(jobA, options)

    // Verify accent color was applied
    expect(options.captionStyle!.highlightColor).toBe('#FF6B35')
    expect(options.hookTitleOverlay!.textColor).toBe('#FF6B35')

    // Restore (simulates pipeline calling restoreBatchOptions after clip A finishes)
    restoreBatchOptions(jobA, options)

    // Verify originals are restored
    expect(options.captionStyle!.highlightColor).toBe('#00FF00')
    expect(options.captionStyle!.emphasisColor).toBeUndefined()
    expect(options.hookTitleOverlay!.textColor).toBe('#FFFFFF')

    // Process clip B with no accent color
    const jobB = makeJob({ clipId: 'clip-b', clipOverrides: {} })
    const resultB = await accentColorFeature.prepare!(jobB, options)
    expect(resultB.modified).toBe(false)
    expect(options.captionStyle!.highlightColor).toBe('#00FF00')
  })
})
