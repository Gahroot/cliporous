import { GoogleGenAI } from '@google/genai'
import { writeFileSync } from 'fs'
import { join, basename, extname } from 'path'
import { callGeminiWithRetry } from './gemini-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlatformDescription {
  platform: 'youtube-shorts' | 'instagram-reels' | 'tiktok'
  text: string
  hashtags: string[]
}

export interface ClipDescription {
  /** ≤100-char hook description tuned for YouTube Shorts. NOT a summary — a hook. */
  shortDescription: string
  /** ONE niche-specific hashtag (no leading #, e.g. "productivityhack") */
  hashtag: string
  /** Slightly longer variant for platforms with more character space */
  longDescription?: string
  /** Per-platform ready-to-paste text with hashtags */
  platforms: PlatformDescription[]
}

/** Minimal clip info needed for description generation */
export interface DescriptionClipInput {
  /** Transcript text for this clip segment */
  transcript: string
  /** AI-generated hook/title text (e.g. "You won't believe this trick") */
  hookText?: string
  /** Why this segment was chosen (from scoring) */
  reasoning?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callGeminiJSON<T>(apiKey: string, prompt: string, usageSource: string): Promise<T> {
  const ai = new GoogleGenAI({ apiKey })
  const text = await callGeminiWithRetry(
    ai,
    { model: 'gemini-2.5-flash-lite', config: { responseMimeType: 'application/json' } },
    prompt,
    usageSource
  )

  try {
    return JSON.parse(text) as T
  } catch {
    const match = text.match(/[\[{][\s\S]*[\]}]/)
    if (!match) throw new Error('Gemini returned an unparseable JSON response')
    return JSON.parse(match[0]) as T
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const DESCRIPTION_SYSTEM_PROMPT = `You are an expert short-form content strategist specializing in YouTube Shorts, Instagram Reels, and TikTok SEO and discoverability.

Your task is to write scroll-stopping descriptions and hyper-targeted hashtags for short video clips.

DESCRIPTION RULES:
- The "short" description must be UNDER 100 characters — ideal for YouTube Shorts where space is minimal
- It must be a HOOK, NOT a summary. Examples of hooks:
  * "This trick saved me 3 hours a day"
  * "Nobody told me this about money"
  * "The real reason everyone's struggling with this"
  * "Stop doing this — you're doing it wrong"
- Hooks should create curiosity, controversy, FOMO, or deliver an immediate value promise
- Write in first person or direct address — feel native and authentic
- NO hashtags in the short description

HASHTAG RULES:
- Pick ONE strategic, niche-specific hashtag (no # prefix in the JSON)
- NOT generic tags like "fyp", "viral", "trending", "shorts"
- Pick a hashtag the content's specific community actually uses
- Examples: "productivityhack", "learntocode", "personalfinance", "liftheavy", "cookingisfun"
- Think: what YouTube/TikTok community would this clip serve?

LONG DESCRIPTION (for Instagram / TikTok where more text shows):
- Expand the short hook with 1 extra sentence of context or intrigue — max 150 chars total
- Can add an emoji at the end
- Still hook-style, not a summary

Return valid JSON.`

interface RawClipDescriptionResponse {
  short_description?: unknown
  hashtag?: unknown
  long_description?: unknown
}

interface RawBatchResponse {
  clips?: unknown[]
}

function parseRawDescription(raw: RawClipDescriptionResponse, fallbackTranscript: string): ClipDescription {
  const shortDescription =
    typeof raw.short_description === 'string' && raw.short_description.trim().length > 0
      ? raw.short_description.trim()
      : fallbackTranscript.split(' ').slice(0, 10).join(' ')

  const rawHashtag = typeof raw.hashtag === 'string' ? raw.hashtag.trim() : ''
  // Strip leading # if the AI included it despite instructions
  const hashtag = rawHashtag.replace(/^#/, '') || 'shorts'

  const longDescription =
    typeof raw.long_description === 'string' && raw.long_description.trim().length > 0
      ? raw.long_description.trim()
      : undefined

  return buildClipDescription(shortDescription, hashtag, longDescription)
}

/**
 * Assemble a ClipDescription from its parts, generating all platform variants.
 */
function buildClipDescription(
  shortDescription: string,
  hashtag: string,
  longDescription?: string
): ClipDescription {
  const tag = `#${hashtag}`

  const platforms: PlatformDescription[] = [
    {
      platform: 'youtube-shorts',
      text: `${shortDescription}\n${tag}`,
      hashtags: [hashtag]
    },
    {
      platform: 'instagram-reels',
      text: longDescription
        ? `${longDescription}\n${tag} #reels`
        : `${shortDescription}\n${tag} #reels`,
      hashtags: [hashtag, 'reels']
    },
    {
      platform: 'tiktok',
      text: longDescription
        ? `${longDescription} ${tag}`
        : `${shortDescription} ${tag}`,
      hashtags: [hashtag]
    }
  ]

  return {
    shortDescription,
    hashtag,
    longDescription,
    platforms
  }
}

// ---------------------------------------------------------------------------
// generateClipDescription — single clip
// ---------------------------------------------------------------------------

export async function generateClipDescription(
  apiKey: string,
  transcript: string,
  clipContext?: string,
  hookTitle?: string
): Promise<ClipDescription> {
  const contextHints: string[] = []
  if (hookTitle) contextHints.push(`Hook text: "${hookTitle}"`)
  if (clipContext) contextHints.push(`Context: ${clipContext}`)

  const prompt = `${DESCRIPTION_SYSTEM_PROMPT}

Generate a description and hashtag for this short-form video clip.
${contextHints.length > 0 ? contextHints.join('\n') + '\n' : ''}
Transcript:
"${transcript}"

Return JSON with exactly this structure:
{
  "short_description": "...",
  "hashtag": "...",
  "long_description": "..."
}`

  const raw = await callGeminiJSON<RawClipDescriptionResponse>(apiKey, prompt, 'descriptions')
  return parseRawDescription(raw, transcript)
}

// ---------------------------------------------------------------------------
// generateBatchDescriptions — all clips in one AI call
// ---------------------------------------------------------------------------

export async function generateBatchDescriptions(
  apiKey: string,
  clips: DescriptionClipInput[]
): Promise<ClipDescription[]> {
  if (clips.length === 0) return []

  const clipsJSON = clips.map((c, i) => ({
    index: i,
    transcript: c.transcript.slice(0, 500), // cap to avoid token bloat
    hook_text: c.hookText ?? null,
    reasoning: c.reasoning ?? null
  }))

  const prompt = `${DESCRIPTION_SYSTEM_PROMPT}

Generate descriptions and hashtags for ${clips.length} short-form video clips in one batch.

Clips:
${JSON.stringify(clipsJSON, null, 2)}

Return JSON with this exact structure:
{
  "clips": [
    {
      "short_description": "...",
      "hashtag": "...",
      "long_description": "..."
    }
  ]
}

The "clips" array MUST have exactly ${clips.length} elements in the same order as the input.`

  const raw = await callGeminiJSON<RawBatchResponse>(apiKey, prompt, 'descriptions')
  const rawClips = Array.isArray(raw.clips) ? raw.clips : []

  return clips.map((clip, i) => {
    const rawClip = (rawClips[i] ?? {}) as RawClipDescriptionResponse
    return parseRawDescription(rawClip, clip.transcript)
  })
}

// ---------------------------------------------------------------------------
// writeDescriptionFile — write .txt alongside the rendered clip
// ---------------------------------------------------------------------------

/**
 * Write a .txt description file next to the rendered clip.
 * Returns the absolute path to the written file.
 *
 * File name: same base name as the clip but with .txt extension.
 * E.g. clip_001.mp4 → clip_001.txt
 */
export function writeDescriptionFile(
  outputDir: string,
  clipFilename: string,
  description: ClipDescription
): string {
  const base = basename(clipFilename, extname(clipFilename))
  const outputPath = join(outputDir, `${base}.txt`)

  const yt = description.platforms.find((p) => p.platform === 'youtube-shorts')
  const ig = description.platforms.find((p) => p.platform === 'instagram-reels')
  const tt = description.platforms.find((p) => p.platform === 'tiktok')

  const lines: string[] = [
    '[YouTube Shorts]',
    yt?.text ?? `${description.shortDescription}\n#${description.hashtag}`,
    '',
    '[Instagram Reels]',
    ig?.text ?? `${description.shortDescription}\n#${description.hashtag}`,
    '',
    '[TikTok]',
    tt?.text ?? `${description.shortDescription} #${description.hashtag}`
  ]

  writeFileSync(outputPath, lines.join('\n'), 'utf-8')
  return outputPath
}
