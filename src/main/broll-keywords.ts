import { GoogleGenAI } from '@google/genai'
import type { WordTimestamp } from '@shared/types'

// ---------------------------------------------------------------------------
// Types (WordTimestamp canonical definition lives in @shared/types)
// ---------------------------------------------------------------------------

export type { WordTimestamp }

export interface KeywordAtTimestamp {
  /** The visual keyword to search for on Pexels */
  keyword: string
  /** Seconds relative to clip start (0-based) at which this keyword appears */
  timestamp: number
}

// ---------------------------------------------------------------------------
// Gemini-powered extraction
// ---------------------------------------------------------------------------

const KEYWORD_PROMPT = `You are a video editor. Given a transcript with word timestamps, extract 3-8 concrete, visually searchable keywords for stock B-Roll footage.

Rules:
- Prefer specific nouns and actions (e.g. "laptop", "running", "coffee") over abstract concepts (e.g. "success", "happiness")
- Each keyword must be 1-3 words
- Return a JSON array of objects with "keyword" (string) and "timestamp" (seconds, a float from the transcript when this concept is mentioned)
- Timestamps must be within the clip range
- Order by timestamp ascending

Respond ONLY with a JSON array, no markdown, no explanation.

Example response:
[{"keyword":"coffee cup","timestamp":2.1},{"keyword":"typing laptop","timestamp":5.4}]`

async function extractKeywordsWithGemini(
  transcriptText: string,
  words: WordTimestamp[],
  geminiApiKey: string
): Promise<KeywordAtTimestamp[]> {
  const ai = new GoogleGenAI({ apiKey: geminiApiKey })

  // Build a compact transcript with timestamps for Gemini
  const timestampedText = words
    .map((w) => `[${w.start.toFixed(1)}] ${w.text}`)
    .join(' ')

  const prompt = `${KEYWORD_PROMPT}\n\nTranscript:\n${timestampedText}\n\nFull text: ${transcriptText}`

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt
  })
  const raw = (result.text ?? '').trim()

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')

  const parsed = JSON.parse(cleaned) as Array<{ keyword: string; timestamp: number }>

  if (!Array.isArray(parsed)) {
    throw new Error('Gemini returned non-array response')
  }

  return parsed
    .filter((item) => typeof item.keyword === 'string' && typeof item.timestamp === 'number')
    .map((item) => ({
      keyword: item.keyword.trim().toLowerCase(),
      timestamp: item.timestamp
    }))
}

// ---------------------------------------------------------------------------
// Simple fallback: group words into ~5-second chunks, pick nouns
// ---------------------------------------------------------------------------

const VISUAL_NOUNS = new Set([
  'computer', 'laptop', 'phone', 'screen', 'office', 'desk', 'city', 'building', 'street',
  'car', 'person', 'people', 'hand', 'hands', 'face', 'eye', 'eyes', 'money', 'business',
  'work', 'team', 'meeting', 'coffee', 'food', 'water', 'sky', 'nature', 'tree', 'house',
  'home', 'family', 'school', 'book', 'paper', 'brain', 'heart', 'dog', 'cat', 'music',
  'camera', 'video', 'data', 'code', 'technology', 'science', 'health', 'sport', 'exercise',
  'run', 'running', 'walk', 'walking', 'talk', 'talking', 'think', 'thinking', 'write',
  'writing', 'read', 'reading', 'eat', 'eating', 'drink', 'drinking', 'sleep', 'sleeping'
])

function extractKeywordsFallback(words: WordTimestamp[]): KeywordAtTimestamp[] {
  if (words.length === 0) return []

  const CHUNK_SECONDS = 5
  const firstTimestamp = words[0].start
  const lastTimestamp = words[words.length - 1].end
  const clipDuration = lastTimestamp - firstTimestamp

  const numChunks = Math.max(1, Math.ceil(clipDuration / CHUNK_SECONDS))
  const results: KeywordAtTimestamp[] = []

  for (let i = 0; i < numChunks; i++) {
    const chunkStart = firstTimestamp + i * CHUNK_SECONDS
    const chunkEnd = chunkStart + CHUNK_SECONDS

    const chunkWords = words.filter((w) => w.start >= chunkStart && w.start < chunkEnd)
    if (chunkWords.length === 0) continue

    // Find any visual noun in the chunk
    const match = chunkWords.find((w) => VISUAL_NOUNS.has(w.text.toLowerCase()))
    if (match) {
      results.push({
        keyword: match.text.toLowerCase(),
        timestamp: match.start - firstTimestamp // make 0-based
      })
    } else {
      // Use the longest word in the chunk as a last resort
      const longest = chunkWords.reduce((a, b) => (a.text.length >= b.text.length ? a : b))
      results.push({
        keyword: longest.text.toLowerCase(),
        timestamp: longest.start - firstTimestamp
      })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract visual B-Roll keywords from a clip's transcript.
 *
 * @param transcriptText  Full text of the clip segment
 * @param wordTimestamps  Word-level timestamps (relative to source video, not clip start)
 * @param clipStart       Clip start time in source video (seconds)
 * @param clipEnd         Clip end time in source video (seconds)
 * @param geminiApiKey    Gemini API key (empty string = use fallback)
 * @returns Array of keywords with 0-based timestamps relative to clip start
 */
export async function extractBRollKeywords(
  transcriptText: string,
  wordTimestamps: WordTimestamp[],
  clipStart: number,
  clipEnd: number,
  geminiApiKey: string
): Promise<KeywordAtTimestamp[]> {
  // Filter to clip range and make 0-based
  const clipWords = wordTimestamps
    .filter((w) => w.start >= clipStart && w.end <= clipEnd)
    .map((w) => ({
      text: w.text,
      start: w.start - clipStart,
      end: w.end - clipStart
    }))

  if (clipWords.length === 0) return []

  if (geminiApiKey) {
    try {
      const results = await extractKeywordsWithGemini(transcriptText, clipWords, geminiApiKey)
      if (results.length > 0) return results
    } catch (err) {
      console.warn('[B-Roll] Gemini keyword extraction failed, using fallback:', err)
    }
  }

  return extractKeywordsFallback(clipWords)
}
