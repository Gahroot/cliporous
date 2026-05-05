import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import * as https from 'https'
import * as http from 'http'
import { URL } from 'url'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PexelsVideoFile {
  id: number
  quality: string
  file_type: string
  width: number | null
  height: number | null
  fps: number | null
  link: string
}

interface PexelsVideo {
  id: number
  width: number
  height: number
  duration: number
  video_files: PexelsVideoFile[]
}

interface PexelsSearchResponse {
  total_results: number
  page: number
  per_page: number
  videos: PexelsVideo[]
}

export interface BRollVideoResult {
  /** Local file path to the cached downloaded clip */
  filePath: string
  /** Duration of the clip in seconds */
  duration: number
  /** The keyword used to find this clip */
  keyword: string
  /** Pexels video ID */
  pexelsId: number
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

const CACHE_DIR = join(tmpdir(), 'batchcontent-broll-cache')
const MAX_CACHE_SIZE_MB = 500
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }
}

function cacheKey(keyword: string, pexelsId: number): string {
  return createHash('md5').update(`${keyword}-${pexelsId}`).digest('hex').slice(0, 16)
}

function getCachedPath(keyword: string, pexelsId: number): string {
  return join(CACHE_DIR, `${cacheKey(keyword, pexelsId)}.mp4`)
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
      // Sort by oldest first and delete until under limit
      const sorted = [...files].sort((a, b) => a.mtime - b.mtime)
      let running = totalBytes
      for (const f of sorted) {
        if (running <= maxBytes) break
        unlink(f.path).catch(() => {})
        running -= f.size
      }
    }
  } catch (err) {
    console.warn('[B-Roll] Cache eviction error:', err)
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
          // Follow redirect
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

    // Silence unused transport variable (needed for protocol detection at call site)
    void transport
  })
}

// ---------------------------------------------------------------------------
// Pexels API search
// ---------------------------------------------------------------------------

const PEXELS_API_BASE = 'https://api.pexels.com/videos/search'

/**
 * Score a Pexels video file for suitability as 9:16 B-Roll:
 * - Prefer portrait (9:16) or square orientation
 * - Prefer HD quality
 * - Prefer smaller file sizes (sd/hd over 4k)
 */
function scoreVideoFile(file: PexelsVideoFile): number {
  let score = 0

  // Quality preference: hd > sd > 4k (4k is too large to download quickly)
  if (file.quality === 'hd') score += 30
  else if (file.quality === 'sd') score += 20
  else if (file.quality === 'uhd' || file.quality === '4k') score += 5

  // Orientation preference
  if (file.width && file.height) {
    const aspect = file.width / file.height
    if (aspect <= 0.7) score += 20 // portrait
    else if (aspect <= 1.1) score += 10 // square
    // landscape gets no bonus — it will be cropped to fill 9:16
  }

  return score
}

function selectBestVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | null {
  if (files.length === 0) return null

  const mp4Files = files.filter((f) => f.file_type === 'video/mp4')
  const candidates = mp4Files.length > 0 ? mp4Files : files

  return candidates.reduce((best, f) => (scoreVideoFile(f) >= scoreVideoFile(best) ? f : best))
}

async function searchPexels(
  keyword: string,
  apiKey: string,
  minDurationSeconds: number,
  maxDurationSeconds: number
): Promise<PexelsVideo[]> {
  const url = new URL(PEXELS_API_BASE)
  url.searchParams.set('query', keyword)
  url.searchParams.set('per_page', '8')
  url.searchParams.set('size', 'small')

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey
    }
  })

  if (!response.ok) {
    throw new Error(`Pexels API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as PexelsSearchResponse

  // Filter to suitable durations
  return data.videos.filter(
    (v) => v.duration >= minDurationSeconds && v.duration <= maxDurationSeconds + 2
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search Pexels for a B-Roll clip matching the keyword, download it to
 * the local cache, and return the cached file path + metadata.
 *
 * Returns null if no suitable clip is found or if download fails.
 *
 * @param keyword         Search query (e.g. "laptop", "coffee shop")
 * @param pexelsApiKey    Pexels API key
 * @param clipDuration    How long the B-Roll clip should be (seconds, 2–6)
 */
export async function fetchBRollClip(
  keyword: string,
  pexelsApiKey: string,
  clipDuration: number
): Promise<BRollVideoResult | null> {
  if (!pexelsApiKey) {
    console.warn('[B-Roll] No Pexels API key configured — skipping B-Roll fetch')
    return null
  }

  ensureCacheDir()

  const minDuration = Math.max(2, clipDuration - 1)
  const maxDuration = Math.min(30, clipDuration + 4)

  try {
    const videos = await searchPexels(keyword, pexelsApiKey, minDuration, maxDuration)

    if (videos.length === 0) {
      console.log(`[B-Roll] No Pexels results for "${keyword}"`)
      return null
    }

    // Pick a random video from the top 3 results for variety
    const topN = Math.min(3, videos.length)
    const video = videos[Math.floor(Math.random() * topN)]

    const bestFile = selectBestVideoFile(video.video_files)
    if (!bestFile) {
      console.log(`[B-Roll] No suitable video file for "${keyword}"`)
      return null
    }

    // Check cache first
    const cachedPath = getCachedPath(keyword, video.id)
    if (existsSync(cachedPath)) {
      console.log(`[B-Roll] Cache hit for "${keyword}" (pexels:${video.id})`)
      return {
        filePath: cachedPath,
        duration: video.duration,
        keyword,
        pexelsId: video.id
      }
    }

    // Download to cache
    console.log(`[B-Roll] Downloading "${keyword}" from Pexels (${bestFile.quality}, ${video.duration}s)`)
    await downloadFile(bestFile.link, cachedPath)

    // Opportunistically clean up old cache entries
    evictOldCacheEntries()

    return {
      filePath: cachedPath,
      duration: video.duration,
      keyword,
      pexelsId: video.id
    }
  } catch (err) {
    console.error(`[B-Roll] Failed to fetch clip for "${keyword}":`, err)
    return null
  }
}

/**
 * Fetch multiple B-Roll clips for a list of keywords in parallel (max 4 concurrent).
 * Keywords that fail to resolve are skipped gracefully.
 */
export async function fetchBRollClips(
  keywords: string[],
  pexelsApiKey: string,
  clipDuration: number
): Promise<Map<string, BRollVideoResult>> {
  const results = new Map<string, BRollVideoResult>()
  const CONCURRENCY = 4

  for (let i = 0; i < keywords.length; i += CONCURRENCY) {
    const batch = keywords.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(
      batch.map((kw) => fetchBRollClip(kw, pexelsApiKey, clipDuration))
    )

    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        results.set(batch[idx], result.value)
      }
    })
  }

  return results
}
