// ---------------------------------------------------------------------------
// Section-header feature (long-form / Hormozi 16:9 only).
//
// Pre-renders a purple pill section divider as a Remotion clip, then muxes it
// with the source narration audio for the same time range. Used exclusively by
// `longform-pipeline.ts`. Outside the long-form profile this is a no-op.
// ---------------------------------------------------------------------------

import { join } from 'path'
import { tmpdir } from 'os'
import type { SectionBoundary } from '@shared/types'
import { muxRemotionVisualWithAudio } from '../longform-encode'
import type { RenderFeature, PrepareResult } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'

export interface RenderSectionHeaderOptions {
  section: SectionBoundary
  sourceVideoPath: string
  width: number
  height: number
  fps: number
}

/**
 * Render one section header to a normalized, concat-ready mp4 segment.
 * Returns the output path.
 */
export async function renderSectionHeaderSegment(
  opts: RenderSectionHeaderOptions
): Promise<string> {
  const { section, sourceVideoPath, width, height, fps } = opts
  const duration = Math.max(0.5, section.endTime - section.startTime)
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`

  // Dynamic import keeps @remotion/bundler (esbuild) out of the static module
  // graph so importing the render pipeline in tests never loads it.
  const { renderRemotionSegment } = await import('../../remotion/render')

  const visualPath = join(tmpdir(), `batchcontent-section-vis-${stamp}.mp4`)
  await renderRemotionSegment({
    compositionId: 'HormoziSectionHeader',
    inputProps: {
      text: section.title,
      iconEmoji: section.iconEmoji ?? '',
      accentColor: section.accentColor
    },
    durationSec: duration,
    fps,
    width,
    height,
    transparent: false,
    outputPath: visualPath
  })

  const outputPath = join(tmpdir(), `batchcontent-section-seg-${stamp}.mp4`)
  await muxRemotionVisualWithAudio({
    visualPath,
    sourceVideoPath,
    outputPath,
    startTime: section.startTime,
    duration,
    width,
    height,
    fps
  })

  return outputPath
}

/**
 * RenderFeature shell — documents the long-form seam and stays a strict no-op
 * for the 9:16 pipeline (it is never registered in the standard feature list).
 */
export const sectionHeaderFeature: RenderFeature = {
  name: 'section-header',
  async prepare(
    _job: RenderClipJob,
    batchOptions: RenderBatchOptions
  ): Promise<PrepareResult> {
    if (batchOptions.outputProfile !== 'longform') {
      return { tempFiles: [], modified: false }
    }
    return { tempFiles: [], modified: false }
  }
}
