/**
 * Headless render wrapper around @remotion/renderer.
 *
 * The bundle is created lazily on first call and cached in-process — bundling
 * takes ~3–8s and is identical across renders. Subsequent renders reuse the
 * bundle and only re-launch the headless browser tab.
 *
 * Output: ProRes 4444 .mov with alpha when `transparent: true`, otherwise
 * H.264 .mp4. Segment-render uses the ProRes/.mov path so the result composites
 * cleanly into the FFmpeg timeline.
 */
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync } from 'fs'

let bundlePromise: Promise<string> | null = null

async function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: resolve(__dirname, './index'),
      // Inherit webpack config from remotion.config.ts implicitly.
      onProgress: () => undefined
    })
  }
  return bundlePromise
}

export interface RenderRemotionOptions {
  compositionId: string
  inputProps: Record<string, unknown>
  /** Duration in seconds. Composition's durationInFrames is overridden. */
  durationSec: number
  fps: number
  width: number
  height: number
  /** When true, output is ProRes 4444 .mov with alpha. */
  transparent?: boolean
  /**
   * Output file path. Extension drives format: .mov for transparent, .mp4
   * otherwise. If omitted, a temp path is generated.
   */
  outputPath?: string
}

export async function renderRemotionSegment(
  opts: RenderRemotionOptions
): Promise<string> {
  const serveUrl = await getBundle()

  const composition = await selectComposition({
    serveUrl,
    id: opts.compositionId,
    inputProps: opts.inputProps
  })

  const durationInFrames = Math.max(1, Math.round(opts.durationSec * opts.fps))
  const outPath =
    opts.outputPath ??
    join(
      mkdtempSync(join(tmpdir(), 'remotion-seg-')),
      `${opts.compositionId}.${opts.transparent ? 'mov' : 'mp4'}`
    )

  await renderMedia({
    serveUrl,
    composition: {
      ...composition,
      durationInFrames,
      fps: opts.fps,
      width: opts.width,
      height: opts.height
    },
    codec: opts.transparent ? 'prores' : 'h264',
    proResProfile: opts.transparent ? '4444' : undefined,
    outputLocation: outPath,
    inputProps: opts.inputProps,
    imageFormat: 'png',
    chromiumOptions: { gl: 'angle' }
  })

  return outPath
}
