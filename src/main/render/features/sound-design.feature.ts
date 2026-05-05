// ---------------------------------------------------------------------------
// Sound design feature — background music + SFX audio mixing
// ---------------------------------------------------------------------------

import type { RenderFeature, PrepareResult } from './feature'
import type { RenderClipJob, RenderBatchOptions, BrandKitRenderOptions, SoundPlacementData } from '../types'
import { buildLogoPositionExpr } from './brand-kit.feature'

// ---------------------------------------------------------------------------
// Sound filter_complex builder — exported for use by base-render.ts
// ---------------------------------------------------------------------------

/**
 * Build a filter_complex string that:
 *  - Processes the video stream (crop → scale → optional ASS subtitles → optional logo) → [outv]
 *  - Mixes original audio with optional music and SFX layers → [outa]
 *
 * Sound input indices start at 1 (input 0 is the source video).
 * Logo input index (if present) = placements.length + 1.
 */
export function buildSoundFilterComplex(
  videoFilter: string,
  placements: SoundPlacementData[],
  clipDuration: number,
  logoOverlay?: { bk: BrandKitRenderOptions; inputIndex: number }
): string {
  const segments: string[] = []

  // ── Video node ─────────────────────────────────────────────────────────────
  if (logoOverlay) {
    const { bk, inputIndex } = logoOverlay
    const logoW = Math.round(bk.logoScale * 1080)
    const opacity = bk.logoOpacity.toFixed(3)
    const posExpr = buildLogoPositionExpr(bk.logoPosition)

    segments.push(`[0:v]${videoFilter}[mainv]`)
    segments.push(
      `[${inputIndex}:v]loop=loop=-1:size=1:start=0,scale=${logoW}:-2,` +
      `format=rgba,colorchannelmixer=aa=${opacity}[logo]`
    )
    segments.push(`[mainv][logo]overlay=${posExpr}:format=auto[outv]`)
  } else {
    segments.push(`[0:v]${videoFilter}[outv]`)
  }

  // ── Audio nodes ───────────────────────────────────────────────────────────
  // [0:a] = original speaker audio; additional inputs start at index 1
  const mixInputs: string[] = ['[0:a]']

  placements.forEach((p, i) => {
    const inputIdx = i + 1
    const label = `[snd${i}]`
    const vol = p.volume.toFixed(3)

    if (p.type === 'music') {
      // Loop the entire music file (size=0), trim to clip duration, apply volume.
      // When a time-varying expression is present (music ducking), use eval=frame
      // so FFmpeg re-evaluates the volume expression for every audio frame.
      // The expression uses comma-free infix operators (t>=s, t<=e) for Windows safety.
      const volPart = p.volumeExpr
        ? `volume=${p.volumeExpr}:eval=frame`
        : `volume=${vol}`
      segments.push(
        `[${inputIdx}:a]aloop=loop=1000:size=0,` +
          `atrim=0:${clipDuration.toFixed(3)},` +
          `${volPart}${label}`
      )
    } else {
      // SFX: delay to target timestamp, apply volume.
      // `adelay=delays=MS:all=1` applies the same delay to all channels
      const delayMs = Math.round(p.startTime * 1000)
      segments.push(
        `[${inputIdx}:a]adelay=delays=${delayMs}:all=1,volume=${vol}${label}`
      )
    }

    mixInputs.push(label)
  })

  // ── Mix node ───────────────────────────────────────────────────────────────
  if (mixInputs.length > 1) {
    // duration=first: use the original audio stream (0:a) as length reference
    // normalize=0: don't reduce volume by 1/N — preserve levels
    segments.push(
      `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:normalize=0[outa]`
    )
  }

  return segments.join(';')
}

// ---------------------------------------------------------------------------
// Sound design feature implementation
// ---------------------------------------------------------------------------

/**
 * Sound design feature handles background music and SFX mixing.
 *
 * Sound placements are pre-computed by the IPC handler in index.ts (via
 * `generateSoundPlacements`) and stored on `job.soundPlacements` before
 * `startBatchRender` is called.
 *
 * Like brand kit, sound design does NOT use `overlayPass()`. The actual audio
 * mixing is integrated into the base render's filter_complex path using
 * `buildSoundFilterComplex()`.
 *
 * This feature's `prepare()` only validates that placements exist and logs
 * the result. The heavy lifting is done by the exported builder function.
 */
export const soundDesignFeature: RenderFeature = {
  name: 'sound-design',

  async prepare(
    job: RenderClipJob,
    _batchOptions: RenderBatchOptions,
    _onProgress?: (message: string, percent: number) => void
  ): Promise<PrepareResult> {
    // Per-clip override can disable sound design
    const perClipOverride = job.clipOverrides?.enableSoundDesign
    if (perClipOverride === false) {
      // Explicitly disabled — clear placements so base render skips sound path
      job.soundPlacements = undefined
      return { tempFiles: [], modified: false }
    }

    const hasPlacements =
      Array.isArray(job.soundPlacements) && job.soundPlacements.length > 0

    if (!hasPlacements) {
      return { tempFiles: [], modified: false }
    }

    try {
      // Log edit events from upstream features (B-Roll transitions, shot transitions, jump-cuts)
      const editEventCount = job.editEvents?.length ?? 0
      const brollEvents = job.editEvents?.filter((e) => e.type === 'broll-transition').length ?? 0
      const shotTransitionEvents = job.editEvents?.filter((e) => e.type === 'shot-transition').length ?? 0
      const jumpCutEvents = job.editEvents?.filter((e) => e.type === 'jump-cut').length ?? 0

      const musicCount = job.soundPlacements!.filter(p => p.type === 'music').length
      const sfxPlacements = job.soundPlacements!.filter(p => p.type === 'sfx')

      // Categorize SFX for diagnostic logging
      const categories = {
        pops: sfxPlacements.filter(p => p.filePath.includes('word-pop')).length,
        impacts: sfxPlacements.filter(p =>
          p.filePath.includes('impact-high') || p.filePath.includes('bass-drop') || p.filePath.includes('impact-low')
        ).length,
        tension: sfxPlacements.filter(p => p.filePath.includes('rise-tension')).length,
        transitions: sfxPlacements.filter(p => p.filePath.includes('swipe')).length,
        shutters: sfxPlacements.filter(p => p.filePath.includes('camera-shutter')).length,
        whooshes: sfxPlacements.filter(p => p.filePath.includes('whoosh')).length,
      }

      console.log(
        `[SoundDesign] Clip ${job.clipId}: ${musicCount} music, ${sfxPlacements.length} sfx ` +
        `(${categories.pops} pops, ${categories.impacts} impacts, ${categories.tension} tension, ` +
        `${categories.transitions} transitions, ${categories.shutters} shutters, ${categories.whooshes} whooshes)` +
        (editEventCount > 0
          ? ` — synced to ${editEventCount} edit events (${brollEvents} broll, ${shotTransitionEvents} shot-transition, ${jumpCutEvents} jump-cut)`
          : '')
      )

      return { tempFiles: [], modified: true }
    } catch (err) {
      console.error(`[SoundDesign] Prepare failed for clip ${job.clipId}, skipping sound:`, err)
      return { tempFiles: [], modified: false }
    }
  }
}
