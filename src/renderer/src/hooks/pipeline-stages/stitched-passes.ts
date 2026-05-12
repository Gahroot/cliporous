import { THUMB_CONCURRENCY } from '@shared/constants'
import { splitIntoSegments, assignArchetypesDeterministic } from '@shared/segments'
import type {
  SourceRange,
  StitchedClipCandidate,
  WordTimestamp,
} from '../../store'
import type { PipelineContext } from './types'

const TARGET_SEGMENT_DURATION_SECONDS = 3

// ---------------------------------------------------------------------------
// Stitched thumbnail pass
// ---------------------------------------------------------------------------

/**
 * Mirror of `thumbnailStage` for stitched clips. Seeks to the first range's
 * start + 1s. Runs in THUMB_CONCURRENCY batches.
 */
export async function stitchedThumbnailPass(
  ctx: PipelineContext,
  sourcePath: string,
  stitchedClips: StitchedClipCandidate[]
): Promise<void> {
  if (stitchedClips.length === 0) return
  const { source, store } = ctx

  for (let i = 0; i < stitchedClips.length; i += THUMB_CONCURRENCY) {
    const batch = stitchedClips.slice(i, i + THUMB_CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map((clip) => {
        const firstStart = clip.sourceRanges[0]?.startTime ?? 0
        return window.api.getThumbnail(sourcePath, firstStart + 1)
      })
    )
    for (let j = 0; j < batch.length; j++) {
      const result = results[j]
      if (result.status === 'fulfilled' && result.value) {
        store.updateStitchedClipThumbnail(source.id, batch[j].id, result.value)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Stitched face detection pass
// ---------------------------------------------------------------------------

/**
 * Run face detection on every range of every stitched clip in one batched
 * detectFaceCrops call. Per-range crops are stored on the clip; the modal
 * crop is kept as a fallback.
 */
export async function stitchedFaceDetectionPass(
  ctx: PipelineContext,
  sourcePath: string,
  stitchedClips: StitchedClipCandidate[]
): Promise<void> {
  if (stitchedClips.length === 0) return
  const { source, check, store, addError } = ctx
  check()

  // Build a flat segment list plus a parallel mapping back to clip + range index.
  const segments: Array<{ start: number; end: number }> = []
  const ownership: Array<{ clipIndex: number; rangeIndex: number }> = []
  stitchedClips.forEach((clip, clipIndex) => {
    clip.sourceRanges.forEach((range, rangeIndex) => {
      segments.push({ start: range.startTime, end: range.endTime })
      ownership.push({ clipIndex, rangeIndex })
    })
  })
  if (segments.length === 0) return

  let results
  try {
    results = await window.api.detectFaceCrops(sourcePath, segments)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    addError({
      source: 'face-detection',
      message: `Stitched face detection failed: ${msg}`,
    })
    return
  }
  check()

  // Group per clip.
  const perClipCrops = new Map<
    number,
    Array<{ x: number; y: number; width: number; height: number }>
  >()
  results.forEach((result, detIdx) => {
    const owner = ownership[detIdx]
    if (!owner) return
    const list = perClipCrops.get(owner.clipIndex) ?? []
    list[owner.rangeIndex] = {
      x: result.crop.x,
      y: result.crop.y,
      width: result.crop.width,
      height: result.crop.height,
    }
    perClipCrops.set(owner.clipIndex, list)
  })

  // Pick a representative crop per clip (the first range's crop is good enough
  // as a fallback when stitched assembly skips a range-level crop).
  for (let i = 0; i < stitchedClips.length; i++) {
    const clip = stitchedClips[i]
    const rangeCropRects = perClipCrops.get(i)
    if (!rangeCropRects || rangeCropRects.length === 0) continue
    const firstRect = rangeCropRects[0]
    const fallback = firstRect
      ? { ...firstRect, faceDetected: true }
      : undefined
    store.setStitchedClipFaceCrops(source.id, clip.id, fallback, rangeCropRects)
  }
}

// ---------------------------------------------------------------------------
// Stitched segmenting pass
// ---------------------------------------------------------------------------

/**
 * Build clip-local words by stitching the source-time word list onto a
 * concatenated 0-based timeline. Mirrors render/pipeline.ts:remapWordTimestamps
 * so the segmenting we produce here lines up with the assembled MP4.
 */
function remapToClipLocal(
  words: ReadonlyArray<WordTimestamp>,
  ranges: ReadonlyArray<SourceRange>
): WordTimestamp[] {
  const out: WordTimestamp[] = []
  let concatStart = 0
  for (const range of ranges) {
    for (const w of words) {
      if (w.start >= range.startTime && w.end <= range.endTime) {
        out.push({
          text: w.text,
          start: concatStart + (w.start - range.startTime),
          end: concatStart + (w.end - range.startTime),
        })
      }
    }
    concatStart += range.endTime - range.startTime
  }
  return out
}

/**
 * Per-stitched-clip segmenting + archetype rotation. The produced
 * `VideoSegment.startTime / endTime` values are clip-local seconds — they
 * already match the timeline of the assembled MP4 that the render pipeline
 * emits during its stitched pre-pass.
 */
export async function stitchedSegmentingPass(
  ctx: PipelineContext,
  stitchedClips: StitchedClipCandidate[]
): Promise<void> {
  if (stitchedClips.length === 0) return
  const { source, store, getState } = ctx
  const hasMediaKey = Boolean(getState().settings.pexelsApiKey)

  for (const clip of stitchedClips) {
    const clipLocalWords = remapToClipLocal(clip.wordTimestamps ?? [], clip.sourceRanges)
    if (clipLocalWords.length === 0) continue
    try {
      const raw = splitIntoSegments(clip.id, clipLocalWords, TARGET_SEGMENT_DURATION_SECONDS)
      const segments = assignArchetypesDeterministic(raw, hasMediaKey)
      store.setStitchedClipSegments(source.id, clip.id, segments)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      ctx.addError({
        source: 'pipeline',
        message: `Stitched segment styling failed for clip ${clip.id}: ${msg}`,
      })
    }
  }
}
