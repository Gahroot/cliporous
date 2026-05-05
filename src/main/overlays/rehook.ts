import { GoogleGenAI } from '@google/genai'
import { emitUsageFromResponse } from '../ai-usage'

/**
 * Default re-hook phrases used as fallbacks when AI generation is unavailable
 * or fails. Picked deterministically by hashing the transcript so the same
 * clip always produces the same default.
 */
export const DEFAULT_REHOOK_PHRASES: readonly string[] = [
  "But here's why it matters...",
  "This is the part they skip...",
  "Pay attention to this next part",
  "Here's where most people get it wrong",
  "This detail changes everything...",
  "The part nobody mentions:",
  "But then this happened...",
  "Here's the actual reason:",
  "Most people miss this part",
  "And this is the real problem..."
]

/**
 * Pick a default re-hook phrase deterministically from `DEFAULT_REHOOK_PHRASES`.
 * Uses a simple character-code hash of the seed string to vary the choice.
 */
export function getDefaultRehookPhrase(seed: string): string {
  let hash = 0
  for (let i = 0; i < Math.min(seed.length, 120); i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return DEFAULT_REHOOK_PHRASES[hash % DEFAULT_REHOOK_PHRASES.length]
}

/**
 * Generate a context-aware mid-clip "re-hook" overlay phrase via Gemini.
 * Returns a deterministic fallback phrase on missing key or API error.
 */
export async function generateRehookText(
  apiKey: string,
  transcript: string,
  clipStart: number,
  clipEnd: number,
  videoSummary?: string,
  keyTopics?: string[]
): Promise<string> {
  if (!apiKey) return getDefaultRehookPhrase(transcript)

  try {
    const ai = new GoogleGenAI({ apiKey })

    const clipDuration = Math.round(clipEnd - clipStart)

    let contextBlock = ''
    if (videoSummary || (keyTopics && keyTopics.length > 0)) {
      const parts: string[] = []
      if (videoSummary) parts.push(`Video context: ${videoSummary}`)
      if (keyTopics && keyTopics.length > 0) parts.push(`Key topics: ${keyTopics.join(', ')}`)
      contextBlock = parts.join('\n') + '\n\n'
    }

    const prompt =
      `You are an expert short-form video editor specializing in viewer retention.

Your task: write a "re-hook" text overlay that appears mid-way through a ${clipDuration}-second clip. 80%+ viewers watch with sound off — the re-hook must work silently to add context and make the viewer personally feel why this matters to THEM.

Re-hooks add context and tell viewers WHY they should keep watching. They are NOT generic filler.

GOOD re-hooks (content-specific):
- "But here's why it matters..."
- "This is the part they skip..."
- "Here's where most get it wrong"
- "The part nobody mentions:"
- "But then this happened..."
- "Here's the actual reason:"

GENERIC re-hooks to AVOID (these are the old style — do NOT produce these):
- "But here's the crazy part..."
- "Watch what happens next"
- "Wait for it..."
- "Nobody expected this"

Rules:
- 5 words or LESS — no exceptions
- Add CONTEXT — hint at what's coming or why it matters
- If possible, use a specific word or detail from the second half of the transcript
- Feel organic, not like an advertisement
- No hashtags, no emojis; only punctuation allowed: ellipsis (...) or colon (:)

${contextBlock}Transcript: "${transcript.slice(0, 600)}"

Return ONLY the re-hook text, nothing else.`

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    })
    emitUsageFromResponse('rehook', 'gemini-2.5-flash', result)
    const raw = (result.text ?? '').trim()
    const firstLine = raw.split('\n')[0].replace(/^["']|["']$/g, '').trim()
    return firstLine.length > 0 ? firstLine : getDefaultRehookPhrase(transcript)
  } catch {
    return getDefaultRehookPhrase(transcript)
  }
}
