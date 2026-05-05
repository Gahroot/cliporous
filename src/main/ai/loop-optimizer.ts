import { callGeminiWithRetry, type GeminiCall } from './gemini-client'
import { GoogleGenAI, Type } from '@google/genai'
import type { TranscriptionResult, WordTimestamp } from '../transcription'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LoopStrategy = 'hard-cut' | 'thematic' | 'audio-match' | 'crossfade' | 'none'

export interface LoopAnalysis {
  /** 0–100: how seamlessly this clip loops. 80+ is TikTok-rewatch gold. */
  loopScore: number
  /** Best strategy to maximise loop seamlessness */
  strategy: LoopStrategy
  /**
   * Seconds to trim from the end (positive = shorten clip, negative = extend).
   * Applied to `clipEnd`: newEnd = clipEnd + suggestedEndAdjust
   */
  suggestedEndAdjust: number
  /**
   * Seconds to shift the in-point (positive = later start, negative = earlier).
   * Applied to `clipStart`: newStart = clipStart + suggestedStartAdjust
   */
  suggestedStartAdjust: number
  /** Human-readable explanation of the loop analysis */
  reason: string
}

export interface LoopOptimizedClip {
  /** New clip start in seconds */
  start: number
  /** New clip end in seconds */
  end: number
  /** Loop strategy applied */
  strategy: LoopStrategy
  /** Duration of audio crossfade in seconds (only set when strategy === 'crossfade') */
  crossfadeDuration?: number
}

const LOOP_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    loopScore: { type: Type.NUMBER, description: 'Loop quality score 0-100' },
    strategy: {
      type: Type.STRING,
      description: 'Loop strategy',
      enum: ['hard-cut', 'thematic', 'audio-match', 'crossfade', 'none']
    },
    suggestedEndAdjust: { type: Type.NUMBER, description: 'Seconds to adjust clip end (-5 to 5)' },
    suggestedStartAdjust: { type: Type.NUMBER, description: 'Seconds to adjust clip start (-5 to 5)' },
    reason: { type: Type.STRING, description: '1-2 sentence explanation' }
  },
  required: ['loopScore', 'strategy', 'suggestedEndAdjust', 'suggestedStartAdjust', 'reason']
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the words that fall within the clip window (clipStart..clipEnd).
 * Returns empty array if transcript has no words.
 */
function getClipWords(
  transcript: TranscriptionResult,
  clipStart: number,
  clipEnd: number
): WordTimestamp[] {
  return transcript.words.filter((w) => w.start >= clipStart && w.end <= clipEnd)
}

/**
 * Format a slice of words as a readable timestamped snippet for the AI prompt.
 * Words are presented as: [offset] word  (offset relative to clip start)
 */
function formatWordSlice(words: WordTimestamp[], clipStart: number, maxWords: number): string {
  return words
    .slice(0, maxWords)
    .map((w) => `[${(w.start - clipStart).toFixed(1)}s] ${w.text}`)
    .join(' ')
}

/**
 * Default LoopAnalysis returned when AI analysis fails or produces unparseable output.
 */
const DEFAULT_LOOP_ANALYSIS: LoopAnalysis = {
  loopScore: 0,
  strategy: 'none',
  suggestedEndAdjust: 0,
  suggestedStartAdjust: 0,
  reason: 'Loop analysis unavailable — AI response could not be parsed.'
}

/**
 * Sanitize a raw JSON string from the AI by fixing common bad escape sequences
 * that cause `JSON.parse` to throw `Bad escaped character`.
 *
 * Handles: bare \' , \x?? hex escapes, \0 NUL, and other invalid \<char> sequences.
 */
function sanitizeJsonEscapes(raw: string): string {
  // Replace invalid escape sequences inside JSON strings:
  //  \' → '     (JSON only allows \" not \')
  //  \xHH → the actual character
  //  \0  → (remove NUL)
  //  \a, \v, \e, \? and other non-standard escapes → the literal char
  return raw.replace(/\\(x[0-9a-fA-F]{2}|[^"\\\/bfnrtu])/g, (_match, seq: string) => {
    if (seq.startsWith('x')) {
      // \xHH → convert to actual char
      return String.fromCharCode(parseInt(seq.slice(1), 16))
    }
    if (seq === '0') return '' // NUL
    if (seq === "'") return "'" // bare \'
    // For anything else (\a, \v, \e, \?, etc.) just return the literal char
    return seq
  })
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const LOOP_ANALYSIS_SYSTEM_PROMPT = `You are an expert in TikTok content optimization, specializing in loop engineering — the technique of editing clips so the ending connects seamlessly back to the beginning, forcing re-watches and multiplying view counts.

LOOP STRATEGIES:
1. hard-cut: End the clip mid-sentence or mid-thought so the viewer thinks they missed something and immediately re-watches. Best when the end word/phrase naturally precedes the opening word. Score: high rewatch compulsion, feels abrupt.
2. thematic: The ending theme, topic, or emotion directly mirrors the opening — the clip feels complete yet circular. The viewer rewinds to relive the moment. Score: high satisfaction loop.
3. audio-match: The audio energy (tone, volume, pace) at the end closely matches the beginning — trim to the exact word where energy levels align. Creates a nearly invisible loop seam. Score: seamless loop.
4. crossfade: A very short (0.1–0.3s) audio crossfade at the loop point softens the cut. Use when energy levels are slightly mismatched but thematic or verbal content loops well. Score: smooth loop.
5. none: The clip's content does not loop naturally regardless of editing. Score: no loop potential.

SCORING (loopScore 0–100):
- 90–100: Guaranteed multi-rewatch — viewer cannot tell where the loop is
- 80–89: Very strong loop — feels intentional and satisfying
- 70–79: Good loop — slight seam but compelling enough for re-watches
- 50–69: Moderate — loop works but requires viewer effort
- 30–49: Weak — detectable cut, occasional re-watch
- 0–29: Poor — no natural loop connection

ADJUSTMENT RULES:
- suggestedEndAdjust: seconds to add/subtract from the clip's end timestamp (e.g. -1.5 to end 1.5s earlier, cutting the last stray word)
- suggestedStartAdjust: seconds to add/subtract from the clip's start (e.g. +0.5 to skip a breath or false start)
- Both values must be in range [-5.0, 5.0]
- Prefer suggestedEndAdjust; only change start if it meaningfully improves the loop

CRITICAL: You MUST return only valid JSON. No markdown fences, no explanation text.

JSON schema:
{
  "loopScore": <number 0-100>,
  "strategy": <"hard-cut" | "thematic" | "audio-match" | "crossfade" | "none">,
  "suggestedEndAdjust": <number -5.0 to 5.0>,
  "suggestedStartAdjust": <number -5.0 to 5.0>,
  "reason": "<1-2 sentence explanation of why this clip loops or doesn't>"
}`

// ---------------------------------------------------------------------------
// analyzeLoopPotential
// ---------------------------------------------------------------------------

/**
 * Uses Gemini AI to analyze a clip's transcript for natural loop points.
 *
 * The function examines:
 * - Whether the ending word/phrase bridges back to the opening (hard-cut or thematic)
 * - Speaker energy and tone alignment between start and end
 * - Callback phrases or repeated structures
 * - Whether a slight trim creates re-watch compulsion
 *
 * @param apiKey   Gemini API key
 * @param transcript  Full video transcription (words + segments)
 * @param clipStart   Clip start in seconds (absolute, relative to source video)
 * @param clipEnd     Clip end in seconds
 */
export async function analyzeLoopPotential(
  apiKey: string,
  transcript: TranscriptionResult,
  clipStart: number,
  clipEnd: number
): Promise<LoopAnalysis> {
  const clipWords = getClipWords(transcript, clipStart, clipEnd)
  const clipDuration = clipEnd - clipStart

  if (clipWords.length < 4) {
    // Not enough spoken content to analyze — default to 'none'
    return {
      loopScore: 0,
      strategy: 'none',
      suggestedEndAdjust: 0,
      suggestedStartAdjust: 0,
      reason: 'Insufficient spoken content in this clip for loop analysis.'
    }
  }

  // Feed the AI the first 10 words and last 10 words of the clip
  const openingWords = formatWordSlice(clipWords, clipStart, 10)
  const tailWords = clipWords.slice(-10)
  const closingWords = tailWords
    .map((w) => `[${(w.start - clipStart).toFixed(1)}s] ${w.text}`)
    .join(' ')

  // Also include full clip text for thematic analysis
  // Strip control characters that could break JSON parsing in the AI response
  const clipText = clipWords.map((w) => w.text).join(' ').replace(/[\x00-\x1F\x7F]/g, '')

  const prompt = `${LOOP_ANALYSIS_SYSTEM_PROMPT}

Clip duration: ${clipDuration.toFixed(1)} seconds

OPENING (first 10 words):
${openingWords}

CLOSING (last 10 words):
${closingWords}

FULL CLIP TEXT:
"${clipText}"

Analyze this clip for loop potential. Consider:
1. Does the closing phrase naturally lead back to the opening phrase?
2. Does the clip end mid-thought in a way that compels re-watch?
3. Is the energy/tone at the end similar to the start?
4. Could trimming the end (suggestedEndAdjust) make the loop tighter?
5. Is there a repeated phrase or callback structure?`

  const ai = new GoogleGenAI({ apiKey })
  const call: GeminiCall = {
    model: 'gemini-2.5-flash-lite',
    config: {
      responseMimeType: 'application/json',
      responseSchema: LOOP_ANALYSIS_SCHEMA
    }
  }

  let rawText: string
  try {
    rawText = await callGeminiWithRetry(ai, call, prompt, 'loop-optimizer')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`Loop analysis AI call failed, returning default: ${msg}`)
    return { ...DEFAULT_LOOP_ANALYSIS, reason: `Loop analysis skipped: ${msg}` }
  }

  // Parse and validate — sanitize bad escapes, then fall back to default on failure
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    // Fix #1: sanitize common bad escape sequences and retry
    try {
      const sanitized = sanitizeJsonEscapes(rawText)
      parsed = JSON.parse(sanitized)
    } catch {
      // Fix #1b: try extracting JSON object from surrounding text
      const match = sanitizeJsonEscapes(rawText).match(/\{[\s\S]*\}/)
      if (!match) {
        console.warn('Gemini returned unparseable JSON for loop analysis, using default')
        return { ...DEFAULT_LOOP_ANALYSIS }
      }
      try {
        parsed = JSON.parse(match[0])
      } catch {
        console.warn('Gemini returned unparseable JSON for loop analysis, using default')
        return { ...DEFAULT_LOOP_ANALYSIS }
      }
    }
  }

  const raw = parsed as Record<string, unknown>

  const loopScore = typeof raw.loopScore === 'number'
    ? Math.min(100, Math.max(0, Math.round(raw.loopScore)))
    : 0

  const validStrategies: LoopStrategy[] = ['hard-cut', 'thematic', 'audio-match', 'crossfade', 'none']
  const strategy: LoopStrategy = validStrategies.includes(raw.strategy as LoopStrategy)
    ? (raw.strategy as LoopStrategy)
    : 'none'

  const clampAdj = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (isNaN(n)) return 0
    return Math.min(5, Math.max(-5, n))
  }

  return {
    loopScore,
    strategy,
    suggestedEndAdjust: clampAdj(raw.suggestedEndAdjust),
    suggestedStartAdjust: clampAdj(raw.suggestedStartAdjust),
    reason: typeof raw.reason === 'string' ? raw.reason.trim() : ''
  }
}

// ---------------------------------------------------------------------------
// optimizeForLoop
// ---------------------------------------------------------------------------

/**
 * Applies the loop analysis to produce adjusted clip boundaries.
 *
 * Strategies:
 * - 'hard-cut':    apply suggestedEndAdjust to create a mid-sentence cut
 * - 'thematic':    apply suggestedEndAdjust + suggestedStartAdjust for thematic alignment
 * - 'audio-match': apply suggestedEndAdjust to align audio energy levels
 * - 'crossfade':   apply adjustments + set a 0.2s audio crossfade duration
 * - 'none':        return original boundaries unchanged
 *
 * @param clipStart   Original clip start in seconds
 * @param clipEnd     Original clip end in seconds
 * @param transcript  Full video transcription (used for word-boundary snapping)
 * @param analysis    Result from analyzeLoopPotential
 */
export function optimizeForLoop(
  clipStart: number,
  clipEnd: number,
  transcript: TranscriptionResult,
  analysis: LoopAnalysis
): LoopOptimizedClip {
  if (analysis.strategy === 'none' || analysis.loopScore < 30) {
    return { start: clipStart, end: clipEnd, strategy: 'none' }
  }

  let newStart = clipStart + analysis.suggestedStartAdjust
  let newEnd = clipEnd + analysis.suggestedEndAdjust

  // Snap newEnd to the nearest word boundary to avoid cutting mid-phoneme
  if (transcript.words.length > 0 && analysis.suggestedEndAdjust !== 0) {
    const targetEnd = newEnd
    const wordsInRange = transcript.words.filter(
      (w) => w.end >= clipStart + 1 && w.end <= clipEnd
    )
    if (wordsInRange.length > 0) {
      const closest = wordsInRange.reduce((best, w) => {
        return Math.abs(w.end - targetEnd) < Math.abs(best.end - targetEnd) ? w : best
      })
      newEnd = closest.end
    }
  }

  // Snap newStart to word boundary if adjusted
  if (transcript.words.length > 0 && analysis.suggestedStartAdjust !== 0) {
    const targetStart = newStart
    const wordsInRange = transcript.words.filter(
      (w) => w.start >= clipStart && w.start <= clipEnd - 2
    )
    if (wordsInRange.length > 0) {
      const closest = wordsInRange.reduce((best, w) => {
        return Math.abs(w.start - targetStart) < Math.abs(best.start - targetStart) ? w : best
      })
      newStart = closest.start
    }
  }

  // Ensure minimum clip duration of 5 seconds
  const MIN_DURATION = 5
  if (newEnd - newStart < MIN_DURATION) {
    newEnd = newStart + MIN_DURATION
  }

  // Crossfade strategy: add a short audio crossfade at the loop boundary
  if (analysis.strategy === 'crossfade') {
    // Crossfade duration: 0.2s default, but clamp to 3% of clip duration
    const clipDuration = newEnd - newStart
    const crossfadeDuration = Math.min(0.3, Math.max(0.1, clipDuration * 0.03))
    return {
      start: newStart,
      end: newEnd,
      strategy: 'crossfade',
      crossfadeDuration
    }
  }

  return {
    start: newStart,
    end: newEnd,
    strategy: analysis.strategy
  }
}

// ---------------------------------------------------------------------------
// buildLoopCrossfadeFilter
// ---------------------------------------------------------------------------

/**
 * Returns an FFmpeg `filter_complex` string that applies a smooth audio
 * crossfade at the loop boundary.
 *
 * Technique: the last `crossfadeDuration` seconds of audio are blended with
 * the first `crossfadeDuration` seconds using `acrossfade`. When the clip is
 * looped (via `-stream_loop -1` or a looping player), the seam becomes
 * inaudible.
 *
 * The returned filter assumes a single input stream `[0:a]` and outputs `[aout]`.
 *
 * @param clipDuration       Total duration of the clip in seconds
 * @param crossfadeDuration  Length of the crossfade blend in seconds (0.1–0.3 recommended)
 */
export function buildLoopCrossfadeFilter(
  clipDuration: number,
  crossfadeDuration: number
): string {
  // Clamp crossfade to sane bounds
  const cf = Math.min(clipDuration * 0.1, Math.max(0.05, crossfadeDuration))

  // Split audio into main body and two tail segments for crossfading
  // The loop crossfade blends:
  //   - A: the final `cf` seconds of the clip (loop tail)
  //   - B: a copy of the first `cf` seconds  (loop head)
  // Combined they replace the tail so when the player loops back the seam is blended.

  const tailStart = (clipDuration - cf).toFixed(6)
  const cfStr = cf.toFixed(6)

  return [
    // Split audio into three parts:
    //   [body] — 0 to (duration - cf)
    //   [tail] — last cf seconds (will be crossfaded out)
    //   [head] — copy of first cf seconds (will be crossfaded in)
    `[0:a]asplit=3[a_full][a_tail_src][a_head_src]`,
    // Trim body: everything except the last cf seconds
    `[a_full]atrim=0:${tailStart},asetpts=PTS-STARTPTS[a_body]`,
    // Tail: last cf seconds
    `[a_tail_src]atrim=start=${tailStart},asetpts=PTS-STARTPTS[a_tail]`,
    // Head: first cf seconds (mirror of loop start)
    `[a_head_src]atrim=0:${cfStr},asetpts=PTS-STARTPTS[a_head]`,
    // Crossfade tail → head
    `[a_tail][a_head]acrossfade=d=${cfStr}:c1=tri:c2=tri[a_cf]`,
    // Concatenate body + crossfaded segment
    `[a_body][a_cf]concat=n=2:v=0:a=1[aout]`
  ].join(';')
}

// ---------------------------------------------------------------------------
// scoreLoopQuality
// ---------------------------------------------------------------------------

/**
 * Returns a 0–100 composite loop quality score from a LoopAnalysis result.
 *
 * Factors:
 * - Base loopScore from AI analysis (70% weight)
 * - Strategy bonus: crossfade/audio-match score higher than hard-cut
 * - Penalty for large boundary adjustments (indicates the original clip
 *   boundaries were far from optimal loop points)
 */
export function scoreLoopQuality(analysis: LoopAnalysis): number {
  const strategyBonus: Record<LoopStrategy, number> = {
    'crossfade': 8,
    'audio-match': 10,
    'thematic': 6,
    'hard-cut': 2,
    'none': 0
  }

  // Penalty for large adjustments (each second beyond 1s costs 2 points)
  const totalAdjust = Math.abs(analysis.suggestedEndAdjust) + Math.abs(analysis.suggestedStartAdjust)
  const adjustPenalty = Math.max(0, (totalAdjust - 1) * 2)

  const raw = analysis.loopScore * 0.7 +
    strategyBonus[analysis.strategy] +
    (analysis.loopScore > 0 ? analysis.loopScore * 0.3 : 0) -
    adjustPenalty

  return Math.min(100, Math.max(0, Math.round(raw)))
}
