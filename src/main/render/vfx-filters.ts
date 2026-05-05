/**
 * VFX overlay filter builders
 *
 * Generates FFmpeg filter strings and overlay input specifications for
 * per-segment VFX effects defined in edit styles.
 */

/** Result of building VFX overlays for a segment. */
export interface VFXBuildResult {
  /** Procedural FFmpeg filter expressions (drawbox, colorize, etc.) to chain in -vf. */
  proceduralFilters: string | null
  /** Asset-based overlay inputs that need additional -i flags in FFmpeg. */
  assetInputs: Array<{
    path: string
    blendMode: string
    opacity: number
    overlayFilter: string
  }>
}

interface VFXOverlay {
  type: string
  opacity: number
  applyToCategories: string[] | 'all'
  assetPath?: string
  blendMode?: string
}

/**
 * Build a complete VFX filter chain string from an array of VFX overlay configs.
 * Only includes overlays whose `applyToCategories` matches the given segment category.
 */
export function buildVFXFilterChain(
  overlays: VFXOverlay[],
  accentColor: string,
  width: number,
  height: number,
  category: string
): string | null {
  const result = buildVFXOverlays(overlays, accentColor, width, height, category)
  return result.proceduralFilters
}

/**
 * Build VFX overlays for a segment, separating procedural filters from asset-based overlays.
 */
export function buildVFXOverlays(
  overlays: VFXOverlay[],
  accentColor: string,
  width: number,
  height: number,
  category: string
): VFXBuildResult {
  const procedural: string[] = []
  const assetInputs: VFXBuildResult['assetInputs'] = []

  for (const overlay of overlays) {
    // Check category match
    if (overlay.applyToCategories !== 'all') {
      if (!overlay.applyToCategories.includes(category)) continue
    }

    const alpha = overlay.opacity

    switch (overlay.type) {
      case 'color-vignette': {
        // Dark vignette around edges using drawbox with transparency
        const inset = Math.round(width * 0.05)
        procedural.push(
          `drawbox=x=0:y=0:w=${width}:h=${inset}:color=black@${alpha}:t=fill`,
          `drawbox=x=0:y=${height - inset}:w=${width}:h=${inset}:color=black@${alpha}:t=fill`
        )
        break
      }

      case 'gradient-bar-bottom': {
        const barH = Math.round(height * 0.15)
        procedural.push(
          `drawbox=x=0:y=${height - barH}:w=${width}:h=${barH}:color=black@${alpha}:t=fill`
        )
        break
      }

      case 'gradient-bar-top': {
        const barH = Math.round(height * 0.1)
        procedural.push(
          `drawbox=x=0:y=0:w=${width}:h=${barH}:color=black@${alpha}:t=fill`
        )
        break
      }

      case 'color-tint': {
        // Apply a subtle color tint using the accent color
        const hex = accentColor.replace('#', '')
        const r = parseInt(hex.substring(0, 2), 16) / 255
        const g = parseInt(hex.substring(2, 4), 16) / 255
        const b = parseInt(hex.substring(4, 6), 16) / 255
        procedural.push(
          `colorbalance=rs=${((r - 0.5) * alpha).toFixed(2)}:gs=${((g - 0.5) * alpha).toFixed(2)}:bs=${((b - 0.5) * alpha).toFixed(2)}`
        )
        break
      }

      case 'scan-line': {
        // Horizontal scan lines — thin dark bars every N pixels
        const gap = 4
        procedural.push(
          `drawgrid=w=0:h=${gap}:t=1:color=black@${(alpha * 0.3).toFixed(2)}`
        )
        break
      }

      case 'image-overlay':
      case 'video-overlay': {
        if (overlay.assetPath) {
          assetInputs.push({
            path: overlay.assetPath,
            blendMode: overlay.blendMode ?? 'normal',
            opacity: alpha,
            overlayFilter: `overlay=0:0:format=auto`
          })
        }
        break
      }

      // Procedural overlays that just use drawbox/drawtext with accent color
      case 'glowing-ring':
      case 'bokeh-blobs':
      case 'diagonal-slash':
      case 'grid-overlay':
      case 'corner-brackets':
      case 'pulse-border':
        // These complex procedural effects are visual-only niceties.
        // A basic tinted border serves as a placeholder.
        procedural.push(
          `drawbox=x=0:y=0:w=${width}:h=${height}:color=${accentColor.replace('#', '0x')}@${(alpha * 0.2).toFixed(2)}:t=4`
        )
        break
    }
  }

  return {
    proceduralFilters: procedural.length > 0 ? procedural.join(',') : null,
    assetInputs
  }
}
