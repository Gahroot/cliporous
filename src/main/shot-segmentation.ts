import type { WordTimestamp } from '@shared/types'
import type { ShotSegment, ShotBreakReason, ShotSegmentationResult } from '@shared/types'

// ---------------------------------------------------------------------------
// Types (re-exported from shared)
// ---------------------------------------------------------------------------

export type { ShotBreakReason }
export type { ShotSegment }
export type { ShotSegmentationResult }

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface SegmentationConfig {
  /** Target shot duration in seconds. Shots aim for this length. Default: 5 */
  targetDuration: number
  /** Minimum shot duration in seconds. Shots shorter than this get merged. Default: 2 */
  minDuration: number
  /** Maximum shot duration in seconds. Shots longer than this get split. Default: 8 */
  maxDuration: number
  /** Minimum gap between words (seconds) to count as a pause boundary. Default: 0.35 */
  pauseThreshold: number
  /** Minimum gap for a "strong" pause (higher confidence boundary). Default: 0.7 */
  strongPauseThreshold: number
  /** Window size for topic shift detection (number of words). Default: 10 */
  topicWindowSize: number
  /** Jaccard similarity threshold for topic shift detection. Below this = shift. Default: 0.25 */
  topicShiftThreshold: number
}

const DEFAULT_CONFIG: SegmentationConfig = {
  targetDuration: 5,
  minDuration: 2,
  maxDuration: 8,
  pauseThreshold: 0.35,
  strongPauseThreshold: 0.7,
  topicWindowSize: 10,
  topicShiftThreshold: 0.25
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface BreakCandidate {
  /** Index into the words array — the break goes AFTER this word. */
  wordIndex: number
  /** Timestamp of the break (midpoint between word end and next word start). */
  time: number
  /** Why this break was detected. */
  reason: ShotBreakReason
  /** Confidence 0–1. Higher = more natural break. */
  confidence: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clean a word to its base form for comparison (lowercase, no punctuation). */
function normalize(text: string): string {
  return text
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    .toLowerCase()
}

/** Check if a word ends a sentence (. ! ? followed by space or end). */
function endsSentence(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim())
}

/** Check if a word ends with a clause boundary (, ; : —). */
function endsClause(text: string): boolean {
  return /[,;:\u2014]\s*$/.test(text.trim())
}

/** Check if a word starts with a capital letter (potential sentence/topic start). */
function startsCapitalized(text: string): boolean {
  const cleaned = text.replace(/^[^a-zA-Z]+/, '')
  return cleaned.length > 0 && cleaned[0] === cleaned[0].toUpperCase() && cleaned[0] !== cleaned[0].toLowerCase()
}

/** Compute Jaccard similarity between two word sets. */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0

  let intersection = 0
  for (const word of setA) {
    if (setB.has(word)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return intersection / union
}

/** Get the vocabulary (unique normalized non-stop words) from a word range. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'can', 'could', 'of', 'in', 'to', 'for',
  'on', 'at', 'by', 'with', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'about', 'up', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us',
  'them', 'my', 'your', 'his', 'our', 'their', 'and', 'but', 'or',
  'nor', 'so', 'yet', 'not', 'no', 'if', 'then', 'than', 'when',
  'where', 'what', 'who', 'which', 'how', 'just', 'also', 'very',
  'too', 'quite', 'rather', 'really', 'already', 'still', 'even'
])

function getVocabulary(words: WordTimestamp[], startIdx: number, endIdx: number): Set<string> {
  const vocab = new Set<string>()
  for (let i = startIdx; i < endIdx; i++) {
    const w = normalize(words[i].text)
    if (w.length > 1 && !STOP_WORDS.has(w)) {
      vocab.add(w)
    }
  }
  return vocab
}

/** Compute speaking rate (words per second) for a word range. */
function speakingRate(words: WordTimestamp[], startIdx: number, endIdx: number): number {
  if (endIdx <= startIdx) return 0
  const duration = words[endIdx - 1].end - words[startIdx].start
  if (duration <= 0) return 0
  return (endIdx - startIdx) / duration
}

// ---------------------------------------------------------------------------
// Break detection
// ---------------------------------------------------------------------------

/**
 * Detect all candidate break points from word timestamps.
 * Returns breaks sorted by time.
 */
function detectBreaks(words: WordTimestamp[], config: SegmentationConfig): BreakCandidate[] {
  if (words.length === 0) return []

  const breaks: BreakCandidate[] = []

  for (let i = 0; i < words.length - 1; i++) {
    const current = words[i]
    const next = words[i + 1]
    const gap = next.start - current.end

    // --- Sentence endings ---
    if (endsSentence(current.text)) {
      const confidence = gap > config.strongPauseThreshold ? 0.95
        : gap > config.pauseThreshold ? 0.85
        : 0.7
      breaks.push({
        wordIndex: i,
        time: current.end + gap / 2,
        reason: 'sentence-end',
        confidence
      })
      continue // sentence-end trumps other signals at this position
    }

    // --- Pauses (silence gaps) ---
    if (gap > config.strongPauseThreshold) {
      breaks.push({
        wordIndex: i,
        time: current.end + gap / 2,
        reason: 'pause',
        confidence: Math.min(0.9, 0.5 + gap / 3)
      })
    } else if (gap > config.pauseThreshold) {
      // Only mark as pause if it's also a clause boundary or potential topic start
      if (endsClause(current.text) || startsCapitalized(next.text)) {
        breaks.push({
          wordIndex: i,
          time: current.end + gap / 2,
          reason: 'pause',
          confidence: Math.min(0.8, 0.4 + gap / 2)
        })
      }
    }

    // --- Clause boundaries (comma, semicolon, colon) ---
    if (endsClause(current.text) && gap > 0.1) {
      // Don't duplicate if we already added a pause here
      const existing = breaks.find(b => b.wordIndex === i)
      if (!existing) {
        breaks.push({
          wordIndex: i,
          time: current.end + gap / 2,
          reason: 'clause-boundary',
          confidence: 0.55
        })
      }
    }
  }

  // --- Topic shifts (sliding window vocabulary comparison) ---
  if (words.length >= config.topicWindowSize * 2) {
    const half = Math.floor(config.topicWindowSize / 2)
    for (let i = half; i < words.length - half; i++) {
      const beforeVocab = getVocabulary(words, Math.max(0, i - config.topicWindowSize), i)
      const afterVocab = getVocabulary(words, i, Math.min(words.length, i + config.topicWindowSize))

      const similarity = jaccardSimilarity(beforeVocab, afterVocab)
      if (similarity < config.topicShiftThreshold) {
        // Check if there's a nearby break already — if so, boost its confidence
        const gap = i < words.length - 1 ? words[i + 1].start - words[i].end : 0
        const breakTime = i < words.length - 1
          ? words[i].end + gap / 2
          : words[i].end

        const nearby = breaks.find(b => Math.abs(b.time - breakTime) < 1.0)
        if (nearby) {
          // Boost confidence of existing break
          nearby.confidence = Math.min(1, nearby.confidence + 0.15)
        } else {
          // Only add a topic-shift break if there's a noticeable gap or capitalization
          if (gap > config.pauseThreshold || startsCapitalized(words[i].text)) {
            breaks.push({
              wordIndex: i,
              time: breakTime,
              reason: 'topic-shift',
              confidence: 0.6 + (1 - similarity) * 0.2
            })
          }
        }
      }
    }
  }

  // --- Speaking rate changes (energy shifts) ---
  if (words.length >= 12) {
    const windowSize = Math.max(4, Math.floor(words.length / 8))
    for (let i = windowSize; i < words.length - windowSize; i++) {
      const rateBefore = speakingRate(words, i - windowSize, i)
      const rateAfter = speakingRate(words, i, Math.min(words.length, i + windowSize))

      if (rateBefore > 0 && rateAfter > 0) {
        const ratio = rateAfter / rateBefore
        // Significant speed change (>1.5x or <0.67x)
        if (ratio > 1.5 || ratio < 0.67) {
          const gap = i < words.length - 1 ? words[i + 1].start - words[i].end : 0
          const breakTime = i < words.length - 1
            ? words[i].end + gap / 2
            : words[i].end

          const nearby = breaks.find(b => Math.abs(b.time - breakTime) < 1.5)
          if (nearby) {
            nearby.confidence = Math.min(1, nearby.confidence + 0.1)
          }
          // Don't add a standalone energy-change break — it's too unreliable alone
        }
      }
    }
  }

  // Sort by time
  breaks.sort((a, b) => a.time - b.time)

  // Remove duplicate breaks at the same word index (keep highest confidence)
  const seen = new Map<number, BreakCandidate>()
  for (const brk of breaks) {
    const existing = seen.get(brk.wordIndex)
    if (!existing || brk.confidence > existing.confidence) {
      seen.set(brk.wordIndex, brk)
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.time - b.time)
}

// ---------------------------------------------------------------------------
// Shot building from breaks
// ---------------------------------------------------------------------------

/**
 * Select the best subset of breaks to produce shots of target duration.
 * Uses a greedy approach: walk through time, pick the highest-confidence
 * break within each target window.
 */
function selectBreaks(breaks: BreakCandidate[], totalDuration: number, config: SegmentationConfig): BreakCandidate[] {
  if (breaks.length === 0) return []
  if (totalDuration <= config.maxDuration) return []

  const selected: BreakCandidate[] = []
  let lastBreakTime = 0

  for (const brk of breaks) {
    const timeSinceLast = brk.time - lastBreakTime

    // Skip breaks that would create too-short shots
    if (timeSinceLast < config.minDuration) continue

    // If we've gone too long without a break, force one
    if (timeSinceLast >= config.maxDuration) {
      selected.push(brk)
      lastBreakTime = brk.time
      continue
    }

    // Accept breaks that are within a reasonable range of target duration
    // Use confidence to decide: high-confidence breaks at shorter durations
    // are accepted; low-confidence breaks need to be closer to target
    const durationAfterBreak = totalDuration - brk.time
    const confidenceThreshold = timeSinceLast < config.targetDuration * 0.6 ? 0.8 : 0.4

    if (brk.confidence >= confidenceThreshold && durationAfterBreak >= config.minDuration) {
      selected.push(brk)
      lastBreakTime = brk.time
    }
  }

  return selected
}

/**
 * Force-split any remaining shots that exceed maxDuration.
 * Finds the best break point within the shot's word range.
 */
function forceSplitOversized(
  shots: ShotSegment[],
  words: WordTimestamp[],
  config: SegmentationConfig
): ShotSegment[] {
  const result: ShotSegment[] = []

  for (const shot of shots) {
    const duration = shot.endTime - shot.startTime

    if (duration <= config.maxDuration) {
      result.push(shot)
      continue
    }

    // Find the word closest to the midpoint of the shot
    const midTime = shot.startTime + duration / 2
    let bestIdx = shot.startWordIndex
    let bestDist = Infinity

    for (let i = shot.startWordIndex + 1; i < shot.endWordIndex; i++) {
      const dist = Math.abs(words[i].start - midTime)
      // Prefer sentence endings or clause boundaries near the midpoint
      const bonus = endsSentence(words[i - 1].text) ? -0.5
        : endsClause(words[i - 1].text) ? -0.3
        : 0
      const adjustedDist = dist + bonus
      if (adjustedDist < bestDist) {
        bestDist = adjustedDist
        bestIdx = i
      }
    }

    const splitTime = bestIdx > 0 && bestIdx < words.length
      ? words[bestIdx].start
      : midTime

    // First half
    result.push({
      startTime: shot.startTime,
      endTime: splitTime,
      text: words.slice(shot.startWordIndex, bestIdx).map(w => w.text).join(' '),
      startWordIndex: shot.startWordIndex,
      endWordIndex: bestIdx,
      breakReason: 'max-duration',
      confidence: 0.4
    })

    // Recurse for the second half in case it's still too long
    const secondHalf: ShotSegment = {
      startTime: splitTime,
      endTime: shot.endTime,
      text: words.slice(bestIdx, shot.endWordIndex).map(w => w.text).join(' '),
      startWordIndex: bestIdx,
      endWordIndex: shot.endWordIndex,
      breakReason: shot.breakReason,
      confidence: shot.confidence
    }

    // Recursively split if still oversized
    const subShots = forceSplitOversized([secondHalf], words, config)
    result.push(...subShots)
  }

  return result
}

/**
 * Merge shots that are too short with their neighbor.
 */
function mergeUndersized(
  shots: ShotSegment[],
  config: SegmentationConfig
): ShotSegment[] {
  if (shots.length <= 1) return shots

  const result: ShotSegment[] = []
  let i = 0

  while (i < shots.length) {
    const current = shots[i]
    const duration = current.endTime - current.startTime

    if (duration >= config.minDuration || i === shots.length - 1) {
      result.push(current)
      i++
      continue
    }

    // Shot is too short — merge with the next or previous neighbor
    const next = shots[i + 1]
    const prev = result.length > 0 ? result[result.length - 1] : null

    if (next) {
      // Merge with next
      result.push({
        startTime: current.startTime,
        endTime: next.endTime,
        text: [current.text, next.text].join(' '),
        startWordIndex: current.startWordIndex,
        endWordIndex: next.endWordIndex,
        breakReason: next.breakReason,
        confidence: Math.max(current.confidence, next.confidence)
      })
      i += 2 // skip next — it's been merged
    } else if (prev) {
      // Merge with previous
      result[result.length - 1] = {
        startTime: prev.startTime,
        endTime: current.endTime,
        text: [prev.text, current.text].join(' '),
        startWordIndex: prev.startWordIndex,
        endWordIndex: current.endWordIndex,
        breakReason: current.breakReason,
        confidence: Math.max(prev.confidence, current.confidence)
      }
      i++
    } else {
      result.push(current)
      i++
    }
  }

  // Recursive merge in case merging created new undersized shots
  let merged = result
  let changed = true
  let iterations = 0
  while (changed && iterations < 10) {
    changed = false
    iterations++
    const newMerged: ShotSegment[] = []
    let j = 0
    while (j < merged.length) {
      const current = merged[j]
      const duration = current.endTime - current.startTime
      if (duration < config.minDuration && merged.length > 1) {
        const next = j < merged.length - 1 ? merged[j + 1] : null
        const prev = newMerged.length > 0 ? newMerged[newMerged.length - 1] : null
        if (next) {
          newMerged.push({
            startTime: current.startTime,
            endTime: next.endTime,
            text: [current.text, next.text].join(' '),
            startWordIndex: current.startWordIndex,
            endWordIndex: next.endWordIndex,
            breakReason: next.breakReason,
            confidence: Math.max(current.confidence, next.confidence)
          })
          j += 2
        } else if (prev) {
          newMerged[newMerged.length - 1] = {
            startTime: prev.startTime,
            endTime: current.endTime,
            text: [prev.text, current.text].join(' '),
            startWordIndex: prev.startWordIndex,
            endWordIndex: current.endWordIndex,
            breakReason: current.breakReason,
            confidence: Math.max(prev.confidence, current.confidence)
          }
          j++
        } else {
          newMerged.push(current)
          j++
        }
        changed = true
      } else {
        newMerged.push(current)
        j++
      }
    }
    merged = newMerged
  }

  return merged
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Segment a clip's word timestamps into natural "shots" — coherent visual
 * thought units suitable for per-shot styling (like captions.ai).
 *
 * This is a pure heuristic analysis — no AI/API calls required.
 *
 * @param words Word timestamps filtered to the clip range, with times
 *              shifted to be 0-based (relative to clip start).
 * @param clipDuration Total clip duration in seconds.
 * @param config Optional segmentation tuning parameters.
 * @returns ShotSegmentationResult with shots array and summary stats.
 */
export function segmentIntoShots(
  words: WordTimestamp[],
  clipDuration: number,
  config?: Partial<SegmentationConfig>
): ShotSegmentationResult {
  const cfg: SegmentationConfig = { ...DEFAULT_CONFIG, ...config }

  // Edge cases
  if (words.length === 0 || clipDuration <= 0) {
    return {
      shots: [{
        startTime: 0,
        endTime: clipDuration,
        text: '',
        startWordIndex: 0,
        endWordIndex: 0,
        breakReason: 'start',
        confidence: 0
      }],
      shotCount: 1,
      avgDuration: clipDuration
    }
  }

  // Very short clips — single shot
  if (clipDuration <= cfg.minDuration * 2) {
    return {
      shots: [{
        startTime: 0,
        endTime: clipDuration,
        text: words.map(w => w.text).join(' '),
        startWordIndex: 0,
        endWordIndex: words.length,
        breakReason: 'start',
        confidence: 1
      }],
      shotCount: 1,
      avgDuration: clipDuration
    }
  }

  // Step 1: Detect all candidate break points
  const allBreaks = detectBreaks(words, cfg)

  // Step 2: Select the best subset for even shot distribution
  const selectedBreaks = selectBreaks(allBreaks, clipDuration, cfg)

  // Step 3: Build shots from selected breaks
  let shots: ShotSegment[] = []
  const breakPoints = [0, ...selectedBreaks.map(b => b.time), clipDuration]
  const breakReasons: ShotBreakReason[] = ['start', ...selectedBreaks.map(b => b.reason), 'end']
  const breakConfidences = [1, ...selectedBreaks.map(b => b.confidence), 1]

  // Map break times to word indices
  const breakWordIndices: number[] = [0]
  for (const brk of selectedBreaks) {
    breakWordIndices.push(brk.wordIndex + 1) // shot starts at the word AFTER the break
  }
  breakWordIndices.push(words.length)

  for (let i = 0; i < breakPoints.length - 1; i++) {
    const startIdx = breakWordIndices[i]
    const endIdx = breakWordIndices[i + 1]

    shots.push({
      startTime: breakPoints[i],
      endTime: breakPoints[i + 1],
      text: words.slice(startIdx, endIdx).map(w => w.text).join(' '),
      startWordIndex: startIdx,
      endWordIndex: endIdx,
      breakReason: breakReasons[i + 1], // reason for why this shot ENDS
      confidence: breakConfidences[i + 1]
    })
  }

  // Step 4: Force-split any oversized shots
  shots = forceSplitOversized(shots, words, cfg)

  // Step 5: Merge undersized shots
  shots = mergeUndersized(shots, cfg)

  // Fix the first shot's break reason
  if (shots.length > 0) {
    shots[0].breakReason = 'start'
    shots[shots.length - 1].breakReason = 'end'
  }

  // Compute stats
  const totalDuration = shots.reduce((sum, s) => sum + (s.endTime - s.startTime), 0)
  const avgDuration = shots.length > 0 ? totalDuration / shots.length : clipDuration

  return {
    shots,
    shotCount: shots.length,
    avgDuration: Math.round(avgDuration * 100) / 100
  }
}

/**
 * Convenience wrapper that takes clip-absolute word timestamps (relative to
 * the source video) and clip start/end, filters + shifts to 0-based, then
 * runs segmentation.
 */
export function segmentClipIntoShots(
  clipWords: WordTimestamp[],
  clipStartTime: number,
  clipEndTime: number,
  config?: Partial<SegmentationConfig>
): ShotSegmentationResult {
  const clipDuration = clipEndTime - clipStartTime

  // Filter words to clip range and shift to 0-based
  const shiftedWords: WordTimestamp[] = clipWords
    .filter(w => w.start >= clipStartTime - 0.05 && w.end <= clipEndTime + 0.05)
    .map(w => ({
      text: w.text,
      start: Math.max(0, w.start - clipStartTime),
      end: Math.min(clipDuration, w.end - clipStartTime)
    }))

  return segmentIntoShots(shiftedWords, clipDuration, config)
}
