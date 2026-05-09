import { GoogleGenAI } from '@google/genai'
import { callGeminiWithRetry, type GeminiCall } from './ai/gemini-client'

// ---------------------------------------------------------------------------
// Types (canonical definitions live in @shared/types)
// ---------------------------------------------------------------------------

import type { TargetDuration, ScoredSegment, ScoringResult, ScoringProgress } from '@shared/types'
export type { TargetDuration, ScoredSegment, ScoringResult, ScoringProgress }

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Map targetDuration to the TIMING RULES line used in the Gemini prompt.
 */
function getTimingRule(targetDuration: TargetDuration): string {
  switch (targetDuration) {
    case '15-30':
      return 'Each segment MUST be 15-30 seconds (optimal: 18-25 seconds)'
    case '30-60':
      return 'Each segment MUST be 30-60 seconds (optimal: 35-50 seconds)'
    case '60-90':
      return 'Each segment MUST be 60-90 seconds (optimal: 65-80 seconds)'
    case '90-120':
      return 'Each segment MUST be 90-120 seconds (optimal: 95-110 seconds)'
    case 'auto':
    default:
      return 'Each segment should be 15 seconds MINIMUM, with ~40 seconds being ideal. Clips can be up to 3 minutes if every second is pure value. There is no such thing as too long, only too boring.'
  }
}

/**
 * Minimum acceptable duration for validation, based on targetDuration.
 */
function getMinDuration(targetDuration: TargetDuration): number {
  switch (targetDuration) {
    case '15-30':
      return 15
    case '30-60':
      return 25
    case '60-90':
      return 50
    case '90-120':
      return 75
    case 'auto':
    default:
      return 15
  }
}

function buildSystemPrompt(targetDuration: TargetDuration, targetAudience: string): string {
  const audienceBlock = targetAudience
    ? `\nTARGET AUDIENCE:\n${targetAudience}\n\nEvery clip MUST pass this filter: "Would the person I want to attract find this valuable?" If the answer is no, do NOT include it. You are playing the CONVERSION GAME — education, on-target views, shares, average view duration. NOT the awareness/entertainment game.`
    : ''

  return `You are an expert at analyzing video transcripts to find the most valuable, complete segments for short-form vertical video content (TikTok, Instagram Reels, YouTube Shorts).
${audienceBlock}

CORE PHILOSOPHY:
- Each clip will be posted INDEPENDENTLY to TikTok, Reels, and Shorts. The viewer has ZERO context — they have never seen the full video, they don't know the speaker, they don't know the topic. Every clip must make COMPLETE sense to a total stranger scrolling their feed.
- Quality over quantity. Fewer, better clips that deliver COMPLETE THOUGHTS and ACTIONABLE VALUE.
- Every clip must reframe thinking, teach something, or deliver an insight the audience can USE.
- If a clip doesn't make the viewer think "I need to save/share this" — don't include it.
- NEVER clip fragments, half-thoughts, or vague motivational fluff. That's spam, not content.

SEGMENT SELECTION CRITERIA (in priority order):
1. COMPLETE THOUGHTS: The clip MUST contain a self-contained idea with setup AND payoff. A clip that starts a thought but doesn't finish it is WORTHLESS. If the full thought takes 50 seconds, clip 50 seconds — don't cut it at 15.
2. ACTIONABLE VALUE: Tips, frameworks, specific how-tos, reframes, insights the audience can immediately apply. "Here's what to do" beats "here's what happened."
3. STRONG HOOK: The first 2-3 seconds must stop the scroll — but a great hook with no payoff is clickbait. The HOOK earns attention, the CONTENT earns the share.
4. STANDALONE CLARITY: Each clip is its own piece of content — a highlight reel from the full video reposted ALONE on social media. The viewer has ZERO context from the full video. They don't know the speaker, the topic, or what was said before. If a clip references a story, example, person, concept, or setup from earlier/later in the video without explaining it WITHIN the clip, it is NOT viable. The clip must establish its own context, deliver its own value, and reach its own conclusion. Ask: "If someone saw ONLY this clip and nothing else, would they get the full picture or feel like they walked in mid-conversation?" If the answer is mid-conversation, DO NOT INCLUDE IT.
5. MINI-PAYOFFS & REHOOKS: Longer clips need moments that re-engage every 8-12 seconds — a surprising stat, a pivot ("but here's the thing"), a specific example. Look for these to determine if a longer clip will hold attention.
6. EMOTIONAL RESONANCE: Evokes curiosity, urgency, surprise, or "I never thought of it that way."
7. SHAREABILITY: Content people would send to a friend, save for later, or comment "THIS" on.

WHAT TO EXCLUDE:
- Clips that reference something said earlier in the video without re-explaining it ("like I said before", "going back to that example", "remember when I mentioned")
- Clips where the speaker is mid-story or mid-argument and the viewer would feel lost without prior context
- Clips that only make sense as a follow-up to another clip — every clip must stand on its own
- Clips where pronouns or references are ambiguous without the surrounding video ("he told me", "that strategy", "this method" — WHO? WHAT method? If it's not clear within the clip, skip it)
- Rambling intros or throat-clearing ("so today I want to talk about...")
- Generic advice that doesn't teach anything specific
- Incomplete arguments — if the payoff comes 30 seconds after the setup, include BOTH
- Pure entertainment/humor with no value for the target audience
- Segments where the speaker is just repeating themselves

SCORING (0-100) — BE GENEROUS. The user filters by score downstream; your job is to surface candidates, not gatekeep:
- 90-100: Must-clip — fully standalone + strong hook + specific actionable insight + high share potential. A stranger could watch this one clip and walk away with clear value.
- 80-89: Very strong — clear value delivery, complete idea, good hook, audience would save this. No missing context.
- 70-79: Solid — good standalone value, may benefit from tight editing but the thought is complete and self-contained.
- 60-69: Decent — has a real idea but delivery is loose, hook is okay, or context is partially missing. INCLUDE these.
- 50-59: Weak but viable — a kernel of an interesting moment. INCLUDE if the clip is at least understandable on its own.
- Below 50: Do not include — truly incoherent, broken mid-sentence, or pure filler.

IMPORTANT: An 8-minute video should typically yield 5-15 candidate segments. If you find yourself returning fewer than 3, you are being too strict — lower your bar and surface more candidates. The user can dismiss the weak ones.

DURATION & SCORING RELATIONSHIP:
- Clips under 25 seconds should RARELY score above 80. In 15-20 seconds you can deliver a punchy one-liner, but you almost never have time for setup + context + payoff + actionable value. If you're scoring a short clip 85+, ask yourself: "Is this TRULY a complete, high-value thought, or am I just rewarding tightness?" Most real value needs breathing room.
- The 30-50 second range is where the best clips live. A clip that hooks, builds context, delivers the insight, and lands the takeaway in 35-45 seconds should score HIGHER than a 17-second fragment at the same perceived quality. Prefer these clips.
- Clips 50-90 seconds are great IF every second earns its place — no dead air, no repetition, multiple mini-payoffs keeping the viewer engaged.
- Clips over 90 seconds are rare but valid when the speaker is on a genuine run of back-to-back value.
- If you find yourself about to create a 15-20 second clip, STOP and look at the surrounding transcript. Is there more context before or more payoff after that would make this a stronger 30-40 second clip? Almost always, the answer is yes. Extend first, then judge.

PAYOFF CHECK (do this for EVERY clip before finalizing end_time):
- Read the 15-20 seconds of transcript AFTER your proposed end_time. Does the speaker deliver a conclusion, punchline, key insight, actionable step, or emotional payoff in that window? If YES, you MUST extend end_time to include it. You are cutting before the value lands.
- Read the 5-10 seconds of transcript AFTER your proposed end_time. Does the speaker finish the current sentence? If NO, extend to at least the end of the sentence. Clips must NEVER end mid-sentence.
- Ask: "If I were a viewer, would I feel satisfied at this ending, or would I feel like the rug was pulled?" If the rug is pulled, extend.

TIMING RULES:
- ${getTimingRule(targetDuration)}
- MINIMUM 15 seconds — anything shorter cannot deliver a complete thought
- ~40 seconds is the TARGET for most clips — not a suggestion, a target. Actively aim for it.
- Clips CAN be 1-3 minutes IF every single second delivers value with no dead air or repetition. Long clips are rare but possible — do not artificially cut a great segment short.
- NEVER cut a clip short just to hit a time target. Complete the thought, THEN end.
- start_time MUST be LESS than end_time
- Segments must not overlap
- Use EXACT timestamps from the transcript
- Start at natural hook points, end AFTER the payoff/conclusion — not before it, not during it, AFTER it

HOOK TEXT:
For each segment, write 1-5 words of on-screen hook text that appears in the first 2 seconds. 80%+ viewers watch with sound off — the hook must work silently.

The hook must do ONE of these:
- CALL OUT the target audience: "Freelancers: stop doing this"
- NAME the specific problem or desire: "$47K/month from rentals?"
- OPEN a curiosity loop with a SPECIFIC detail: "The 3am rule changed everything"
- ATTACK a common belief: "College is a scam and here's why"

Rules:
- Use a SPECIFIC noun, number, or detail from the transcript — never generic filler
- NOT a summary of the clip
- No generic hooks like "Wait for it", "Watch this", "You need to see this"
- Must make the RIGHT audience stop scrolling — filter IN your people

Return valid JSON with this exact structure:
{
  "segments": [
    {
      "start_time": "MM:SS",
      "end_time": "MM:SS",
      "text": "transcript text for this segment",
      "score": 85,
      "hook_text": "Introverts: this changes everything",
      "reasoning": "Why this delivers value: complete thought about X, strong hook, actionable takeaway about Y"
    }
  ],
  "summary": "Brief summary of the full video",
  "key_topics": ["topic1", "topic2"]
}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a timestamp string (MM:SS or HH:MM:SS) into seconds.
 * Returns NaN if the format is unrecognised.
 */
function parseTimestamp(ts: string): number {
  const parts = ts.trim().split(':').map(Number)
  if (parts.some(isNaN)) return NaN
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return NaN
}

interface RawSegment {
  start_time?: unknown
  end_time?: unknown
  text?: unknown
  score?: unknown
  hook_text?: unknown
  reasoning?: unknown
}

interface RawResponse {
  segments?: unknown
  summary?: unknown
  key_topics?: unknown
}

/**
 * Validate and normalise the raw JSON from Gemini into ScoredSegment[].
 * Applies all timing / score / overlap rules.
 */
/**
 * Hard floor for the validator. Anything below this is almost certainly junk
 * (Gemini gave it up itself). The user-facing approval bar is
 * `settings.minScore` (defaults to 69) — lower-scoring clips still flow
 * through and show up in the grid so the user can see what was rejected
 * and decide for themselves.
 */
const VALIDATOR_MIN_SCORE = 50

interface ValidationOutcome {
  segments: ScoredSegment[]
  rejectionReasons: Record<string, number>
}

function validateSegments(raw: RawSegment[], videoDuration: number, targetDuration: TargetDuration = 'auto'): ValidationOutcome {
  const minDuration = getMinDuration(targetDuration)
  const parsed: ScoredSegment[] = []
  const rejectionReasons: Record<string, number> = {}
  const reject = (reason: string): void => {
    rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1
  }

  // If videoDuration is zero/negative/non-finite, treat the bound as unknown
  // rather than rejecting every segment. This guards against an upstream bug
  // where the source's duration was never written back after download — in
  // that case we'd rather accept Gemini's timestamps than throw away every
  // segment with `start-past-video-end`.
  const hasVideoBound = Number.isFinite(videoDuration) && videoDuration > 0

  for (const seg of raw) {
    if (typeof seg.start_time !== 'string' || typeof seg.end_time !== 'string') {
      reject('missing-timestamps')
      continue
    }
    if (typeof seg.text !== 'string' || seg.text.trim().split(/\s+/).length < 3) {
      reject('text-too-short')
      continue
    }

    const startTime = parseTimestamp(seg.start_time)
    const endTime = parseTimestamp(seg.end_time)

    if (isNaN(startTime) || isNaN(endTime)) {
      reject('unparseable-timestamps')
      continue
    }
    if (startTime >= endTime) {
      reject('start-after-end')
      continue
    }

    const duration = endTime - startTime
    if (duration < minDuration) {
      reject(`duration-below-${minDuration}s`)
      continue
    }

    const score = typeof seg.score === 'number' ? seg.score : Number(seg.score)
    if (isNaN(score)) {
      reject('invalid-score')
      continue
    }
    if (score < VALIDATOR_MIN_SCORE) {
      reject(`score-below-${VALIDATOR_MIN_SCORE}`)
      continue
    }

    // Clamp to video duration only when we know it.
    let clampedEnd = endTime
    if (hasVideoBound) {
      if (startTime >= videoDuration) {
        reject('start-past-video-end')
        continue
      }
      clampedEnd = Math.min(endTime, videoDuration)
    }

    parsed.push({
      startTime,
      endTime: clampedEnd,
      text: String(seg.text).trim(),
      score: Math.min(100, Math.max(0, Math.round(score))),
      hookText: typeof seg.hook_text === 'string' ? seg.hook_text.trim() : '',
      reasoning: typeof seg.reasoning === 'string' ? seg.reasoning.trim() : ''
    })
  }

  if (raw.length > 0 && parsed.length === 0) {
    console.warn(
      `[scoring] All ${raw.length} segments from Gemini were rejected. Reasons:`,
      rejectionReasons,
      `videoDuration=${videoDuration}`,
      'Sample raw scores:',
      raw.slice(0, 5).map((s) => ({ score: s.score, start: s.start_time, end: s.end_time }))
    )
  } else if (raw.length > 0) {
    console.log(
      `[scoring] Gemini returned ${raw.length} segments, ${parsed.length} passed validation.`,
      Object.keys(rejectionReasons).length > 0 ? `Rejections: ${JSON.stringify(rejectionReasons)}` : ''
    )
  }

  // Sort by score descending
  parsed.sort((a, b) => b.score - a.score)

  // Remove overlapping segments — keep the higher-scored one (already sorted)
  const result: ScoredSegment[] = []
  for (const seg of parsed) {
    const overlaps = result.some(
      (kept) => seg.startTime < kept.endTime && seg.endTime > kept.startTime
    )
    if (!overlaps) {
      result.push(seg)
    }
  }

  return { segments: result, rejectionReasons }
}

/** Format a rejection-reasons map as a compact, human-readable string. */
function formatRejectionReasons(reasons: Record<string, number>): string {
  const entries = Object.entries(reasons)
  if (entries.length === 0) return ''
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason}×${count}`)
    .join(', ')
}

// ---------------------------------------------------------------------------
// scoreTranscript
// ---------------------------------------------------------------------------

export async function scoreTranscript(
  apiKey: string,
  formattedTranscript: string,
  videoDuration: number,
  onProgress: (p: ScoringProgress) => void,
  targetDuration: TargetDuration = 'auto',
  targetAudience: string = ''
): Promise<ScoringResult> {
  onProgress({ stage: 'sending', message: 'Sending transcript to Gemini AI...' })

  const ai = new GoogleGenAI({ apiKey })
  const call: GeminiCall = {
    model: 'gemini-2.5-flash-lite',
    config: { responseMimeType: 'application/json' }
  }

  const systemPrompt = buildSystemPrompt(targetDuration, targetAudience)

  const prompt = `${systemPrompt}

Analyze this video transcript and identify the most engaging segments for short-form content.

Transcript:
${formattedTranscript}`

  onProgress({ stage: 'analyzing', message: 'Gemini is analyzing the transcript...' })

  const text = await callGeminiWithRetry(ai, call, prompt, 'scoring')

  onProgress({ stage: 'validating', message: 'Validating and scoring segments...' })

  let rawResponse: RawResponse
  try {
    rawResponse = JSON.parse(text) as RawResponse
  } catch {
    // Try to extract JSON from within the text if the model wrapped it
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error('Gemini returned an unparseable response')
    }
    rawResponse = JSON.parse(match[0]) as RawResponse
  }

  const rawSegments = Array.isArray(rawResponse.segments) ? (rawResponse.segments as RawSegment[]) : []
  const { segments, rejectionReasons } = validateSegments(rawSegments, videoDuration, targetDuration)

  if (segments.length === 0) {
    const rawCount = rawSegments.length
    if (rawCount === 0) {
      throw new Error(
        'Gemini returned 0 segments. The transcript may be too short, silent, or unintelligible. Check the source video.'
      )
    }
    const sampleScores = rawSegments
      .slice(0, 5)
      .map((s) => (typeof s.score === 'number' ? s.score : Number(s.score)))
      .filter((n) => !isNaN(n))
    const reasonStr = formatRejectionReasons(rejectionReasons)
    const durationNote =
      rejectionReasons['start-past-video-end'] && (!Number.isFinite(videoDuration) || videoDuration <= 0)
        ? ' (videoDuration was 0 — source metadata likely missing)'
        : ''
    throw new Error(
      `Gemini returned ${rawCount} segments but all were filtered out by validation. ` +
      `Sample scores: [${sampleScores.join(', ')}]. ` +
      `Rejection reasons: ${reasonStr || '(none recorded)'}${durationNote}.`
    )
  }

  return {
    segments,
    summary: typeof rawResponse.summary === 'string' ? rawResponse.summary : '',
    keyTopics: Array.isArray(rawResponse.key_topics)
      ? (rawResponse.key_topics as unknown[]).filter((t): t is string => typeof t === 'string')
      : []
  }
}

// ---------------------------------------------------------------------------
// rescoreSingleClip
// ---------------------------------------------------------------------------

export interface SingleClipRescoreResult {
  score: number
  reasoning: string
  hookText: string
}

/**
 * Re-score a single clip after the user has edited its boundaries.
 * Lighter-weight than a full transcript score — single Gemini call for one clip.
 */
export async function rescoreSingleClip(
  apiKey: string,
  clipText: string,
  clipDuration: number
): Promise<SingleClipRescoreResult> {
  const ai = new GoogleGenAI({ apiKey })
  const call: GeminiCall = {
    model: 'gemini-2.5-flash-lite',
    config: { responseMimeType: 'application/json' }
  }

  const prompt = `You are an expert at scoring short-form video clips for viral potential on TikTok, Instagram Reels, and YouTube Shorts.

This clip will be posted INDEPENDENTLY on social media. The viewer has ZERO context — they have never seen the full video. The clip must make COMPLETE sense to a total stranger.

Given this clip transcript (${Math.round(clipDuration)}s), score it and generate hook text.

SCORING (0-100):
- 90-100: Guaranteed viral — fully standalone, perfect hook + high emotion + universally relatable. A stranger understands everything without outside context.
- 80-89: Very strong — great hook, compelling content, broad appeal. No missing context.
- 70-79: Strong — good standalone clip, clear value or entertainment. Self-contained.
- 60-69: Decent — may need editing to shine, but still understandable on its own.
- Below 60: Weak — limited viral potential, or requires context from the full video to make sense.

CRITICAL: If the clip references people, stories, examples, or concepts that are NOT explained within the clip itself, score it LOWER. A clip where the viewer feels like they walked in mid-conversation is not viable content.

HOOK TEXT: Write 5 words or less of on-screen text for the first 2 seconds. 80%+ viewers watch with sound off — the hook must work silently.

The hook must do ONE of these:
- CALL OUT the target audience (e.g. "Freelancers: stop doing this")
- NAME the specific problem or desire (e.g. "$47K/month from rentals?")
- OPEN a curiosity loop with a SPECIFIC detail from the transcript
- ATTACK a common belief with specifics

Rules:
- Pull a SPECIFIC noun, number, or detail from the transcript
- No generic hooks like "Wait for it", "Watch this", "Nobody talks about this"
- Must make the RIGHT audience stop scrolling

Return valid JSON:
{
  "score": 85,
  "reasoning": "Why this clip has viral potential (or lacks it)",
  "hook_text": "$47K/month from rentals?"
}

Transcript: "${clipText.trim()}"`

  const text = await callGeminiWithRetry(ai, call, prompt, 'rescore')

  let raw: { score?: unknown; reasoning?: unknown; hook_text?: unknown }
  try {
    raw = JSON.parse(text) as typeof raw
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Gemini returned an unparseable response for re-score')
    raw = JSON.parse(match[0]) as typeof raw
  }

  const score = typeof raw.score === 'number' ? raw.score : Number(raw.score)
  if (isNaN(score)) throw new Error('Gemini returned an invalid score')

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning.trim() : '',
    hookText: typeof raw.hook_text === 'string' ? raw.hook_text.trim() : ''
  }
}

// ---------------------------------------------------------------------------
// generateHookText
// ---------------------------------------------------------------------------

export async function generateHookText(apiKey: string, transcript: string, videoSummary?: string, keyTopics?: string[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })
  const call: GeminiCall = { model: 'gemini-2.5-flash' }

  let contextBlock = ''
  if (videoSummary || (keyTopics && keyTopics.length > 0)) {
    const parts: string[] = []
    if (videoSummary) parts.push(`Video context: ${videoSummary}`)
    if (keyTopics && keyTopics.length > 0) parts.push(`Key topics: ${keyTopics.join(', ')}`)
    contextBlock = parts.join('\n') + '\n\n'
  }

  try {
    return await callGeminiWithRetry(
      ai,
      call,
      `You are an expert short-form content creator specializing in organic (non-ad) TikTok, Instagram Reels, and YouTube Shorts.

Your job is to write on-screen hook text that appears in the first 2 seconds of a clip. 80%+ viewers watch with sound off — the hook must work silently, hooking attention AND adding context so the right audience stays.

Rules:
- 5 words or LESS — no exceptions
- Stop the scroll — curiosity, shock, intrigue, or a question
- Feel native and authentic — NOT like an ad
- Be SPECIFIC to the transcript — fill in real details from the content

The hook MUST do one of:
• AUDIENCE CALLOUT: Name who this is for — "Freelancers: stop doing this", "New parents: watch this", "Gym bros hate this"
• SPECIFIC PROBLEM/DESIRE: Name the exact outcome — "$47K/month from rentals?", "Lost 30lbs eating pizza", "3x your close rate"
• CURIOSITY LOOP with DETAIL: Use a specific noun/number from the transcript — "The 3am rule changed everything", "One word killed his deal", "She said 4 words..."
• BELIEF ATTACK: Challenge with specifics — "College is a scam", "8 hours of sleep is a lie", "Stretching doesn't work"

BANNED (too generic, adds no context):
"Wait for it", "Watch this", "You won't believe", "This changes everything",
"Nobody talks about this", "Must watch", "Check this out", "Here's the thing",
"Game changer", "Mind blown", "Unpopular opinion"

Do NOT:
- Summarize the clip
- Add hashtags, emojis, or extra punctuation

Given the transcript below, write ONE piece of on-screen hook text. Return ONLY the text, nothing else.

${contextBlock}Transcript: "${transcript}"`,
      'hooks'
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to generate hook text: ${msg}`)
  }
}
