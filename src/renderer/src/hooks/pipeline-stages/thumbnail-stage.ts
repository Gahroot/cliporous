import type { ClipCandidate } from '../../store'
import type { PipelineContext } from './types'
import { THUMB_CONCURRENCY } from '@shared/constants'

/** Generate thumbnails for clips in batches. */
export async function thumbnailStage(
  ctx: PipelineContext,
  sourcePath: string,
  clips: ClipCandidate[]
): Promise<void> {
  const { source, store } = ctx

  for (let i = 0; i < clips.length; i += THUMB_CONCURRENCY) {
    const batch = clips.slice(i, i + THUMB_CONCURRENCY)
    const done = Math.min(i + THUMB_CONCURRENCY, clips.length)
    ctx.setPipeline({
      stage: 'scoring',
      message: `Generating thumbnails (${done}/${clips.length})…`,
      percent: Math.round((done / clips.length) * 100)
    })
    const results = await Promise.allSettled(
      batch.map((clip) => window.api.getThumbnail(sourcePath, clip.startTime + 1))
    )
    for (let j = 0; j < batch.length; j++) {
      const result = results[j]
      if (result.status === 'fulfilled' && result.value) {
        store.updateClipThumbnail(source.id, batch[j].id, result.value)
      }
    }
  }
}
