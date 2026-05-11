// ---------------------------------------------------------------------------
// Tests for the aspect-ratio configuration module.
//
// Locks in the invariants the rest of the render pipeline relies on:
//   • the only exported aspect ratio is 9:16
//   • locked output dimensions are 1080×1920 @ 30fps
//   • driving any source dimensions through the resolver
//     (getCanvasDimensions + computeCenterCropForRatio) yields a render
//     config whose output is 1080×1920 @ 30fps
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import {
  ASPECT_RATIO_CONFIGS,
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
  OUTPUT_FPS,
  getCanvasDimensions,
  computeCenterCropForRatio,
  type OutputAspectRatio
} from './aspect-ratios'

// ---------------------------------------------------------------------------
// Sample render config + resolver — mirrors how src/main/render/base-render.ts
// derives its output dimensions/fps from the aspect-ratios module.
// ---------------------------------------------------------------------------

interface SampleRenderConfig {
  source: { width: number; height: number }
  output: { width: number; height: number; fps: number }
  crop: { x: number; y: number; width: number; height: number }
}

function resolveRenderConfig(sourceWidth: number, sourceHeight: number): SampleRenderConfig {
  const canvas = getCanvasDimensions()
  const crop = computeCenterCropForRatio(sourceWidth, sourceHeight)
  return {
    source: { width: sourceWidth, height: sourceHeight },
    output: { width: canvas.width, height: canvas.height, fps: OUTPUT_FPS },
    crop
  }
}

// ---------------------------------------------------------------------------
// Locked exports
// ---------------------------------------------------------------------------

describe('aspect-ratios locked exports', () => {
  it('exposes exactly one aspect ratio: 9:16', () => {
    const keys = Object.keys(ASPECT_RATIO_CONFIGS) as OutputAspectRatio[]
    expect(keys).toEqual(['9:16'])
  })

  it('locks output dimensions to 1080×1920', () => {
    expect(OUTPUT_WIDTH).toBe(1080)
    expect(OUTPUT_HEIGHT).toBe(1920)

    const cfg = ASPECT_RATIO_CONFIGS['9:16']
    expect(cfg.ratio).toBe('9:16')
    expect(cfg.width).toBe(1080)
    expect(cfg.height).toBe(1920)
  })

  it('locks output frame rate to 30fps', () => {
    expect(OUTPUT_FPS).toBe(30)
  })

  it('getCanvasDimensions always returns 1080×1920', () => {
    expect(getCanvasDimensions()).toEqual({ width: 1080, height: 1920 })
    expect(getCanvasDimensions('9:16')).toEqual({ width: 1080, height: 1920 })
  })
})

// ---------------------------------------------------------------------------
// Resolver — drive a sample render config through multiple input sources
// ---------------------------------------------------------------------------

describe('aspect-ratios resolver — render config output', () => {
  const sources: ReadonlyArray<{ label: string; width: number; height: number }> = [
    { label: '1080p landscape', width: 1920, height: 1080 },
    { label: '4K landscape', width: 3840, height: 2160 },
    { label: '1:1 square', width: 1080, height: 1080 },
    { label: '9:16 vertical', width: 1080, height: 1920 }
  ]

  for (const src of sources) {
    it(`resolves ${src.label} (${src.width}×${src.height}) to 1080×1920 @ 30fps`, () => {
      const config = resolveRenderConfig(src.width, src.height)

      expect(config.output.width).toBe(1080)
      expect(config.output.height).toBe(1920)
      expect(config.output.fps).toBe(30)

      // Crop must be valid (non-zero, even, within source bounds).
      expect(config.crop.width).toBeGreaterThan(0)
      expect(config.crop.height).toBeGreaterThan(0)
      expect(config.crop.width % 2).toBe(0)
      expect(config.crop.height % 2).toBe(0)
      expect(config.crop.x % 2).toBe(0)
      expect(config.crop.y % 2).toBe(0)
      expect(config.crop.x + config.crop.width).toBeLessThanOrEqual(src.width)
      expect(config.crop.y + config.crop.height).toBeLessThanOrEqual(src.height)
    })
  }

  it('every source resolves to identical output dimensions and fps', () => {
    const outputs = sources.map((s) => resolveRenderConfig(s.width, s.height).output)
    for (const out of outputs) {
      expect(out).toEqual({ width: 1080, height: 1920, fps: 30 })
    }
  })
})
