// ---------------------------------------------------------------------------
// HyperFrames engine — wraps the HyperFrames CLI to render HTML compositions
// to MOV (ProRes 4444) with alpha channel for FFmpeg overlay compositing.
// ---------------------------------------------------------------------------

import { execFile } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// HyperFrames CLI resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the path to the `hyperframes` CLI binary. Prefers the locally
 * installed `node_modules/.bin/hyperframes` over a global `npx` invocation.
 */
export function resolveHyperFramesCli(): string {
  // Local node_modules/.bin is the most reliable path in an Electron app.
  const projectRoot = join(__dirname, '..', '..', '..')
  const localBin = join(projectRoot, 'node_modules', '.bin', 'hyperframes')
  if (existsSync(localBin)) return localBin

  // Fallback: use npx (requires hyperframes to be in package.json deps).
  return 'npx'
}

// ---------------------------------------------------------------------------
// Render options
// ---------------------------------------------------------------------------

export interface RenderCompositionOptions {
  /** Absolute path to the HTML composition file. */
  compositionPath: string
  /** Absolute path for the output MOV file. */
  outputPath: string
  /** Width in pixels (default: 1080). */
  width?: number
  /** Height in pixels (default: 1920). */
  height?: number
  /** Frame rate (default: 30). */
  fps?: number
  /** Quality: 'draft' | 'standard' | 'high' (default: 'standard'). */
  quality?: 'draft' | 'standard' | 'high'
  /** Variable overrides as a JSON-serializable object. */
  variables?: Record<string, unknown>
  /** Composition duration in seconds. Injected as a data-duration element. */
  durationSeconds?: number
  /** Timeout in milliseconds (default: 120_000 = 2 min). */
  timeoutMs?: number
}

export interface RenderCompositionResult {
  /** Absolute path to the rendered MOV file. */
  outputPath: string
  /** Duration of the render in milliseconds. */
  elapsedMs: number
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render a HyperFrames HTML composition to a MOV file with ProRes 4444 alpha
 * channel. The output can be composited onto the base video via FFmpeg's
 * overlay filter with premultiplied alpha.
 *
 * HyperFrames must be installed as a project dependency (`npm install hyperframes`).
 */
export async function renderComposition(
  options: RenderCompositionOptions
): Promise<RenderCompositionResult> {
  const {
    compositionPath,
    outputPath,
    width = 1080,
    height = 1920,
    fps = 30,
    quality = 'standard',
    variables,
    durationSeconds,
    timeoutMs = 120_000
  } = options

  if (!existsSync(compositionPath)) {
    throw new Error(`[HyperFrames] Composition not found: ${compositionPath}`)
  }

  // Ensure output directory exists.
  const outputDir = dirname(outputPath)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // Build the project directory — HyperFrames expects to run from the
  // directory containing the composition. We create a minimal temp project
  // with the composition as `index.html` and a `package.json` (required
  // by the resolveProject util).
  const projectDir = join(
    tmpdir(),
    `batchcontent-hf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
  mkdirSync(projectDir, { recursive: true })

  try {
    // Copy the composition into the project as index.html.
    let compContent = readFileSync(compositionPath, 'utf-8')

    // Inject a duration element if requested. HyperFrames determines
    // composition length from data-start + data-duration attributes on
    // elements. Without one, the duration is undefined. We inject a
    // zero-opacity anchor element right before </body>.
    if (durationSeconds != null && durationSeconds > 0) {
      const durationEl =
        `<div data-start="0" data-duration="${durationSeconds.toFixed(3)}" ` +
        `style="position:absolute;width:0;height:0;opacity:0;"></div>`
      compContent = compContent.replace('</body>', `${durationEl}\n</body>`)
    }

    writeFileSync(join(projectDir, 'index.html'), compContent, 'utf-8')

    // Copy the shared/ directory (styles, assets) if it exists alongside the
    // composition. HyperFrames compositions reference shared/styles.css via
    // relative <link> tags.
    const compDir = dirname(compositionPath)
    const sharedDir = join(compDir, 'shared')
    if (existsSync(sharedDir)) {
      cpSync(sharedDir, join(projectDir, 'shared'), { recursive: true })
    }

    // Write a minimal package.json (HyperFrames resolveProject requires it).
    writeFileSync(
      join(projectDir, 'package.json'),
      JSON.stringify({ name: 'batchcontent-hf-render', private: true }),
      'utf-8'
    )

    // Build CLI arguments.
    const cli = resolveHyperFramesCli()
    const args: string[] = ['render']

    if (cli !== 'npx') {
      // Direct binary — prefix with 'npx' is not needed.
      args.unshift(cli)
    } else {
      args.unshift('hyperframes')
    }

    // We pass the project directory as the positional arg.
    args.push(projectDir)

    // Format: MOV with ProRes 4444 (alpha channel).
    args.push('--format', 'mov')
    args.push('--output', outputPath)
    args.push('--fps', String(fps))
    args.push('--quality', quality)
    args.push('--workers', '1')

    // Resolution is set via the composition's data-width/data-height attributes,
    // but we can also pass it explicitly.
    // HyperFrames resolution flag is a preset name; for exact dimensions we
    // rely on the HTML composition's data-width/data-height.

    // Variable overrides.
    if (variables && Object.keys(variables).length > 0) {
      args.push('--variables', JSON.stringify(variables))
    }

    // Quiet mode to reduce noise.
    args.push('--quiet')

    const startTime = Date.now()

    try {
      const { stdout, stderr } = await execFileAsync(
        cli === 'npx' ? 'npx' : args[0],
        cli === 'npx' ? args : args.slice(1),
        {
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          cwd: projectDir,
          env: {
            ...process.env,
            // Ensure Chromium can launch in headless mode.
            PUPPETEER_HEADLESS: 'true'
          }
        }
      )

      const elapsedMs = Date.now() - startTime

      if (!existsSync(outputPath)) {
        throw new Error(
          `[HyperFrames] Render completed but output not found: ${outputPath}\n` +
          `stdout: ${stdout}\nstderr: ${stderr}`
        )
      }

      console.log(
        `[HyperFrames] Rendered ${compositionPath} → ${outputPath} in ${elapsedMs}ms`
      )

      return { outputPath, elapsedMs }
    } catch (err) {
      const elapsedMs = Date.now() - startTime
      const message = err instanceof Error ? err.message : String(err)

      // HyperFrames CLI may exit with non-zero for lint warnings — check if
      // the output file was actually produced.
      if (existsSync(outputPath)) {
        console.warn(
          `[HyperFrames] Render produced output despite error (${elapsedMs}ms): ${message}`
        )
        return { outputPath, elapsedMs }
      }

      throw new Error(
        `[HyperFrames] Render failed after ${elapsedMs}ms: ${message}`
      )
    }
  } finally {
    // Clean up the temp project directory.
    try {
      rmSync(projectDir, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup — ignore errors.
    }
  }
}
