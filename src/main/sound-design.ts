import { join } from 'path'
import { app } from 'electron'
import { existsSync } from 'fs'
import type { MusicTrack, WordTimestamp, ShotStyleConfig } from '@shared/types'

// ---------------------------------------------------------------------------
// Types (MusicTrack canonical definition lives in @shared/types)
// ---------------------------------------------------------------------------

export type { MusicTrack }

export type SFXType =
  | 'whoosh-soft'
  | 'whoosh-hard'
  | 'impact-low'
  | 'impact-high'
  | 'rise-tension'
  | 'notification-pop'
  | 'swipe-transition'
  | 'word-pop'
  | 'bass-drop'
  | 'camera-shutter'
  | 'rise-tension-short'
  | 'typewriter-key'
  | 'glitch-hit'

export interface SoundPlacementData {
  type: 'sfx' | 'music'
  filePath: string
  startTime: number // seconds within the clip (0 = clip start)
  duration: number  // seconds this sound plays
  volume: number    // 0–1 (static scalar, used when volumeExpr is absent)
  /**
   * Optional time-varying FFmpeg volume expression (overrides `volume`).
   * Built using comma-free infix operators so it's safe on Windows:
   *   - `(t>=s)*(t<=e)` instead of `between(t,s,e)`
   *   - No function calls with commas (gte/lte/if avoided)
   * Passed as: `volume=EXPR:eval=frame` in the audio filter chain.
   */
  volumeExpr?: string
}

export type SFXStyle = 'minimal' | 'standard' | 'energetic'

/**
 * Tunable parameters that drive SFX placement for each style preset.
 * All gap values are in seconds. Volume scales are multiplied by the
 * user-controlled sfxVolume before being written into SoundPlacementData.
 */
export interface SFXStyleConfig {
  // Edit event sync (B-Roll transitions, jump-cuts)
  editSyncEnabled: boolean
  editBrollMinGap: number
  editBrollVolScale: number
  editJumpCutMinGap: number
  editJumpCutVolScale: number

  // Pause whooshes
  whooshEnabled: boolean
  whooshMinPause: number           // minimum gap length to trigger a whoosh
  whooshMinGap: number             // min gap from previous SFX
  whooshSecondsPerWhoosh: number   // rate-limit: 1 whoosh per N seconds of clip
  whooshVolScale: number
}

/** Preset configs indexed by SFXStyle. */
export const SFX_STYLE_CONFIGS: Record<SFXStyle, SFXStyleConfig> = {
  /** Barely-there: a single subtle whoosh, no edit-event SFX. */
  minimal: {
    editSyncEnabled: false,
    editBrollMinGap: 9999,
    editBrollVolScale: 0.65,
    editJumpCutMinGap: 9999,
    editJumpCutVolScale: 0.35,
    whooshEnabled: true,
    whooshMinPause: 0.6,
    whooshMinGap: 2.0,
    whooshSecondsPerWhoosh: 20,
    whooshVolScale: 0.3,
  },

  /** Balanced: edit-event SFX at moderate density. Current default behaviour. */
  standard: {
    editSyncEnabled: true,
    editBrollMinGap: 1.0,
    editBrollVolScale: 0.65,
    editJumpCutMinGap: 1.5,
    editJumpCutVolScale: 0.35,
    whooshEnabled: true,
    whooshMinPause: 0.4,
    whooshMinGap: 1.0,
    whooshSecondsPerWhoosh: 8,
    whooshVolScale: 0.7,
  },

  /** Maximum density: whooshes on every edit event and eligible pause. */
  energetic: {
    editSyncEnabled: true,
    editBrollMinGap: 0.4,
    editBrollVolScale: 0.85,
    editJumpCutMinGap: 0.75,
    editJumpCutVolScale: 0.6,
    whooshEnabled: true,
    whooshMinPause: 0.25,
    whooshMinGap: 0.4,
    whooshSecondsPerWhoosh: 3,
    whooshVolScale: 0.9,
  },
}

export interface SoundDesignOptions {
  enabled: boolean
  backgroundMusicTrack: MusicTrack
  sfxVolume: number    // 0–1
  musicVolume: number  // 0–1
  musicDucking: boolean  // duck music during speech
  musicDuckLevel: number // volume fraction during speech (0–1, default 0.2)
  sfxStyle: SFXStyle   // placement density preset (default 'standard')
}

/** @deprecated Use WordTimestamp from @shared/types instead */
export type WordTimestampInput = WordTimestamp

/**
 * An edit event during the clip that can trigger a synced SFX.
 * Passed from the render pipeline to sound design for content-reactive placement.
 */
export interface EditEvent {
  /** Type of edit event */
  type: 'broll-transition' | 'jump-cut' | 'shot-transition'
  /** Time in seconds (0-based, relative to clip start) */
  time: number
  /** B-Roll transition style (only for broll-transition events) */
  transition?: 'hard-cut' | 'crossfade' | 'swipe-up' | 'swipe-down'
  /** Shot transition style (only for shot-transition events) */
  shotTransition?: 'crossfade' | 'dip-black' | 'swipe-left' | 'swipe-up' | 'swipe-down' | 'zoom-in' | 'zoom-punch' | 'glitch'
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

export function resolveSfxPath(sfxName: SFXType | string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'sfx', `${sfxName}.mp3`)
  }
  return join(process.cwd(), 'resources', 'sfx', `${sfxName}.mp3`)
}

export function resolveMusicPath(trackName: MusicTrack | string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'music', `${trackName}.mp3`)
  }
  return join(process.cwd(), 'resources', 'music', `${trackName}.mp3`)
}

// ---------------------------------------------------------------------------
// Emphasis-aware sound placement generation
// ---------------------------------------------------------------------------

/** Resolve an SFX path only if the file exists on disk; returns null otherwise. */
function tryResolve(sfxName: SFXType | string): string | null {
  const p = resolveSfxPath(sfxName)
  return existsSync(p) ? p : null
}

// ---------------------------------------------------------------------------
// Shot transition → SFX mapping
// ---------------------------------------------------------------------------

/** Resolved SFX for a shot transition — path, duration, and volume scale. */
interface TransitionSfxHit {
  path: string
  duration: number
  volScale: number
}

/**
 * Resolve the SFX file + volume for a shot transition type.
 *
 * Each transition type has a signature sound that makes it feel intentional:
 * - Crossfade/dip-black → soft whoosh (gentle, editorial)
 * - Swipe variants → swipe swoosh (directional energy)
 * - Zoom-in → low impact (subtle push)
 * - Zoom-punch → high impact (aggressive slam — the Velocity signature)
 * - Glitch → glitch hit, or impact-high fallback (digital crunch)
 *
 * Returns null if the transition type has no SFX or the file is missing.
 */
function resolveShotTransitionSfx(
  shotTransition: EditEvent['shotTransition'],
  sfxPaths: Record<string, string | null>
): TransitionSfxHit | null {
  if (!shotTransition) return null

  switch (shotTransition) {
    case 'crossfade':
      return sfxPaths.whooshSoft
        ? { path: sfxPaths.whooshSoft, duration: 0.4, volScale: 0.5 }
        : null
    case 'dip-black':
      return sfxPaths.whooshSoft
        ? { path: sfxPaths.whooshSoft, duration: 0.5, volScale: 0.55 }
        : null
    case 'swipe-left':
    case 'swipe-up':
    case 'swipe-down':
      return sfxPaths.swipeTransition
        ? { path: sfxPaths.swipeTransition, duration: 0.35, volScale: 0.65 }
        : null
    case 'zoom-in':
      return sfxPaths.impactLow
        ? { path: sfxPaths.impactLow, duration: 0.3, volScale: 0.45 }
        : null
    case 'zoom-punch':
      // The signature Velocity hit — loud and punchy
      return sfxPaths.impactHigh
        ? { path: sfxPaths.impactHigh, duration: 0.35, volScale: 0.8 }
        : null
    case 'glitch':
      // Prefer dedicated glitch SFX, fall back to impact-high for digital crunch
      if (sfxPaths.glitchHit) {
        return { path: sfxPaths.glitchHit, duration: 0.3, volScale: 0.7 }
      }
      return sfxPaths.impactHigh
        ? { path: sfxPaths.impactHigh, duration: 0.25, volScale: 0.6 }
        : null
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Music ducking helpers
// ---------------------------------------------------------------------------

/**
 * Merge word timestamps into contiguous speech segments.
 *
 * Adjacent words whose gap is ≤ `mergeGap` seconds are merged into a single
 * segment. A small `pad` is added to the end of each segment so the duck
 * lingers briefly after the last word (natural release feel).
 *
 * @returns Array of [startSec, endSec] tuples, non-overlapping.
 */
function mergeSpeechSegments(
  words: WordTimestampInput[],
  mergeGap: number = 0.15,
  pad: number = 0.08
): Array<[number, number]> {
  if (words.length === 0) return []

  const segments: Array<[number, number]> = []
  let segStart = words[0].start
  let segEnd = words[0].end

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - segEnd
    if (gap <= mergeGap) {
      // Extend current segment
      segEnd = words[i].end
    } else {
      segments.push([segStart, segEnd + pad])
      segStart = words[i].start
      segEnd = words[i].end
    }
  }
  segments.push([segStart, segEnd + pad])

  return segments
}

/**
 * Build a comma-free FFmpeg volume expression that ducks during speech.
 *
 * The expression uses infix comparison operators (`t>=s`, `t<=e`) which
 * return 0 or 1 in FFmpeg's expression evaluator, avoiding all commas.
 * This is safe on Windows where escaped commas in filter values can cause
 * "Error opening output file: Invalid argument".
 *
 * Formula:
 *   inSpeech = Σ (t>=si)*(t<=ei)   — sums to 0 (pause) or 1 (speech)
 *   volume   = fullVol + (duckVol - fullVol) * inSpeech
 *
 * @param speechSegments  Non-overlapping [start, end] pairs in seconds
 * @param fullVol         Volume during pauses / B-Roll (0–1)
 * @param duckVol         Volume during speech (0–1, typically fullVol * duckLevel)
 * @returns FFmpeg volume expression string ready for `volume=EXPR:eval=frame`
 */
export function buildMusicDuckingExpr(
  speechSegments: Array<[number, number]>,
  fullVol: number,
  duckVol: number
): string {
  if (speechSegments.length === 0) return fullVol.toFixed(3)

  const fv = fullVol.toFixed(3)
  const dv = duckVol.toFixed(3)

  // Each term: (t>=si)*(t<=ei) — comma-free binary indicator
  const inSpeechTerms = speechSegments
    .map(([s, e]) => `(t>=${s.toFixed(3)})*(t<=${e.toFixed(3)})`)
    .join('+')

  // fullVol + (duckVol - fullVol) * inSpeech
  // During speech: fullVol + (duckVol - fullVol) * 1 = duckVol  ✓
  // During pause:  fullVol + (duckVol - fullVol) * 0 = fullVol  ✓
  return `${fv}+(${dv}-${fv})*(${inSpeechTerms})`
}

// ---------------------------------------------------------------------------
// Per-shot music helpers — crossfade between different tracks per shot
// ---------------------------------------------------------------------------

/** A resolved music segment: which track plays over which time range. */
interface ShotMusicSegment {
  startTime: number
  endTime: number
  track: MusicTrack
}

/** A group of consecutive shots sharing the same track. */
interface TrackGroup {
  track: MusicTrack
  startTime: number
  endTime: number
}

/**
 * Resolve per-shot music track assignments into time-ranged segments.
 * Shots without a musicTrack override use the global fallback track.
 */
function resolvePerShotMusic(
  clipDuration: number,
  globalTrack: MusicTrack,
  shotStyleConfigs?: ShotStyleConfig[]
): ShotMusicSegment[] {
  if (!shotStyleConfigs || shotStyleConfigs.length === 0) {
    return [{ startTime: 0, endTime: clipDuration, track: globalTrack }]
  }

  // Sort shots by startTime
  const sorted = [...shotStyleConfigs].sort((a, b) => a.startTime - b.startTime)
  const segments: ShotMusicSegment[] = []

  let cursor = 0
  for (const shot of sorted) {
    // Fill gap before this shot with global track
    if (shot.startTime > cursor + 0.01) {
      segments.push({ startTime: cursor, endTime: shot.startTime, track: globalTrack })
    }
    segments.push({
      startTime: shot.startTime,
      endTime: shot.endTime,
      track: shot.musicTrack ?? globalTrack
    })
    cursor = shot.endTime
  }

  // Fill remaining clip duration with global track
  if (cursor < clipDuration - 0.01) {
    segments.push({ startTime: cursor, endTime: clipDuration, track: globalTrack })
  }

  return segments
}

/**
 * Group consecutive shot music segments by track, merging adjacent segments
 * that use the same track into a single group for efficient rendering.
 */
function groupShotMusicByTrack(segments: ShotMusicSegment[]): TrackGroup[] {
  if (segments.length === 0) return []

  const groups: TrackGroup[] = []
  let current: TrackGroup = {
    track: segments[0].track,
    startTime: segments[0].startTime,
    endTime: segments[0].endTime
  }

  for (let i = 1; i < segments.length; i++) {
    if (segments[i].track === current.track) {
      current.endTime = segments[i].endTime
    } else {
      groups.push(current)
      current = {
        track: segments[i].track,
        startTime: segments[i].startTime,
        endTime: segments[i].endTime
      }
    }
  }
  groups.push(current)
  return groups
}

/**
 * Build a volume expression for a per-shot music track that:
 *  - Fades in at the track's start boundary over `crossfadeSec`
 *  - Fades out at the track's end boundary over `crossfadeSec`
 *  - Stays at 0 outside its active region
 *  - Applies speech ducking within its active region
 *
 * Uses comma-free infix math for Windows FFmpeg safety.
 *
 * Crossfade envelope (before ducking):
 *   - Before active region: 0
 *   - Fade-in ramp: t in [start - cf, start] → linearly 0 → fullVol
 *   - Active plateau: fullVol
 *   - Fade-out ramp: t in [end, end + cf] → linearly fullVol → 0
 *   - After active region: 0
 */
function buildPerShotMusicVolExpr(
  startTime: number,
  endTime: number,
  clipDuration: number,
  fullVol: number,
  duckVol: number,
  crossfadeSec: number,
  speechSegments: Array<[number, number]>,
  ducking: boolean
): string {
  const fv = fullVol.toFixed(3)

  // Crossfade boundaries (clamped to clip edges)
  const fadeInStart = Math.max(0, startTime - crossfadeSec)
  const fadeInEnd = startTime
  const fadeOutStart = endTime
  const fadeOutEnd = Math.min(clipDuration, endTime + crossfadeSec)

  // Build envelope expression:
  // envelope = fadeIn * plateau * fadeOut
  // fadeIn: clamp((t - fadeInStart) / fadeInDur, 0, 1)
  // fadeOut: clamp((fadeOutEnd - t) / fadeOutDur, 0, 1)
  // Using min/max since FFmpeg has them as comma-free: min(a;b), max(a;b)
  // Actually FFmpeg min/max use `;` separator which might have issues.
  // Safer approach: use arithmetic clamping with multiplication.

  const fadeInDur = fadeInEnd - fadeInStart
  const fadeOutDur = fadeOutEnd - fadeOutStart

  // Comma-free clamping: clamp(x, 0, 1) = x*(x>=0)*(x<=1) + 1*(x>1)
  // Simpler: use smooth step with multiplied conditions
  const parts: string[] = []

  if (fadeInDur > 0.01) {
    // Fade-in ramp: ramp = (t - fadeInStart) / fadeInDur, clamped to [0,1]
    // = ramp * (ramp >= 0) * (ramp <= 1) + (ramp > 1)
    const s = fadeInStart.toFixed(3)
    const d = fadeInDur.toFixed(3)
    parts.push(`((t-${s})/${d}*(t>=${s})*(t<=${fadeInEnd.toFixed(3)})+(t>${fadeInEnd.toFixed(3)}))`)
  }

  if (fadeOutDur > 0.01) {
    // Fade-out ramp: ramp = (fadeOutEnd - t) / fadeOutDur, clamped to [0,1]
    const e = fadeOutEnd.toFixed(3)
    const d = fadeOutDur.toFixed(3)
    parts.push(`((${e}-t)/${d}*(t>=${fadeOutStart.toFixed(3)})*(t<=${e})+(t<${fadeOutStart.toFixed(3)}))`)
  }

  // Silence outside the [fadeInStart, fadeOutEnd] window
  parts.push(`(t>=${fadeInStart.toFixed(3)})*(t<=${fadeOutEnd.toFixed(3)})`)

  let envelope = parts.join('*')

  // Apply base volume
  let expr = `${fv}*${envelope}`

  // Apply speech ducking within the active region
  if (ducking && speechSegments.length > 0) {
    const dv = duckVol.toFixed(3)
    // Filter speech segments to those overlapping our active region
    const relevantSpeech = speechSegments.filter(
      ([s, e]) => e > fadeInStart && s < fadeOutEnd
    )
    if (relevantSpeech.length > 0) {
      const inSpeechTerms = relevantSpeech
        .map(([s, e]) => `(t>=${s.toFixed(3)})*(t<=${e.toFixed(3)})`)
        .join('+')
      // Ducked volume: fullVol + (duckVol - fullVol) * inSpeech, then multiply by envelope
      expr = `(${fv}+(${dv}-${fv})*(${inSpeechTerms}))*${envelope}`
    }
  }

  return expr
}

/**
 * Generate emphasis-aware sound placements for a clip.
 *
 * Placement strategy:
 *
 * 1. **Background music** — continuous ambient bed under the whole clip
 * 2. **Edit event sync** — `swipe-transition` on B-Roll entries, `camera-shutter` on jump-cut zooms
 * 3. **Pause whooshes** — soft whoosh at natural speech pauses (topic shifts)
 *
 * Supersize and emphasis words are intentionally NOT sonified. Per-word SFX
 * on every emphasis felt overwhelming and fought the speaker's voice — sound
 * design now reacts to structural beats (edits and pauses) instead.
 *
 * All SFX are rate-limited by minimum gap enforcement so the density feels intentional.
 * Missing audio files are silently skipped with a console warning.
 *
 * @param clipDuration    Duration of the clip in seconds
 * @param wordTimestamps   Word timestamps (0-based, relative to clip start)
 * @param options          Sound design configuration
 * @param editEvents       Optional edit events (B-Roll transitions, jump-cuts) for sync SFX.
 * @param shotStyleConfigs Optional per-shot style configs with music track overrides.
 *                         When shots specify different music tracks, each shot gets its
 *                         own music placement with crossfade volume envelopes for smooth
 *                         transitions between tracks.
 */
export function generateSoundPlacements(
  clipDuration: number,
  wordTimestamps: WordTimestampInput[],
  options: SoundDesignOptions,
  editEvents?: EditEvent[],
  shotStyleConfigs?: ShotStyleConfig[]
): SoundPlacementData[] {
  if (!options.enabled) return []

  const placements: SoundPlacementData[] = []
  const sfxVolume = Math.max(0, Math.min(1, options.sfxVolume))
  const cfg = SFX_STYLE_CONFIGS[options.sfxStyle ?? 'standard']

  // Resolve all available SFX files up-front
  const sfxPaths = {
    impactHigh:       tryResolve('impact-high'),
    swipeTransition:  tryResolve('swipe-transition'),
    cameraShutter:    tryResolve('camera-shutter'),
    whooshSoft:       tryResolve('whoosh-soft'),
    impactLow:        tryResolve('impact-low'),
    glitchHit:        tryResolve('glitch-hit'),
  }

  // ── 1. Background music (with per-shot crossfade support) ──────────────────
  const fullVol = Math.max(0, Math.min(1, options.musicVolume))
  const speechSegments = (options.musicDucking && wordTimestamps.length > 0)
    ? mergeSpeechSegments(wordTimestamps)
    : []
  const duckVol = fullVol * Math.max(0, Math.min(1, options.musicDuckLevel))

  // Determine per-shot music segments: collect unique music tracks across shots
  const shotMusicSegments = resolvePerShotMusic(
    clipDuration, options.backgroundMusicTrack, shotStyleConfigs
  )

  // Check if all shots use the same track (common case — no crossfade needed)
  const uniqueTracks = new Set(shotMusicSegments.map(s => s.track))

  if (uniqueTracks.size <= 1) {
    // Single track — original simple path
    const track = shotMusicSegments[0]?.track ?? options.backgroundMusicTrack
    const musicPath = resolveMusicPath(track)
    if (existsSync(musicPath)) {
      const musicPlacement: SoundPlacementData = {
        type: 'music',
        filePath: musicPath,
        startTime: 0,
        duration: clipDuration,
        volume: fullVol
      }

      if (options.musicDucking && speechSegments.length > 0) {
        musicPlacement.volumeExpr = buildMusicDuckingExpr(speechSegments, fullVol, duckVol)
      }

      placements.push(musicPlacement)
    } else {
      console.warn(`[SoundDesign] Music file not found, skipping: ${musicPath}`)
    }
  } else {
    // Multiple tracks across shots — create per-track placements with crossfade envelopes
    const CROSSFADE_SEC = 0.5 // crossfade duration between different tracks

    // Group consecutive segments by track
    const trackGroups = groupShotMusicByTrack(shotMusicSegments)

    for (const group of trackGroups) {
      const musicPath = resolveMusicPath(group.track)
      if (!existsSync(musicPath)) {
        console.warn(`[SoundDesign] Per-shot music file not found, skipping: ${musicPath}`)
        continue
      }

      // Build a volume envelope that fades this track in/out at shot boundaries
      const volExpr = buildPerShotMusicVolExpr(
        group.startTime, group.endTime, clipDuration,
        fullVol, duckVol, CROSSFADE_SEC,
        speechSegments, options.musicDucking
      )

      placements.push({
        type: 'music',
        filePath: musicPath,
        startTime: 0,
        duration: clipDuration,
        volume: fullVol,
        volumeExpr: volExpr
      })
    }

    if (trackGroups.length > 1) {
      console.log(
        `[SoundDesign] Per-shot music: ${trackGroups.length} tracks with ${CROSSFADE_SEC}s crossfades ` +
        `(${trackGroups.map(g => `${g.track}@${g.startTime.toFixed(1)}-${g.endTime.toFixed(1)}s`).join(', ')})`
      )
    }
  }

  if (wordTimestamps.length === 0 && (!editEvents || editEvents.length === 0)) {
    return placements
  }

  // Track the last time any SFX was placed to enforce minimum gaps.
  // Supersize and emphasis words are intentionally NOT sonified — SFX on every
  // big word grew overwhelming and distracted from the speaker's voice. Sound
  // design now only reacts to edit events (b-roll/jump-cut/shot transitions)
  // and meaningful pauses.
  let lastSfxTime = -Infinity

  // ── Edit event synced SFX ──────────────────────────────────────────────────
  // B-Roll transitions → swipe sound; jump-cut zooms → quiet camera shutter;
  // shot transitions → type-specific SFX that matches the visual transition.
  // These sync to the visual edit rhythm so audio and video feel connected.
  if (cfg.editSyncEnabled && editEvents && editEvents.length > 0) {
    for (const evt of editEvents) {
      if (evt.time < 0.1 || evt.time > clipDuration - 0.3) continue

      if (evt.type === 'broll-transition' && sfxPaths.swipeTransition) {
        if (evt.time - lastSfxTime >= cfg.editBrollMinGap) {
          placements.push({
            type: 'sfx',
            filePath: sfxPaths.swipeTransition,
            startTime: evt.time,
            duration: 0.4,
            volume: sfxVolume * cfg.editBrollVolScale
          })
          lastSfxTime = evt.time
        }
      } else if (evt.type === 'jump-cut' && sfxPaths.cameraShutter) {
        // Camera shutter is intentionally quiet — it's felt more than heard
        if (evt.time - lastSfxTime >= cfg.editJumpCutMinGap) {
          placements.push({
            type: 'sfx',
            filePath: sfxPaths.cameraShutter,
            startTime: evt.time,
            duration: 0.25,
            volume: sfxVolume * cfg.editJumpCutVolScale
          })
          lastSfxTime = evt.time
        }
      } else if (evt.type === 'shot-transition') {
        // Shot transitions get type-matched SFX — each transition style has
        // a signature sound that reinforces the editorial feel. This is what
        // makes Velocity feel punchy and Film feel smooth.
        const resolved = resolveShotTransitionSfx(evt.shotTransition, sfxPaths)
        if (resolved && evt.time - lastSfxTime >= cfg.editBrollMinGap) {
          placements.push({
            type: 'sfx',
            filePath: resolved.path,
            startTime: evt.time,
            duration: resolved.duration,
            volume: sfxVolume * resolved.volScale
          })
          lastSfxTime = evt.time
        }
      }
    }
  }

  // ── 5. Transition whooshes at speech pauses ────────────────────────────────
  // Topic shifts / natural speech pauses get a soft whoosh to mark the
  // transition. Rate-limited by cfg.whooshSecondsPerWhoosh.
  if (cfg.whooshEnabled && sfxPaths.whooshSoft && wordTimestamps.length > 1) {
    const maxWhooshes = Math.max(1, Math.floor(clipDuration / cfg.whooshSecondsPerWhoosh))
    let whooshCount = 0

    for (let i = 1; i < wordTimestamps.length && whooshCount < maxWhooshes; i++) {
      const gapStart = wordTimestamps[i - 1].end
      const gapLength = wordTimestamps[i].start - gapStart

      if (gapLength >= cfg.whooshMinPause && gapStart > 2 && gapStart + 0.8 < clipDuration) {
        if (gapStart - lastSfxTime >= cfg.whooshMinGap) {
          placements.push({
            type: 'sfx',
            filePath: sfxPaths.whooshSoft,
            startTime: gapStart,
            duration: Math.min(gapLength, 0.8),
            volume: sfxVolume * cfg.whooshVolScale
          })
          lastSfxTime = gapStart
          whooshCount++
        }
      }
    }
  }

  return placements
}
