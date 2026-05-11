// ---------------------------------------------------------------------------
// Segment splitting + deterministic archetype assignment
//
// Lives under src/shared/ so both the renderer (segmenting pipeline stage)
// and the main process (render pipeline) can call into it without an IPC
// round-trip. No AI, no network, no Node-only imports — pure TypeScript on
// top of `@shared/types`.
// ---------------------------------------------------------------------------

import type {
  WordTimestamp,
  VideoSegment,
  Archetype,
  SegmentStyleCategory,
} from './types'

// ---------------------------------------------------------------------------
// UUID — works in both renderer (Web Crypto) and Node ≥19 via globalThis
// ---------------------------------------------------------------------------

function uuid(): string {
  // globalThis.crypto.randomUUID() is available in:
  //   - Electron renderer (Web Crypto API)
  //   - Node ≥19 (web-compatible crypto on globalThis)
  return globalThis.crypto.randomUUID()
}

// ---------------------------------------------------------------------------
// Splitting configuration
// ---------------------------------------------------------------------------

const MIN_SEGMENT_DURATION = 2
const MAX_SEGMENT_DURATION = 5
const DEFAULT_TARGET_DURATION = 3
const PAUSE_THRESHOLD = 0.3

// ---------------------------------------------------------------------------
// Archetype lookup tables
//
// Inlined from src/main/edit-styles/shared/archetypes.ts so this module has
// no dependency on main-process code. Keep the two in sync — both ultimately
// describe the same 7 stable archetypes the edit-styles registry implements.
// ---------------------------------------------------------------------------

const ARCHETYPE_TO_CATEGORY: Record<Archetype, SegmentStyleCategory> = {
  'talking-head': 'main-video',
  'tight-punch': 'main-video',
  'wide-breather': 'main-video',
  'quote-lower': 'main-video-text',
  'split-image': 'main-video-images',
  'fullscreen-image': 'fullscreen-image',
  'fullscreen-quote': 'fullscreen-text',
}

const IMAGE_ARCHETYPES = new Set<Archetype>(['split-image', 'fullscreen-image'])

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

/** Check if a word ends a sentence (period, question mark, exclamation mark). */
function isSentenceEnd(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim())
}

/**
 * Compute the ideal number of segments for a given clip duration.
 *
 * ~30s @ target 3s → ~10 segments
 * ~60s @ target 3s → ~15 segments (capped)
 */
function computeSegmentCount(totalDuration: number, targetDuration: number): number {
  return Math.max(2, Math.min(15, Math.round(totalDuration / targetDuration)))
}

interface SplitCandidate {
  /** Word index — the split goes AFTER this word. */
  wordIndex: number
  /** Timestamp: end of this word (where the segment boundary lands). */
  time: number
  /** Priority: sentence > pause > word. Higher is better. */
  priority: number
}

/** Find all candidate split points in the words array. */
function findSplitCandidates(words: WordTimestamp[]): SplitCandidate[] {
  const candidates: SplitCandidate[] = []
  for (let i = 0; i < words.length - 1; i++) {
    const current = words[i]
    const next = words[i + 1]
    const gap = next.start - current.end
    if (isSentenceEnd(current.text)) {
      candidates.push({ wordIndex: i, time: current.end, priority: 3 })
    } else if (gap > PAUSE_THRESHOLD) {
      candidates.push({ wordIndex: i, time: current.end, priority: 2 })
    } else {
      candidates.push({ wordIndex: i, time: current.end, priority: 1 })
    }
  }
  return candidates
}

/**
 * Given a target split time, find the best split candidate within
 * [targetTime - tolerance, targetTime + tolerance].
 *
 * Prefers: sentence boundary > pause > nearest word boundary.
 */
function findBestSplit(
  candidates: SplitCandidate[],
  targetTime: number,
  minTime: number,
  maxTime: number
): SplitCandidate | null {
  const inRange = candidates.filter((c) => c.time >= minTime && c.time <= maxTime)
  if (inRange.length === 0) return null
  inRange.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return Math.abs(a.time - targetTime) - Math.abs(b.time - targetTime)
  })
  return inRange[0]
}

/**
 * Merge segments shorter than MIN_SEGMENT_DURATION into their previous neighbor.
 */
function mergeShortSegments(segments: VideoSegment[], clipId: string): VideoSegment[] {
  if (segments.length <= 1) return segments
  const result: VideoSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const duration = seg.endTime - seg.startTime
    if (duration >= MIN_SEGMENT_DURATION || result.length === 0) {
      result.push({ ...seg })
      continue
    }
    const prev = result[result.length - 1]
    result[result.length - 1] = {
      id: prev.id,
      clipId,
      index: prev.index,
      startTime: prev.startTime,
      endTime: seg.endTime,
      captionText: [prev.captionText, seg.captionText].filter(Boolean).join(' '),
      words: [...prev.words, ...seg.words],
      archetype: 'talking-head',
      segmentStyleCategory: 'main-video',
      zoomKeyframes: [],
      transitionIn: prev.transitionIn,
      transitionOut: seg.transitionOut,
    }
  }
  return result
}

/**
 * Split a clip's words into 2–15 segments at natural boundaries.
 *
 * Designed for a per-scene archetype rotation editor where each ~3 second
 * segment gets its own visual treatment (zoom, text overlay, image, etc.).
 *
 * @param clipId         The parent clip ID these segments belong to.
 * @param words          Word timestamps for the clip (clip-relative or absolute).
 * @param targetDuration Target segment length in seconds (default 3).
 */
export function splitIntoSegments(
  clipId: string,
  words: WordTimestamp[],
  targetDuration: number = DEFAULT_TARGET_DURATION
): VideoSegment[] {
  const target = Math.max(MIN_SEGMENT_DURATION, Math.min(MAX_SEGMENT_DURATION, targetDuration))

  if (words.length === 0) {
    return [
      {
        id: uuid(),
        clipId,
        index: 0,
        startTime: 0,
        endTime: 0,
        captionText: '',
        words: [],
        archetype: 'talking-head',
        segmentStyleCategory: 'main-video',
        zoomKeyframes: [],
        transitionIn: 'hard-cut',
        transitionOut: 'hard-cut',
      },
    ]
  }

  const clipStart = words[0].start
  const clipEnd = words[words.length - 1].end
  const totalDuration = clipEnd - clipStart

  if (totalDuration <= MIN_SEGMENT_DURATION * 2) {
    return [
      {
        id: uuid(),
        clipId,
        index: 0,
        startTime: clipStart,
        endTime: clipEnd,
        captionText: words.map((w) => w.text).join(' '),
        words: [...words],
        archetype: 'talking-head',
        segmentStyleCategory: 'main-video',
        zoomKeyframes: [],
        transitionIn: 'hard-cut',
        transitionOut: 'hard-cut',
      },
    ]
  }

  const segmentCount = computeSegmentCount(totalDuration, target)
  const idealSegmentDuration = totalDuration / segmentCount
  const candidates = findSplitCandidates(words)

  const splitPoints: SplitCandidate[] = []
  const usedWordIndices = new Set<number>()

  for (let i = 1; i < segmentCount; i++) {
    const targetTime = clipStart + idealSegmentDuration * i
    const lastSplitTime =
      splitPoints.length > 0 ? splitPoints[splitPoints.length - 1].time : clipStart

    const minTime = Math.max(
      lastSplitTime + MIN_SEGMENT_DURATION,
      targetTime - idealSegmentDuration * 0.5
    )
    const maxTime = Math.min(
      clipEnd - MIN_SEGMENT_DURATION,
      targetTime + idealSegmentDuration * 0.5
    )

    const available = candidates.filter((c) => !usedWordIndices.has(c.wordIndex))
    const best = findBestSplit(available, targetTime, minTime, maxTime)
    if (best) {
      splitPoints.push(best)
      usedWordIndices.add(best.wordIndex)
    }
  }

  splitPoints.sort((a, b) => a.time - b.time)

  const segments: VideoSegment[] = []
  const boundaries = [
    { wordIndex: -1, time: clipStart },
    ...splitPoints,
    { wordIndex: words.length - 1, time: clipEnd },
  ]

  for (let i = 0; i < boundaries.length - 1; i++) {
    const segStart = boundaries[i].time
    const segEnd = boundaries[i + 1].time
    const startWordIdx = boundaries[i].wordIndex + 1
    const endWordIdx =
      i + 1 < boundaries.length - 1
        ? boundaries[i + 1].wordIndex + 1
        : words.length

    const segWords = words.slice(startWordIdx, endWordIdx)

    segments.push({
      id: uuid(),
      clipId,
      index: i,
      startTime: segStart,
      endTime: segEnd,
      captionText: segWords.map((w) => w.text).join(' '),
      words: segWords,
      archetype: 'talking-head',
      segmentStyleCategory: 'main-video',
      zoomKeyframes: [],
      transitionIn: 'hard-cut',
      transitionOut: 'hard-cut',
    })
  }

  const merged = mergeShortSegments(segments, clipId)
  for (let i = 0; i < merged.length; i++) {
    merged[i].index = i
  }
  return merged
}

// ---------------------------------------------------------------------------
// Deterministic archetype assignment
//
// No AI — picks archetypes from a fixed rotation pattern with a no-streak
// rule. The opening five beats use a hand-tuned sequence; the rest of the
// clip cycles a body pattern with a 3-in-a-row category guard. Last beat is
// always talking-head (CTA close).
// ---------------------------------------------------------------------------

/**
 * The hand-tuned opening five beats. Walks the viewer in: punch on the hook,
 * give visual context, let the key line breathe, settle in, keep the rhythm.
 */
const OPENING: Archetype[] = [
  'tight-punch',       // 1. punch in on the hook
  'split-image',       // 2. visual context
  'fullscreen-quote',  // 3. let a key line breathe
  'talking-head',      // 4. settle in
  'split-image',       // 5. keep visual rhythm
]

/** Body cycle when image-archetypes are available. */
const BODY_WITH_IMAGES: Archetype[] = [
  'fullscreen-image',
  'tight-punch',
  'wide-breather',
  'talking-head',
  'split-image',
  'fullscreen-quote',
  'talking-head',
  'tight-punch',
]

/** Body cycle when no image-archetype source is configured. */
const BODY_NO_IMAGES: Archetype[] = [
  'fullscreen-quote',
  'tight-punch',
  'wide-breather',
  'talking-head',
  'quote-lower',
  'tight-punch',
]

/**
 * Pick an archetype for the segment at `index`, respecting:
 *   - last index → talking-head (CTA close)
 *   - index 0–4 → OPENING[index] (skip media archetypes when unavailable)
 *   - index 5+ → BODY_*[(index-5) % length] with 3-in-a-row category guard
 */
function pickArchetype(
  index: number,
  segmentCount: number,
  hasMediaKey: boolean,
  previousAssignments: Archetype[]
): Archetype {
  if (index === segmentCount - 1) return 'talking-head'

  const body = hasMediaKey ? BODY_WITH_IMAGES : BODY_NO_IMAGES

  const wouldStreak = (candidate: Archetype): boolean => {
    if (previousAssignments.length < 2) return false
    const cat = ARCHETYPE_TO_CATEGORY[candidate]
    const prev1 = previousAssignments[previousAssignments.length - 1]
    const prev2 = previousAssignments[previousAssignments.length - 2]
    return (
      ARCHETYPE_TO_CATEGORY[prev1] === cat &&
      ARCHETYPE_TO_CATEGORY[prev2] === cat
    )
  }

  // Opening: walk OPENING starting at index, skipping media-archetypes when
  // unavailable and skipping anything that would streak the same category.
  if (index < OPENING.length) {
    for (let offset = 0; offset < OPENING.length; offset++) {
      const candidate = OPENING[(index + offset) % OPENING.length]
      if (!hasMediaKey && IMAGE_ARCHETYPES.has(candidate)) continue
      if (wouldStreak(candidate)) continue
      return candidate
    }
    // All opening slots streak — fall through to body picker.
  }

  const bodyOffset = Math.max(0, index - OPENING.length)
  for (let offset = 0; offset < body.length; offset++) {
    const candidate = body[(bodyOffset + offset) % body.length]
    if (!wouldStreak(candidate)) return candidate
  }
  return body[bodyOffset % body.length]
}

/**
 * Assign an archetype to every segment using a deterministic rotation.
 *
 * @param segments      Segments produced by splitIntoSegments().
 * @param hasMediaKey   When false, media archetypes (split-image / fullscreen-
 *                      image) drop out of rotation — they would degrade at
 *                      render time without a Pexels b-roll video.
 */
export function assignArchetypesDeterministic(
  segments: VideoSegment[],
  hasMediaKey: boolean
): VideoSegment[] {
  const assigned: Archetype[] = []

  return segments.map((seg, i) => {
    const archetype = pickArchetype(i, segments.length, hasMediaKey, assigned)
    assigned.push(archetype)

    return {
      ...seg,
      archetype,
      segmentStyleCategory: ARCHETYPE_TO_CATEGORY[archetype],
    }
  })
}
