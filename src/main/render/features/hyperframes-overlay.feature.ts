// ---------------------------------------------------------------------------
// HyperFrames overlay feature — composites floating UI overlays onto clips
// ---------------------------------------------------------------------------
//
// This feature renders HTML-based overlay blocks (pop-ups, icon callouts,
// animated labels, progress bars, glowing badges) via HyperFrames and
// composites them onto the rendered clip using FFmpeg's overlay filter.
//
// HyperFrames produces MOV (ProRes 4444 with alpha channel). FFmpeg's
// overlay filter reads the alpha and composites transparently.
//
// This feature runs in the `postProcess` phase — after the base encode and
// after other overlay passes (captions, hook-title, rehook). Overlays are
// additive and don't interfere with the existing render pipeline.
// ---------------------------------------------------------------------------

import { copyFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { RenderFeature, PrepareResult, PostProcessContext } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import { renderOverlays } from '../../hyperframes/renderer'
import type { OverlayRequest } from '../../hyperframes/types'
import { toFFmpegPath } from '../helpers'
import { ffmpeg as createFfmpeg, getSoftwareEncoder } from '../../ffmpeg'
// ---------------------------------------------------------------------------
// Job extension — overlay requests attached by upstream features/handlers
// ---------------------------------------------------------------------------

/**
 * Augment RenderClipJob with HyperFrames overlay requests.
 *
 * The render pipeline attaches these to the job during the IPC handler
 * pre-pass or via the feature's own prepare phase. The feature reads
 * them in postProcess and renders + composites each overlay.
 *
 * Uses module augmentation to avoid modifying the shared types file.
 */
declare module '../types' {
  interface RenderClipJob {
    /**
     * HyperFrames overlay requests for this clip. Each request specifies a
     * catalog block, props, and timing. Rendered to MOV (ProRes 4444 alpha)
     * and composited onto the final clip in the postProcess phase.
     */
    hyperframesOverlays?: OverlayRequest[]
  }
}

// ---------------------------------------------------------------------------
// Feature implementation
// ---------------------------------------------------------------------------

export const hyperframesOverlayFeature: RenderFeature = {
  name: 'hyperframes-overlay',

  async prepare(
    job: RenderClipJob,
    _batchOptions: RenderBatchOptions,
    _onProgress?: (message: string, percent: number) => void
  ): Promise<PrepareResult> {
    // No overlays requested — skip.
    if (!job.hyperframesOverlays || job.hyperframesOverlays.length === 0) {
      return { tempFiles: [], modified: false }
    }

    console.log(
      `[HyperFrames] Clip ${job.clipId}: ${job.hyperframesOverlays.length} overlay(s) queued`
    )

    return { tempFiles: [], modified: false }
  },

  async postProcess(
    job: RenderClipJob,
    renderedPath: string,
    _context: PostProcessContext
  ): Promise<string> {
    if (!job.hyperframesOverlays || job.hyperframesOverlays.length === 0) {
      return renderedPath
    }

    const startTime = Date.now()
    const tempFiles: string[] = []

    try {
      // Render all overlay blocks to temp MOV files.
      const results = await renderOverlays(job.hyperframesOverlays)

      // Filter out failed renders (empty movPath).
      const validResults = results.filter((r) => r.movPath !== '')
      if (validResults.length === 0) {
        console.warn(
          `[HyperFrames] All overlay renders failed for clip ${job.clipId}, keeping original`
        )
        return renderedPath
      }

      // Composite each overlay onto the clip sequentially.
      // Each overlay is a separate FFmpeg pass to avoid filter_complex
      // complexity explosion (same pattern as overlay-runner.ts).
      let currentPath = renderedPath

      for (let i = 0; i < validResults.length; i++) {
        const result = validResults[i]
        const request = job.hyperframesOverlays[i]
        if (!request) continue

        const overlayOutputPath = join(
          tmpdir(),
          `batchcontent-hf-comp-${job.clipId}-${Date.now()}-${i}.mp4`
        )
        tempFiles.push(overlayOutputPath)

        await compositeOverlay(currentPath, result.movPath, overlayOutputPath, request.timing.start)

        // Clean up the temp MOV after compositing.
        try { unlinkSync(result.movPath) } catch { /* ignore */ }

        // If we produced a new intermediate, clean the previous one.
        if (currentPath !== renderedPath) {
          try { unlinkSync(currentPath) } catch { /* ignore */ }
        }

        currentPath = overlayOutputPath
      }

      // If we produced a new final file, copy it to the original path.
      if (currentPath !== renderedPath) {
        copyFileSync(currentPath, renderedPath)
        try { unlinkSync(currentPath) } catch { /* ignore */ }
      }

      const elapsed = Date.now() - startTime
      console.log(
        `[HyperFrames] Composited ${validResults.length} overlay(s) onto clip ${job.clipId} in ${elapsed}ms`
      )

      return renderedPath
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `[HyperFrames] Overlay compositing failed for clip ${job.clipId}, keeping original:`,
        message
      )
      return renderedPath
    } finally {
      // Clean up any remaining temp files.
      for (const f of tempFiles) {
        try {
          if (existsSync(f) && f !== renderedPath) unlinkSync(f)
        } catch { /* ignore */ }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// FFmpeg overlay compositing
// ---------------------------------------------------------------------------

/**
 * Composite a ProRes 4444 MOV (with alpha) onto the base video at a specific
 * time offset using FFmpeg's overlay filter.
 *
 * The overlay stream is PTS-shifted by `startTime` so it appears at the
 * correct position on the base video's timeline. The MOV's own length
 * constrains how long it stays visible.
 */
function compositeOverlay(
  basePath: string,
  overlayMovPath: string,
  outputPath: string,
  startTime: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const { encoder, presetFlag } = getSoftwareEncoder({ crf: 18, preset: 'medium' })

    const cmd = createFfmpeg(toFFmpegPath(basePath))
    cmd.input(toFFmpegPath(overlayMovPath))

    // Shift the overlay PTS so it appears at startTime on the base timeline.
    // format=auto lets FFmpeg pick the right pixel format for compositing.
    // eof_action=pass lets the base video continue after the overlay ends.
    const ptsOffset = startTime.toFixed(3)
    const filterComplex =
      `[1:v]setpts=PTS+${ptsOffset}/TB[ovr];` +
      `[0:v][ovr]overlay=0:0:format=auto:eof_action=pass[outv]`

    cmd
      .outputOptions([
        '-filter_complex',
        filterComplex,
        '-map',
        '[outv]',
        '-map',
        '0:a?',
        '-c:v',
        encoder,
        ...presetFlag,
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        '-y'
      ])
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .save(toFFmpegPath(outputPath))
  })
}
