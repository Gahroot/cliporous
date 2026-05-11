/**
 * AI B-Roll Image Generation via Gemini
 *
 * Generates contextual images for B-Roll overlays using Gemini's native
 * image generation (gemini-2.5-flash-image). Uses REST API directly since
 * the project's @google/genai SDK doesn't support responseModalities: ['IMAGE'].
 *
 * Images are cached locally (same pattern as broll-pexels.ts) to avoid
 * regenerating identical requests.
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { OUTPUT_WIDTH, OUTPUT_HEIGHT } from './aspect-ratios'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BRollImageResult {
  /** Absolute path to the cached PNG file */
  filePath: string
  /** Original keyword used for generation */
  keyword: string
  /** Image width in pixels */
  width: number
  /** Image height in pixels */
  height: number
  /** Source identifier */
  source: 'ai-generated'
}

// ---------------------------------------------------------------------------
// Style-aware prompt guidance
// ---------------------------------------------------------------------------

const STYLE_IMAGE_GUIDANCE: Record<string, string> = {
  viral: 'Vibrant, high-contrast, bold colors, dynamic composition, eye-catching, social media aesthetic',
  educational: 'Clean, informative, flat illustration style, clear visual hierarchy, infographic-like',
  cinematic: 'Warm and cinematic, film grain, shallow depth of field, dramatic lighting, golden hour tones',
  minimal: 'Minimal, clean, muted tones, lots of white space, simple geometric composition',
  branded: 'Professional, polished, corporate aesthetic, clean lines, balanced composition',
  custom: 'High quality, visually appealing, balanced composition'
}

// ---------------------------------------------------------------------------
// Cache management (mirrors broll-pexels.ts)
// ---------------------------------------------------------------------------

const CACHE_DIR = join(tmpdir(), 'batchcontent-broll-image-cache')
const MAX_CACHE_SIZE_MB = 500
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }
}

function imageCacheKey(keyword: string, transcriptContext: string, styleCategory: string): string {
  return createHash('md5')
    .update(`${keyword}|${transcriptContext}|${styleCategory}`)
    .digest('hex')
    .slice(0, 20)
}

function getCachedImagePath(keyword: string, transcriptContext: string, styleCategory: string): string {
  return join(CACHE_DIR, `${imageCacheKey(keyword, transcriptContext, styleCategory)}.png`)
}

/** Evict oldest files when cache exceeds MAX_CACHE_SIZE_MB */
function evictOldCacheEntries(): void {
  try {
    if (!existsSync(CACHE_DIR)) return

    const files = readdirSync(CACHE_DIR)
      .map((f) => {
        const full = join(CACHE_DIR, f)
        try {
          const s = statSync(full)
          return { path: full, mtime: s.mtimeMs, size: s.size }
        } catch {
          return null
        }
      })
      .filter(Boolean) as { path: string; mtime: number; size: number }[]

    // Remove files older than MAX_CACHE_AGE_MS
    const now = Date.now()
    for (const f of files) {
      if (now - f.mtime > MAX_CACHE_AGE_MS) {
        unlink(f.path).catch(() => {})
      }
    }

    // Check total size
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
    const maxBytes = MAX_CACHE_SIZE_MB * 1024 * 1024

    if (totalBytes > maxBytes) {
      const sorted = [...files].sort((a, b) => a.mtime - b.mtime)
      let running = totalBytes
      for (const f of sorted) {
        if (running <= maxBytes) break
        unlink(f.path).catch(() => {})
        running -= f.size
      }
    }
  } catch (err) {
    console.warn('[B-Roll Image] Cache eviction error:', err)
  }
}

// ---------------------------------------------------------------------------
// Gemini REST API helpers
// ---------------------------------------------------------------------------

const GEMINI_IMAGE_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'

interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        inlineData?: {
          mimeType: string
          data: string
        }
      }>
    }
  }>
  error?: {
    code: number
    message: string
    status: string
  }
}

function classifyGeminiError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err)
  const status = (err as { status?: number })?.status

  if (status === 401 || status === 403 || /api.key/i.test(msg)) {
    throw new Error('Invalid Gemini API key. Check your key in Settings.')
  }
  if (status === 429 || /resource.exhausted|rate.limit|quota/i.test(msg)) {
    throw new Error('Gemini API rate limit exceeded. Please wait and try again.')
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg)) {
    throw new Error('Network error: cannot reach Gemini API. Check your internet connection.')
  }
  throw err
}

async function callGeminiImageApi(
  prompt: string,
  geminiApiKey: string
): Promise<Buffer> {
  const url = `${GEMINI_IMAGE_API_URL}?key=${geminiApiKey}`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '9:16' }
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    const error = new Error(`Gemini Image API error: ${response.status} ${response.statusText} — ${errBody}`)
    ;(error as unknown as { status: number }).status = response.status
    throw error
  }

  const data = (await response.json()) as GeminiImageResponse

  if (data.error) {
    const error = new Error(`Gemini Image API error: ${data.error.message}`)
    ;(error as unknown as { status: number }).status = data.error.code
    throw error
  }

  // Extract base64 image from response
  const parts = data.candidates?.[0]?.content?.parts
  if (!parts) {
    throw new Error('Gemini Image API returned empty response — no candidates')
  }

  const imagePart = parts.find((p) => p.inlineData?.data)
  if (!imagePart?.inlineData) {
    throw new Error('Gemini Image API returned no image data')
  }

  return Buffer.from(imagePart.inlineData.data, 'base64')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a style-aware image generation prompt.
 */
export function buildImagePrompt(
  keyword: string,
  transcriptContext: string,
  styleCategory: string
): string {
  const styleGuidance = STYLE_IMAGE_GUIDANCE[styleCategory] || STYLE_IMAGE_GUIDANCE.custom

  return [
    `Create a visually compelling 9:16 vertical image that illustrates the concept: "${keyword}".`,
    '',
    `Context from the video transcript: "${transcriptContext}"`,
    '',
    `Visual style: ${styleGuidance}`,
    '',
    'Requirements:',
    '- No text, words, letters, or watermarks in the image',
    '- Photorealistic or high-quality illustration style',
    '- Suitable as a brief B-Roll overlay in a short-form vertical video',
    '- Visually interesting and attention-grabbing',
    '- Clean composition with a clear focal point'
  ].join('\n')
}

/**
 * Generate a single AI B-Roll image via Gemini.
 *
 * @param keyword           Visual concept to illustrate (e.g. "revenue chart", "brain neurons")
 * @param transcriptContext Short excerpt of transcript around the B-Roll moment
 * @param styleCategory     Edit style category for visual consistency
 * @param geminiApiKey      Gemini API key
 * @returns BRollImageResult with cached file path, or null if generation fails
 */
export async function generateBRollImage(
  keyword: string,
  transcriptContext: string,
  styleCategory: string,
  geminiApiKey: string
): Promise<BRollImageResult | null> {
  if (!geminiApiKey) {
    console.warn('[B-Roll Image] No Gemini API key configured — skipping image generation')
    return null
  }

  ensureCacheDir()

  // Check cache first
  const cachedPath = getCachedImagePath(keyword, transcriptContext, styleCategory)
  if (existsSync(cachedPath)) {
    console.log(`[B-Roll Image] Cache hit for "${keyword}"`)
    return {
      filePath: cachedPath,
      keyword,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      source: 'ai-generated'
    }
  }

  const prompt = buildImagePrompt(keyword, transcriptContext, styleCategory)

  // Attempt with retry (same pattern as broll-ai-placement.ts)
  let imageBuffer: Buffer
  try {
    imageBuffer = await callGeminiImageApi(prompt, geminiApiKey)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = (err as { status?: number })?.status
    const isTransient =
      status === 429 ||
      /resource.exhausted|rate.limit|quota/i.test(msg) ||
      /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg)

    if (isTransient) {
      console.log(`[B-Roll Image] Transient error for "${keyword}", retrying in 2s...`)
      await new Promise((r) => setTimeout(r, 2000))
      try {
        imageBuffer = await callGeminiImageApi(prompt, geminiApiKey)
      } catch (retryErr) {
        console.error(`[B-Roll Image] Retry failed for "${keyword}":`, retryErr)
        return null
      }
    } else {
      console.error(`[B-Roll Image] Generation failed for "${keyword}":`, err)
      return null
    }
  }

  // Save to cache
  try {
    writeFileSync(cachedPath, imageBuffer)
    console.log(`[B-Roll Image] Generated and cached "${keyword}" (${imageBuffer.length} bytes)`)
  } catch (writeErr) {
    console.error(`[B-Roll Image] Failed to write cache for "${keyword}":`, writeErr)
    return null
  }

  // Opportunistically clean up old cache entries
  evictOldCacheEntries()

  return {
    filePath: cachedPath,
    keyword,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    source: 'ai-generated'
  }
}

/**
 * Generate AI B-Roll images for multiple keywords in parallel (max 3 concurrent).
 * Keywords that fail are skipped gracefully.
 */
export async function generateBRollImages(
  requests: Array<{ keyword: string; transcriptContext: string }>,
  styleCategory: string,
  geminiApiKey: string
): Promise<Map<string, BRollImageResult>> {
  const results = new Map<string, BRollImageResult>()
  const CONCURRENCY = 3

  for (let i = 0; i < requests.length; i += CONCURRENCY) {
    const batch = requests.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(
      batch.map((req) => generateBRollImage(req.keyword, req.transcriptContext, styleCategory, geminiApiKey))
    )

    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        results.set(batch[idx].keyword, result.value)
      }
    })
  }

  return results
}
