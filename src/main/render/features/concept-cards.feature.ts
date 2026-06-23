// ---------------------------------------------------------------------------
// Concept-card feature (long-form / Hormozi 16:9 only).
//
// Pre-renders a full-frame concept card as a Remotion clip, then muxes it with
// the source narration audio for the same time range. Used exclusively by
// `longform-pipeline.ts`. Outside the long-form profile this is a no-op.
// ---------------------------------------------------------------------------

import { join } from 'path'
import { tmpdir } from 'os'
import type { ConceptCardPlacement } from '@shared/types'
import { muxRemotionVisualWithAudio } from '../longform-encode'
import type { RenderFeature, PrepareResult } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'

export interface RenderConceptCardOptions {
  card: ConceptCardPlacement
  sourceVideoPath: string
  width: number
  height: number
  fps: number
}

/**
 * Render one concept card to a normalized, concat-ready mp4 segment.
 * Returns the output path. Temp files are written under the OS temp dir.
 */
export async function renderConceptCardSegment(
  opts: RenderConceptCardOptions
): Promise<string> {
  const { card, sourceVideoPath, width, height, fps } = opts
  const duration = Math.max(0.5, card.endTime - card.startTime)
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`

  // Dynamic import keeps @remotion/bundler (esbuild) out of the static module
  // graph so importing the render pipeline in tests never loads it.
  const { renderRemotionSegment } = await import('../../remotion/render')

  const visualPath = join(tmpdir(), `batchcontent-card-vis-${stamp}.mp4`)
  await renderRemotionSegment({
    compositionId: 'HormoziConceptCard',
    inputProps: {
      layout: card.layout,
      text: card.text,
      subtitle: card.subtitle ?? '',
      items: card.items ?? [],
      accentColor: card.accentColor
    },
    durationSec: duration,
    fps,
    width,
    height,
    transparent: false,
    outputPath: visualPath
  })

  const outputPath = join(tmpdir(), `batchcontent-card-seg-${stamp}.mp4`)
  await muxRemotionVisualWithAudio({
    visualPath,
    sourceVideoPath,
    outputPath,
    startTime: card.startTime,
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
export const conceptCardsFeature: RenderFeature = {
  name: 'concept-cards',
  async prepare(
    _job: RenderClipJob,
    batchOptions: RenderBatchOptions
  ): Promise<PrepareResult> {
    // Long-form orchestration happens in longform-pipeline.ts, not here.
    if (batchOptions.outputProfile !== 'longform') {
      return { tempFiles: [], modified: false }
    }
    return { tempFiles: [], modified: false }
  }
}
