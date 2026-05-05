// ---------------------------------------------------------------------------
// Color Grade — FFmpeg filter builder for per-shot and global color treatment
//
// Maps ColorGradeConfig (preset + optional overrides) into concrete FFmpeg
// eq/hue filter strings with time-limited enable expressions for piecewise
// application across shots.
// ---------------------------------------------------------------------------

import type { ColorGradePreset, ColorGradeConfig, ShotStyleConfig } from '@shared/types'

// ---------------------------------------------------------------------------
// Preset → FFmpeg parameter mapping
// ---------------------------------------------------------------------------

interface EqParams {
  brightness?: number
  contrast?: number
  saturation?: number
  gamma_r?: number
  gamma_g?: number
  gamma_b?: number
}

const PRESET_PARAMS: Record<ColorGradePreset, { type: 'eq'; params: EqParams } | { type: 'hue'; s: number } | null> = {
  'none': null,
  'warm': { type: 'eq', params: { brightness: 0.04, saturation: 1.3, gamma_r: 1.1, gamma_b: 0.9 } },
  'cool': { type: 'eq', params: { brightness: 0.02, saturation: 1.1, gamma_r: 0.9, gamma_b: 1.15 } },
  'cinematic': { type: 'eq', params: { contrast: 1.2, saturation: 0.8, brightness: -0.03 } },
  'vintage': { type: 'eq', params: { contrast: 0.9, saturation: 0.7, brightness: 0.06, gamma_r: 1.05 } },
  'high-contrast': { type: 'eq', params: { contrast: 1.4, saturation: 1.2 } },
  'bw': { type: 'hue', s: 0 },
  'film': { type: 'eq', params: { saturation: 0.85, brightness: 0.02, gamma_r: 1.08, gamma_b: 0.95 } },
}

// ---------------------------------------------------------------------------
// Single-shot filter builder
// ---------------------------------------------------------------------------

/**
 * Build an FFmpeg filter string for a single color grade config applied to
 * a specific time range. Returns empty string for 'none' preset.
 *
 * @param config    Color grade configuration (preset + optional overrides)
 * @param startTime Start of the time range in seconds
 * @param endTime   End of the time range in seconds
 * @returns         FFmpeg filter string (e.g. "eq=brightness=0.04:saturation=1.3:enable='between(t,0,5)'")
 */
export function buildColorGradeFilter(
  config: ColorGradeConfig,
  startTime: number,
  endTime: number
): string {
  if (!config.preset) return ''
  const presetDef = PRESET_PARAMS[config.preset]
  if (!presetDef) return ''

  const enable = `enable='between(t\\,${startTime.toFixed(3)}\\,${endTime.toFixed(3)})'`

  if (presetDef.type === 'hue') {
    // B&W: hue=s=0
    const s = config.saturation !== undefined ? Math.round(config.saturation * presetDef.s) : presetDef.s
    return `hue=s=${s}:${enable}`
  }

  // eq filter with preset params + user overrides
  const params = { ...presetDef.params }
  if (config.brightness !== undefined) {
    params.brightness = (params.brightness ?? 0) + config.brightness
  }
  if (config.contrast !== undefined) {
    params.contrast = (params.contrast ?? 1.0) * config.contrast
  }
  if (config.saturation !== undefined) {
    params.saturation = (params.saturation ?? 1.0) * config.saturation
  }

  const parts: string[] = []
  if (params.brightness !== undefined) parts.push(`brightness=${params.brightness.toFixed(3)}`)
  if (params.contrast !== undefined) parts.push(`contrast=${params.contrast.toFixed(3)}`)
  if (params.saturation !== undefined) parts.push(`saturation=${params.saturation.toFixed(3)}`)
  if (params.gamma_r !== undefined) parts.push(`gamma_r=${params.gamma_r.toFixed(3)}`)
  if (params.gamma_g !== undefined) parts.push(`gamma_g=${params.gamma_g.toFixed(3)}`)
  if (params.gamma_b !== undefined) parts.push(`gamma_b=${params.gamma_b.toFixed(3)}`)

  if (parts.length === 0) return ''

  return `eq=${parts.join(':')}:${enable}`
}

// ---------------------------------------------------------------------------
// Piecewise (multi-shot) filter builder
// ---------------------------------------------------------------------------

/**
 * Build a chained FFmpeg filter string that applies different color grades
 * to different time ranges within a single clip. Each shot that has a
 * colorGrade config gets its own time-limited eq/hue filter.
 *
 * Shots without colorGrade (null/undefined) fall back to the optional
 * globalGrade. If neither exists for a shot, that time range is ungraded.
 *
 * @param shots       Per-shot style configs (must have startTime/endTime)
 * @param globalGrade Optional fallback color grade for unassigned shots
 * @returns           Chained FFmpeg filter string (segments joined with ',')
 *                    or empty string if no color grading applies
 */
export function buildPiecewiseColorGradeFilter(
  shots: ShotStyleConfig[],
  globalGrade?: ColorGradeConfig
): string {
  const segments: string[] = []

  for (const shot of shots) {
    const grade = shot.colorGrade !== undefined ? shot.colorGrade : (globalGrade ?? null)
    if (!grade) continue

    const filter = buildColorGradeFilter(grade, shot.startTime, shot.endTime)
    if (filter) segments.push(filter)
  }

  return segments.join(',')
}
