// ---------------------------------------------------------------------------
// Long-Form Edit Plan — Hormozi-style 16:9 talking-head edit planning
//
// Analyzes a full-video transcript and produces three edit layers anchored to
// ABSOLUTE source-video timestamps:
//
//   1. Phrase emphasis — punchy 2–6 word beats shown as large floating text
//   2. Concept cards   — full-frame graphic cards at high-value moments
//   3. Section boundaries — topic transitions rendered as pill headers
//
// Long videos are processed in windows (default 5 minutes) so the prompt stays
// within a comfortable size; per-window timestamps are already absolute
// because we feed the model absolute word times.
// ---------------------------------------------------------------------------

import { GoogleGenAI } from '@google/genai'
import { callGeminiWithRetry, MODELS, type GeminiCall } from './gemini-client'
import type {
  WordTimestamp,
  LongformEditPlan,
  PhraseEmphasis,
  ConceptCardPlacement,
  SectionBoundary,
  ConceptCardLayout
} from '@shared/types'
import {
  HORMOZI_ACCENT,
  HORMOZI_SECTION_ACCENT
} from '../edit-styles/hormozi'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Window size (seconds) the transcript is chunked into for the AI call. */
const WINDOW_SECONDS = 300

const VALID_CARD_LAYOUTS = new Set<ConceptCardLayout>([
  'quote',
  'list',
  'statistic',
  'section-title'
])

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildLongformPrompt(formattedTranscript: string, windowDurationSec: number): string {
  const maxPhrases = Math.max(2, Math.round((windowDurationSec / 120) * 5))
  const maxCards = Math.max(1, Math.round(windowDurationSec / 180))

  return `You are a senior YouTube editor specializing in Alex Hormozi-style talking head videos.

Given this transcript window, produce an edit plan with three layers. All timestamps you return MUST be absolute seconds copied from the transcript word times below (do not invent times).

TRANSCRIPT (format: [absolute_start_sec|absolute_end_sec|word_text]):
${formattedTranscript}

PRODUCE:

1. PHRASE EMPHASIS — key phrases to display as large floating text over the speaker.
   - Select high-impact phrases that already appear in the speech.
   - Phrases should be 2-6 words, punchy, attention-grabbing.
   - start/end must bracket the spoken phrase (absolute seconds).

2. CONCEPT CARDS — moments where a full-frame graphic card enhances understanding.
   - Statistics, studies, lists, quotes, comparisons, definitions.
   - layout must be one of: "quote" | "list" | "statistic" | "section-title".
   - "statistic": text is the big number/stat, subtitle is its label.
   - "list": text is the list title, items is an array of 2-5 short bullet strings.
   - "quote": text is the quote, subtitle is the optional attribution.
   - "section-title": text is a short title, subtitle is an optional tagline.
   - start/end define when the card shows (absolute seconds, 3-5s span).

3. SECTION BOUNDARIES — topic transitions for chapter markers.
   - Only at genuine topic shifts, not sentence breaks.
   - title is a short 2-5 word section name; iconEmoji optional.
   - start/end define the brief header beat (absolute seconds, ~3s span).

CONSTRAINTS:
  - phrases: max ${maxPhrases} for this window.
  - concept_cards: max ${maxCards} for this window (don't overuse — they lose impact).
  - section_boundaries: only at real topic shifts.

Return ONLY a valid JSON object matching this exact schema (no markdown fences, no explanation):
{
  "phrases": [
    {"text": "FIRST $100,000", "start": 12.4, "end": 14.1}
  ],
  "concept_cards": [
    {"start": 30.0, "end": 34.0, "layout": "list", "text": "Three Levers", "items": ["More customers", "Higher prices", "Better retention"]},
    {"start": 95.0, "end": 99.0, "layout": "statistic", "text": "83%", "subtitle": "of businesses fail"}
  ],
  "section_boundaries": [
    {"start": 60.0, "end": 63.0, "title": "The Real Problem", "iconEmoji": "🎯"}
  ]
}`
}

// ---------------------------------------------------------------------------
// Transcript formatting
// ---------------------------------------------------------------------------

function formatWindow(words: WordTimestamp[]): string {
  return words
    .map((w) => `[${w.start.toFixed(2)}|${w.end.toFixed(2)}|${w.text}]`)
    .join('\n')
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseWindowResponse(
  raw: string,
  windowStart: number,
  windowEnd: number
): { phrases: PhraseEmphasis[]; conceptCards: ConceptCardPlacement[]; sections: SectionBoundary[] } {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { phrases: [], conceptCards: [], sections: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return { phrases: [], conceptCards: [], sections: [] }
  }
  const obj = parsed as Record<string, unknown>

  const inRange = (start: number, end: number): boolean =>
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    start >= windowStart - 1 &&
    start <= windowEnd + 1

  // ---- Phrases -------------------------------------------------------------
  const phrases: PhraseEmphasis[] = []
  for (const item of Array.isArray(obj.phrases) ? obj.phrases : []) {
    if (typeof item !== 'object' || item === null) continue
    const p = item as Record<string, unknown>
    const text = String(p.text ?? '').trim()
    const start = Number(p.start)
    const end = Number(p.end)
    if (text.length === 0 || !inRange(start, end)) continue
    phrases.push({ text, startTime: start, endTime: end })
  }

  // ---- Concept cards -------------------------------------------------------
  const conceptCards: ConceptCardPlacement[] = []
  for (const item of Array.isArray(obj.concept_cards) ? obj.concept_cards : []) {
    if (typeof item !== 'object' || item === null) continue
    const c = item as Record<string, unknown>
    const text = String(c.text ?? '').trim()
    const start = Number(c.start)
    const end = Number(c.end)
    const layout = String(c.layout ?? '') as ConceptCardLayout
    if (text.length === 0 || !inRange(start, end) || !VALID_CARD_LAYOUTS.has(layout)) continue
    const items = Array.isArray(c.items)
      ? c.items.map((x) => String(x).trim()).filter((x) => x.length > 0).slice(0, 5)
      : undefined
    const subtitle = c.subtitle != null ? String(c.subtitle).trim() : undefined
    conceptCards.push({
      startTime: start,
      endTime: end,
      layout,
      text,
      subtitle: subtitle && subtitle.length > 0 ? subtitle : undefined,
      items: items && items.length > 0 ? items : undefined
    })
  }

  // ---- Section boundaries --------------------------------------------------
  const sections: SectionBoundary[] = []
  for (const item of Array.isArray(obj.section_boundaries) ? obj.section_boundaries : []) {
    if (typeof item !== 'object' || item === null) continue
    const s = item as Record<string, unknown>
    const title = String(s.title ?? '').trim()
    const start = Number(s.start)
    const end = Number(s.end)
    if (title.length === 0 || !inRange(start, end)) continue
    const iconEmoji = s.iconEmoji != null ? String(s.iconEmoji).trim() : undefined
    sections.push({
      startTime: start,
      endTime: end,
      title,
      iconEmoji: iconEmoji && iconEmoji.length > 0 ? iconEmoji : undefined
    })
  }

  return { phrases, conceptCards, sections }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface GenerateLongformEditPlanOptions {
  apiKey: string
  /** Word-level transcript timestamps (absolute source-video seconds). */
  words: WordTimestamp[]
  /** Total video duration in seconds (used to bound the final window). */
  videoDuration: number
  /** Window size override in seconds (default 300). */
  windowSeconds?: number
}

/**
 * Generate a Hormozi-style long-form edit plan from a full-video transcript.
 *
 * Splits the transcript into time windows, runs one Gemini call per window,
 * and merges the results into a single plan with absolute timestamps and the
 * Hormozi accent colors applied.
 *
 * @throws When no API key is provided.
 */
export async function generateLongformEditPlan(
  options: GenerateLongformEditPlanOptions
): Promise<LongformEditPlan> {
  const { apiKey, words, videoDuration } = options
  const windowSeconds = options.windowSeconds ?? WINDOW_SECONDS

  if (!apiKey) {
    throw new Error('Gemini API key is required to generate a long-form edit plan.')
  }

  const generatedAt = Date.now()

  if (words.length === 0) {
    return {
      phrases: [],
      conceptCards: [],
      sections: [],
      reasoning: 'No transcript words available.',
      generatedAt
    }
  }

  const ai = new GoogleGenAI({ apiKey })
  const call: GeminiCall = {
    model: MODELS.BALANCED[0],
    fallbacks: MODELS.BALANCED.slice(1),
    config: { responseMimeType: 'application/json', temperature: 0.4 }
  }

  const totalDuration = Math.max(videoDuration, words[words.length - 1]?.end ?? 0)
  const allPhrases: PhraseEmphasis[] = []
  const allCards: ConceptCardPlacement[] = []
  const allSections: SectionBoundary[] = []

  for (let windowStart = 0; windowStart < totalDuration; windowStart += windowSeconds) {
    const windowEnd = Math.min(windowStart + windowSeconds, totalDuration)
    const windowWords = words.filter((w) => w.start >= windowStart && w.start < windowEnd)
    if (windowWords.length === 0) continue

    const prompt = buildLongformPrompt(formatWindow(windowWords), windowEnd - windowStart)
    const raw = await callGeminiWithRetry(ai, call, prompt, 'longform-edit-plan')
    const { phrases, conceptCards, sections } = parseWindowResponse(raw, windowStart, windowEnd)
    allPhrases.push(...phrases)
    allCards.push(...conceptCards)
    allSections.push(...sections)
  }

  // Apply Hormozi accents + sort everything chronologically.
  const byStart = <T extends { startTime: number }>(a: T, b: T): number => a.startTime - b.startTime

  return {
    phrases: allPhrases
      .map((p) => ({ ...p, accentColor: p.accentColor ?? HORMOZI_ACCENT }))
      .sort(byStart),
    conceptCards: allCards
      .map((c) => ({ ...c, accentColor: c.accentColor ?? HORMOZI_ACCENT }))
      .sort(byStart),
    sections: allSections
      .map((s) => ({ ...s, accentColor: s.accentColor ?? HORMOZI_SECTION_ACCENT }))
      .sort(byStart),
    reasoning: `Generated from ${words.length} words across ${Math.ceil(totalDuration / windowSeconds)} window(s).`,
    generatedAt
  }
}
