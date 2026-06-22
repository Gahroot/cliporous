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
import { app } from 'electron'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync, existsSync } from 'fs'

let bundlePromise: Promise<string> | null = null

/**
 * Resolve the Remotion entry point.
 *
 * Remotion's `bundle()` compiles the composition TREE from SOURCE via its own
 * webpack pass, so it needs the original `src/main/remotion/index.ts` — NOT the
 * electron-vite-compiled `out/main/index.js`. Using `__dirname` here is wrong:
 * at runtime `__dirname` is `out/main`, which produced the bogus path
 * `out/main/index` (ENOENT).
 *
 * `app.getAppPath()` returns the project root in dev and the app root
 * (resources/app[.asar]) when packaged, so the source tree is resolved
 * consistently relative to it.
 */
function resolveRemotionEntry(): string {
  const appPath = app.getAppPath()
  const candidates = [
    join(appPath, 'src', 'main', 'remotion', 'index.ts'),
    join(appPath, 'src', 'main', 'remotion', 'index.tsx')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  // Fall back to the first candidate so the error surfaces a real, expected
  // path instead of a misleading compiled-output location.
  return candidates[0]
}

async function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: resolveRemotionEntry(),
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
