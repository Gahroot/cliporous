import { callGeminiWithRetry, type GeminiCall } from './ai/gemini-client'
import { GoogleGenAI } from '@google/genai'
import type { WordTimestamp } from '@shared/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Emphasis level for a single word in the transcript. */
export type EmphasisLevel = 'normal' | 'emphasis' | 'supersize' | 'box'

/** A word with its emphasis level determined by AI or heuristic analysis. */
export interface EmphasizedWord {
  text: string
  start: number
  end: number
  emphasis: EmphasisLevel
}

/** Result of word emphasis analysis for a clip or segment. */
export interface WordEmphasisResult {
  words: EmphasizedWord[]
  /** Whether AI was used (true) or heuristic fallback (false). */
  usedAI: boolean
}

// ---------------------------------------------------------------------------
// Word lists
// ---------------------------------------------------------------------------

const POWER_WORDS = new Set([
  'never', 'always', 'every', 'secret', 'reveal', 'truth', 'fail', 'failed',
  'success', 'successful', 'million', 'billion', 'thousand', 'percent',
  'incredible', 'amazing', 'shocking', 'important', 'critical', 'wrong',
  'right', 'mistake', 'discover', 'change', 'biggest', 'best', 'worst',
  'first', 'last', 'only', 'real', 'free', 'money', 'rich', 'poor', 'life',
  'death', 'love', 'hate', 'fear', 'stop', 'start', 'massive', 'huge',
  'insane', 'crazy', 'literally', 'actually', 'guaranteed', 'proven',
  'instantly', 'immediately', 'skyrocket', 'explode', 'double', 'triple',
  'zero', 'nothing', 'everything', 'anyone', 'nobody', 'impossible',
  'unstoppable', 'legendary', 'viral', 'broke', 'destroyed', 'crushed',
  // Extended set
  'exactly', 'absolutely', 'completely', 'totally', 'entire', 'seriously',
  'honestly', 'basically', 'obviously', 'definitely', 'certainly',
  'remember', 'imagine', 'understand', 'realize', 'believe', 'think',
  'watch', 'listen', 'look', 'need', 'must', 'should', 'win', 'lose',
  'kill', 'save', 'build', 'break', 'grow', 'fight', 'power', 'force',
  'energy', 'genius', 'stupid', 'perfect', 'terrible', 'beautiful', 'ugly',
  'dangerous', 'safe', 'fast', 'slow', 'hard', 'easy', 'simple', 'complex',
  'new', 'old', 'rare', 'common', 'unique', 'special', 'different', 'same',
  'problem', 'solution', 'answer', 'question', 'reason', 'result',
  'strategy', 'method', 'trick', 'hack', 'rule', 'law', 'key',
  'finally', 'suddenly', 'ultimately'
])

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
  'too', 'quite', 'rather', 'really', 'already', 'still', 'even', 'only'
])

// "only" appears in both lists per the spec — stop words win for emphasis,
// but it is a superlative candidate so we keep it in the superlative set below.

const SUPERLATIVE_WORDS = new Set([
  'biggest', 'best', 'worst', 'first', 'last', 'only', 'never', 'always',
  'every', 'nothing', 'everything', 'impossible', 'guaranteed', 'zero'
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip punctuation from the edges of a word for matching purposes. */
function cleanWord(text: string): string {
  return text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
}

/** Check if a word looks like a number or dollar amount. */
function isNumeric(text: string): boolean {
  const cleaned = cleanWord(text)
  return /^[$€£]?\d/.test(cleaned) || /\d[%xX]?$/.test(cleaned)
}

/** Check if a word is ALL-CAPS with the given minimum letter count. */
function isAllCaps(text: string, minLetters: number): boolean {
  const cleaned = cleanWord(text)
  const letters = cleaned.replace(/[^a-zA-Z]/g, '')
  return letters.length >= minLetters && letters === letters.toUpperCase()
}

/** Check if a word ends with ! or ? */
function endsWithPunctuation(text: string): boolean {
  return /[!?]$/.test(text.trim())
}

/** Whether a cleaned lowercase word is a stop word. */
function isStopWord(text: string): boolean {
  return STOP_WORDS.has(cleanWord(text).toLowerCase())
}

/** Whether a cleaned lowercase word is a power word. */
function isPowerWord(text: string): boolean {
  return POWER_WORDS.has(cleanWord(text).toLowerCase())
}

// ---------------------------------------------------------------------------
// Sentence splitting
// ---------------------------------------------------------------------------

interface Sentence {
  /** Indices into the original words array. */
  indices: number[]
}

/**
 * Split words into sentences by detecting sentence-ending punctuation
 * (`.`, `!`, `?` at the end of a word) or time gaps > 0.7s.
 */
function splitIntoSentences(words: WordTimestamp[]): Sentence[] {
  if (words.length === 0) return []

  const sentences: Sentence[] = []
  let current: number[] = []

  for (let i = 0; i < words.length; i++) {
    current.push(i)

    const endsWithSentencePunc = /[.!?]$/.test(words[i].text.trim())
    const hasGap =
      i < words.length - 1 && words[i + 1].start - words[i].end > 0.7

    if (endsWithSentencePunc || hasGap || i === words.length - 1) {
      if (current.length > 0) {
        sentences.push({ indices: current })
        current = []
      }
    }
  }

  if (current.length > 0) {
    sentences.push({ indices: current })
  }

  return sentences
}

// ---------------------------------------------------------------------------
// Supersize candidate scoring (per sentence)
// ---------------------------------------------------------------------------

/**
 * Pick the single best supersize candidate within a sentence.
 * Returns the index into the original words array, or -1 if none qualifies.
 *
 * Priority:
 *   1. Numbers / dollar amounts
 *   2. ALL-CAPS words with 3+ letters
 *   3. Superlative/extreme words
 *   4. First power word in the sentence
 */
function pickSupersizeCandidate(words: WordTimestamp[], sentenceIndices: number[]): number {
  // Priority 1 — numbers / dollar amounts
  for (const idx of sentenceIndices) {
    if (isNumeric(words[idx].text)) return idx
  }

  // Priority 2 — ALL-CAPS 3+ letters
  for (const idx of sentenceIndices) {
    if (isAllCaps(words[idx].text, 3)) return idx
  }

  // Priority 3 — superlative/extreme words
  for (const idx of sentenceIndices) {
    const lower = cleanWord(words[idx].text).toLowerCase()
    if (SUPERLATIVE_WORDS.has(lower)) return idx
  }

  // Priority 4 — first power word
  for (const idx of sentenceIndices) {
    if (isPowerWord(words[idx].text)) return idx
  }

  return -1
}

// ---------------------------------------------------------------------------
// Heuristic analysis
// ---------------------------------------------------------------------------

/**
 * Pure heuristic word emphasis analysis — no API key required.
 * Marks words as normal, emphasis, or supersize.
 */
export function analyzeEmphasisHeuristic(words: WordTimestamp[]): EmphasizedWord[] {
  if (words.length === 0) return []

  // Single word → emphasis
  if (words.length === 1) {
    return [{ text: words[0].text, start: words[0].start, end: words[0].end, emphasis: 'emphasis' }]
  }

  const totalWords = words.length

  // --- Step 1: Pick supersize candidates (one per sentence) ---
  const sentences = splitIntoSentences(words)
  const supersizeSet = new Set<number>()

  for (const sentence of sentences) {
    const candidate = pickSupersizeCandidate(words, sentence.indices)
    if (candidate >= 0) {
      supersizeSet.add(candidate)
    }
  }

  // --- Step 2: Mark emphasis candidates ---
  const emphasisSet = new Set<number>()

  for (let i = 0; i < totalWords; i++) {
    if (supersizeSet.has(i)) continue // supersize supersedes emphasis

    const word = words[i]

    // Skip stop words for emphasis (even if they match other rules)
    if (isStopWord(word.text)) continue

    if (isPowerWord(word.text)) {
      emphasisSet.add(i)
    } else if (isAllCaps(word.text, 2)) {
      emphasisSet.add(i)
    } else if (isNumeric(word.text)) {
      emphasisSet.add(i)
    } else if (endsWithPunctuation(word.text)) {
      emphasisSet.add(i)
    }
  }

  // --- Step 3: Rate-limit supersize to 3-8% ---
  const maxSupersize = Math.max(1, Math.floor(totalWords * 0.08))
  if (supersizeSet.size > maxSupersize) {
    // Keep the ones from earliest sentences; demote excess to emphasis
    const supersizeArr = Array.from(supersizeSet)
    // We already added in sentence order, but sort by index to be safe
    supersizeArr.sort((a, b) => a - b)
    for (let i = maxSupersize; i < supersizeArr.length; i++) {
      supersizeSet.delete(supersizeArr[i])
      // Demote to emphasis (unless it's a stop word)
      if (!isStopWord(words[supersizeArr[i]].text)) {
        emphasisSet.add(supersizeArr[i])
      }
    }
  }

  // --- Step 4: Rate-limit emphasis to ≤25% ---
  const maxEmphasis = Math.max(1, Math.floor(totalWords * 0.25))
  if (emphasisSet.size > maxEmphasis) {
    // Score each emphasis word by priority for demotion (lower = demoted first)
    const scored = Array.from(emphasisSet).map((idx) => {
      const word = words[idx]
      let priority = 0
      if (isNumeric(word.text)) priority += 4
      if (isAllCaps(word.text, 3)) priority += 3
      if (isPowerWord(word.text)) priority += 2
      if (isAllCaps(word.text, 2)) priority += 1
      if (endsWithPunctuation(word.text)) priority += 1
      return { idx, priority }
    })

    // Sort ascending by priority — lowest-priority first to be demoted
    scored.sort((a, b) => a.priority - b.priority)

    const toDemote = emphasisSet.size - maxEmphasis
    for (let i = 0; i < toDemote; i++) {
      emphasisSet.delete(scored[i].idx)
    }
  }

  // --- Step 5: Build result ---
  return words.map((w, i) => ({
    text: w.text,
    start: w.start,
    end: w.end,
    emphasis: supersizeSet.has(i)
      ? ('supersize' as EmphasisLevel)
      : emphasisSet.has(i)
        ? ('emphasis' as EmphasisLevel)
        : ('normal' as EmphasisLevel)
  }))
}

// ---------------------------------------------------------------------------
// Gemini helpers (same patterns as ai-scoring.ts)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// AI-powered analysis
// ---------------------------------------------------------------------------

/** Build the prompt for Gemini word emphasis analysis. */
function buildEmphasisPrompt(words: WordTimestamp[]): string {
  const wordList = words.map((w, i) => `${i}: ${w.text}`).join('\n')
  const totalWords = words.length
  const emphasisTarget = `${Math.round(totalWords * 0.15)}-${Math.round(totalWords * 0.25)}`
  const supersizeTarget = `${Math.max(1, Math.round(totalWords * 0.03))}-${Math.max(1, Math.round(totalWords * 0.08))}`

  return `You are an expert at creating captions for short-form viral video content (TikTok, Instagram Reels, YouTube Shorts).

Your task: Given a list of words (with indices), decide which words should be visually emphasised in on-screen captions.

There are two emphasis levels:
- **emphasis**: Displayed bigger/bolder than normal text. These are important concepts, action verbs, emotional beats, key facts, and numbers. Target: ${emphasisTarget} words (15-25% of ${totalWords} total words).
- **supersize**: Displayed at MAXIMUM size — the single most memorable word per sentence that makes viewers remember the clip. Target: ${supersizeTarget} words (3-8% of ${totalWords} total words).

Rules:
- Do NOT emphasise common stop words (the, a, is, are, of, in, to, for, etc.)
- Supersize should be the ONE most impactful word in each sentence/thought
- Numbers, dollar amounts, and statistics are strong emphasis candidates
- ALL-CAPS words in the original text should almost always be emphasised

Return ONLY valid JSON with this exact structure:
{
  "emphasis_indices": [3, 7, 12, ...],
  "supersize_indices": [5, 18, ...]
}

Words:
${wordList}`
}

/**
 * Analyse word emphasis using Gemini AI.
 * Returns null if analysis fails or produces invalid results.
 */
async function analyzeEmphasisWithAI(
  words: WordTimestamp[],
  apiKey: string
): Promise<EmphasizedWord[] | null> {
  const ai = new GoogleGenAI({ apiKey })
  const call: GeminiCall = {
    model: 'gemini-2.5-flash-lite',
    config: { responseMimeType: 'application/json' }
  }

  const prompt = buildEmphasisPrompt(words)
  const text = await callGeminiWithRetry(ai, call, prompt, 'word-emphasis')

  // Parse JSON response
  let raw: { emphasis_indices?: unknown; supersize_indices?: unknown }
  try {
    raw = JSON.parse(text) as typeof raw
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      raw = JSON.parse(match[0]) as typeof raw
    } catch {
      return null
    }
  }

  // Extract and validate indices
  const emphasisIndices = Array.isArray(raw.emphasis_indices)
    ? (raw.emphasis_indices as unknown[])
        .map(Number)
        .filter((n) => !isNaN(n) && Number.isInteger(n) && n >= 0 && n < words.length)
    : []

  const supersizeIndices = Array.isArray(raw.supersize_indices)
    ? (raw.supersize_indices as unknown[])
        .map(Number)
        .filter((n) => !isNaN(n) && Number.isInteger(n) && n >= 0 && n < words.length)
    : []

  // Validate percentages
  const totalWords = words.length
  const emphasisPct = ((emphasisIndices.length + supersizeIndices.length) / totalWords) * 100
  const supersizePct = (supersizeIndices.length / totalWords) * 100

  // If emphasis is wildly out of range (10-30%) or supersize (2-10%), fall back
  if (emphasisPct < 10 || emphasisPct > 30) return null
  if (supersizePct < 2 || supersizePct > 10) {
    // Allow edge case: very few words where even 1 supersize is > 10%
    if (totalWords > 20) return null
  }

  // Build result — supersize supersedes emphasis
  const supersizeSet = new Set(supersizeIndices)
  const emphasisSet = new Set(emphasisIndices.filter((i) => !supersizeSet.has(i)))

  return words.map((w, i) => ({
    text: w.text,
    start: w.start,
    end: w.end,
    emphasis: supersizeSet.has(i)
      ? ('supersize' as EmphasisLevel)
      : emphasisSet.has(i)
        ? ('emphasis' as EmphasisLevel)
        : ('normal' as EmphasisLevel)
  }))
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Analyse word emphasis for a list of words from a transcript.
 *
 * - If `apiKey` is provided, tries AI-powered analysis first.
 * - Falls back to heuristic analysis on any failure.
 * - Never throws — always returns a result.
 */
export async function analyzeWordEmphasis(
  words: WordTimestamp[],
  apiKey?: string
): Promise<WordEmphasisResult> {
  if (words.length === 0) {
    return { words: [], usedAI: false }
  }

  // Try AI if we have a key
  if (apiKey && apiKey.trim().length > 0) {
    try {
      const aiResult = await analyzeEmphasisWithAI(words, apiKey.trim())
      if (aiResult) {
        return { words: aiResult, usedAI: true }
      }
    } catch {
      // AI failed — fall through to heuristic
    }
  }

  // Heuristic fallback
  return { words: analyzeEmphasisHeuristic(words), usedAI: false }
}
