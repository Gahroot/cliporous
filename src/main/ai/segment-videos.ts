/**
 * AI Segment Video Generation
 *
 * Fetches contextual b-roll videos from Pexels for segments whose archetype
 * needs media (split-image, fullscreen-image). The companion of segment-images
 * — but pulls real video clips instead of stills.
 *
 * Strategy:
 *   1. Gemini generates a focused 2–4 word stock-search query from the
 *      segment's caption text (reused from segment-images.ts). If no Gemini
 *      key is available, falls back to a keyword heuristic.
 *   2. fetchBRollClip() searches the Pexels video API and downloads the best
 *      mp4 into the shared b-roll cache. Orientation is requested 'portrait'
 *      for fullscreen-image segments so the crop loses less of the frame.
 *
 * No AI-generation fallback: when Pexels has no result, the segment is left
 * unfilled and the render pipeline degrades gracefully to talking-head.
 */

import type { VideoSegment } from '@shared/types'
import { fetchBRollClip } from '../broll-pexels'
import { getImageSearchQuery } from './segment-images'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SegmentVideoResult {
  segmentId: string
  videoPath: string
  source: 'pexels'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Categories that need a contextual b-roll video. */
const VIDEO_CATEGORIES: Set<string> = new Set(['main-video-images', 'fullscreen-image'])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fallback heuristic when no Gemini key is available: pick the longest
 * concrete-looking words from the caption.
 */
function fallbackSearchQuery(captionText: string): string {
  const STOPWORDS = new Set([
    'this', 'that', 'they', 'them', 'with', 'have', 'will', 'from', 'your',
    'about', 'just', 'like', 'what', 'when', 'where', 'which', 'their',
    'there', 'would', 'could', 'should', 'really', 'going', 'because',
    'thing', 'things', 'know', 'into', 'than', 'then', 'some', 'more',
    'much', 'very', 'been', 'were', 'also'
  ])
  const words = captionText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  return words.slice(0, 3).join(' ') || captionText.split(/\s+/).slice(0, 3).join(' ')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch contextual b-roll videos for segments that need them.
 *
 * @param segments        All segments for a clip (only video-needing ones are processed)
 * @param pexelsApiKey    Pexels API key — required; if absent, returns empty map
 * @param geminiApiKey    Gemini API key — optional, used for query refinement
 * @param defaultDuration Seed search duration in seconds (per-segment override
 *                        uses the segment's own duration)
 * @returns Map of segmentId → local mp4 path
 */
export async function fetchSegmentVideos(
  segments: VideoSegment[],
  pexelsApiKey: string,
  geminiApiKey: string,
  defaultDuration: number = 4
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  if (!pexelsApiKey || !pexelsApiKey.trim()) {
    console.warn('[Segment Videos] No Pexels API key — skipping b-roll video fetch')
    return results
  }

  const videoSegments = segments.filter((s) => VIDEO_CATEGORIES.has(s.segmentStyleCategory))
  if (videoSegments.length === 0) return results

  console.log(`[Segment Videos] Fetching b-roll for ${videoSegments.length} segment(s)`)

  for (const segment of videoSegments) {
    try {
      // Resolve search query. Gemini-refined when available, heuristic otherwise.
      let searchQuery: string
      if (geminiApiKey && geminiApiKey.trim()) {
        try {
          searchQuery = await getImageSearchQuery(segment.captionText, geminiApiKey)
        } catch (err) {
          console.warn(`[Segment Videos] Gemini query failed for "${segment.id}":`, err)
          searchQuery = fallbackSearchQuery(segment.captionText)
        }
      } else {
        searchQuery = fallbackSearchQuery(segment.captionText)
      }

      const segDuration =
        Math.max(2, segment.endTime - segment.startTime) || defaultDuration
      const orientation =
        segment.segmentStyleCategory === 'fullscreen-image' ? 'portrait' : undefined

      console.log(`[Segment Videos] Segment "${segment.id}" → query: "${searchQuery}"`)

      const clip = await fetchBRollClip(searchQuery, pexelsApiKey, segDuration, orientation)
      if (clip) {
        results.set(segment.id, clip.filePath)
        console.log(`[Segment Videos] ✓ Segment "${segment.id}" → ${clip.filePath}`)
      } else {
        console.warn(`[Segment Videos] ✗ No Pexels result for segment "${segment.id}"`)
      }
    } catch (err) {
      console.error(`[Segment Videos] Error processing segment "${segment.id}":`, err)
      // Partial success is valuable — continue with remaining segments.
    }
  }

  console.log(
    `[Segment Videos] Complete: ${results.size}/${videoSegments.length} videos fetched`
  )
  return results
}
