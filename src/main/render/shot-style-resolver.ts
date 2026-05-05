// ---------------------------------------------------------------------------
// Shot-Style Resolver — maps ShotStyleAssignment[] to concrete ShotStyleConfig[]
//
// At IPC time, the renderer sends an array of { shotIndex, presetId } per clip.
// This module resolves each preset ID into its concrete rendering parameters
// (caption animation, zoom mode, etc.) and returns a ShotStyleConfig[] that
// the render features can consume to apply piecewise style changes.
// ---------------------------------------------------------------------------

import type {
  ShotStyleAssignment,
  ShotStyleConfig,
  ShotSegment,
  CaptionAnimation,
  ZoomMode,
  ZoomIntensity,
  ColorGradeConfig,
  ShotTransitionConfig,
  MusicTrack
} from '@shared/types'

// ---------------------------------------------------------------------------
// Preset shape (matches EditStylePreset from store/types.ts)
// We only import the fields we need for render resolution. The full preset
// objects are passed in from the IPC handler — we don't import the store type
// directly to avoid main ↔ renderer coupling.
// ---------------------------------------------------------------------------

interface PresetCaptions {
  enabled: boolean
  style: {
    animation: CaptionAnimation
    primaryColor: string
    highlightColor: string
    outlineColor: string
    emphasisColor?: string
    supersizeColor?: string
    fontSize: number
    outline: number
    shadow: number
    borderStyle: number
    wordsPerLine: number
    fontName: string
    backColor: string
  }
}

interface PresetZoom {
  enabled: boolean
  mode: ZoomMode
  intensity: ZoomIntensity
  intervalSeconds: number
}

interface PresetSound {
  backgroundMusicTrack?: MusicTrack
}

/** Minimal preset shape needed for shot-style resolution. */
export interface StylePresetForResolution {
  id: string
  captions: PresetCaptions
  zoom: PresetZoom
  sound?: PresetSound
  colorGrade?: ColorGradeConfig
  transitionIn?: ShotTransitionConfig
  transitionOut?: ShotTransitionConfig
  brollMode?: 'fullscreen' | 'split-top' | 'split-bottom' | 'pip'
}

/**
 * Resolve per-shot style assignments into concrete render configurations.
 *
 * @param assignments  The user's per-shot preset assignments (shotIndex → presetId)
 * @param shots        The clip's shot segments (provides time ranges)
 * @param presets      Available style presets (keyed by ID for O(1) lookup)
 * @returns            Array of resolved ShotStyleConfig objects, one per assigned shot
 */
export function resolveShotStyles(
  assignments: ShotStyleAssignment[],
  shots: ShotSegment[],
  presets: Map<string, StylePresetForResolution>
): ShotStyleConfig[] {
  if (!assignments.length || !shots.length) return []

  const configs: ShotStyleConfig[] = []

  for (const assignment of assignments) {
    const shot = shots[assignment.shotIndex]
    if (!shot) {
      console.warn(
        `[ShotStyleResolver] Shot index ${assignment.shotIndex} out of range ` +
        `(clip has ${shots.length} shots). Skipping.`
      )
      continue
    }

    const preset = presets.get(assignment.presetId)
    if (!preset) {
      console.warn(
        `[ShotStyleResolver] Preset "${assignment.presetId}" not found ` +
        `for shot ${assignment.shotIndex}. Falling back to global style.`
      )
      continue
    }

    configs.push({
      shotIndex: assignment.shotIndex,
      startTime: shot.startTime,
      endTime: shot.endTime,
      captionStyle: preset.captions.enabled ? {
        animation: preset.captions.style.animation,
        primaryColor: preset.captions.style.primaryColor,
        highlightColor: preset.captions.style.highlightColor,
        outlineColor: preset.captions.style.outlineColor,
        emphasisColor: preset.captions.style.emphasisColor,
        supersizeColor: preset.captions.style.supersizeColor,
        fontSize: preset.captions.style.fontSize,
        outline: preset.captions.style.outline,
        shadow: preset.captions.style.shadow,
        borderStyle: preset.captions.style.borderStyle,
        wordsPerLine: preset.captions.style.wordsPerLine,
        fontName: preset.captions.style.fontName,
        backColor: preset.captions.style.backColor
      } : null,
      zoom: preset.zoom.enabled ? {
        mode: preset.zoom.mode,
        intensity: preset.zoom.intensity,
        intervalSeconds: preset.zoom.intervalSeconds
      } : null,
      colorGrade: preset.colorGrade ?? null,
      transitionIn: preset.transitionIn ?? null,
      transitionOut: preset.transitionOut ?? null,
      brollMode: preset.brollMode ?? null,
      musicTrack: preset.sound?.backgroundMusicTrack ?? null
    })
  }

  return configs
}

/**
 * Build a Map<string, StylePresetForResolution> from a flat array of presets.
 * Used by the IPC handler to pass presets into resolveShotStyles().
 */
export function buildPresetLookup(
  presets: StylePresetForResolution[]
): Map<string, StylePresetForResolution> {
  const map = new Map<string, StylePresetForResolution>()
  for (const preset of presets) {
    map.set(preset.id, preset)
  }
  return map
}
