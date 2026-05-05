import type { KeywordAtTimestamp } from './broll-keywords'
import type { BRollVideoResult } from './broll-pexels'

export type BRollDisplayMode = 'fullscreen' | 'split-top' | 'split-bottom' | 'pip'
export type BRollTransition = 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BRollPlacement {
  /** Start time in seconds relative to clip start (0-based) */
  startTime: number
  /** Duration of the B-Roll overlay in seconds */
  duration: number
  /** Absolute path to the downloaded B-Roll video file */
  videoPath: string
  /** How the B-Roll is displayed on screen */
  displayMode: BRollDisplayMode
  /** Transition type for entry/exit */
  transition: BRollTransition
  /** PiP size as fraction of canvas width */
  pipSize: number
  /** PiP corner position */
  pipPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** The keyword used to find this clip */
  keyword: string
  /** Source of the B-Roll media: stock footage or AI-generated image */
  source?: 'stock' | 'ai-generated'
}

export interface BRollSettings {
  /** Whether B-Roll insertion is enabled */
  enabled: boolean
  /** Pexels API key */
  pexelsApiKey: string
  /** Target interval between B-Roll insertions in seconds (default: 5) */
  intervalSeconds: number
  /** Duration of each B-Roll clip in seconds (default: 3) */
  clipDuration: number
  /** Display mode. Default: 'split-top' */
  displayMode: BRollDisplayMode
  /** Transition type. Default: 'crossfade' */
  transition: BRollTransition
  /** PiP size as fraction of canvas width. Default: 0.25 */
  pipSize: number
  /** PiP corner position. Default: 'bottom-right' */
  pipPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** B-Roll source preference: 'stock' (Pexels only), 'ai-generated' (Gemini images only), or 'auto' (AI decides) */
  sourceMode?: 'stock' | 'ai-generated' | 'auto'
}

// ---------------------------------------------------------------------------
// Placement engine
// ---------------------------------------------------------------------------

/** Minimum seconds from the start of a clip before the first B-Roll can appear */
const HOOK_PROTECTION_SECONDS = 3

/** Minimum gap between the end of one B-Roll and the start of the next */
const MIN_GAP_BETWEEN_BROLL = 3

/** Minimum duration for a B-Roll clip */
const MIN_BROLL_DURATION = 1.5

/**
 * Given keyword timestamps and downloaded B-Roll clips, generate an ordered
 * list of B-Roll placements that respect retention rules:
 *
 * 1. Never overlay B-Roll in the first HOOK_PROTECTION_SECONDS (preserve the hook)
 * 2. Target: one B-Roll every `intervalSeconds` seconds
 * 3. Each B-Roll lasts `clipDuration` seconds (clamped to available clip footage)
 * 4. Minimum MIN_GAP_BETWEEN_BROLL seconds between B-Roll clips
 * 5. B-Roll must end before the clip ends
 * 6. Keywords appearing closest to a target timestamp are preferred
 */
export function buildBRollPlacements(
  clipDuration: number,
  keywords: KeywordAtTimestamp[],
  downloadedClips: Map<string, BRollVideoResult>,
  settings: BRollSettings
): BRollPlacement[] {
  if (!settings.enabled || keywords.length === 0 || downloadedClips.size === 0) {
    return []
  }

  const interval = Math.max(3, settings.intervalSeconds)
  const brollDur = Math.max(MIN_BROLL_DURATION, Math.min(6, settings.clipDuration))
  const placements: BRollPlacement[] = []

  // Build list of target timestamps (every interval seconds, starting after hook protection)
  const targetTimes: number[] = []
  let t = HOOK_PROTECTION_SECONDS + brollDur / 2 // first target
  while (t + brollDur <= clipDuration - 0.5) {
    targetTimes.push(t)
    t += interval
  }

  if (targetTimes.length === 0) return []

  // For each target timestamp, find the nearest keyword that has a downloaded clip
  let lastBRollEnd = 0

  for (const target of targetTimes) {
    // Respect minimum gap between B-Roll clips
    const earliestStart = Math.max(target - interval / 2, lastBRollEnd + MIN_GAP_BETWEEN_BROLL)
    const latestStart = Math.min(target + interval / 2, clipDuration - brollDur - 0.5)

    if (earliestStart > latestStart) continue
    if (earliestStart < HOOK_PROTECTION_SECONDS) continue

    // Find keywords closest to the target time, preferring those that have downloaded clips
    const eligibleKeywords = keywords
      .filter((kw) => downloadedClips.has(kw.keyword))
      .sort((a, b) => Math.abs(a.timestamp - target) - Math.abs(b.timestamp - target))

    const bestKeyword = eligibleKeywords[0]

    // Determine the actual start time: use keyword timestamp if it's within range,
    // otherwise clamp to the allowed window
    let startTime: number
    if (bestKeyword) {
      // Align with keyword timestamp, clamped to valid window
      startTime = Math.max(
        earliestStart,
        Math.min(latestStart, bestKeyword.timestamp - 0.5) // start 0.5s before keyword
      )
    } else {
      startTime = earliestStart
    }

    // Find clip for this keyword (or any downloaded clip if no keyword matches this window)
    const clip = bestKeyword
      ? downloadedClips.get(bestKeyword.keyword)
      : downloadedClips.values().next().value

    if (!clip) continue

    // Clamp duration to available footage and clip end
    const availableDur = Math.min(brollDur, clip.duration, clipDuration - startTime - 0.5)
    if (availableDur < MIN_BROLL_DURATION) continue

    placements.push({
      startTime,
      duration: availableDur,
      videoPath: clip.filePath,
      keyword: clip.keyword,
      displayMode: settings.displayMode,
      transition: settings.transition,
      pipSize: settings.pipSize,
      pipPosition: settings.pipPosition
    })

    lastBRollEnd = startTime + availableDur
  }

  return placements
}

/**
 * Build a simple time-based placement schedule when no keyword information
 * is available (fallback mode: evenly space B-Roll clips throughout the clip).
 */
export function buildSimpleBRollPlacements(
  clipDuration: number,
  downloadedClips: BRollVideoResult[],
  settings: BRollSettings
): BRollPlacement[] {
  if (!settings.enabled || downloadedClips.length === 0) return []

  const interval = Math.max(3, settings.intervalSeconds)
  const brollDur = Math.max(MIN_BROLL_DURATION, Math.min(6, settings.clipDuration))
  const placements: BRollPlacement[] = []

  let clipIdx = 0
  let t = HOOK_PROTECTION_SECONDS
  let lastEnd = 0

  while (t + brollDur <= clipDuration - 0.5 && clipIdx < downloadedClips.length) {
    if (t < lastEnd + MIN_GAP_BETWEEN_BROLL) {
      t = lastEnd + MIN_GAP_BETWEEN_BROLL
      continue
    }

    const clip = downloadedClips[clipIdx % downloadedClips.length]
    const availableDur = Math.min(brollDur, clip.duration, clipDuration - t - 0.5)

    if (availableDur < MIN_BROLL_DURATION) break

    placements.push({
      startTime: t,
      duration: availableDur,
      videoPath: clip.filePath,
      keyword: clip.keyword,
      displayMode: settings.displayMode,
      transition: settings.transition,
      pipSize: settings.pipSize,
      pipPosition: settings.pipPosition
    })

    lastEnd = t + availableDur
    t += interval
    clipIdx++
  }

  return placements
}
