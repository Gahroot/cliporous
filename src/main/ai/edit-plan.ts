// ---------------------------------------------------------------------------
// AI Edit Plan — Single-shot complete clip edit plan generation
//
// One Gemini call that analyzes a clip transcript through the lens of the
// active style preset and returns three edit layers simultaneously:
//
//   1. Word emphasis — which words to supersize / emphasize in captions
//   2. B-Roll suggestions — what to show visually, when, and how
//   3. SFX recommendations — where sound effects add energy without noise
//
// A professional short-form editor thinks in ALL THREE layers at once.
// This module replicates that holistic judgment in one structured AI call.
// ---------------------------------------------------------------------------

import { GoogleGenAI } from '@google/genai'
import { emitUsageFromResponse } from '../ai-usage'
import {
  buildEditPlanCacheKey,
  getCachedEditPlan,
  setCachedEditPlan,
  evictEditPlanCache
} from './edit-plan-cache'
import type {
  AIEditPlan,
  AIEditPlanWordEmphasis,
  AIEditPlanBRollSuggestion,
  AIEditPlanSFXSuggestion,
  AIEditPlanSFXType,
  WordTimestamp
} from '@shared/types'

// ---------------------------------------------------------------------------
// Style-calibration constants
// ---------------------------------------------------------------------------

/**
 * Per-style-category guidance injected into the prompt so the AI tailors its
 * edit density to match the preset's aesthetic intent.
 */
const STYLE_CATEGORY_GUIDANCE: Record<string, string> = {
  viral:
    'This is a HIGH-ENERGY viral style. Maximize emphasis density (15–25% of words). ' +
    'Suggest B-Roll every 4–6s when content allows. Use energetic SFX liberally — ' +
    'impact-high and word-pop on key moments, whoosh on transitions, bass-drop on the ' +
    'biggest punchline. Think Hormozi, TikTok, peak engagement at every second.',

  educational:
    'This is a CLEAR EDUCATIONAL style. Emphasis on technical terms and key concepts ' +
    '(8–15% of words). B-Roll every 5–8s to illustrate points visually. ' +
    'SFX should be subtle — notification-pop on facts/stats, soft whooshes only. ' +
    'Never let sound design compete with the clarity of the information.',

  cinematic:
    'This is a CINEMATIC PREMIUM style. Restraint is the craft. Only 3–8% of words ' +
    'get emphasis — reserve supersize for peak emotional beats only. B-Roll every ' +
    '7–10s using fullscreen with slow crossfade. Minimal SFX — impact-low on major ' +
    'emotional beats only. No word-pops, no whooshes on minor cuts.',

  minimal:
    'This is a MINIMAL CLEAN style. Almost no intervention: 0–5% emphasis, only the ' +
    'single most impactful word if any. No B-Roll suggestions. Maximum 2 SFX total, ' +
    'only if the content strongly demands it. Let silence and content carry the clip.',

  branded:
    'This is a BRANDED style. Emphasis on brand keywords and value propositions ' +
    '(10–20% of words). B-Roll every 5–7s to reinforce brand story. ' +
    'Standard SFX density with professional restraint — nothing that feels cheap.',

  custom:
    'This is a CUSTOM style. Apply balanced editorial judgment across all three layers ' +
    'with moderate density: 10–20% emphasis, B-Roll every 5–7s, standard SFX.'
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export function buildEditPlanPrompt(
  formattedTranscript: string,
  clipDuration: number,
  stylePresetName: string,
  stylePresetCategory: string,
  wordCount: number
): string {
  const categoryGuidance =
    STYLE_CATEGORY_GUIDANCE[stylePresetCategory] ??
    STYLE_CATEGORY_GUIDANCE['custom']

  const maxEmphasis = Math.ceil(wordCount * 0.25)
  const maxSupersize = Math.ceil(wordCount * 0.10)

  return `You are a senior short-form video editor with deep expertise in TikTok, Instagram Reels, and YouTube Shorts. You think in three edit layers simultaneously: caption emphasis, visual B-Roll, and sound design.

You are editing a ${Math.round(clipDuration)}-second clip using the "${stylePresetName}" style preset.

STYLE GUIDANCE:
${categoryGuidance}

TRANSCRIPT (format: [word_index|clip_relative_start_sec|clip_relative_end_sec|word_text]):
${formattedTranscript}

TASK: Produce a complete edit plan for this clip. Think like a professional editor — ask yourself:
  • Which WORDS carry the emotional weight? (emphasis)
  • Where would VISUALS illustrate or contrast the speech? (B-Roll)
  • Where would SOUND amplify the moment without being obnoxious? (SFX)

CONSTRAINTS:
  • word_emphasis: max ${maxEmphasis} emphasis entries total, max ${maxSupersize} can be "supersize". Numbers, stats, and power words make the best candidates.
  • broll_suggestions: only suggest B-Roll if the content genuinely benefits from a visual cut. Use clip-relative timestamps. All display_mode and transition values must come from the allowed lists.
  • sfx_suggestions: place SFX at clip-relative timestamps. Less is more — a single perfectly-timed impact beats a wall of noise.

ALLOWED VALUES:
  display_mode: "fullscreen" | "split-top" | "split-bottom" | "pip"
  transition: "hard-cut" | "crossfade" | "swipe-up" | "swipe-down"
  sfx_type: "whoosh-soft" | "whoosh-hard" | "impact-low" | "impact-high" | "rise-tension" | "notification-pop" | "word-pop" | "bass-drop" | "rise-tension-short"

Return ONLY a valid JSON object matching this exact schema (no markdown fences, no explanation):
{
  "word_emphasis": [
    {"word_index": 12, "text": "million", "start": 4.21, "end": 4.78, "level": "supersize"},
    {"word_index": 31, "text": "wrong", "start": 9.14, "end": 9.52, "level": "emphasis"}
  ],
  "broll_suggestions": [
    {"timestamp": 5.0, "duration": 3, "keyword": "person coding laptop", "display_mode": "split-top", "transition": "crossfade", "reason": "Illustrates the software development context being described"}
  ],
  "sfx_suggestions": [
    {"timestamp": 4.21, "type": "impact-high", "reason": "Punctuates the shocking revenue number for maximum impact"},
    {"timestamp": 0.0, "type": "whoosh-soft", "reason": "Opens the clip with energy to signal fast-paced content"}
  ],
  "reasoning": "2-3 sentence editorial reasoning explaining the overall approach taken for this clip and style."
}`
}

// ---------------------------------------------------------------------------
// Transcript formatter
// ---------------------------------------------------------------------------

/**
 * Format word timestamps into the indexed format the prompt expects.
 * Times are clip-relative (shifted so clipStart = 0.00).
 */
export function formatWordsForPrompt(
  words: WordTimestamp[],
  clipStart: number,
  clipEnd: number
): { formatted: string; clippedWords: Array<WordTimestamp & { clipRelStart: number; clipRelEnd: number }> } {
  const clipped = words
    .filter((w) => w.start >= clipStart - 0.1 && w.end <= clipEnd + 0.1)
    .map((w) => ({
      ...w,
      clipRelStart: Math.max(0, w.start - clipStart),
      clipRelEnd: Math.min(clipEnd - clipStart, w.end - clipStart)
    }))

  const lines = clipped.map(
    (w, i) =>
      `[${i}|${w.clipRelStart.toFixed(2)}|${w.clipRelEnd.toFixed(2)}|${w.text}]`
  )

  return { formatted: lines.join('\n'), clippedWords: clipped }
}

// ---------------------------------------------------------------------------
// Response validation & parsing
// ---------------------------------------------------------------------------

const VALID_DISPLAY_MODES = new Set(['fullscreen', 'split-top', 'split-bottom', 'pip'])
const VALID_TRANSITIONS = new Set(['hard-cut', 'crossfade', 'swipe-up', 'swipe-down'])
const VALID_SFX_TYPES = new Set<AIEditPlanSFXType>([
  'whoosh-soft', 'whoosh-hard', 'impact-low', 'impact-high',
  'rise-tension', 'notification-pop', 'word-pop', 'bass-drop', 'rise-tension-short'
])
const VALID_EMPHASIS_LEVELS = new Set(['emphasis', 'supersize'])

export function parseEditPlanResponse(
  raw: string,
  clippedWords: Array<{ clipRelStart: number; clipRelEnd: number; text: string }>,
  clipDuration: number
): { wordEmphasis: AIEditPlanWordEmphasis[]; brollSuggestions: AIEditPlanBRollSuggestion[]; sfxSuggestions: AIEditPlanSFXSuggestion[]; reasoning: string } {
  // Strip markdown fences if the model added them
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON object found in response')

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    throw new Error(`Failed to parse edit plan JSON: ${err}`)
  }

  const obj = parsed as Record<string, unknown>

  // ---- Word emphasis -------------------------------------------------------
  const wordEmphasis: AIEditPlanWordEmphasis[] = []
  const rawEmphasis = Array.isArray(obj.word_emphasis) ? obj.word_emphasis : []
  for (const item of rawEmphasis) {
    if (typeof item !== 'object' || item === null) continue
    const e = item as Record<string, unknown>
    const idx = Number(e.word_index)
    const level = String(e.level ?? '')
    if (
      !Number.isFinite(idx) ||
      idx < 0 ||
      idx >= clippedWords.length ||
      !VALID_EMPHASIS_LEVELS.has(level)
    ) continue

    const word = clippedWords[idx]
    wordEmphasis.push({
      wordIndex: idx,
      text: String(e.text ?? word.text),
      start: Number.isFinite(Number(e.start)) ? Number(e.start) : word.clipRelStart,
      end: Number.isFinite(Number(e.end)) ? Number(e.end) : word.clipRelEnd,
      level: level as 'emphasis' | 'supersize' | 'box'
    })
  }

  // ---- B-Roll suggestions --------------------------------------------------
  const brollSuggestions: AIEditPlanBRollSuggestion[] = []
  const rawBroll = Array.isArray(obj.broll_suggestions) ? obj.broll_suggestions : []
  for (const item of rawBroll) {
    if (typeof item !== 'object' || item === null) continue
    const b = item as Record<string, unknown>
    const ts = Number(b.timestamp)
    const dur = Number(b.duration)
    const displayMode = String(b.display_mode ?? '')
    const transition = String(b.transition ?? '')
    const keyword = String(b.keyword ?? '').trim()
    if (
      !Number.isFinite(ts) || ts < 0 || ts >= clipDuration ||
      !Number.isFinite(dur) || dur < 1 || dur > 8 ||
      !VALID_DISPLAY_MODES.has(displayMode) ||
      !VALID_TRANSITIONS.has(transition) ||
      keyword.length === 0
    ) continue

    brollSuggestions.push({
      timestamp: ts,
      duration: Math.min(dur, clipDuration - ts),
      keyword,
      displayMode: displayMode as AIEditPlanBRollSuggestion['displayMode'],
      transition: transition as AIEditPlanBRollSuggestion['transition'],
      reason: String(b.reason ?? '').slice(0, 200)
    })
  }

  // ---- SFX suggestions -----------------------------------------------------
  const sfxSuggestions: AIEditPlanSFXSuggestion[] = []
  const rawSfx = Array.isArray(obj.sfx_suggestions) ? obj.sfx_suggestions : []
  for (const item of rawSfx) {
    if (typeof item !== 'object' || item === null) continue
    const s = item as Record<string, unknown>
    const ts = Number(s.timestamp)
    const type = String(s.type ?? '') as AIEditPlanSFXType
    if (!Number.isFinite(ts) || ts < 0 || ts > clipDuration || !VALID_SFX_TYPES.has(type)) continue

    sfxSuggestions.push({
      timestamp: ts,
      type,
      reason: String(s.reason ?? '').slice(0, 200)
    })
  }

  const reasoning = String(obj.reasoning ?? '').trim().slice(0, 600)

  return { wordEmphasis, brollSuggestions, sfxSuggestions, reasoning }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface GenerateEditPlanOptions {
  apiKey: string
  clipId: string
  clipStart: number
  clipEnd: number
  words: WordTimestamp[]
  /** Raw transcript text for context */
  transcriptText: string
  stylePresetId: string
  stylePresetName: string
  /** Category from EditStylePreset — controls prompt calibration */
  stylePresetCategory: string
}

/**
 * Generate a complete AI edit plan for a single clip in one Gemini call.
 *
 * Returns word emphasis tags, B-Roll placement suggestions, and SFX
 * recommendations — all calibrated to the active style preset.
 *
 * @throws When no API key is provided or the AI call fails fatally.
 */
export async function generateEditPlan(options: GenerateEditPlanOptions): Promise<AIEditPlan> {
  const {
    apiKey,
    clipId,
    clipStart,
    clipEnd,
    words,
    stylePresetId,
    stylePresetName,
    stylePresetCategory
  } = options

  if (!apiKey) throw new Error('Gemini API key is required to generate an edit plan.')

  const clipDuration = clipEnd - clipStart

  // Build clip-relative word list and formatted transcript
  const { formatted: formattedTranscript, clippedWords } = formatWordsForPrompt(
    words,
    clipStart,
    clipEnd
  )

  if (clippedWords.length === 0) {
    // No words in range — return an empty plan
    return {
      clipId,
      stylePresetId,
      stylePresetName,
      wordEmphasis: [],
      brollSuggestions: [],
      sfxSuggestions: [],
      reasoning: 'No transcript words found in this clip range.',
      generatedAt: Date.now()
    }
  }

  // ---- Cache lookup --------------------------------------------------------
  const cacheKey = buildEditPlanCacheKey(words, clipStart, clipEnd, stylePresetId)
  const cached = getCachedEditPlan(cacheKey)
  if (cached) {
    console.log(`[EditPlan] Cache HIT for clip ${clipId} (key=${cacheKey})`)
    // Preserve the original clipId in case the same transcript is shared
    return { ...cached, clipId, generatedAt: Date.now() }
  }

  console.log(`[EditPlan] Cache MISS for clip ${clipId} (key=${cacheKey}) — calling Gemini`)

  // ---- API call ------------------------------------------------------------
  const prompt = buildEditPlanPrompt(
    formattedTranscript,
    clipDuration,
    stylePresetName,
    stylePresetCategory,
    clippedWords.length
  )

  const ai = new GoogleGenAI({ apiKey })
  // Use full Flash for the quality of reasoning this complex multi-layer analysis requires
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.3  // lower temperature for consistent, structured output
    }
  })
  emitUsageFromResponse('edit-plan', 'gemini-2.5-flash', result)

  const raw = (result.text ?? '').trim()

  const { wordEmphasis, brollSuggestions, sfxSuggestions, reasoning } =
    parseEditPlanResponse(raw, clippedWords, clipDuration)

  console.log(
    `[EditPlan] Clip ${clipId}: ${wordEmphasis.length} emphasis tags, ` +
    `${brollSuggestions.length} B-Roll suggestions, ${sfxSuggestions.length} SFX hits`
  )

  const plan: AIEditPlan = {
    clipId,
    stylePresetId,
    stylePresetName,
    wordEmphasis,
    brollSuggestions,
    sfxSuggestions,
    reasoning,
    generatedAt: Date.now()
  }

  // ---- Cache store ---------------------------------------------------------
  setCachedEditPlan(cacheKey, plan)
  // Opportunistic eviction — lightweight, runs after every write
  evictEditPlanCache()

  return plan
}
