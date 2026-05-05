/**
 * AI Segment Image Generation
 *
 * Generates contextual stock/AI images for segments whose layout category
 * requires an image (main-video-images, fullscreen-image). This is the
 * feature that makes Captions.ai output look professional — contextual images
 * paired with the speaker.
 *
 * Strategy (in priority order):
 *   1. Gemini generates a focused stock photo search query from caption text
 *   2. Pexels Photo API searches and downloads a portrait image
 *   3. Falls back to Gemini native image generation if Pexels fails or is unavailable
 *
 * Images are cached locally to avoid re-downloading for the same query.
 */

import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import * as https from 'https'
import * as http from 'http'
import { URL } from 'url'
import { callGeminiWithRetry, type GeminiCall } from './gemini-client'
import { GoogleGenAI } from '@google/genai'
import type { VideoSegment, SegmentStyleCategory } from '@shared/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SegmentImageResult {
  segmentId: string
  imagePath: string
  source: 'pexels' | 'ai-generated'
  searchQuery: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Categories that need a contextual image */
const IMAGE_CATEGORIES: Set<string> = new Set(['main-video-images', 'fullscreen-image'])

const CACHE_DIR = join(tmpdir(), 'batchcontent-segment-images')
const MAX_CACHE_SIZE_MB = 200
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }
}

function imageCacheKey(query: string): string {
  return createHash('md5').update(query.toLowerCase().trim()).digest('hex').slice(0, 16)
}

function getCachedImagePath(query: string): string {
  return join(CACHE_DIR, `${imageCacheKey(query)}.jpg`)
}

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

    const now = Date.now()
    for (const f of files) {
      if (now - f.mtime > MAX_CACHE_AGE_MS) {
        unlink(f.path).catch(() => {})
      }
    }

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
    console.warn('[Segment Images] Cache eviction error:', err)
  }
}

// ---------------------------------------------------------------------------
// HTTP download helper
// ---------------------------------------------------------------------------

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const transport = parsed.protocol === 'https:' ? https : http

    const file = createWriteStream(destPath)

    function get(currentUrl: string, redirectCount = 0): void {
      if (redirectCount > 5) {
        file.close()
        reject(new Error('Too many redirects'))
        return
      }

      const parsedUrl = new URL(currentUrl)
      const req = (parsedUrl.protocol === 'https:' ? https : http).get(currentUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          get(res.headers.location, redirectCount + 1)
          return
        }

        if (res.statusCode && res.statusCode !== 200) {
          file.close()
          reject(new Error(`HTTP ${res.statusCode} downloading ${currentUrl}`))
          return
        }

        res.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
        file.on('error', reject)
        res.on('error', reject)
      })

      req.on('error', (err) => {
        file.close()
        reject(err)
      })

      req.setTimeout(30_000, () => {
        req.destroy()
        file.close()
        reject(new Error('Download timeout'))
      })
    }

    get(url)
    void transport
  })
}

// ---------------------------------------------------------------------------
// Pexels Photo API
// ---------------------------------------------------------------------------

interface PexelsPhotoSrc {
  portrait: string
  large: string
  medium: string
}

interface PexelsPhoto {
  id: number
  width: number
  height: number
  alt: string
  src: PexelsPhotoSrc
}

interface PexelsPhotoResponse {
  total_results: number
  page: number
  per_page: number
  photos: PexelsPhoto[]
}

/**
 * Search Pexels Photos API for a portrait-oriented image matching the query.
 * Returns the direct download URL for the best portrait image, or null.
 */
async function searchPexelsPhoto(
  query: string,
  pexelsApiKey: string
): Promise<{ url: string; id: number } | null> {
  const url = new URL('https://api.pexels.com/v1/search')
  url.searchParams.set('query', query)
  url.searchParams.set('per_page', '5')
  url.searchParams.set('orientation', 'portrait')

  const response = await fetch(url.toString(), {
    headers: { Authorization: pexelsApiKey }
  })

  if (!response.ok) {
    if (response.status === 429) {
      console.warn('[Segment Images] Pexels rate limit hit')
    }
    throw new Error(`Pexels Photo API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as PexelsPhotoResponse

  if (!data.photos || data.photos.length === 0) {
    return null
  }

  // Pick a random photo from top 3 for variety
  const topN = Math.min(3, data.photos.length)
  const photo = data.photos[Math.floor(Math.random() * topN)]

  return {
    url: photo.src.portrait,
    id: photo.id
  }
}

/**
 * Download a Pexels image. Checks cache first.
 * Returns the local file path, or null on failure.
 */
async function downloadPexelsImage(
  query: string,
  pexelsApiKey: string
): Promise<{ path: string; source: 'pexels' } | null> {
  ensureCacheDir()

  const cachedPath = getCachedImagePath(query)
  if (existsSync(cachedPath)) {
    return { path: cachedPath, source: 'pexels' }
  }

  const result = await searchPexelsPhoto(query, pexelsApiKey)
  if (!result) return null

  await downloadFile(result.url, cachedPath)
  evictOldCacheEntries()

  return { path: cachedPath, source: 'pexels' }
}

// ---------------------------------------------------------------------------
// Gemini image generation fallback
// ---------------------------------------------------------------------------

const GEMINI_IMAGE_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'

const STYLE_IMAGE_GUIDANCE: Record<string, string> = {
  viral: 'Vibrant, high-contrast, bold colors, dynamic composition, eye-catching',
  educational: 'Clean, informative, flat illustration style, clear visual hierarchy',
  cinematic: 'Warm and cinematic, film grain, shallow depth of field, dramatic lighting',
  minimal: 'Minimal, clean, muted tones, lots of white space, simple composition',
  branded: 'Professional, polished, corporate aesthetic, clean lines',
  custom: 'High quality, visually appealing, balanced composition'
}

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

/**
 * Generate an image via Gemini's native image generation API.
 * Returns the local file path, or null on failure.
 */
async function generateGeminiImage(
  keyword: string,
  transcriptContext: string,
  styleCategory: string,
  geminiApiKey: string
): Promise<{ path: string; source: 'ai-generated' } | null> {
  ensureCacheDir()

  const styleGuidance = STYLE_IMAGE_GUIDANCE[styleCategory] || STYLE_IMAGE_GUIDANCE.custom

  const prompt = [
    `Create a visually compelling 9:16 vertical image that illustrates: "${keyword}".`,
    '',
    `Context: "${transcriptContext}"`,
    '',
    `Visual style: ${styleGuidance}`,
    '',
    'Requirements:',
    '- No text, words, letters, or watermarks',
    '- Photorealistic or high-quality illustration',
    '- Suitable as an overlay in a short-form vertical video',
    '- Visually interesting with a clear focal point'
  ].join('\n')

  // Check cache
  const cacheKey = imageCacheKey(`ai:${keyword}:${styleCategory}`)
  const cachedPath = join(CACHE_DIR, `${cacheKey}.png`)
  if (existsSync(cachedPath)) {
    return { path: cachedPath, source: 'ai-generated' }
  }

  const apiUrl = `${GEMINI_IMAGE_API_URL}?key=${geminiApiKey}`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '9:16' }
    }
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      console.error(`[Segment Images] Gemini image API error: ${response.status} — ${errBody}`)
      return null
    }

    const data = (await response.json()) as GeminiImageResponse

    if (data.error) {
      console.error(`[Segment Images] Gemini image API error: ${data.error.message}`)
      return null
    }

    const parts = data.candidates?.[0]?.content?.parts
    if (!parts) return null

    const imagePart = parts.find((p) => p.inlineData?.data)
    if (!imagePart?.inlineData) return null

    const buffer = Buffer.from(imagePart.inlineData.data, 'base64')
    writeFileSync(cachedPath, buffer)
    evictOldCacheEntries()

    return { path: cachedPath, source: 'ai-generated' }
  } catch (err) {
    console.error('[Segment Images] Gemini image generation failed:', err)
    return null
  }
}


/**
 * Use Gemini to generate a focused 2-4 word stock photo search query from
 * a segment's caption text. The query should find a relevant, professional
 * portrait-oriented image.
 */
async function getImageSearchQuery(
  captionText: string,
  geminiApiKey: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: geminiApiKey })
  const call: GeminiCall = {
    model: 'gemini-2.5-flash-lite',
    config: { responseMimeType: 'application/json' }
  }

  const prompt = `Given this video segment transcript: "${captionText}"

Generate a 2-4 word search query for a professional stock photo that would visually represent the topic or concept being discussed.

Rules:
- Use concrete nouns and visual concepts (e.g. "modern office workspace", "brain neural network", "mountain sunrise")
- Avoid abstract or hard-to-photograph concepts
- Prefer specific over generic (e.g. "coffee shop interior" not "business")
- The image will be used in a 9:16 vertical video as a visual aid

Return JSON: {"query": "your search query here"}`

  const text = await callGeminiWithRetry(ai, call, prompt, 'segment-images')

  try {
    const parsed = JSON.parse(text) as { query?: unknown }
    if (typeof parsed.query === 'string' && parsed.query.trim()) {
      return parsed.query.trim()
    }
  } catch {
    // Try extracting from text
    const match = text.match(/"query"\s*:\s*"([^"]+)"/)
    if (match) return match[1]
  }

  // Fallback: extract key nouns from caption
  const words = captionText.split(/\s+/).filter((w) => w.length > 3)
  return words.slice(0, 3).join(' ')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate contextual images for segments that need them.
 *
 * For each segment whose style category is `main-video-images` or
 * `fullscreen-image`:
 *   1. Use Gemini to generate a stock photo search query
 *   2. Try Pexels Photo API to find and download an image
 *   3. Fall back to Gemini image generation if Pexels unavailable
 *
 * @param segments       All segments for a clip (only image-needing ones are processed)
 * @param geminiApiKey   Gemini API key for search query generation + image fallback
 * @param pexelsApiKey   Pexels API key (optional — falls back to AI generation if absent)
 * @param outputDir      Directory to save images (uses temp cache if omitted)
 * @param styleCategory  Edit style category for AI image styling (default 'custom')
 * @returns Map of segmentId → local image file path
 */
export async function generateSegmentImages(
  segments: VideoSegment[],
  geminiApiKey: string,
  pexelsApiKey: string,
  outputDir?: string,
  styleCategory: string = 'custom'
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  // Filter to segments that need images
  const imageSegments = segments.filter(
    (s) => IMAGE_CATEGORIES.has(s.segmentStyleCategory)
  )

  if (imageSegments.length === 0) {
    return results
  }

  if (!geminiApiKey || !geminiApiKey.trim()) {
    console.warn('[Segment Images] No Gemini API key — skipping image generation')
    return results
  }

  ensureCacheDir()

  console.log(`[Segment Images] Generating images for ${imageSegments.length} segment(s)`)

  for (const segment of imageSegments) {
    try {
      // Step 1: Generate search query via Gemini
      const searchQuery = await getImageSearchQuery(segment.captionText, geminiApiKey)
      console.log(`[Segment Images] Segment "${segment.id}" → query: "${searchQuery}"`)

      let imagePath: string | null = null

      // Step 2: Try Pexels Photo API (if key available)
      if (pexelsApiKey && pexelsApiKey.trim()) {
        try {
          const pexelsResult = await downloadPexelsImage(searchQuery, pexelsApiKey)
          if (pexelsResult) {
            imagePath = pexelsResult.path
          }
        } catch (err) {
          console.warn(`[Segment Images] Pexels failed for "${searchQuery}":`, err)
        }
      }

      // Step 3: Fall back to Gemini image generation
      if (!imagePath) {
        try {
          const aiResult = await generateGeminiImage(
            searchQuery,
            segment.captionText,
            styleCategory,
            geminiApiKey
          )
          if (aiResult) {
            imagePath = aiResult.path
          }
        } catch (err) {
          console.warn(`[Segment Images] AI generation failed for "${searchQuery}":`, err)
        }
      }

      if (imagePath) {
        // If outputDir is specified, copy to a predictable name there
        if (outputDir) {
          if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true })
          }
          const destPath = join(outputDir, `segment_image_${segment.id}.jpg`)
          // Only copy if not already there (avoid overwriting)
          if (!existsSync(destPath)) {
            try {
              const { copyFileSync } = await import('fs')
              copyFileSync(imagePath, destPath)
            } catch {
              // If copy fails (e.g. different FS), just use the cached path
              results.set(segment.id, imagePath)
              continue
            }
          }
          results.set(segment.id, destPath)
        } else {
          results.set(segment.id, imagePath)
        }

        console.log(`[Segment Images] ✓ Segment "${segment.id}" → ${imagePath}`)
      } else {
        console.warn(`[Segment Images] ✗ No image found for segment "${segment.id}"`)
      }
    } catch (err) {
      console.error(`[Segment Images] Error processing segment "${segment.id}":`, err)
      // Continue with remaining segments — partial success is valuable
    }
  }

  console.log(`[Segment Images] Complete: ${results.size}/${imageSegments.length} images generated`)
  return results
}
