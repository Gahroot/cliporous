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

/** Options controlling how filler removal stitches together keep segments. */
export interface BuildKeepSegmentsOptions {
  /**
   * Seconds to pad onto the *start* of every keep segment, preserving the
   * lead-in (consonant onset, breath, articulation shape) of the kept audio.
   * Padding is clamped so adjacent keep segments never overlap and so it
   * never crosses the clip bounds. Default: 0.
   */
  paddingHead?: number
  /**
   * Seconds to pad onto the *end* of every keep segment, preserving the
   * trailing breath / plosive release of the last word. Default: 0.
   */
  paddingTail?: number
  /**
   * Maximum cut size (in seconds) we should *not* bother making. If two keep
   * segments would be separated by a gap smaller than this, they are merged
   * (i.e. the in-between content is kept, no cut is made). Set higher to
   * eliminate micro-cuts. Default: 0.05 (preserve all but degenerate cuts).
   */
  mergeGapThreshold?: number
  /**
   * Minimum acceptable duration (seconds) of any single keep segment. Smaller
   * segments are dropped because they're too short to perceive. Default: 0.1.
   */
  minKeepDuration?: number
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
 * @param options - Padding / merge tuning (see {@link BuildKeepSegmentsOptions})
 * @returns Array of keep segments with 0-based timestamps relative to clip start
 */
export function buildKeepSegments(
  clipStart: number,
  clipEnd: number,
  fillerSegments: FillerSegment[],
  options: BuildKeepSegmentsOptions = {}
): KeepSegment[] {
  if (clipEnd <= clipStart) return []

  const paddingHead = Math.max(0, options.paddingHead ?? 0)
  const paddingTail = Math.max(0, options.paddingTail ?? 0)
  const mergeGapThreshold = Math.max(0, options.mergeGapThreshold ?? 0.05)
  const minKeepDuration = Math.max(0, options.minKeepDuration ?? 0.1)

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

  // Apply breath padding — extend each keep segment's tail forward and the
  // next segment's head backward, but never let them collide or escape the
  // clip. This preserves coarticulation across cuts so the audio doesn't
  // sound chopped off, while still removing the bulk of the filler/silence.
  if ((paddingHead > 0 || paddingTail > 0) && keepSegments.length > 0) {
    const clipDuration = clipEnd - clipStart
    keepSegments = keepSegments.map((seg, i) => {
      const prevEnd = i > 0 ? keepSegments[i - 1].end : 0
      const nextStart = i < keepSegments.length - 1 ? keepSegments[i + 1].start : clipDuration
      // Available room on each side of THIS segment’s gap. Split the gap so
      // the head pad of this segment + tail pad of the previous segment
      // never overlap.
      const headRoom = (seg.start - prevEnd) / 2
      const tailRoom = (nextStart - seg.end) / 2
      return {
        start: Math.max(0, seg.start - Math.min(paddingHead, headRoom)),
        end: Math.min(clipDuration, seg.end + Math.min(paddingTail, tailRoom)),
      }
    })
  }

  // Merge keep segments whose remaining gap is smaller than the threshold.
  // With default 0.05s this just kills degenerate cuts; with a larger value
  // (e.g. 0.4s from the let-it-ride preset's perspective) it suppresses
  // micro-cuts that aren't worth their disruption cost.
  keepSegments = mergeCloseSegments(keepSegments, mergeGapThreshold)

  // Remove keep segments shorter than minKeepDuration (too small to be useful)
  keepSegments = keepSegments.filter((seg) => seg.end - seg.start >= minKeepDuration)

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

// ---------------------------------------------------------------------------
// remapTimeAfterFillers
// ---------------------------------------------------------------------------

/**
 * Remap a single source-video timestamp onto the cleaned (post-filler-removal)
 * clip timeline.
 *
 * Given an absolute source-video time `t`, subtract the cumulative duration
 * of every filler segment that ends at or before `t`, plus any portion of a
 * filler segment that overlaps `t`. Returns 0-based clip-local seconds.
 *
 * If `t` falls inside a filler segment (i.e. the moment is cut from the
 * output), the returned time is clamped to the start of that filler in the
 * cleaned timeline — callers that need to detect this should compare
 * against `clipStart` themselves.
 *
 * @param t              Absolute source-video timestamp (seconds)
 * @param clipStart      Clip start in source video
 * @param clipEnd        Clip end in source video
 * @param fillerSegments Filler segments removed from the clip
 * @returns              0-based clip-local time after filler removal
 */
export function remapTimeAfterFillers(
  t: number,
  clipStart: number,
  clipEnd: number,
  fillerSegments: FillerSegment[]
): number {
  if (t <= clipStart) return 0
  const clamped = Math.min(t, clipEnd)

  const fillers = fillerSegments
    .filter((seg) => seg.start < clipEnd && seg.end > clipStart)
    .map((seg) => ({
      start: Math.max(seg.start, clipStart),
      end: Math.min(seg.end, clipEnd),
    }))
    .sort((a, b) => a.start - b.start)

  let cumulativeCut = 0
  for (const filler of fillers) {
    if (filler.end <= clamped) {
      // Entire filler is before `t`
      cumulativeCut += filler.end - filler.start
    } else if (filler.start < clamped) {
      // Filler straddles `t` — only the portion before `t` is cut from
      // the timeline `t` lands on. (`t` itself effectively snaps to the
      // start of this filler in the cleaned timeline.)
      cumulativeCut += clamped - filler.start
    } else {
      // Filler starts at or after `t` — no more preceding cuts
      break
    }
  }

  return Math.max(0, (clamped - clipStart) - cumulativeCut)
}
