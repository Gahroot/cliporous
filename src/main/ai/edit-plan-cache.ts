// ---------------------------------------------------------------------------
// Edit Plan Cache — persistent file-based cache for AI edit plan results
//
// Avoids redundant Gemini API calls when the same clip + style preset is
// processed multiple times.  Cache key is a SHA-256 hash of:
//
//   transcript words (text + timing) + clip boundaries + style preset ID
//
// Storage: one JSON file per cached plan in app.getPath('userData')/edit-plan-cache/
// Eviction: LRU by mtime, max 50 MB total, max 30 days age.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { createHash } from 'crypto'
import type { AIEditPlan, WordTimestamp } from '@shared/types'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CACHE_DIR_NAME = 'edit-plan-cache'
const MAX_CACHE_SIZE_MB = 50
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function getCacheDir(): string {
  return join(app.getPath('userData'), CACHE_DIR_NAME)
}

function ensureCacheDir(): string {
  const dir = getCacheDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

// ---------------------------------------------------------------------------
// Cache key generation
// ---------------------------------------------------------------------------

/**
 * Build a stable cache key from the inputs that uniquely determine an edit plan.
 *
 * The key is a SHA-256 hash of:
 *   - The word timestamps within the clip range (text + start + end)
 *   - The clip start/end boundaries (as precise floats)
 *   - The style preset ID
 *
 * Changes to any of these produce a different key → cache miss → fresh API call.
 */
export function buildEditPlanCacheKey(
  words: WordTimestamp[],
  clipStart: number,
  clipEnd: number,
  stylePresetId: string
): string {
  // Filter words to clip range (same logic as formatWordsForPrompt in edit-plan.ts)
  const clippedWords = words
    .filter((w) => w.start >= clipStart - 0.1 && w.end <= clipEnd + 0.1)
    .map((w) => `${w.text}|${w.start.toFixed(3)}|${w.end.toFixed(3)}`)
    .join(',')

  const raw = `words:${clippedWords}|start:${clipStart}|end:${clipEnd}|style:${stylePresetId}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 24)
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

export interface CachedEditPlan {
  /** The cache key this entry was stored under. */
  cacheKey: string
  /** The full AI edit plan. */
  plan: AIEditPlan
  /** ISO timestamp when the cache entry was written. */
  cachedAt: string
}

/**
 * Look up a cached edit plan. Returns `undefined` on miss.
 */
export function getCachedEditPlan(cacheKey: string): AIEditPlan | undefined {
  const filePath = join(getCacheDir(), `${cacheKey}.json`)
  if (!existsSync(filePath)) return undefined

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const entry: CachedEditPlan = JSON.parse(raw)
    return entry.plan
  } catch {
    // Corrupt file — treat as miss
    return undefined
  }
}

/**
 * Store an edit plan in the cache.
 */
export function setCachedEditPlan(cacheKey: string, plan: AIEditPlan): void {
  const dir = ensureCacheDir()
  const entry: CachedEditPlan = {
    cacheKey,
    plan,
    cachedAt: new Date().toISOString()
  }
  const filePath = join(dir, `${cacheKey}.json`)
  writeFileSync(filePath, JSON.stringify(entry), 'utf-8')
}

// ---------------------------------------------------------------------------
// Eviction
// ---------------------------------------------------------------------------

/**
 * Evict stale entries and trim cache to size limit.
 * Called opportunistically after writes.
 */
export function evictEditPlanCache(): void {
  const dir = getCacheDir()
  if (!existsSync(dir)) return

  try {
    const now = Date.now()
    const files: { path: string; mtime: number; size: number }[] = []

    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      const fullPath = join(dir, name)
      try {
        const s = statSync(fullPath)
        // Delete entries older than MAX_CACHE_AGE_MS
        if (now - s.mtimeMs > MAX_CACHE_AGE_MS) {
          unlinkSync(fullPath)
        } else {
          files.push({ path: fullPath, mtime: s.mtimeMs, size: s.size })
        }
      } catch {
        // File disappeared or unreadable — skip
      }
    }

    // Check total size and evict oldest until under limit
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
    const maxBytes = MAX_CACHE_SIZE_MB * 1024 * 1024

    if (totalBytes > maxBytes) {
      const sorted = [...files].sort((a, b) => a.mtime - b.mtime)
      let running = totalBytes
      for (const f of sorted) {
        if (running <= maxBytes) break
        try { unlinkSync(f.path) } catch { /* ignore */ }
        running -= f.size
      }
    }
  } catch (err) {
    console.warn('[EditPlanCache] Eviction error:', err)
  }
}

/**
 * Clear the entire edit plan cache. Returns number of entries removed.
 */
export function clearEditPlanCache(): number {
  const dir = getCacheDir()
  if (!existsSync(dir)) return 0

  let removed = 0
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      try {
        unlinkSync(join(dir, name))
        removed++
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return removed
}

/**
 * Get the total size of the edit plan cache in bytes.
 */
export function getEditPlanCacheSize(): number {
  const dir = getCacheDir()
  if (!existsSync(dir)) return 0

  let bytes = 0
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      try {
        const s = statSync(join(dir, name))
        bytes += s.size
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return bytes
}
