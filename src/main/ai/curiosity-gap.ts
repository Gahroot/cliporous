import { callGeminiWithRetry, type GeminiCall } from './gemini-client'
import { GoogleGenAI } from '@google/genai'
import type { TranscriptionResult } from '../transcription'
import type { CuriosityGap, ClipBoundary, CuriosityClipCandidate, ClipEndMode } from '@shared/types'

// Re-export shared types for existing consumers + backward-compat alias
export type { CuriosityGap, ClipBoundary, CuriosityClipCandidate }
export type ClipCandidate = CuriosityClipCandidate

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const CURIOSITY_GAP_SYSTEM_PROMPT = `You are an expert in viral content psychology and narrative structure. Your task is to analyze a video transcript and identify every "curiosity gap" moment — structural patterns that compel viewers to keep watching.

CURIOSITY GAP TYPES:
1. QUESTION: Speaker poses a direct or rhetorical question (e.g. "Have you ever wondered why…?", "What if I told you…?")
2. STORY: Speaker begins an anecdote or story with a clear setup that needs a payoff (e.g. "So this one time I was…", "Let me tell you about…")
3. CLAIM: Speaker makes a bold, surprising, or counterintuitive claim that begs explanation (e.g. "This is the biggest mistake people make", "Everything you know about X is wrong")
4. PIVOT: Speaker signals a dramatic shift using language like "but", "however", "here's the thing", "the truth is", "wait" — the pivot creates tension between before/after
5. TEASE: Speaker hints at something coming without immediately revealing it (e.g. "And then I discovered something that changed everything", "The answer surprised me")

FOR EACH GAP FOUND:
- open_timestamp: when the tension opens (MM:SS)
- resolve_timestamp: when the payoff lands — the answer, punchline, or resolution (MM:SS)
- type: question | story | claim | pivot | tease
- score: 1–10 (10 = irresistible, viewer cannot stop watching; 1 = weak)
- description: 1–2 sentences explaining exactly what makes this gap compelling for short-form content

SCORING CRITERIA:
- 9–10: Universal emotional hook — surprise, stakes, identity, or strong narrative tension
- 7–8: Clear gap with satisfying payoff, works well as a standalone clip
- 5–6: Moderate tension — functional but not exceptional
- 3–4: Weak gap — easy to skip
- 1–2: Barely noticeable — informational drift, not a real gap

IMPORTANT:
- open_timestamp must always be LESS THAN resolve_timestamp
- The gap should span at least 5 seconds
- Return ALL gaps scoring 5 or above — do not limit the count
- Use EXACT timestamps from the transcript

Return valid JSON:
{
  "gaps": [
    {
      "open_timestamp": "MM:SS",
      "resolve_timestamp": "MM:SS",
      "type": "question",
      "score": 8,
      "description": "Speaker asks why top creators succeed while hiding the actual answer for 30 seconds, creating genuine suspense."
    }
  ]
}`

// ---------------------------------------------------------------------------
// Helpers (shared with ai-scoring.ts pattern)
// ---------------------------------------------------------------------------

/**
 * Parse a timestamp string (MM:SS or HH:MM:SS) into seconds.
 * Returns NaN if the format is unrecognised.
 */
function parseTimestamp(ts: string): number {
  const parts = ts.trim().split(':').map(Number)
  if (parts.some(isNaN)) return NaN
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return NaN
}


// ---------------------------------------------------------------------------
// Raw response shapes
// ---------------------------------------------------------------------------

interface RawGap {
  open_timestamp?: unknown
  resolve_timestamp?: unknown
  type?: unknown
  score?: unknown
  description?: unknown
}

interface RawGapResponse {
  gaps?: unknown
}

// ---------------------------------------------------------------------------
// validateGaps
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set<string>(['question', 'story', 'claim', 'pivot', 'tease'])

function validateGaps(raw: RawGap[], videoDuration: number): CuriosityGap[] {
  const result: CuriosityGap[] = []

  for (const gap of raw) {
    if (typeof gap.open_timestamp !== 'string' || typeof gap.resolve_timestamp !== 'string') {
      continue
    }

    const openTs = parseTimestamp(gap.open_timestamp)
    const resolveTs = parseTimestamp(gap.resolve_timestamp)

    if (isNaN(openTs) || isNaN(resolveTs)) continue
    if (openTs >= resolveTs) continue
    if (resolveTs - openTs < 5) continue
    if (openTs >= videoDuration) continue

    const score = typeof gap.score === 'number' ? gap.score : Number(gap.score)
    if (isNaN(score) || score < 5) continue

    const type = typeof gap.type === 'string' && VALID_TYPES.has(gap.type)
      ? (gap.type as CuriosityGap['type'])
      : null
    if (!type) continue

    result.push({
      openTimestamp: openTs,
      resolveTimestamp: Math.min(resolveTs, videoDuration),
      type,
      score: Math.min(10, Math.max(1, Math.round(score))),
      description: typeof gap.description === 'string' ? gap.description.trim() : ''
    })
  }

  // Sort by score descending
  result.sort((a, b) => b.score - a.score)
  return result
}

// ---------------------------------------------------------------------------
// detectCuriosityGaps
// ---------------------------------------------------------------------------

/**
 * Send the formatted transcript to Gemini and detect all curiosity gap moments.
 *
 * @param apiKey           Gemini API key
 * @param transcript       Full TranscriptionResult from the ASR pipeline
 * @param formattedTranscript  Pre-formatted string (output of formatTranscriptForAI)
 * @param videoDuration    Total video duration in seconds (used for clamping)
 */
export async function detectCuriosityGaps(
  apiKey: string,
  transcript: TranscriptionResult,
  formattedTranscript: string,
  videoDuration: number
): Promise<CuriosityGap[]> {
  // If the transcript is empty there's nothing to analyze
  if (!transcript.words || transcript.words.length === 0) {
    return []
  }

  const ai = new GoogleGenAI({ apiKey })
  const call: GeminiCall = {
    model: 'gemini-2.5-flash-lite',
    config: { responseMimeType: 'application/json' }
  }

  const prompt = `${CURIOSITY_GAP_SYSTEM_PROMPT}

Analyze this video transcript and identify all curiosity gap moments.

Transcript:
${formattedTranscript}`

  const text = await callGeminiWithRetry(ai, call, prompt, 'curiosity-gaps')

  let rawResponse: RawGapResponse
  try {
    rawResponse = JSON.parse(text) as RawGapResponse
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error('Gemini returned an unparseable curiosity gap response')
    }
    rawResponse = JSON.parse(match[0]) as RawGapResponse
  }

  const rawGaps = Array.isArray(rawResponse.gaps) ? (rawResponse.gaps as RawGap[]) : []
  return validateGaps(rawGaps, videoDuration)
}

// ---------------------------------------------------------------------------
// optimizeClipBoundaries
// ---------------------------------------------------------------------------

/**
 * Adjusts clip boundaries to begin 1–2 seconds before the curiosity gap opens
 * and end 1–2 seconds after the payoff resolves.
 *
 * The adjusted boundaries respect the word-level transcript for clean cuts:
 * - Start is pushed back to the nearest word boundary before openTimestamp - 1.5s
 * - End is pushed forward to the nearest word boundary after resolveTimestamp + 1.5s
 * - Result is always clamped within [originalStart, originalEnd]
 *
 * @param gap            The detected curiosity gap to frame around
 * @param originalStart  The original clip start time in seconds
 * @param originalEnd    The original clip end time in seconds
 * @param transcript     Full TranscriptionResult for word-level boundary snapping
 */
export function optimizeClipBoundaries(
  gap: CuriosityGap,
  originalStart: number,
  originalEnd: number,
  transcript: TranscriptionResult
): ClipBoundary {
  const PAD_OPEN = 1.5    // seconds before gap opens
  const PAD_RESOLVE = 1.5 // seconds after gap resolves

  const targetStart = gap.openTimestamp - PAD_OPEN
  const targetEnd = gap.resolveTimestamp + PAD_RESOLVE

  // Snap start backward to the nearest word boundary
  let snapStart = targetStart
  if (transcript.words.length > 0) {
    // Find the last word that starts at or before targetStart
    const wordsBeforeTarget = transcript.words.filter((w) => w.start <= targetStart)
    if (wordsBeforeTarget.length > 0) {
      snapStart = wordsBeforeTarget[wordsBeforeTarget.length - 1].start
    } else {
      // All words are after targetStart — use first word
      snapStart = transcript.words[0].start
    }
  }

  // Snap end forward to the nearest word boundary
  let snapEnd = targetEnd
  if (transcript.words.length > 0) {
    // Find the first word that ends at or after targetEnd
    const wordsAfterTarget = transcript.words.filter((w) => w.end >= targetEnd)
    if (wordsAfterTarget.length > 0) {
      snapEnd = wordsAfterTarget[0].end
    } else {
      // All words end before targetEnd — use last word
      snapEnd = transcript.words[transcript.words.length - 1].end
    }
  }

  // Clamp to original boundaries — never expand beyond the original clip window
  const clampedStart = Math.max(originalStart, snapStart)
  const clampedEnd = Math.min(originalEnd, snapEnd)

  // Safety: ensure start < end
  const finalStart = clampedStart < clampedEnd ? clampedStart : originalStart
  const finalEnd = clampedStart < clampedEnd ? clampedEnd : originalEnd

  const reason = buildOptimizationReason(gap, originalStart, originalEnd, finalStart, finalEnd)

  return { start: finalStart, end: finalEnd, reason }
}

function buildOptimizationReason(
  gap: CuriosityGap,
  originalStart: number,
  originalEnd: number,
  finalStart: number,
  finalEnd: number
): string {
  const typeLabels: Record<CuriosityGap['type'], string> = {
    question: 'question-answer arc',
    story: 'story setup-payoff arc',
    claim: 'claim-evidence arc',
    pivot: 'pivot moment',
    tease: 'tease-reveal arc'
  }

  const label = typeLabels[gap.type]
  const startAdjusted = Math.abs(finalStart - originalStart) > 0.5
  const endAdjusted = Math.abs(finalEnd - originalEnd) > 0.5

  const parts: string[] = [`Framed around ${label} (score ${gap.score}/10)`]
  if (startAdjusted) {
    parts.push(
      `start pulled ${finalStart < originalStart ? 'back' : 'forward'} to open before the ${gap.type}`
    )
  }
  if (endAdjusted) {
    parts.push(
      `end extended ${finalEnd > originalEnd ? 'out' : 'in'} to include the full payoff`
    )
  }
  if (!startAdjusted && !endAdjusted) {
    parts.push('original boundaries already capture the full arc')
  }

  return parts.join('; ')
}

// ---------------------------------------------------------------------------
// rankClipsByCuriosity
// ---------------------------------------------------------------------------

/**
 * Re-ranks an array of clip candidates by blending the original virality score
 * with any curiosity gap strength detected within the clip's time window.
 *
 * Ranking formula:
 *   combinedScore = viralityScore * 0.65 + curiosityContribution * 0.35
 *
 * curiosityContribution is the highest gap score (1–10, scaled to 0–100) among
 * all curiosity gaps whose open–resolve window overlaps with the clip.
 *
 * Clips with no overlapping gaps receive no curiosity bonus.
 *
 * @param clips  Array of ClipCandidate objects (mutated in place with new fields)
 * @param gaps   Array of CuriosityGap objects detected in the same transcript
 */
export function rankClipsByCuriosity(
  clips: ClipCandidate[],
  gaps: CuriosityGap[]
): ClipCandidate[] {
  const ranked = clips.map((clip) => {
    // Find all curiosity gaps that overlap with this clip's time range
    const overlappingGaps = gaps.filter(
      (gap) => gap.openTimestamp < clip.endTime && gap.resolveTimestamp > clip.startTime
    )

    const topGapScore =
      overlappingGaps.length > 0
        ? Math.max(...overlappingGaps.map((g) => g.score))
        : 0

    // Scale gap score (1–10) to 0–100 for consistent blending with virality score
    const curiosityContribution = topGapScore * 10

    const combinedScore =
      overlappingGaps.length > 0
        ? Math.round(clip.score * 0.65 + curiosityContribution * 0.35)
        : clip.score

    return {
      ...clip,
      curiosityScore: topGapScore > 0 ? topGapScore : undefined,
      combinedScore
    }
  })

  // Sort by combinedScore descending, break ties by original score
  ranked.sort((a, b) => {
    const diff = (b.combinedScore ?? b.score) - (a.combinedScore ?? a.score)
    return diff !== 0 ? diff : b.score - a.score
  })

  return ranked
}

// ---------------------------------------------------------------------------
// Clip End Mode — boundary optimization strategies
// ---------------------------------------------------------------------------

export type { ClipEndMode }

/** Characters that signal the end of a sentence. */
const SENTENCE_ENDINGS = /[.!?]$|\.{3}$/

/**
 * For "completion-first" mode — snaps clip boundaries so the clip starts and
 * ends on complete sentence / thought boundaries.
 *
 * Strategy:
 * - Walk backward from the last word to find a sentence-ending punctuation mark
 *   or a word followed by a significant pause (> 0.7 s).
 * - Walk forward from the first word to find the start of a sentence.
 * - Enforces a minimum 5 s clip duration; falls back to original boundaries
 *   when no suitable sentence boundary is found.
 */
export function snapToSentenceBoundary(
  clipStart: number,
  clipEnd: number,
  transcript: TranscriptionResult
): ClipBoundary {
  const MIN_DURATION = 5
  const PAUSE_THRESHOLD = 0.7
  const END_BUFFER = 0.15

  // Gather words within the clip window
  const words = transcript.words.filter((w) => w.start >= clipStart && w.end <= clipEnd)

  if (words.length === 0) {
    return { start: clipStart, end: clipEnd, reason: 'No transcript words within clip — kept original boundaries' }
  }

  // --- Snap END to sentence boundary (walk backward) ---
  let snappedEnd: number | null = null
  let endReason = ''

  for (let i = words.length - 1; i >= 0; i--) {
    const trimmed = words[i].text.trimEnd()

    // Check for sentence-ending punctuation
    if (SENTENCE_ENDINGS.test(trimmed)) {
      snappedEnd = words[i].end + END_BUFFER
      endReason = `end snapped to sentence boundary ("${trimmed}")`
      break
    }

    // Check for a significant pause after this word (natural thought boundary)
    if (i < words.length - 1) {
      const gapToNext = words[i + 1].start - words[i].end
      if (gapToNext > PAUSE_THRESHOLD) {
        snappedEnd = words[i].end + END_BUFFER
        endReason = `end snapped to natural pause (${gapToNext.toFixed(1)}s gap)`
        break
      }
    }
  }

  // --- Snap START to sentence boundary (walk forward) ---
  let snappedStart: number | null = null
  let startReason = ''

  for (let i = 0; i < words.length; i++) {
    // The very first word in the clip range is always a valid sentence start
    if (i === 0) {
      // Check if it's also the first word of the transcript or preceded by
      // sentence-ending punctuation / pause. We'll accept it by default if
      // nothing better is found later (but keep looking for a stronger signal).
      const wordIndex = transcript.words.indexOf(words[i])

      if (wordIndex <= 0) {
        // First word in the transcript — valid sentence start
        snappedStart = words[i].start
        startReason = 'start at first transcript word'
        break
      }

      const prevWord = transcript.words[wordIndex - 1]
      const pauseBefore = words[i].start - prevWord.end
      const prevTrimmed = prevWord.text.trimEnd()

      if (SENTENCE_ENDINGS.test(prevTrimmed) || pauseBefore > PAUSE_THRESHOLD) {
        snappedStart = words[i].start
        startReason = 'start aligned to sentence beginning'
        break
      }

      // Not a clear sentence start — keep searching forward
      continue
    }

    // For subsequent words: check if the previous word ends a sentence or has a pause
    const prevWord = words[i - 1]
    const prevTrimmed = prevWord.text.trimEnd()
    const pauseBefore = words[i].start - prevWord.end

    if (SENTENCE_ENDINGS.test(prevTrimmed) || pauseBefore > PAUSE_THRESHOLD) {
      snappedStart = words[i].start
      startReason = 'start snapped forward to sentence beginning'
      break
    }
  }

  // Fall back if no boundaries found
  if (snappedStart === null) {
    snappedStart = clipStart
    startReason = 'start kept at original (no clear sentence boundary found)'
  }
  if (snappedEnd === null) {
    return {
      start: clipStart,
      end: clipEnd,
      reason: 'No sentence boundary found near clip end — kept original boundaries'
    }
  }

  // Enforce minimum duration
  if (snappedEnd - snappedStart < MIN_DURATION) {
    return {
      start: clipStart,
      end: clipEnd,
      reason: 'Sentence-snapped clip too short (< 5s) — kept original boundaries'
    }
  }

  return {
    start: snappedStart,
    end: snappedEnd,
    reason: `Completion-first: ${startReason}; ${endReason}`
  }
}

/**
 * For "cliffhanger" mode — ends the clip at peak tension, roughly 30 % into the
 * curiosity gap, BEFORE the resolution lands.
 *
 * Strategy:
 * - Target end ≈ openTimestamp + 30 % of (resolve − open), snapped forward to
 *   the nearest word boundary but never past resolveTimestamp − 2 s.
 * - Start ≈ openTimestamp − 3 s, snapped backward to the nearest word boundary.
 * - Everything clamped within [clipStart, clipEnd].
 * - Minimum 5 s clip duration enforced.
 */
export function optimizeForCliffhanger(
  gap: CuriosityGap,
  clipStart: number,
  clipEnd: number,
  transcript: TranscriptionResult
): ClipBoundary {
  const MIN_DURATION = 5
  const TENSION_RATIO = 0.3
  const CONTEXT_BEFORE = 3
  const RESOLVE_GUARD = 2

  const gapSpan = gap.resolveTimestamp - gap.openTimestamp
  const rawTargetEnd = gap.openTimestamp + gapSpan * TENSION_RATIO
  const maxEnd = gap.resolveTimestamp - RESOLVE_GUARD

  // Snap target end forward to the nearest word boundary (word.end >= targetEnd)
  let targetEnd = Math.min(rawTargetEnd, maxEnd)
  let endWord: { text: string; end: number } | null = null

  for (const w of transcript.words) {
    if (w.end >= targetEnd) {
      // Don't overshoot past the resolve guard
      if (w.end <= maxEnd) {
        targetEnd = w.end
        endWord = w
      }
      break
    }
  }

  // Snap start backward to the nearest word boundary
  const rawTargetStart = gap.openTimestamp - CONTEXT_BEFORE
  let targetStart = rawTargetStart

  if (transcript.words.length > 0) {
    const wordsBefore = transcript.words.filter((w) => w.start <= rawTargetStart)
    if (wordsBefore.length > 0) {
      targetStart = wordsBefore[wordsBefore.length - 1].start
    } else {
      targetStart = transcript.words[0].start
    }
  }

  // Clamp within original clip boundaries
  const clampedStart = Math.max(clipStart, targetStart)
  const clampedEnd = Math.min(clipEnd, targetEnd)

  // Safety: ensure valid range
  const finalStart = clampedStart < clampedEnd ? clampedStart : clipStart
  const finalEnd = clampedStart < clampedEnd ? clampedEnd : clipEnd

  // Enforce minimum duration — fall back to original boundaries
  if (finalEnd - finalStart < MIN_DURATION) {
    return {
      start: clipStart,
      end: clipEnd,
      reason: 'Cliffhanger cut too short (< 5s) — kept original boundaries'
    }
  }

  const endDesc = endWord
    ? `end cut at "${endWord.text}" (~${Math.round(TENSION_RATIO * 100)}% into gap)`
    : `end cut ~${Math.round(TENSION_RATIO * 100)}% into gap`

  return {
    start: finalStart,
    end: finalEnd,
    reason: `Cliffhanger: ${endDesc}, before resolution at ${gap.resolveTimestamp.toFixed(1)}s — peak tension, viewer must seek the full video`
  }
}

/**
 * Convenience dispatcher — selects the right boundary-optimization strategy
 * based on the chosen clip-end mode.
 *
 * - `loop-first`: No adjustment (loop optimiser handles it).
 * - `completion-first`: Snap to sentence endings via {@link snapToSentenceBoundary}.
 * - `cliffhanger`: Cut at peak tension via {@link optimizeForCliffhanger};
 *   falls back to `completion-first` when no gap is provided.
 */
export function optimizeClipEndpoints(
  mode: ClipEndMode,
  clipStart: number,
  clipEnd: number,
  transcript: TranscriptionResult,
  gap?: CuriosityGap
): ClipBoundary {
  switch (mode) {
    case 'completion-first':
      return snapToSentenceBoundary(clipStart, clipEnd, transcript)

    case 'cliffhanger':
      if (gap) {
        return optimizeForCliffhanger(gap, clipStart, clipEnd, transcript)
      }
      // No gap available — best-effort fallback to sentence boundary
      return snapToSentenceBoundary(clipStart, clipEnd, transcript)

    case 'loop-first':
      return {
        start: clipStart,
        end: clipEnd,
        reason: 'Loop-first mode — boundaries handled by loop optimizer'
      }
  }
}
