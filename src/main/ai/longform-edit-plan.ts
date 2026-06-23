// ---------------------------------------------------------------------------
// Long-Form Edit Plan — Hormozi-style 16:9 talking-head edit planning
//
// Analyzes a full-video transcript and produces two edit layers anchored to
// ABSOLUTE source-video timestamps:
//
//   1. Phrase emphasis — punchy 2–6 word beats shown as large floating text
//   2. Content blocks  — full-frame skinned data graphics at high-value moments
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
  BlockPlacement,
  LongformBlockKind
} from '@shared/types'
import { HORMOZI_ACCENT } from '../edit-styles/hormozi'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Window size (seconds) the transcript is chunked into for the AI call. */
const WINDOW_SECONDS = 300

const VALID_BLOCK_KINDS = new Set<LongformBlockKind>([
  'bar-chart',
  'comparison',
  'comparison-table',
  'stat-grid',
  'icon-stat-grid',
  'icon-row',
  'numbered-list',
  'checklist',
  'stat-hero',
  'progress-bars',
  'kpi-ticker',
  'quote-card',
  'tweet-card',
  'definition-card',
  'timeline',
  'timeline-cards',
  'feature-grid'
])

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildLongformPrompt(formattedTranscript: string, windowDurationSec: number): string {
  const maxPhrases = Math.max(2, Math.round((windowDurationSec / 120) * 5))
  const maxBlocks = Math.max(2, Math.round(windowDurationSec / 90))

  return `You are a senior YouTube editor specializing in Alex Hormozi-style talking head videos.

Given this transcript window, produce an edit plan with two layers. All timestamps you return MUST be absolute seconds copied from the transcript word times below (do not invent times).

TRANSCRIPT (format: [absolute_start_sec|absolute_end_sec|word_text]):
${formattedTranscript}

PRODUCE:

1. PHRASE EMPHASIS — key phrases to display as large floating text over the speaker.
   - Select high-impact phrases that already appear in the speech.
   - Phrases should be 2-6 words, punchy, attention-grabbing.
   - start/end must bracket the spoken phrase (absolute seconds).

2. CONTENT BLOCKS — full-frame data graphics shown over the narration when the
   speech contains genuinely STRUCTURED content. Only emit a block when the
   words actually describe a list, comparison, set of numbers/stats, steps,
   timeline, definition, or quote. Do not invent data. When a numeric magnitude
   is not stated verbatim, estimate it as a normalized 0-1 value ("value").
   Every block needs: kind, start, end (absolute seconds, 3-6s span), a short
   uppercase "kicker" (2-4 words), and a "heading" (3-6 words). Pick the kind
   whose fields fit the spoken content:
   - "bar-chart": bars:[{label, value(0-1), valueLabel}] (3-5). Use for
     quantities compared across categories (revenue by quarter, etc.).
   - "stat-grid": stats:[{value, label}] (exactly 4). Use for 4 headline metrics.
   - "icon-stat-grid": items:[{icon, value, label}] (4). icon = a PascalCase
     lucide name (Users, DollarSign, Clock, Repeat). Like stat-grid w/ icons.
   - "icon-row": items:[{icon, label}] (3-4). Use for a short set of pillars.
   - "numbered-list": items:[{text, detail?}] (3-5). Use for ordered steps.
   - "checklist": items:[{text, done?}] (3-5). Use for a list of requirements.
   - "stat-hero": value(number), label, prefix?, suffix?, decimals?,
     trend?("up"|"down"), delta?. Use for ONE hero number.
   - "progress-bars": bars:[{label, value(0-1), valueLabel}] (3-4). Use for
     proportions of a whole (how time/budget is split).
   - "kpi-ticker": items:[{value, label, delta?, trend?}] (3-4). KPI strip.
   - "comparison" / "comparison-table": leftTitle, rightTitle,
     leftItems:[string] (2-4), rightItems:[string] (2-4). Use for X vs Y.
   - "quote-card": quote, name, role?. Use for a strong attributed quote.
   - "definition-card": term, definition, partOfSpeech?. Use to define a term.
   - "timeline": steps:[{title, detail?}] (3-4). Use for a sequence over time.
   - "timeline-cards": steps:[{icon, title, detail?}] (3-4). Timeline w/ icons.
   - "feature-grid": items:[{icon, title, description}] (4). Use for features.
   - "tweet-card": name, handle, body, verified?, replies?, reposts?, likes?.

CONSTRAINTS:
  - phrases: max ${maxPhrases} for this window.
  - blocks: max ${maxBlocks} for this window. Favor VARIETY — across the video,
    reach for different block kinds rather than repeating one. Only emit a block
    when the speech genuinely supports it (a weak block is worse than none).

Return ONLY a valid JSON object matching this exact schema (no markdown fences, no explanation):
{
  "phrases": [
    {"text": "FIRST $100,000", "start": 12.4, "end": 14.1}
  ],
  "blocks": [
    {"kind": "numbered-list", "start": 120.0, "end": 125.0, "kicker": "THE PLAYBOOK", "heading": "Three Steps To Start", "items": [{"text": "Validate the pain", "detail": "Ten conversations first"}, {"text": "Pre-sell the offer"}, {"text": "Ship the ugly version"}]},
    {"kind": "stat-hero", "start": 200.0, "end": 205.0, "kicker": "ONE YEAR IN", "heading": "Annual Revenue", "value": 1.2, "decimals": 1, "prefix": "$", "suffix": "M", "label": "Up from $310K", "trend": "up", "delta": "+287%"}
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
): {
  phrases: PhraseEmphasis[]
  blocks: BlockPlacement[]
} {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { phrases: [], blocks: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return { phrases: [], blocks: [] }
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

  // ---- Content blocks ------------------------------------------------------
  const blocks = parseBlocks(obj.blocks, inRange)

  return { phrases, blocks }
}

// ---------------------------------------------------------------------------
// Block parsing — strict per-kind validation. Malformed items are dropped so a
// weak plan degrades to "fewer blocks", never a render crash.
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function strList(v: unknown, max: number): string[] {
  return Array.isArray(v)
    ? v.map((x) => str(x)).filter((x) => x.length > 0).slice(0, max)
    : []
}

/** Clamp a number into [0,1]; returns 0 for non-finite input. */
function norm01(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function parseBlocks(
  raw: unknown,
  inRange: (start: number, end: number) => boolean
): BlockPlacement[] {
  const out: BlockPlacement[] = []
  if (!Array.isArray(raw)) return out

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const b = item as Record<string, unknown>
    const kind = str(b.kind) as LongformBlockKind
    const start = Number(b.start)
    const end = Number(b.end)
    if (!VALID_BLOCK_KINDS.has(kind) || !inRange(start, end)) continue

    const kicker = str(b.kicker)
    const heading = str(b.heading)
    if (heading.length === 0) continue
    const accentColor = str(b.accentColor)
    const common = {
      startTime: start,
      endTime: end,
      kicker,
      heading,
      ...(accentColor ? { accentColor } : {})
    }

    switch (kind) {
      case 'bar-chart':
      case 'progress-bars': {
        const bars = (Array.isArray(b.bars) ? b.bars : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            return { label: str(o.label), value: norm01(o.value), valueLabel: str(o.valueLabel) }
          })
          .filter((x) => x.label.length > 0)
          .slice(0, 5)
        if (bars.length < 2) continue
        out.push({ kind, ...common, bars })
        break
      }
      case 'stat-grid': {
        const stats = (Array.isArray(b.stats) ? b.stats : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            return { value: str(o.value), label: str(o.label) }
          })
          .filter((x) => x.value.length > 0)
          .slice(0, 4)
        if (stats.length < 2) continue
        out.push({ kind, ...common, stats })
        break
      }
      case 'icon-stat-grid': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            return { icon: str(o.icon), value: str(o.value), label: str(o.label) }
          })
          .filter((x) => x.value.length > 0)
          .slice(0, 4)
        if (items.length < 2) continue
        out.push({ kind, ...common, items })
        break
      }
      case 'icon-row': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            return { icon: str(o.icon), label: str(o.label) }
          })
          .filter((x) => x.label.length > 0)
          .slice(0, 4)
        if (items.length < 2) continue
        out.push({ kind, ...common, items })
        break
      }
      case 'numbered-list': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            const detail = str(o.detail)
            return { text: str(o.text), ...(detail ? { detail } : {}) }
          })
          .filter((x) => x.text.length > 0)
          .slice(0, 5)
        if (items.length < 2) continue
        out.push({ kind, ...common, items })
        break
      }
      case 'checklist': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            return { text: str(o.text), done: o.done === true }
          })
          .filter((x) => x.text.length > 0)
          .slice(0, 5)
        if (items.length < 2) continue
        out.push({ kind, ...common, items })
        break
      }
      case 'stat-hero': {
        const value = Number(b.value)
        const label = str(b.label)
        if (!Number.isFinite(value) || label.length === 0) continue
        const decimals = Number.isFinite(Number(b.decimals)) ? Number(b.decimals) : undefined
        const prefix = str(b.prefix)
        const suffix = str(b.suffix)
        const delta = str(b.delta)
        const trend = b.trend === 'up' || b.trend === 'down' ? b.trend : undefined
        out.push({
          kind,
          ...common,
          value,
          label,
          ...(decimals != null ? { decimals } : {}),
          ...(prefix ? { prefix } : {}),
          ...(suffix ? { suffix } : {}),
          ...(trend ? { trend } : {}),
          ...(delta ? { delta } : {})
        })
        break
      }
      case 'kpi-ticker': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            const delta = str(o.delta)
            const trend = o.trend === 'up' || o.trend === 'down' ? o.trend : undefined
            return {
              value: str(o.value),
              label: str(o.label),
              ...(delta ? { delta } : {}),
              ...(trend ? { trend } : {})
            }
          })
          .filter((x) => x.value.length > 0)
          .slice(0, 4)
        if (items.length < 2) continue
        out.push({ kind, ...common, items })
        break
      }
      case 'comparison':
      case 'comparison-table': {
        const leftTitle = str(b.leftTitle)
        const rightTitle = str(b.rightTitle)
        const leftItems = strList(b.leftItems, 4)
        const rightItems = strList(b.rightItems, 4)
        if (leftTitle.length === 0 || rightTitle.length === 0) continue
        if (leftItems.length === 0 || rightItems.length === 0) continue
        out.push({ kind, ...common, leftTitle, rightTitle, leftItems, rightItems })
        break
      }
      case 'quote-card': {
        const quote = str(b.quote)
        const name = str(b.name)
        if (quote.length === 0 || name.length === 0) continue
        const role = str(b.role)
        out.push({ kind, ...common, quote, name, ...(role ? { role } : {}) })
        break
      }
      case 'tweet-card': {
        const name = str(b.name)
        const handle = str(b.handle).replace(/^@/, '')
        const body = str(b.body)
        if (name.length === 0 || handle.length === 0 || body.length === 0) continue
        const replies = str(b.replies)
        const reposts = str(b.reposts)
        const likes = str(b.likes)
        out.push({
          kind,
          ...common,
          name,
          handle,
          body,
          verified: b.verified === true,
          ...(replies ? { replies } : {}),
          ...(reposts ? { reposts } : {}),
          ...(likes ? { likes } : {})
        })
        break
      }
      case 'definition-card': {
        const term = str(b.term)
        const definition = str(b.definition)
        if (term.length === 0 || definition.length === 0) continue
        const partOfSpeech = str(b.partOfSpeech)
        out.push({
          kind,
          ...common,
          term,
          definition,
          ...(partOfSpeech ? { partOfSpeech } : {})
        })
        break
      }
      case 'timeline': {
        const steps = (Array.isArray(b.steps) ? b.steps : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            const detail = str(o.detail)
            return { title: str(o.title), ...(detail ? { detail } : {}) }
          })
          .filter((x) => x.title.length > 0)
          .slice(0, 4)
        if (steps.length < 2) continue
        out.push({ kind, ...common, steps })
        break
      }
      case 'timeline-cards': {
        const steps = (Array.isArray(b.steps) ? b.steps : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            const detail = str(o.detail)
            return { icon: str(o.icon), title: str(o.title), ...(detail ? { detail } : {}) }
          })
          .filter((x) => x.title.length > 0)
          .slice(0, 4)
        if (steps.length < 2) continue
        out.push({ kind, ...common, steps })
        break
      }
      case 'feature-grid': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            return { icon: str(o.icon), title: str(o.title), description: str(o.description) }
          })
          .filter((x) => x.title.length > 0)
          .slice(0, 4)
        if (items.length < 2) continue
        out.push({ kind, ...common, items })
        break
      }
    }
  }

  return out
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
      blocks: [],
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
  const allBlocks: BlockPlacement[] = []

  for (let windowStart = 0; windowStart < totalDuration; windowStart += windowSeconds) {
    const windowEnd = Math.min(windowStart + windowSeconds, totalDuration)
    const windowWords = words.filter((w) => w.start >= windowStart && w.start < windowEnd)
    if (windowWords.length === 0) continue

    const prompt = buildLongformPrompt(formatWindow(windowWords), windowEnd - windowStart)
    const raw = await callGeminiWithRetry(ai, call, prompt, 'longform-edit-plan')
    const { phrases, blocks } = parseWindowResponse(raw, windowStart, windowEnd)
    allPhrases.push(...phrases)
    allBlocks.push(...blocks)
  }

  // Apply Hormozi accents + sort everything chronologically.
  const byStart = <T extends { startTime: number }>(a: T, b: T): number => a.startTime - b.startTime

  return {
    phrases: allPhrases
      .map((p) => ({ ...p, accentColor: p.accentColor ?? HORMOZI_ACCENT }))
      .sort(byStart),
    blocks: allBlocks
      .map((b) => ({ ...b, accentColor: b.accentColor ?? HORMOZI_ACCENT }))
      .sort(byStart),
    reasoning: `Generated from ${words.length} words across ${Math.ceil(totalDuration / windowSeconds)} window(s). ${allBlocks.length} block(s).`,
    generatedAt
  }
}
