/**
 * Edit style color grade filter builder
 *
 * Converts a ColorGradeConfig (preset name + optional overrides) into an
 * FFmpeg filter string using eq, colorbalance, and curves filters.
 */

interface ColorGradeConfig {
  preset: string
  brightness?: number
  contrast?: number
  saturation?: number
  warmth?: number
  blackLift?: number
  highlightSoftness?: number
}

interface GradeParams {
  brightness: number
  contrast: number
  saturation: number
  warmth: number
  blackLift: number
}

const PRESETS: Record<string, GradeParams> = {
  none: { brightness: 0, contrast: 1.0, saturation: 1.0, warmth: 0, blackLift: 0 },
  vivid: { brightness: 0.02, contrast: 1.15, saturation: 1.3, warmth: 0.05, blackLift: 0 },
  warm: { brightness: 0.01, contrast: 1.05, saturation: 1.1, warmth: 0.15, blackLift: 0 },
  cool: { brightness: 0, contrast: 1.05, saturation: 1.0, warmth: -0.12, blackLift: 0 },
  desaturated: { brightness: 0, contrast: 1.0, saturation: 0.6, warmth: 0, blackLift: 0 },
  highContrast: { brightness: 0, contrast: 1.3, saturation: 1.1, warmth: 0, blackLift: 0 },
  faded: { brightness: 0.03, contrast: 0.9, saturation: 0.85, warmth: 0.05, blackLift: 0.08 },
  film: { brightness: 0, contrast: 1.08, saturation: 0.9, warmth: 0.08, blackLift: 0.04 },
  cinematic: { brightness: -0.01, contrast: 1.12, saturation: 0.95, warmth: 0.1, blackLift: 0.03 },
  moody: { brightness: -0.03, contrast: 1.15, saturation: 0.85, warmth: -0.05, blackLift: 0.06 },
}

/**
 * Build an FFmpeg filter expression for the given color grade config.
 * Returns `null` when the config produces no visible change (preset "none" + no overrides).
 */
export function buildEditStyleColorGradeFilter(config: ColorGradeConfig): string | null {
  const base = PRESETS[config.preset] ?? PRESETS.none

  const brightness = config.brightness ?? base.brightness
  const contrast = config.contrast ?? base.contrast
  const saturation = config.saturation ?? base.saturation
  const warmth = config.warmth ?? base.warmth
  const blackLift = config.blackLift ?? base.blackLift

  // Skip if all params are effectively neutral
  if (
    Math.abs(brightness) < 0.001 &&
    Math.abs(contrast - 1) < 0.001 &&
    Math.abs(saturation - 1) < 0.001 &&
    Math.abs(warmth) < 0.001 &&
    Math.abs(blackLift) < 0.001
  ) {
    return null
  }

  const filters: string[] = []

  // Brightness, contrast, saturation via eq filter
  const eqParts: string[] = []
  if (Math.abs(brightness) >= 0.001) eqParts.push(`brightness=${brightness.toFixed(3)}`)
  if (Math.abs(contrast - 1) >= 0.001) eqParts.push(`contrast=${contrast.toFixed(3)}`)
  if (Math.abs(saturation - 1) >= 0.001) eqParts.push(`saturation=${saturation.toFixed(3)}`)
  if (eqParts.length > 0) filters.push(`eq=${eqParts.join(':')}`)

  // Warmth via colorbalance (shift reds/blues in shadows and midtones)
  if (Math.abs(warmth) >= 0.001) {
    const rs = (warmth * 0.3).toFixed(3)
    const bs = (-warmth * 0.3).toFixed(3)
    filters.push(`colorbalance=rs=${rs}:bs=${bs}:rm=${rs}:bm=${bs}`)
  }

  // Black lift via curves (raise the black point).
  // The curves filter takes normalized [0,1] coordinates for both axes, so
  // blackLift (already in [0,1]) is passed directly. Clamp defensively.
  if (Math.abs(blackLift) >= 0.001) {
    const lift = Math.max(0, Math.min(1, blackLift))
    filters.push(`curves=master='0/${lift.toFixed(3)} 1/1'`)
  }

  return filters.length > 0 ? filters.join(',') : null
}
