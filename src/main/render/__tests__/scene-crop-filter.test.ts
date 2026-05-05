import { describe, it, expect } from 'vitest'
import { buildSceneCropFilter, sliceTimelineToWindow } from '../scene-crop-filter'

describe('sliceTimelineToWindow', () => {
  it('converts source-absolute times to clip-local and drops entries outside the window', () => {
    const timeline = [
      { startTime: 100, endTime: 105, x: 100, y: 0, width: 608, height: 1080, faceDetected: true },
      { startTime: 105, endTime: 112, x: 450, y: 0, width: 608, height: 1080, faceDetected: true },
      // Outside the clip [100, 120]:
      { startTime: 130, endTime: 140, x: 200, y: 0, width: 608, height: 1080, faceDetected: true }
    ]
    const sliced = sliceTimelineToWindow(timeline, /* clipStart */ 100, 0, 20)
    expect(sliced).toHaveLength(2)
    expect(sliced[0]).toMatchObject({ startLocal: 0, endLocal: 5, x: 100 })
    expect(sliced[1]).toMatchObject({ startLocal: 5, endLocal: 12, x: 450 })
  })

  it('clamps entries that cross the window boundary', () => {
    const timeline = [
      { startTime: 90, endTime: 110, x: 100, y: 0, width: 608, height: 1080, faceDetected: true },
      { startTime: 110, endTime: 150, x: 450, y: 0, width: 608, height: 1080, faceDetected: true }
    ]
    const sliced = sliceTimelineToWindow(timeline, /* clipStart */ 100, 0, 30)
    expect(sliced).toHaveLength(2)
    // First entry starts before clip, should be clamped to localStart=0
    expect(sliced[0].startLocal).toBe(0)
    // Second entry ends after clip, should be clamped to localEnd=30
    expect(sliced[1].endLocal).toBe(30)
  })

  it('drops entries shorter than 50 ms of overlap', () => {
    const timeline = [
      { startTime: 99.99, endTime: 100.02, x: 100, y: 0, width: 608, height: 1080, faceDetected: true },
      { startTime: 100, endTime: 110, x: 450, y: 0, width: 608, height: 1080, faceDetected: true }
    ]
    const sliced = sliceTimelineToWindow(timeline, 100, 0, 20)
    // First entry overlaps only 0.02s which is below the 0.05s threshold
    expect(sliced).toHaveLength(1)
    expect(sliced[0].x).toBe(450)
  })
})

describe('buildSceneCropFilter', () => {
  const SOURCE_W = 1920
  const SOURCE_H = 1080
  const FPS = 30

  it('returns null with no timeline and no default', () => {
    const result = buildSceneCropFilter(undefined, undefined, 0, 0, 10, SOURCE_W, SOURCE_H, FPS)
    expect(result).toBeNull()
  })

  it('emits static crop when only the default is provided', () => {
    const result = buildSceneCropFilter(
      undefined,
      { x: 656, y: 0, width: 608, height: 1080 },
      0,
      0,
      10,
      SOURCE_W,
      SOURCE_H,
      FPS
    )
    expect(result).toBe('crop=608:1080:656:0')
  })

  it('emits static crop when timeline has only one scene', () => {
    const timeline = [
      { startTime: 0, endTime: 30, x: 300, y: 0, width: 608, height: 1080, faceDetected: true }
    ]
    const result = buildSceneCropFilter(timeline, undefined, 0, 0, 30, SOURCE_W, SOURCE_H, FPS)
    expect(result).toBe('crop=608:1080:300:0')
  })

  it('emits expression-based crop when timeline has multiple scenes', () => {
    const timeline = [
      { startTime: 0, endTime: 5, x: 100, y: 0, width: 608, height: 1080, faceDetected: true },
      { startTime: 5, endTime: 12, x: 450, y: 0, width: 608, height: 1080, faceDetected: true }
    ]
    const result = buildSceneCropFilter(timeline, undefined, 0, 0, 12, SOURCE_W, SOURCE_H, FPS)
    expect(result).toMatch(/^crop=608:1080:'if\(lt\(n\/30,5\.000\),100,450\)':'0'$/)
  })

  it('converts source-absolute timeline to clip-local time via clipStart', () => {
    const timeline = [
      { startTime: 100, endTime: 105, x: 100, y: 0, width: 608, height: 1080, faceDetected: true },
      { startTime: 105, endTime: 112, x: 450, y: 0, width: 608, height: 1080, faceDetected: true }
    ]
    const result = buildSceneCropFilter(timeline, undefined, /* clipStart */ 100, 0, 12, SOURCE_W, SOURCE_H, FPS)
    // Boundary at local time 5s (== 105 - 100)
    expect(result).toContain('lt(n/30,5.000)')
    expect(result).toContain(',100,')
    expect(result).toContain(',450')
  })

  it('builds nested ifs for three scenes', () => {
    const timeline = [
      { startTime: 0, endTime: 4, x: 100, y: 0, width: 608, height: 1080, faceDetected: true },
      { startTime: 4, endTime: 8, x: 300, y: 0, width: 608, height: 1080, faceDetected: true },
      { startTime: 8, endTime: 12, x: 500, y: 0, width: 608, height: 1080, faceDetected: true }
    ]
    const result = buildSceneCropFilter(timeline, undefined, 0, 0, 12, SOURCE_W, SOURCE_H, FPS)!
    // Should be: crop=608:1080:'if(lt(n/30,4.000),100,if(lt(n/30,8.000),300,500))':'0'
    expect(result).toContain('if(lt(n/30,4.000),100,if(lt(n/30,8.000),300,500))')
  })

  it('clamps crop x values that exceed source width', () => {
    const timeline = [
      { startTime: 0, endTime: 5, x: 5000, y: 0, width: 608, height: 1080, faceDetected: true },
      { startTime: 5, endTime: 10, x: -100, y: 0, width: 608, height: 1080, faceDetected: true }
    ]
    const result = buildSceneCropFilter(timeline, undefined, 0, 0, 10, SOURCE_W, SOURCE_H, FPS)!
    // 5000 → 1920 - 608 = 1312, -100 → 0
    expect(result).toContain('1312')
    expect(result).toContain(',0)')
  })
})
