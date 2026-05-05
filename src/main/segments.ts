import { randomUUID } from 'crypto'
import type { WordTimestamp, VideoSegment } from '@shared/types'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MIN_SEGMENT_DURATION = 3
const MAX_SEGMENT_DURATION = 15
const DEFAULT_TARGET_DURATION = 8
const PAUSE_THRESHOLD = 0.3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a word ends a sentence (period, question mark, exclamation mark). */
function isSentenceEnd(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim())
}

/**
 * Compute the ideal number of segments for a given clip duration.
 *
 * ~20s → 2-3 segments
 * ~40s → 5 segments
 * ~60s → 6-7 segments
 */
function computeSegmentCount(totalDuration: number, targetDuration: number): number {
  return Math.max(2, Math.min(7, Math.round(totalDuration / targetDuration)))
}

// ---------------------------------------------------------------------------
// Split point detection
// ---------------------------------------------------------------------------

interface SplitCandidate {
  /** Word index — the split goes AFTER this word. */
  wordIndex: number
  /** Timestamp: end of this word (where the segment boundary lands). */
  time: number
  /** Priority: sentence > pause > word. Higher is better. */
  priority: number
}

/**
 * Find all candidate split points in the words array.
 * Returns them sorted by time.
 */
function findSplitCandidates(words: WordTimestamp[]): SplitCandidate[] {
  const candidates: SplitCandidate[] = []

  for (let i = 0; i < words.length - 1; i++) {
    const current = words[i]
    const next = words[i + 1]
    const gap = next.start - current.end

    if (isSentenceEnd(current.text)) {
      candidates.push({ wordIndex: i, time: current.end, priority: 3 })
    } else if (gap > PAUSE_THRESHOLD) {
      candidates.push({ wordIndex: i, time: current.end, priority: 2 })
    } else {
      // Every word boundary is a fallback candidate
      candidates.push({ wordIndex: i, time: current.end, priority: 1 })
    }
  }

  return candidates
}

/**
 * Given a target split time, find the best split candidate within
 * [targetTime - tolerance, targetTime + tolerance].
 *
 * Prefers: sentence boundary > pause > nearest word boundary.
 */
function findBestSplit(
  candidates: SplitCandidate[],
  targetTime: number,
  minTime: number,
  maxTime: number
): SplitCandidate | null {
  const inRange = candidates.filter(c => c.time >= minTime && c.time <= maxTime)
  if (inRange.length === 0) return null

  // Sort by priority descending, then by closeness to target ascending
  inRange.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return Math.abs(a.time - targetTime) - Math.abs(b.time - targetTime)
  })

  return inRange[0]
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Split a clip's words into 2–7 styled segments at natural boundaries.
 *
 * Designed for a Captions.ai-style editor where each ~8-10 second segment
 * gets its own visual style (zoom, text overlay, B-roll, etc.).
 *
 * @param clipId       The parent clip ID these segments belong to.
 * @param words        Word timestamps for the clip (clip-relative or absolute).
 * @param targetDuration Target segment length in seconds (default 8).
 * @returns An array of VideoSegment objects ready for the segment editor.
 */
export function splitIntoSegments(
  clipId: string,
  words: WordTimestamp[],
  targetDuration: number = DEFAULT_TARGET_DURATION
): VideoSegment[] {
  // Clamp target to valid range
  const target = Math.max(MIN_SEGMENT_DURATION, Math.min(MAX_SEGMENT_DURATION, targetDuration))

  // Edge case: no words
  if (words.length === 0) {
    return [{
      id: randomUUID(),
      clipId,
      index: 0,
      startTime: 0,
      endTime: 0,
      captionText: '',
      words: [],
      archetype: 'talking-head',
      segmentStyleCategory: 'main-video',
      zoomKeyframes: [],
      transitionIn: 'hard-cut',
      transitionOut: 'hard-cut'
    }]
  }

  const clipStart = words[0].start
  const clipEnd = words[words.length - 1].end
  const totalDuration = clipEnd - clipStart

  // Very short clip — return single segment
  if (totalDuration <= MIN_SEGMENT_DURATION * 2) {
    return [{
      id: randomUUID(),
      clipId,
      index: 0,
      startTime: clipStart,
      endTime: clipEnd,
      captionText: words.map(w => w.text).join(' '),
      words: [...words],
      archetype: 'talking-head',
      segmentStyleCategory: 'main-video',
      zoomKeyframes: [],
      transitionIn: 'hard-cut',
      transitionOut: 'hard-cut'
    }]
  }

  const segmentCount = computeSegmentCount(totalDuration, target)
  const idealSegmentDuration = totalDuration / segmentCount
  const candidates = findSplitCandidates(words)

  // Greedily select split points
  const splitPoints: SplitCandidate[] = []
  const usedWordIndices = new Set<number>()

  for (let i = 1; i < segmentCount; i++) {
    const targetTime = clipStart + idealSegmentDuration * i
    const lastSplitTime = splitPoints.length > 0
      ? splitPoints[splitPoints.length - 1].time
      : clipStart

    // Window: at least MIN_SEGMENT_DURATION from last split, at most MAX_SEGMENT_DURATION
    const minTime = Math.max(lastSplitTime + MIN_SEGMENT_DURATION, targetTime - idealSegmentDuration * 0.5)
    const maxTime = Math.min(clipEnd - MIN_SEGMENT_DURATION, targetTime + idealSegmentDuration * 0.5)

    // Filter out already-used candidates
    const available = candidates.filter(c => !usedWordIndices.has(c.wordIndex))
    const best = findBestSplit(available, targetTime, minTime, maxTime)

    if (best) {
      splitPoints.push(best)
      usedWordIndices.add(best.wordIndex)
    }
  }

  // Sort split points by time
  splitPoints.sort((a, b) => a.time - b.time)

  // Build segments from split points
  const segments: VideoSegment[] = []
  const boundaries = [
    { wordIndex: -1, time: clipStart },
    ...splitPoints,
    { wordIndex: words.length - 1, time: clipEnd }
  ]

  for (let i = 0; i < boundaries.length - 1; i++) {
    const segStart = boundaries[i].time
    const segEnd = boundaries[i + 1].time
    const startWordIdx = boundaries[i].wordIndex + 1
    const endWordIdx = i + 1 < boundaries.length - 1
      ? boundaries[i + 1].wordIndex + 1
      : words.length

    const segWords = words.slice(startWordIdx, endWordIdx)

    segments.push({
      id: randomUUID(),
      clipId,
      index: i,
      startTime: segStart,
      endTime: segEnd,
      captionText: segWords.map(w => w.text).join(' '),
      words: segWords,
      archetype: 'talking-head',
      segmentStyleCategory: 'main-video',
      zoomKeyframes: [],
      transitionIn: 'hard-cut',
      transitionOut: 'hard-cut'
    })
  }

  // Post-process: merge any too-short segments with their neighbor
  const merged = mergeShortSegments(segments, clipId)

  // Re-index after merging
  for (let i = 0; i < merged.length; i++) {
    merged[i].index = i
  }

  return merged
}

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

/**
 * Merge segments shorter than MIN_SEGMENT_DURATION into their neighbor.
 */
function mergeShortSegments(segments: VideoSegment[], clipId: string): VideoSegment[] {
  if (segments.length <= 1) return segments

  const result: VideoSegment[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const duration = seg.endTime - seg.startTime

    if (duration >= MIN_SEGMENT_DURATION || result.length === 0) {
      result.push({ ...seg })
      continue
    }

    // Too short — merge with previous segment
    const prev = result[result.length - 1]
    result[result.length - 1] = {
      id: prev.id,
      clipId,
      index: prev.index,
      startTime: prev.startTime,
      endTime: seg.endTime,
      captionText: [prev.captionText, seg.captionText].filter(Boolean).join(' '),
      words: [...prev.words, ...seg.words],
      archetype: 'talking-head',
      segmentStyleCategory: 'main-video',
      zoomKeyframes: [],
      transitionIn: prev.transitionIn,
      transitionOut: seg.transitionOut
    }
  }

  return result
}
