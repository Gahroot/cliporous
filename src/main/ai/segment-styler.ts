/**
 * AI Segment Styler
 *
 * Uses Gemini to assign each segment an archetype — the user-facing, stable
 * vocabulary of 8 slots every edit style implements. The archetype is later
 * resolved to a concrete SegmentStyleVariant by the template resolver.
 *
 * Distribution targets (based on analysis of 10 real Captions.ai videos):
 *   - split-image        : ~36% of segments (~70% time — longest segments)
 *   - talking-head group : ~36% of segments (~15% time — shorter segments)
 *   - fullscreen-image   : ~19% of segments (~15% time — brief cutaways)
 *   - fullscreen-quote   :  ~9% of segments ( ~1% time — quick punctuation)
 *
 * When fal.ai is NOT configured, split-image / fullscreen-image drop out of
 * rotation (they require a generated image) and the distribution tilts toward
 * quote-lower and fullscreen-quote for visual variety instead.
 */

import { callGeminiWithRetry, type GeminiCall } from './gemini-client'
import { GoogleGenAI } from '@google/genai'
import {
  ARCHETYPE_KEYS,
  ARCHETYPE_TO_CATEGORY,
  type Archetype
} from '../edit-styles/shared/archetypes'
import type { VideoSegment, EditStyle } from '@shared/types'

// ---------------------------------------------------------------------------
// Hero text derivation (for fullscreen-headline, fullscreen-quote, quote-lower)
// ---------------------------------------------------------------------------

const HERO_ARCHETYPES = new Set<Archetype>([
  'fullscreen-headline',
  'fullscreen-quote',
  'quote-lower'
])

/**
 * Derive the big on-screen hero text for a hero archetype from its caption.
 * Keeps natural casing (no title-case), strips trailing punctuation, and
 * caps at 8 words so the text fits comfortably on a 9:16 hero card.
 */
function deriveHeroText(captionText: string): string {
  const cleaned = captionText
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?…,;:–—-]+$/g, '')
  const words = cleaned.split(' ')
  if (words.length <= 8) return cleaned
  return words.slice(0, 8).join(' ')
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const ARCHETYPE_PROMPT_DESCRIPTIONS: Record<Archetype, string> = {
  'talking-head':
    "Speaker fills the 9:16 frame, standard crop. Use for most narration.",
  'tight-punch':
    "Tight zoom on the speaker's face. Use for intimate / emotional / emphasis beats.",
  'wide-breather':
    'Slightly wider framing. Use for scene-setting or pacing relief.',
  'quote-lower':
    'Large-text overlay in the lower 40% over the speaker. Use for punchy lines.',
  'split-image':
    'Speaker plus a contextual image (topic visualization). Use for concepts, products, places, data.',
  'fullscreen-image':
    'B-roll only — image fills frame with captions and edits still on. Use for brief cutaways.',
  'fullscreen-quote':
    'Solid bg plus centered quote. Use for bold claims (max 1–2 per clip).',
  'fullscreen-headline':
    'Solid bg plus headline and subtext. Use for clip-opening or clip-closing beats.'
}

function buildArchetypeList(hasFalKey: boolean): string {
  return ARCHETYPE_KEYS.filter((key) => {
    if (!hasFalKey && (key === 'split-image' || key === 'fullscreen-image')) {
      return false
    }
    return true
  })
    .map((key) => `  - "${key}": ${ARCHETYPE_PROMPT_DESCRIPTIONS[key]}`)
    .join('\n')
}

function buildSegmentList(segments: VideoSegment[]): string {
  return segments
    .map(
      (s, i) =>
        `${i}. [${s.startTime.toFixed(1)}s–${s.endTime.toFixed(1)}s] "${s.captionText}"`
    )
    .join('\n')
}

function buildDistributionGuidelines(hasFalKey: boolean): string {
  if (hasFalKey) {
    return [
      '- Use split-image for 30-40% of segments (concepts, descriptions, things being explained)',
      '- Use the talking-head family (talking-head / tight-punch / wide-breather) for 30-40% of segments (speaker is the focus, personal stories, direct address)',
      '- Use fullscreen-image for 10-20% of segments (visual emphasis, brief cutaways, topic transitions)',
      '- Use fullscreen-quote / fullscreen-headline sparingly, max 1-2 per video (key quotes, shocking statements, important numbers)',
      '- Use quote-lower for emphasis moments (key points, calls to action)'
    ].join('\n')
  }
  // No fal.ai: replace image-based slots with text-based visual variety
  return [
    '- Use the talking-head family (talking-head / tight-punch / wide-breather) for 40-55% of segments (speaker is the focus, personal stories, direct address)',
    '- Use quote-lower for 25-35% of segments (punchy lines, key points, calls to action — this replaces split-image visual variety)',
    '- Use fullscreen-quote for 10-20% of segments (bold claims, memorable statements — this replaces fullscreen-image cutaways)',
    '- Use fullscreen-headline sparingly for the opening beat and occasional clip-closing beats (max 1-2 per video)'
  ].join('\n')
}

export function buildPrompt(
  segments: VideoSegment[],
  editStyle: EditStyle,
  hasFalKey: boolean
): string {
  const archetypeList = buildArchetypeList(hasFalKey)
  const segmentList = buildSegmentList(segments)
  const distribution = buildDistributionGuidelines(hasFalKey)

  const imageCaveat = hasFalKey
    ? ''
    : '\nIMPORTANT: fal.ai is not configured for this run, so do NOT emit "split-image" or "fullscreen-image" — they require a generated image and will degrade. Use quote-lower and fullscreen-quote for visual variety instead.'

  return `You are a professional short-form video editor assigning visual styles to segments of a 9:16 vertical video.
Each segment has caption text and a time range. Assign each one an archetype from the list below.

EDIT STYLE: "${editStyle.name}" (energy: ${editStyle.energy})

Available archetypes:
${archetypeList}
${imageCaveat}
DISTRIBUTION GUIDELINES:
${distribution}

RULES:
- NEVER use the same archetype category for 3+ consecutive segments — variety is key.
  (talking-head, tight-punch, and wide-breather all share the same category.)
- First segment: ALWAYS use fullscreen-headline — this is the on-screen text hook that anchors retention.
- Last segment: prefer talking-head (call to action, personal close).
- Short segments (<3 seconds) work well as fullscreen-quote${hasFalKey ? ' or fullscreen-image' : ''}.
- Longer segments (>6 seconds) work better as talking-head${hasFalKey ? ' or split-image' : ' or quote-lower'}.
${hasFalKey ? '- When the speaker describes a concept/thing/place, use split-image — it keeps the speaker visible while showing context.\n' : ''}- When the speaker makes a bold claim or quote, consider fullscreen-quote.
- When the speaker tells a personal story, use talking-head or tight-punch.
- Energy level "${editStyle.energy}" means ${
    editStyle.energy === 'high'
      ? 'more variety, more fullscreen cuts, faster pacing'
      : editStyle.energy === 'low'
      ? 'more talking-head, fewer cuts, calmer pacing'
      : 'balanced variety between speaker and visual cuts'
  }

Segments:
${segmentList}

Return a JSON array with one object per segment:
[{"index": 0, "archetype": "fullscreen-headline"}, ...]

The "index" must match the segment number. Every segment must be assigned exactly one archetype from the list above.`
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface RawAssignment {
  index?: unknown
  archetype?: unknown
}

const VALID_ARCHETYPES: Set<string> = new Set(ARCHETYPE_KEYS as readonly string[])
const IMAGE_ARCHETYPES: Set<string> = new Set(['split-image', 'fullscreen-image'])

export function parseAssignments(
  text: string,
  segmentCount: number,
  hasFalKey: boolean
): Array<{ index: number; archetype: Archetype }> {
  let raw: RawAssignment[]
  try {
    raw = JSON.parse(text) as RawAssignment[]
  } catch {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) {
      throw new Error(
        'Gemini returned an unparseable response for segment style assignment'
      )
    }
    raw = JSON.parse(match[0]) as RawAssignment[]
  }

  if (!Array.isArray(raw)) {
    throw new Error(
      'Gemini did not return an array for segment style assignment'
    )
  }

  const result: Array<{ index: number; archetype: Archetype }> = []

  for (const item of raw) {
    const idx = typeof item.index === 'number' ? item.index : Number(item.index)
    if (isNaN(idx) || idx < 0 || idx >= segmentCount) continue

    const archetype = typeof item.archetype === 'string' ? item.archetype : ''
    if (!VALID_ARCHETYPES.has(archetype)) continue

    // Drop image archetypes when fal.ai is not configured — they will fall
    // through to the deterministic pattern-based fallback for a safer default.
    if (!hasFalKey && IMAGE_ARCHETYPES.has(archetype)) continue

    result.push({ index: idx, archetype: archetype as Archetype })
  }

  return result
}

// ---------------------------------------------------------------------------
// Fallback: deterministic pattern-based assignment without AI
// ---------------------------------------------------------------------------

/**
 * Baseline rotation pattern — anchor hook with a headline, then rotate between
 * speaker framing and visual accents. The first slot is always the hook.
 */
const DEFAULT_PATTERN_WITH_IMAGES: Archetype[] = [
  'fullscreen-headline', // hook
  'tight-punch',
  'split-image',
  'talking-head',
  'fullscreen-image',
  'quote-lower',
  'split-image',
  'wide-breather',
  'fullscreen-quote',
  'talking-head'
]

/**
 * Rotation when fal.ai is not configured: no image-based archetypes — replaced
 * with text-heavy variety (quote-lower / fullscreen-quote) so each clip still
 * feels dynamic without generated imagery.
 */
const DEFAULT_PATTERN_NO_IMAGES: Archetype[] = [
  'fullscreen-headline', // hook
  'tight-punch',
  'quote-lower',
  'talking-head',
  'fullscreen-quote',
  'wide-breather',
  'quote-lower',
  'tight-punch',
  'fullscreen-quote',
  'talking-head'
]

/**
 * Pick a fallback archetype for the segment at `index`, respecting:
 *   - index 0 → always fullscreen-headline (hook)
 *   - last index → talking-head (CTA close)
 *   - middle indices → pattern[i % length], but walk forward if picking it
 *     would create 3-in-a-row of the same category
 *   - very short middle segments (<3s) → fullscreen-quote (punchy, quick)
 */
function pickFallbackArchetype(
  index: number,
  segmentCount: number,
  duration: number,
  pattern: Archetype[],
  previousAssignments: Archetype[]
): Archetype {
  if (index === 0) return 'fullscreen-headline'
  if (index === segmentCount - 1) return 'talking-head'

  // Short middle beat → punchy accent
  if (duration < 3) return 'fullscreen-quote'

  // Walk the pattern forward until we find an archetype that doesn't trigger
  // a 3-consecutive-same-category streak.
  const wouldStreak = (candidate: Archetype): boolean => {
    if (previousAssignments.length < 2) return false
    const cat = ARCHETYPE_TO_CATEGORY[candidate]
    const prev1 = previousAssignments[previousAssignments.length - 1]
    const prev2 = previousAssignments[previousAssignments.length - 2]
    return (
      ARCHETYPE_TO_CATEGORY[prev1] === cat &&
      ARCHETYPE_TO_CATEGORY[prev2] === cat
    )
  }

  for (let offset = 0; offset < pattern.length; offset++) {
    const candidate = pattern[(index + offset) % pattern.length]
    if (!wouldStreak(candidate)) return candidate
  }
  // Every pattern entry would streak — fall back to the literal index.
  return pattern[index % pattern.length]
}

function assignFallbackStyles(
  segments: VideoSegment[],
  hasFalKey: boolean
): VideoSegment[] {
  const pattern = hasFalKey
    ? DEFAULT_PATTERN_WITH_IMAGES
    : DEFAULT_PATTERN_NO_IMAGES
  const assigned: Archetype[] = []

  return segments.map((seg, i) => {
    const archetype = pickFallbackArchetype(
      i,
      segments.length,
      seg.endTime - seg.startTime,
      pattern,
      assigned
    )
    assigned.push(archetype)

    const overlayText =
      HERO_ARCHETYPES.has(archetype) && !seg.overlayText
        ? deriveHeroText(seg.captionText)
        : seg.overlayText

    return {
      ...seg,
      archetype,
      segmentStyleCategory: ARCHETYPE_TO_CATEGORY[archetype],
      overlayText
    }
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Use Gemini AI to assign an archetype to each segment based on its caption
 * content and the edit style's energy level. Falls back to a deterministic
 * pattern when the AI call fails or no API key is set.
 *
 * When `hasFalKey` is false, split-image / fullscreen-image are excluded
 * from both the AI prompt and the fallback pattern — those archetypes need
 * a generated image and would otherwise degrade at render time.
 */
export async function assignSegmentStyles(
  segments: VideoSegment[],
  editStyle: EditStyle,
  apiKey: string,
  hasFalKey: boolean = false
): Promise<VideoSegment[]> {
  if (segments.length === 0) return segments

  // No API key → deterministic fallback
  if (!apiKey || !apiKey.trim()) {
    return assignFallbackStyles(segments, hasFalKey)
  }

  const ai = new GoogleGenAI({ apiKey })
  const call: GeminiCall = {
    model: 'gemini-2.5-flash-lite',
    config: { responseMimeType: 'application/json' }
  }

  const prompt = buildPrompt(segments, editStyle, hasFalKey)

  let assignments: Array<{ index: number; archetype: Archetype }>
  try {
    const text = await callGeminiWithRetry(ai, call, prompt, 'segment-styler')
    assignments = parseAssignments(text, segments.length, hasFalKey)
  } catch {
    return assignFallbackStyles(segments, hasFalKey)
  }

  const assignmentMap = new Map(assignments.map((a) => [a.index, a.archetype]))
  // Always force the first segment to be the hook headline.
  if (segments.length > 0) {
    assignmentMap.set(0, 'fullscreen-headline')
  }
  const fallback = assignFallbackStyles(segments, hasFalKey)

  return segments.map((seg, i) => {
    const archetype = assignmentMap.get(i)
    if (archetype) {
      const overlayText =
        HERO_ARCHETYPES.has(archetype) && !seg.overlayText
          ? deriveHeroText(seg.captionText)
          : seg.overlayText
      return {
        ...seg,
        archetype,
        segmentStyleCategory: ARCHETYPE_TO_CATEGORY[archetype],
        overlayText
      }
    }
    return fallback[i]
  })
}
