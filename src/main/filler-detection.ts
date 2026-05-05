// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A word from the transcript with timing */
export interface TranscriptWord {
  text: string
  start: number // seconds
  end: number // seconds
  confidence?: number
}

/** A segment detected for potential removal */
export interface FillerSegment {
  start: number
  end: number
  type: 'filler' | 'silence' | 'repeat'
  /** The word(s) that triggered this detection */
  label: string
}

/** Settings controlling what gets detected */
export interface FillerDetectionSettings {
  /** Detect and mark filler words (um, uh, like, etc.) */
  removeFillerWords: boolean
  /** Trim long silences between words */
  trimSilences: boolean
  /** Remove stuttered/repeated word starts */
  removeRepeats: boolean
  /** Minimum gap (seconds) between words to consider as a removable silence. Default: 0.8 */
  silenceThreshold: number
  /** Target silence duration (seconds) to leave after trimming. Default: 0.15 */
  silenceTargetGap: number
  /** Custom filler word list */
  fillerWords: string[]
}

/** Default filler word list */
export const DEFAULT_FILLER_WORDS: string[] = [
  'um', 'uh', 'erm', 'er', 'ah', 'hm', 'hmm', 'mm', 'mhm',
  'like', 'you know', 'i mean', 'sort of', 'kind of',
  'basically', 'actually', 'literally', 'right', 'okay so'
]

const DEFAULT_FILLER_DETECTION_SETTINGS: FillerDetectionSettings = {
  removeFillerWords: true,
  trimSilences: true,
  removeRepeats: true,
  silenceThreshold: 0.8,
  silenceTargetGap: 0.15,
  fillerWords: DEFAULT_FILLER_WORDS
}

/** Result of analyzing a transcript for fillers */
export interface FillerDetectionResult {
  /** All detected removable segments */
  segments: FillerSegment[]
  /** Estimated time saved in seconds */
  timeSaved: number
  /** Count of each type detected */
  counts: { filler: number; silence: number; repeat: number }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strip punctuation and lowercase a word for comparison */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z']/g, '')
}

/** Words that indicate "like" is being used meaningfully (e.g. "I like this") */
const LIKE_MEANINGFUL_PREDECESSORS = new Set(['would', 'really', "don't", 'dont', 'i'])

/** Context-sensitive fillers that need surrounding-word checks */
const CONTEXT_SENSITIVE_FILLERS = new Set(['like', 'right', 'actually', 'literally', 'basically'])

/** Multi-word filler phrases (all lowercase, space-separated) */
const MULTI_WORD_FILLERS = ['you know', 'i mean', 'sort of', 'kind of', 'okay so']

// ---------------------------------------------------------------------------
// detectFillers
// ---------------------------------------------------------------------------

/**
 * Detect filler words, long silences, and repeated starts in a word-level transcript.
 *
 * @param words - Word-level transcript array with timing
 * @param settings - Detection configuration
 * @returns Detected filler segments, sorted by start time
 */
export function detectFillers(
  words: TranscriptWord[],
  settings: FillerDetectionSettings
): FillerDetectionResult {
  if (words.length === 0) {
    return { segments: [], timeSaved: 0, counts: { filler: 0, silence: 0, repeat: 0 } }
  }

  const segments: FillerSegment[] = []

  // Build the set of single-word fillers and list of multi-word fillers from settings
  const singleFillers = new Set<string>()
  const multiFillers: string[] = []

  for (const phrase of settings.fillerWords) {
    const lower = phrase.toLowerCase().trim()
    if (lower.includes(' ')) {
      multiFillers.push(lower)
    } else {
      singleFillers.add(lower)
    }
  }

  // Track which word indices are already consumed by a multi-word filler
  const consumedByMulti = new Set<number>()

  if (settings.removeFillerWords) {
    // --- Multi-word filler detection ---
    for (let i = 0; i < words.length - 1; i++) {
      const pair = normalize(words[i].text) + ' ' + normalize(words[i + 1].text)
      if (multiFillers.includes(pair)) {
        segments.push({
          start: words[i].start,
          end: words[i + 1].end,
          type: 'filler',
          label: pair
        })
        consumedByMulti.add(i)
        consumedByMulti.add(i + 1)
      }
    }

    // --- Single-word filler detection ---
    for (let i = 0; i < words.length; i++) {
      if (consumedByMulti.has(i)) continue

      const norm = normalize(words[i].text)
      if (!singleFillers.has(norm)) continue

      // Context-sensitive fillers need extra checks
      if (CONTEXT_SENSITIVE_FILLERS.has(norm)) {
        // Must not be first or last word
        if (i === 0 || i === words.length - 1) continue

        // Must not be at the start of a sentence (preceded by long pause > 1s)
        const gapBefore = words[i].start - words[i - 1].end
        if (gapBefore > 1.0) continue

        // Special rule for "like": skip if preceded by a meaningful verb
        if (norm === 'like') {
          const prevNorm = normalize(words[i - 1].text)
          if (LIKE_MEANINGFUL_PREDECESSORS.has(prevNorm)) continue
        }
      }

      segments.push({
        start: words[i].start,
        end: words[i].end,
        type: 'filler',
        label: norm
      })
    }
  }

  // --- Silence detection ---
  if (settings.trimSilences) {
    for (let i = 0; i < words.length - 1; i++) {
      const gap = words[i + 1].start - words[i].end
      if (gap > settings.silenceThreshold) {
        const segStart = words[i].end + settings.silenceTargetGap
        const segEnd = words[i + 1].start

        // Only create segment if there is actual excess silence to remove
        if (segEnd > segStart) {
          segments.push({
            start: segStart,
            end: segEnd,
            type: 'silence',
            label: `${gap.toFixed(2)}s pause`
          })
        }
      }
    }
  }

  // --- Repeat detection ---
  if (settings.removeRepeats) {
    detectRepeatedWords(words, segments)
    detectRepeatedPhrases(words, segments)
  }

  // --- Post-processing ---
  // Sort by start time
  segments.sort((a, b) => a.start - b.start || a.end - b.end)

  // Merge overlapping segments
  const merged = mergeOverlapping(segments)

  // Calculate stats
  let timeSaved = 0
  const counts = { filler: 0, silence: 0, repeat: 0 }
  for (const seg of merged) {
    const duration = seg.end - seg.start
    if (duration > 0) {
      timeSaved += duration
    }
    counts[seg.type]++
  }

  return { segments: merged, timeSaved, counts }
}

// ---------------------------------------------------------------------------
// Repeat detection helpers
// ---------------------------------------------------------------------------

/**
 * Detect consecutive runs of the same word: "I I I think" → mark the first
 * two "I"s for removal.
 */
function detectRepeatedWords(words: TranscriptWord[], segments: FillerSegment[]): void {
  let i = 0
  while (i < words.length) {
    const norm = normalize(words[i].text)
    if (!norm) {
      i++
      continue
    }

    // Count how many consecutive identical words
    let j = i + 1
    while (j < words.length && normalize(words[j].text) === norm) {
      j++
    }

    const runLength = j - i
    if (runLength >= 2) {
      // Mark all but the last occurrence for removal
      segments.push({
        start: words[i].start,
        end: words[j - 2].end,
        type: 'repeat',
        label: `${words[i].text} ×${runLength - 1}`
      })
    }

    i = j
  }
}

/**
 * Detect 2–3 word repeated phrase starts: "the thing the thing is" → mark
 * the first "the thing" for removal.
 */
function detectRepeatedPhrases(words: TranscriptWord[], segments: FillerSegment[]): void {
  // Check phrase lengths 2 and 3
  for (const phraseLen of [3, 2]) {
    let i = 0
    while (i <= words.length - phraseLen * 2) {
      const phrase = buildPhrase(words, i, phraseLen)
      const nextPhrase = buildPhrase(words, i + phraseLen, phraseLen)

      if (phrase === nextPhrase) {
        // Count how many times this phrase repeats consecutively
        let repetitions = 2
        let k = i + phraseLen * 2
        while (k + phraseLen <= words.length && buildPhrase(words, k, phraseLen) === phrase) {
          repetitions++
          k += phraseLen
        }

        // Mark all but the last occurrence for removal
        const removeCount = repetitions - 1
        const endIdx = i + phraseLen * removeCount - 1
        segments.push({
          start: words[i].start,
          end: words[endIdx].end,
          type: 'repeat',
          label: `"${phrase}" ×${removeCount}`
        })

        // Skip past the repeated section
        i = i + phraseLen * removeCount
      } else {
        i++
      }
    }
  }
}

/** Build a normalized phrase string from `count` words starting at `start` */
function buildPhrase(words: TranscriptWord[], start: number, count: number): string {
  const parts: string[] = []
  for (let i = start; i < start + count && i < words.length; i++) {
    parts.push(normalize(words[i].text))
  }
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Merge overlapping segments
// ---------------------------------------------------------------------------

function mergeOverlapping(segments: FillerSegment[]): FillerSegment[] {
  if (segments.length === 0) return []

  const result: FillerSegment[] = [segments[0]]

  for (let i = 1; i < segments.length; i++) {
    const current = segments[i]
    const prev = result[result.length - 1]

    if (current.start <= prev.end) {
      // Overlapping — keep the one that started first, extend its end if needed
      if (current.end > prev.end) {
        prev.end = current.end
      }
    } else {
      result.push(current)
    }
  }

  return result
}
