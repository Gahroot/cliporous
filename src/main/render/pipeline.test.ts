// ---------------------------------------------------------------------------
// Pipeline integration test — drives one fake clip per PRESTYJ archetype
// through every ported render feature's prepare → videoFilter → overlayPass
// → postProcess phases. Assertions:
//
//   1. No feature throws while processing any archetype.
//   2. The combined filter graph (videoFilter chain + overlay passes) is
//      non-empty across the test set.
//   3. Every registered feature is invoked at least once across the 8 jobs.
//
// FFmpeg execution is mocked — the test never shells out.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be defined before imports that reference them
// ---------------------------------------------------------------------------

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from(''))
}))

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from(''))
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') }
}))

// NOTE: This test file lives at src/main/render/pipeline.test.ts. Mock
// specifiers therefore use '../<name>' to reach src/main/<name>, mirroring
// what the feature files at src/main/render/features/<x>.feature.ts see
// when they import '../../<name>'. Both resolve to the same module URL
// inside vitest's mock registry.
vi.mock('../captions', () => ({
  generateCaptions: vi.fn().mockResolvedValue('/tmp/batchcontent-captions-archetype.ass')
}))

vi.mock('../word-emphasis', () => ({
  analyzeEmphasisHeuristic: vi.fn(
    (words: Array<{ text: string; start: number; end: number }>) =>
      words.map((w, i) => ({
        ...w,
        // Mark a couple of words as emphasis so downstream features have data to consume.
        emphasis: i % 3 === 0 ? 'emphasis' : 'normal'
      }))
  )
}))

vi.mock('../auto-zoom', () => ({
  generateZoomFilter: vi.fn(
    () => 'crop=trunc(iw*1.1):trunc(ih*1.1):0:0,scale=720:1280'
  ),
  generatePiecewiseZoomFilter: vi.fn(
    () =>
      "crop=w='iw*1.1':h='ih*1.1':x='(iw-iw*1.1)/2':y='(ih-ih*1.1)/2',scale=720:1280"
  )
}))

vi.mock('../overlays/rehook', () => ({
  getDefaultRehookPhrase: vi.fn(() => 'Wait for it...')
}))

vi.mock('../filler-detection', () => ({
  detectFillers: vi.fn(() => ({
    segments: [],
    counts: { filler: 0, silence: 0, repeat: 0 },
    timeSaved: 0
  }))
}))

vi.mock('../filler-cuts', () => ({
  buildKeepSegments: vi.fn(() => []),
  remapWordTimestamps: vi.fn(() => [])
}))

// FFmpeg execution surface — every shell-out path is fully mocked. Each call
// to `ffmpeg(...)` returns a chainable object whose `.run()` resolves
// immediately with no spawned process. `vi.hoisted` is required because
// vi.mock() factories are hoisted to the top of the file; any closure
// variable they reference must be hoisted alongside.
const { ffmpegRunMock } = vi.hoisted(() => ({
  ffmpegRunMock: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../ffmpeg', () => {
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  const methods = [
    'input',
    'inputOptions',
    'output',
    'outputOptions',
    'videoFilter',
    'audioFilter',
    'complexFilter',
    'on',
    'size',
    'fps',
    'videoCodec',
    'audioCodec',
    'format',
    'duration',
    'seekInput',
    'addInput',
    'addOption',
    'addOutputOption',
    'addInputOption'
  ]
  for (const m of methods) chain[m] = vi.fn(() => chain)
  chain.run = ffmpegRunMock
  chain.kill = vi.fn()
  // `.save(path)` is the fluent terminator used by broll.feature.ts. Resolve
  // any registered 'end' handlers on the next tick so the wrapping Promise
  // settles cleanly.
  chain.save = vi.fn(() => {
    queueMicrotask(() => {
      const onCalls = (chain.on as ReturnType<typeof vi.fn>).mock.calls as Array<[string, (...a: unknown[]) => void]>
      for (const [event, handler] of onCalls) {
        if (event === 'end' && typeof handler === 'function') handler()
      }
    })
    return chain
  })
  return {
    ffmpeg: vi.fn(() => chain),
    getEncoder: vi.fn(() => ({ encoder: 'libx264', presetFlag: ['-preset', 'veryfast'] })),
    getSoftwareEncoder: vi.fn(() => ({ encoder: 'libx264', presetFlag: ['-preset', 'veryfast'] })),
    isGpuSessionError: vi.fn(() => false),
    isGpuEncoderDisabled: vi.fn(() => false),
    disableGpuEncoderForSession: vi.fn(),
    getVideoMetadata: vi.fn(async () => ({
      width: 1920,
      height: 1080,
      codec: 'h264',
      fps: 30,
      audioCodec: 'aac',
      duration: 60
    }))
  }
})

vi.mock('../aspect-ratios', () => ({
  // Locked to 9:16 vertical at 720×1280 @ 30fps.
  ASPECT_RATIO_CONFIGS: {
    '9:16': { width: 720, height: 1280 }
  },
  OUTPUT_WIDTH: 720,
  OUTPUT_HEIGHT: 1280,
  OUTPUT_FPS: 30,
  computeCenterCropForRatio: (sw: number, sh: number) => ({
    x: 0,
    y: 0,
    width: sw,
    height: sh
  })
}))

// Stub the broll image overlay path. The B-Roll feature's local
// applyBRollOverlay() function uses the mocked ../ffmpeg surface above,
// so postProcess returns immediately without spawning a child process.
vi.mock('../broll-image-overlay', () => ({
  applyBRollImageOverlay: vi.fn().mockResolvedValue(undefined)
}))

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { createCaptionsFeature } from './features/captions.feature'
import { createHookTitleFeature } from './features/hook-title.feature'
import { createRehookFeature } from './features/rehook.feature'
import { autoZoomFeature } from './features/auto-zoom.feature'
import { createFillerRemovalFeature } from './features/filler-removal.feature'
import { brandKitFeature } from './features/brand-kit.feature'
import { soundDesignFeature } from './features/sound-design.feature'
import { wordEmphasisFeature } from './features/word-emphasis.feature'
import { brollFeature } from './features/broll.feature'
import { shotTransitionFeature } from './features/shot-transition.feature'
import { accentColorFeature } from './features/accent-color.feature'
import type {
  RenderFeature,
  FilterContext,
  OverlayContext,
  PostProcessContext
} from './features/feature'
import type { RenderClipJob, RenderBatchOptions } from './types'
import { ARCHETYPE_KEYS, type Archetype } from '../edit-styles/shared/archetypes'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface InvocationLog {
  prepare: number
  videoFilter: number
  overlayPass: number
  postProcess: number
}

function makeInvocationLog(): InvocationLog {
  return { prepare: 0, videoFilter: 0, overlayPass: 0, postProcess: 0 }
}

/**
 * Wrap a feature so every phase invocation is counted. The wrapper preserves
 * the original return value / behaviour and records nothing about success or
 * failure beyond "the method was called".
 */
function trackFeature(
  feature: RenderFeature,
  log: InvocationLog
): RenderFeature {
  const wrapped: RenderFeature = { name: feature.name }

  if (feature.prepare) {
    wrapped.prepare = async (job, opts, onProgress) => {
      log.prepare++
      return feature.prepare!(job, opts, onProgress)
    }
  }
  if (feature.videoFilter) {
    wrapped.videoFilter = (job, ctx) => {
      log.videoFilter++
      return feature.videoFilter!(job, ctx)
    }
  }
  if (feature.overlayPass) {
    wrapped.overlayPass = (job, ctx) => {
      log.overlayPass++
      return feature.overlayPass!(job, ctx)
    }
  }
  if (feature.postProcess) {
    wrapped.postProcess = async (job, renderedPath, ctx) => {
      log.postProcess++
      return feature.postProcess!(job, renderedPath, ctx)
    }
  }
  return wrapped
}

/**
 * Build a fake clip job tailored for a given archetype. Every job is laden
 * with config that triggers as many feature paths as possible — captions,
 * hook title, rehook, sound placements, broll placements, multi-shot
 * configs, and an accent color override. The archetype itself only colours
 * the segmented-segment metadata; the feature pipeline is archetype-agnostic
 * but we still verify it tolerates one job per archetype.
 */
function makeArchetypeJob(archetype: Archetype, index: number): RenderClipJob {
  const clipDuration = 12
  const startTime = 0
  const endTime = startTime + clipDuration
  const wordTimestamps = Array.from({ length: 10 }, (_, i) => ({
    text: `word${i}`,
    start: startTime + i * 1.0,
    end: startTime + i * 1.0 + 0.4
  }))

  return {
    clipId: `clip-${archetype}-${index}`,
    sourceVideoPath: `/videos/${archetype}.mp4`,
    startTime,
    endTime,
    wordTimestamps,
    hookTitleText: `Hook for ${archetype}`,
    stylePresetId: 'prestyj',
    clipOverrides: { accentColor: '#FF6B35' },
    soundPlacements: [
      { type: 'music', filePath: '/music/track.mp3', startTime: 0, volume: 0.3 }
    ],
    brollPlacements: [
      {
        startTime: 4,
        duration: 2,
        videoPath: '/broll/clip.mp4',
        keyword: archetype,
        displayMode: 'fullscreen',
        transition: 'crossfade'
      }
    ],
    shotStyleConfigs: [
      {
        shotIndex: 0,
        startTime: 0,
        endTime: 6,
        transitionOut: { type: 'crossfade', duration: 0.3 }
      },
      {
        shotIndex: 1,
        startTime: 6,
        endTime: clipDuration,
        transitionIn: { type: 'crossfade', duration: 0.3 }
      }
    ]
  } as RenderClipJob
}

function makeBatchOptions(): RenderBatchOptions {
  return {
    jobs: [],
    outputDirectory: '/output',
    captionsEnabled: true,
    captionStyle: {
      fontName: 'Arial',
      fontSize: 0.07,
      primaryColor: '#FFFFFF',
      highlightColor: '#00FF00',
      outlineColor: '#000000',
      backColor: '#80000000',
      outline: 4,
      shadow: 0,
      borderStyle: 4,
      wordsPerLine: 3,
      animation: 'word-pop'
    },
    hookTitleOverlay: {
      enabled: true,
      displayDuration: 3,
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
    },
    autoZoom: {
      enabled: true,
      mode: 'ken-burns',
      intensity: 'medium',
      intervalSeconds: 3
    },
    brandKit: {
      enabled: true,
      logoPath: '/logo.png',
      logoPosition: 'top-right',
      logoScale: 0.15,
      logoOpacity: 0.8,
      introBumperPath: null,
      outroBumperPath: null
    }
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('pipeline: PRESTYJ archetype × ported feature matrix', () => {
  // Build the full registered feature set in pipeline.ts execution order,
  // plus brand-kit and sound-design (the two ported feature wrappers that
  // exist on disk but aren't enumerated in pipeline.ts's active list).
  // Every ported feature is exercised by at least one job in the matrix.
  const featureLogs = new Map<string, InvocationLog>()
  const features: RenderFeature[] = []

  beforeAll(() => {
    const raw: RenderFeature[] = [
      createFillerRemovalFeature(),
      accentColorFeature,
      brandKitFeature,
      wordEmphasisFeature,
      createCaptionsFeature(),
      createHookTitleFeature(),
      createRehookFeature(),
      autoZoomFeature,
      brollFeature,
      shotTransitionFeature,
      soundDesignFeature
    ]
    for (const f of raw) {
      const log = makeInvocationLog()
      featureLogs.set(f.name, log)
      features.push(trackFeature(f, log))
    }
  })

  // Sanity check: archetypes haven't drifted out from under the test.
  it('covers all 8 PRESTYJ archetypes', () => {
    expect(ARCHETYPE_KEYS).toHaveLength(8)
  })

  // ── Drive a single clip per archetype through every phase ───────────────
  // Every phase call wrapped in expect(...).not.toThrow at the assertion
  // boundary; the awaited Promise rejection would surface here too.
  it.each([...ARCHETYPE_KEYS])(
    'drives a fake "%s" clip through prepare → videoFilter → overlayPass → postProcess without throwing',
    async (archetype) => {
      const job = makeArchetypeJob(archetype, 0)
      const options = makeBatchOptions()

      const filterContext: FilterContext = {
        sourceWidth: 1920,
        sourceHeight: 1080,
        targetWidth: 720,
        targetHeight: 1280,
        clipDuration: job.endTime - job.startTime,
        outputAspectRatio: '9:16'
      }
      const overlayContext: OverlayContext = {
        clipDuration: job.endTime - job.startTime,
        targetWidth: 720,
        targetHeight: 1280
      }
      const postContext: PostProcessContext = {
        clipDuration: job.endTime - job.startTime,
        outputPath: `/output/${job.clipId}.mp4`
      }

      // Phase 1: prepare()
      for (const f of features) {
        if (f.prepare) {
          await expect(f.prepare(job, options)).resolves.toBeDefined()
        }
      }

      // Phase 2: videoFilter() — collect contributions for the graph assertion
      const filterParts: string[] = []
      for (const f of features) {
        if (f.videoFilter) {
          let part: string | null = null
          expect(() => {
            part = f.videoFilter!(job, filterContext)
          }).not.toThrow()
          if (part) filterParts.push(part)
        }
      }

      // Phase 3: overlayPass() — collect overlay filter strings
      const overlayParts: string[] = []
      for (const f of features) {
        if (f.overlayPass) {
          let step: ReturnType<NonNullable<RenderFeature['overlayPass']>> = null
          expect(() => {
            step = f.overlayPass!(job, overlayContext)
          }).not.toThrow()
          if (step) overlayParts.push(step.filter)
        }
      }

      // Phase 4: postProcess()
      let renderedPath = postContext.outputPath
      for (const f of features) {
        if (f.postProcess) {
          await expect(
            f.postProcess(job, renderedPath, postContext)
          ).resolves.toBeTypeOf('string')
        }
      }

      // Filter graph for THIS archetype must be non-empty (videoFilter
      // contributions ∪ overlay passes). Auto-zoom alone guarantees a
      // videoFilter contribution; captions + hook + rehook each emit an
      // overlay pass.
      const graph = [...filterParts, ...overlayParts].join(';')
      expect(graph.length).toBeGreaterThan(0)
    }
  )

  // ── Aggregate assertion across the full matrix ──────────────────────────
  it('invokes every registered ported feature at least once across the archetype set', () => {
    for (const [name, log] of featureLogs) {
      const total =
        log.prepare + log.videoFilter + log.overlayPass + log.postProcess
      expect(
        total,
        `feature "${name}" was never invoked across any archetype — ` +
          `prepare=${log.prepare} videoFilter=${log.videoFilter} ` +
          `overlayPass=${log.overlayPass} postProcess=${log.postProcess}`
      ).toBeGreaterThan(0)
    }
  })

  it('never invokes the real FFmpeg base-render path', () => {
    // base-render.ts terminates its FFmpeg pipeline with `.run()`. The broll
    // postProcess uses `.save(path)` instead. Both are mocked above — so no
    // real child process is ever spawned. Confirming `.run()` was untouched
    // proves the pipeline's main encode pass never executed in this test.
    expect(ffmpegRunMock).not.toHaveBeenCalled()
  })
})
