import { GoogleGenAI } from '@google/genai'
import { callGeminiWithRetry, type GeminiCall } from './gemini-client'

import type {
  StitchedClipPlan,
  StitchedClipRole,
  StitchGenerationProgress,
  StitchGenerationResult,
  SourceRange,
} from '@shared/types'

export type {
  StitchedClipPlan,
  StitchedClipRole,
  StitchGenerationProgress,
  StitchGenerationResult,
  SourceRange,
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Floor used by the validator. Anything below this is filtered out. */
const STITCH_MIN_SCORE = 70
/** Hard lower duration bound (sum of all ranges). */
const STITCH_MIN_TOTAL_DURATION_S = 3
/** Hard upper duration bound (sum of all ranges). */
const STITCH_MAX_TOTAL_DURATION_S = 120
/** Minimum acceptable duration for a single range. */
const STITCH_MIN_RANGE_DURATION_S = 1.5
/**
 * Spread requirement: when sorted by startTime, the first and last range must
 * span at least this many seconds of source video. Prevents pseudo-non-
 * contiguous stitches where all ranges sit within a tight window.
 */
const STITCH_MIN_RANGE_SPREAD_S = 60

const VALID_ROLES = new Set<StitchedClipRole>([
  'hook',
  'rehook',
  'context',
  'why',
  'what',
  'how',
  'mini-payoff',
  'main-payoff',
  'bonus-payoff',
  'bridge',
])

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function summarizeExistingClips(
  existingClips: ReadonlyArray<{ startTime: number; endTime: number; score: number; text: string }>
): string {
  if (existingClips.length === 0) return '(none — pick freely)'
  return existingClips
    .slice(0, 24)
    .map((c) => {
      const text = c.text.replace(/\s+/g, ' ').trim().slice(0, 80)
      return `${formatTimestamp(c.startTime)}-${formatTimestamp(c.endTime)} score:${Math.round(c.score)} — ${text}`
    })
    .join('\n')
}

function buildSystemPrompt(
  videoDuration: number,
  existingClips: ReadonlyArray<{ startTime: number; endTime: number; score: number; text: string }>,
  targetAudience: string
): string {
  const audienceBlock = targetAudience.trim()
    ? `\nTARGET AUDIENCE:\n${targetAudience.trim()}\n\nEvery stitched clip MUST pass this filter: "Would the person I want to attract find this valuable?" If the answer is no, do NOT include it.`
    : ''

  const totalMinutes = Math.max(1, Math.round(videoDuration / 60))
  const existingSummary = summarizeExistingClips(existingClips)

  return `You are an expert short-form editor identifying STITCHED CLIPS — single coherent shorts assembled from TWO OR MORE non-contiguous moments in the same long-form video.
${audienceBlock}

CORE PHILOSOPHY:
- A stitched clip pulls together moments from DIFFERENT parts of the video that, joined together, form one COMPLETE THOUGHT stronger than any single moment alone.
- It is NOT a "best of" reel. It is NOT a montage. It is ONE coherent narrative: hook → context (optional) → payoff.
- Each range must flow into the next as if the speaker said it that way originally. The viewer should NOT feel like they're watching a chopped-up edit.
- A stitched clip must be HIGHER value than just clipping any single range — that's why we bothered to stitch it. If a single contiguous clip would deliver the same value, do NOT propose a stitched version.

WHEN TO STITCH (good signals):
- The setup lives at one timestamp and the payoff lives much later (e.g. a question asked early, answered 8 minutes later).
- A claim made in passing is supported by a specific story or example given much later (or earlier).
- Three short tips scattered across the video that, when joined, form a complete framework.
- An emotional hook in one segment is resolved by a callback near the end.

WHEN NOT TO STITCH (bad signals):
- The moments are already adjacent — that's a regular clip, not a stitched one.
- The combined ranges substantially overlap an existing high-scoring single-range clip below — that's duplication.
- The joined text doesn't make grammatical sense or the speaker references something cut between ranges ("like I said earlier", "going back to that").
- All ranges sit within a 60-second window — that's a single clip with a hole in it, not a true stitch.

EXISTING CLIPS ALREADY GENERATED (avoid producing stitched composites whose ranges overlap these):
${existingSummary}

REQUIRED STRUCTURE FOR EVERY STITCHED CLIP:
- 2 to 6 ranges. More than 4 is rare and usually a sign you're trying too hard.
- The FIRST range MUST have role "hook" — an attention-grabbing complete thought (not a cliffhanger snip).
- At least one later range MUST have a *-payoff role: "mini-payoff", "main-payoff", or "bonus-payoff".
- Other ranges may use: "context", "why", "what", "how", "bridge", "rehook".
- No internal overlap. Sorted by start time, each range must end before the next begins.
- Each range must be AT LEAST 1.5 seconds and contain a complete clause — no fragmenting words.
- Total stitched duration: ${STITCH_MIN_TOTAL_DURATION_S}–${STITCH_MAX_TOTAL_DURATION_S} seconds. Aim for 30–60s when possible.
- Ranges must be drawn from at least TWO source regions separated by ${STITCH_MIN_RANGE_SPREAD_S}+ seconds. If every range you picked sits within a tight 60s window, this is NOT a stitched clip — drop it.

HOOK TEXT:
For each stitched clip, write 1-5 words of on-screen hook text that appears in the first 2 seconds. 80%+ viewers watch with sound off — the hook must work silently.
- Pull a SPECIFIC noun, number, or detail from the transcript — never generic filler
- Must make the RIGHT audience stop scrolling
- No generic hooks ("Wait for it", "Watch this", "You won't believe")

SCORING (0-100), with a floor of ${STITCH_MIN_SCORE}:
- 90-100: Must-stitch — the composite delivers a complete framework / arc / payoff that NO single contiguous segment in this video could match. Standalone, viral-quality, audience would save+share.
- 80-89: Very strong — the stitch genuinely unlocks value the source video had scattered.
- 70-79: Solid — the stitch is coherent, complete, and clearly better than picking either range alone.
- Below 70: Do not include. Either the stitch is redundant with an existing clip, the cohesion is weak, or the composite isn't materially better than a single-range clip.

OUTPUT REQUIREMENTS:
- The video is ${formatTimestamp(videoDuration)} long (${totalMinutes} minutes). All timestamps must fit inside it.
- Use MM:SS for every timestamp.
- Be selective. Return at most 6 stitched clips. Zero is a perfectly valid answer if the source video doesn't have material that genuinely benefits from stitching.

Return valid JSON with this exact structure:
{
  "clips": [
    {
      "ranges": [
        { "start_time": "MM:SS", "end_time": "MM:SS", "role": "hook" },
        { "start_time": "MM:SS", "end_time": "MM:SS", "role": "context" },
        { "start_time": "MM:SS", "end_time": "MM:SS", "role": "main-payoff" }
      ],
      "text": "Concatenated transcript across the ranges in narrative order",
      "score": 82,
      "hook_text": "5 words on-screen hook",
      "reasoning": "Why this stitched composite works as a complete thought."
    }
  ]
}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTimestamp(ts: string): number {
  const parts = ts.trim().split(':').map(Number)
  if (parts.some(isNaN)) return NaN
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return NaN
}

function normalizeRole(raw: unknown): StitchedClipRole {
  const r = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (r === 'payoff') return 'main-payoff'
  if (VALID_ROLES.has(r as StitchedClipRole)) return r as StitchedClipRole
  return 'context'
}

interface RawRange {
  start_time?: unknown
  end_time?: unknown
  role?: unknown
}

interface RawClip {
  ranges?: unknown
  text?: unknown
  score?: unknown
  hook_text?: unknown
  reasoning?: unknown
}

interface RawResponse {
  clips?: unknown
}

interface ValidationOutcome {
  clips: StitchedClipPlan[]
  rejectionReasons: Record<string, number>
}

/** Validate AI output and enforce the structural rules described above. */
export function validateStitchedClips(
  raw: RawClip[],
  videoDuration: number
): ValidationOutcome {
  const rejectionReasons: Record<string, number> = {}
  const reject = (reason: string): void => {
    rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1
  }

  const hasVideoBound = Number.isFinite(videoDuration) && videoDuration > 0
  const accepted: StitchedClipPlan[] = []

  for (const clip of raw) {
    if (!Array.isArray(clip.ranges) || clip.ranges.length < 2) {
      reject('fewer-than-2-ranges')
      continue
    }

    const ranges: SourceRange[] = []
    let rangesOk = true
    for (const r of clip.ranges as RawRange[]) {
      if (typeof r.start_time !== 'string' || typeof r.end_time !== 'string') {
        reject('range-missing-timestamps')
        rangesOk = false
        break
      }
      const startTime = parseTimestamp(r.start_time)
      const endTime = parseTimestamp(r.end_time)
      if (isNaN(startTime) || isNaN(endTime)) {
        reject('range-unparseable-timestamps')
        rangesOk = false
        break
      }
      if (startTime >= endTime) {
        reject('range-start-after-end')
        rangesOk = false
        break
      }
      if (endTime - startTime < STITCH_MIN_RANGE_DURATION_S) {
        reject(`range-duration-below-${STITCH_MIN_RANGE_DURATION_S}s`)
        rangesOk = false
        break
      }
      if (hasVideoBound && (startTime >= videoDuration || endTime > videoDuration + 1)) {
        reject('range-past-video-end')
        rangesOk = false
        break
      }
      ranges.push({
        startTime,
        endTime: hasVideoBound ? Math.min(endTime, videoDuration) : endTime,
        role: normalizeRole(r.role),
      })
    }
    if (!rangesOk) continue

    // Sort + check overlap.
    ranges.sort((a, b) => a.startTime - b.startTime)
    let overlaps = false
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].startTime < ranges[i - 1].endTime) {
        overlaps = true
        break
      }
    }
    if (overlaps) {
      reject('ranges-overlap')
      continue
    }

    // Role requirements.
    const hasHook = ranges.some((r) => r.role === 'hook')
    const hasPayoff = ranges.some((r) => /-payoff$/.test(r.role))
    if (!hasHook) {
      reject('missing-hook-role')
      continue
    }
    if (!hasPayoff) {
      reject('missing-payoff-role')
      continue
    }

    // Pseudo-non-contiguous check — spread between first and last start.
    const spread = ranges[ranges.length - 1].startTime - ranges[0].startTime
    if (spread < STITCH_MIN_RANGE_SPREAD_S) {
      reject(`spread-below-${STITCH_MIN_RANGE_SPREAD_S}s`)
      continue
    }

    // Duration bounds.
    const totalDuration = ranges.reduce((s, r) => s + (r.endTime - r.startTime), 0)
    if (totalDuration < STITCH_MIN_TOTAL_DURATION_S) {
      reject(`total-duration-below-${STITCH_MIN_TOTAL_DURATION_S}s`)
      continue
    }
    if (totalDuration > STITCH_MAX_TOTAL_DURATION_S) {
      reject(`total-duration-above-${STITCH_MAX_TOTAL_DURATION_S}s`)
      continue
    }

    // Score.
    const scoreNum = typeof clip.score === 'number' ? clip.score : Number(clip.score)
    if (isNaN(scoreNum)) {
      reject('invalid-score')
      continue
    }
    const score = Math.min(100, Math.max(0, Math.round(scoreNum)))
    if (score < STITCH_MIN_SCORE) {
      reject(`score-below-${STITCH_MIN_SCORE}`)
      continue
    }

    // Text.
    const text = typeof clip.text === 'string' ? clip.text.trim() : ''
    if (text.split(/\s+/).filter(Boolean).length < 3) {
      reject('text-too-short')
      continue
    }

    accepted.push({
      ranges,
      text,
      score,
      hookText: typeof clip.hook_text === 'string' ? clip.hook_text.trim() : '',
      reasoning: typeof clip.reasoning === 'string' ? clip.reasoning.trim() : '',
    })
  }

  // Score-descending.
  accepted.sort((a, b) => b.score - a.score)

  return { clips: accepted, rejectionReasons }
}

function formatRejectionReasons(reasons: Record<string, number>): string {
  const entries = Object.entries(reasons)
  if (entries.length === 0) return ''
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason}x${count}`)
    .join(', ')
}

// ---------------------------------------------------------------------------
// generateStitchedClips
// ---------------------------------------------------------------------------

export async function generateStitchedClips(
  apiKey: string,
  formattedTranscript: string,
  videoDuration: number,
  existingClips: ReadonlyArray<{ startTime: number; endTime: number; score: number; text: string }>,
  onProgress: (p: StitchGenerationProgress) => void,
  targetAudience: string = ''
): Promise<StitchGenerationResult> {
  onProgress({ stage: 'sending', message: 'Sending transcript to Gemini AI...' })

  const ai = new GoogleGenAI({ apiKey })
  const call: GeminiCall = {
    model: 'gemini-2.5-flash-lite',
    config: { responseMimeType: 'application/json' },
  }

  const systemPrompt = buildSystemPrompt(videoDuration, existingClips, targetAudience)

  const prompt = `${systemPrompt}

Analyze this video transcript and propose stitched clips that compose 2+ non-contiguous moments into one coherent short.

Transcript:
${formattedTranscript}`

  onProgress({ stage: 'analyzing', message: 'Gemini is composing stitched clips...' })

  const text = await callGeminiWithRetry(ai, call, prompt, 'stitching')

  onProgress({ stage: 'validating', message: 'Validating stitched clip plans...' })

  let rawResponse: RawResponse
  try {
    rawResponse = JSON.parse(text) as RawResponse
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error('Gemini returned an unparseable response for stitched clips')
    }
    rawResponse = JSON.parse(match[0]) as RawResponse
  }

  const rawClips = Array.isArray(rawResponse.clips) ? (rawResponse.clips as RawClip[]) : []
  const { clips, rejectionReasons } = validateStitchedClips(rawClips, videoDuration)

  if (rawClips.length > 0 && clips.length === 0) {
    console.warn(
      `[stitching] All ${rawClips.length} stitched clips from Gemini were rejected. Reasons:`,
      rejectionReasons
    )
  } else if (rawClips.length > 0) {
    console.log(
      `[stitching] Gemini returned ${rawClips.length} stitched clip(s), ${clips.length} passed validation.` +
        (Object.keys(rejectionReasons).length > 0
          ? ` Rejections: ${formatRejectionReasons(rejectionReasons)}`
          : '')
    )
  } else {
    console.log('[stitching] Gemini returned 0 stitched clip candidates.')
  }

  return { clips }
}
