import type { FillerSegment, TranscriptWord } from './filler-detection'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A segment of the original clip to KEEP (not cut) */
export interface KeepSegment {
  /** Start time in seconds (relative to clip start, 0-based) */
  start: number
  /** End time in seconds (relative to clip start, 0-based) */
  end: number
}

// ---------------------------------------------------------------------------
// buildKeepSegments
// ---------------------------------------------------------------------------

/**
 * Convert filler segments (things to remove) into keep segments (things to keep).
 *
 * @param clipStart - Clip start time in seconds (absolute, in source video)
 * @param clipEnd - Clip end time in seconds (absolute, in source video)
 * @param fillerSegments - Segments to remove (absolute timestamps from source video)
 * @returns Array of keep segments with 0-based timestamps relative to clip start
 */
export function buildKeepSegments(
  clipStart: number,
  clipEnd: number,
  fillerSegments: FillerSegment[]
): KeepSegment[] {
  if (clipEnd <= clipStart) return []

  // Filter to only those overlapping with [clipStart, clipEnd]
  const overlapping = fillerSegments.filter(
    (seg) => seg.start < clipEnd && seg.end > clipStart
  )

  if (overlapping.length === 0) {
    return [{ start: 0, end: clipEnd - clipStart }]
  }

  // Clamp each filler segment to the clip bounds and sort by start time
  const clamped = overlapping
    .map((seg) => ({
      start: Math.max(seg.start, clipStart),
      end: Math.min(seg.end, clipEnd),
    }))
    .sort((a, b) => a.start - b.start)

  // Walk from clipStart to clipEnd, collecting gaps between filler segments
  const keepAbsolute: { start: number; end: number }[] = []
  let currentPos = clipStart

  for (const filler of clamped) {
    if (filler.start > currentPos) {
      keepAbsolute.push({ start: currentPos, end: filler.start })
    }
    currentPos = Math.max(currentPos, filler.end)
  }

  if (currentPos < clipEnd) {
    keepAbsolute.push({ start: currentPos, end: clipEnd })
  }

  // Convert to 0-based (relative to clipStart)
  let keepSegments: KeepSegment[] = keepAbsolute.map((seg) => ({
    start: seg.start - clipStart,
    end: seg.end - clipStart,
  }))

  // Merge keep segments that are very close together (gap < 0.05s) to avoid micro-cuts
  keepSegments = mergeCloseSegments(keepSegments, 0.05)

  // Remove keep segments shorter than 0.1s (too small to be useful)
  keepSegments = keepSegments.filter((seg) => seg.end - seg.start >= 0.1)

  return keepSegments
}

/**
 * Merge adjacent keep segments whose gap is smaller than `threshold` seconds.
 */
function mergeCloseSegments(segments: KeepSegment[], threshold: number): KeepSegment[] {
  if (segments.length === 0) return []

  const merged: KeepSegment[] = [{ ...segments[0] }]

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = segments[i]

    if (curr.start - prev.end < threshold) {
      // Merge: extend prev to cover curr
      prev.end = curr.end
    } else {
      merged.push({ ...curr })
    }
  }

  return merged
}

// ---------------------------------------------------------------------------
// buildSelectFilter
// ---------------------------------------------------------------------------

/**
 * Build FFmpeg select/aselect filter expressions that keep only the desired segments.
 * Uses `(t>=S)*(t<=E)` expressions joined with `+` (comma-free for Windows FFmpeg compat).
 *
 * @param keepSegments - Segments to keep (0-based, relative to clip start)
 * @returns Object with `videoSelect` and `audioSelect` filter strings,
 *          plus `setpts` and `asetpts` to close gaps.
 *          Returns null if no cuts needed (all content kept).
 */
export function buildSelectFilter(
  keepSegments: KeepSegment[]
): {
  videoSelect: string
  audioSelect: string
} | null {
  if (keepSegments.length === 0) return null

  // Check if single segment starting at 0 — means no cuts were made.
  // We consider "no cuts" if there's exactly one segment starting at ~0.
  if (keepSegments.length === 1 && keepSegments[0].start < 0.001) {
    return null
  }

  // Uses infix operators to avoid commas — escaped commas break some Windows FFmpeg builds.
  const betweenExprs = keepSegments
    .map((seg) => `(t>=${seg.start.toFixed(4)})*(t<=${seg.end.toFixed(4)})`)
    .join('+')

  return {
    videoSelect: `select='${betweenExprs}',setpts=N/FRAME_RATE/TB`,
    audioSelect: `aselect='${betweenExprs}',asetpts=N/SR/TB`,
  }
}

// ---------------------------------------------------------------------------
// remapWordTimestamps
// ---------------------------------------------------------------------------

/**
 * Remap word timestamps after filler removal.
 * Takes original word timestamps and the cut list, computes where each surviving
 * word falls in the new (shorter) timeline.
 *
 * Words that fall inside removed segments are excluded from output.
 * Words that fall in kept segments have their timestamps shifted earlier
 * by the cumulative duration of all preceding cuts.
 *
 * @param words - Original word timestamps (absolute, source video times)
 * @param clipStart - Clip start in source video
 * @param clipEnd - Clip end in source video
 * @param fillerSegments - Segments that were removed (absolute timestamps)
 * @returns New word timestamps, 0-based relative to the new clip start,
 *          with filler words excluded and times shifted.
 */
export function remapWordTimestamps(
  words: TranscriptWord[],
  clipStart: number,
  clipEnd: number,
  fillerSegments: FillerSegment[]
): { text: string; start: number; end: number }[] {
  if (words.length === 0) return []

  // Filter words to those within [clipStart, clipEnd]
  const clippedWords = words.filter(
    (w) => w.start >= clipStart && w.end <= clipEnd
  )

  if (clippedWords.length === 0) return []

  // Sort filler segments by start time, clamp to clip bounds
  const fillers = fillerSegments
    .filter((seg) => seg.start < clipEnd && seg.end > clipStart)
    .map((seg) => ({
      start: Math.max(seg.start, clipStart),
      end: Math.min(seg.end, clipEnd),
    }))
    .sort((a, b) => a.start - b.start)

  if (fillers.length === 0) {
    // No fillers — just shift to 0-based
    return clippedWords.map((w) => ({
      text: w.text,
      start: w.start - clipStart,
      end: w.end - clipStart,
    }))
  }

  const result: { text: string; start: number; end: number }[] = []

  for (const word of clippedWords) {
    // Check if the word falls inside any filler segment (overlaps by >50% of word duration)
    const wordDuration = word.end - word.start
    let insideFiller = false

    for (const filler of fillers) {
      if (filler.start >= word.end || filler.end <= word.start) continue

      // Compute overlap
      const overlapStart = Math.max(word.start, filler.start)
      const overlapEnd = Math.min(word.end, filler.end)
      const overlap = overlapEnd - overlapStart

      if (wordDuration > 0 && overlap / wordDuration > 0.5) {
        insideFiller = true
        break
      }
      // For zero-duration words, consider them inside if any overlap exists
      if (wordDuration === 0 && overlap >= 0) {
        insideFiller = true
        break
      }
    }

    if (insideFiller) continue

    // Calculate cumulative cut duration before this word
    let cumulativeCut = 0

    for (const filler of fillers) {
      if (filler.end <= word.start) {
        // Entire filler is before this word
        cumulativeCut += filler.end - filler.start
      } else if (filler.start < word.start && filler.end > word.start) {
        // Filler partially overlaps the word's start — add the portion before word.start
        cumulativeCut += word.start - filler.start
      } else {
        // Filler starts at or after word.start — no more preceding cuts
        break
      }
    }

    let newStart = (word.start - clipStart) - cumulativeCut
    let newEnd = (word.end - clipStart) - cumulativeCut

    // Ensure start >= 0 and end > start
    newStart = Math.max(0, newStart)
    newEnd = Math.max(newStart + 0.001, newEnd)

    result.push({
      text: word.text,
      start: newStart,
      end: newEnd,
    })
  }

  return result
}
