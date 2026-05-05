// ---------------------------------------------------------------------------
// Font Registry — bundled font manifest + resolver for FFmpeg/libass and renderer
// ---------------------------------------------------------------------------

import { existsSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BundledFont {
  /** Internal font family name (matches what ASS/libass resolves). */
  family: string
  /** Display-friendly label for UI. */
  label: string
  /** Filename within the fonts directory. */
  file: string
  /** Weight range or primary weight. */
  weight: string
  /** Typographic category for filtering. */
  category: 'sans-serif' | 'display' | 'handwritten' | 'serif' | 'monospace' | 'decorative'
  /** License identifier. */
  license: 'OFL-1.1' | 'Apache-2.0'
}

// ---------------------------------------------------------------------------
// Bundled font manifest
//
// Every entry must match a .ttf file in resources/fonts/ and the `family`
// must match the internal font family name embedded in the TTF so that
// libass can resolve it when given a `fontsdir`.
// ---------------------------------------------------------------------------

export const BUNDLED_FONTS: BundledFont[] = [
  // ── Sans-Serif ──────────────────────────────────────────────────────────
  {
    family: 'Inter',
    label: 'Inter',
    file: 'Inter.ttf',
    weight: '100-900',
    category: 'sans-serif',
    license: 'OFL-1.1'
  },
  {
    family: 'Inter',
    label: 'Inter Bold',
    file: 'Inter-Bold.ttf',
    weight: '700',
    category: 'sans-serif',
    license: 'OFL-1.1'
  },
  {
    family: 'Montserrat',
    label: 'Montserrat',
    file: 'Montserrat.ttf',
    weight: '100-900',
    category: 'sans-serif',
    license: 'OFL-1.1'
  },
  {
    family: 'Montserrat',
    label: 'Montserrat Bold',
    file: 'Montserrat-Bold.ttf',
    weight: '700',
    category: 'sans-serif',
    license: 'OFL-1.1'
  },
  {
    family: 'Poppins',
    label: 'Poppins',
    file: 'Poppins-Regular.ttf',
    weight: '400',
    category: 'sans-serif',
    license: 'OFL-1.1'
  },
  {
    family: 'Poppins',
    label: 'Poppins Bold',
    file: 'Poppins-Bold.ttf',
    weight: '700',
    category: 'sans-serif',
    license: 'OFL-1.1'
  },
  {
    family: 'Outfit',
    label: 'Outfit',
    file: 'Outfit.ttf',
    weight: '100-900',
    category: 'sans-serif',
    license: 'OFL-1.1'
  },

  // ── Bold Display ────────────────────────────────────────────────────────
  {
    family: 'Bebas Neue',
    label: 'Bebas Neue',
    file: 'BebasNeue-Regular.ttf',
    weight: '400',
    category: 'display',
    license: 'OFL-1.1'
  },
  {
    family: 'Anton',
    label: 'Anton',
    file: 'Anton-Regular.ttf',
    weight: '400',
    category: 'display',
    license: 'OFL-1.1'
  },
  {
    family: 'Oswald',
    label: 'Oswald',
    file: 'Oswald.ttf',
    weight: '200-700',
    category: 'display',
    license: 'OFL-1.1'
  },

  // ── Handwritten / Script ────────────────────────────────────────────────
  {
    family: 'Caveat',
    label: 'Caveat',
    file: 'Caveat.ttf',
    weight: '400-700',
    category: 'handwritten',
    license: 'OFL-1.1'
  },
  {
    family: 'Dancing Script',
    label: 'Dancing Script',
    file: 'DancingScript.ttf',
    weight: '400-700',
    category: 'handwritten',
    license: 'OFL-1.1'
  },

  // ── Serif ───────────────────────────────────────────────────────────────
  {
    family: 'Playfair Display',
    label: 'Playfair Display',
    file: 'PlayfairDisplay.ttf',
    weight: '400-900',
    category: 'serif',
    license: 'OFL-1.1'
  },
  {
    family: 'Lora',
    label: 'Lora',
    file: 'Lora.ttf',
    weight: '400-700',
    category: 'serif',
    license: 'OFL-1.1'
  },

  // ── Monospace ───────────────────────────────────────────────────────────
  {
    family: 'JetBrains Mono',
    label: 'JetBrains Mono',
    file: 'JetBrainsMono.ttf',
    weight: '100-800',
    category: 'monospace',
    license: 'OFL-1.1'
  },
  {
    family: 'Source Code Pro',
    label: 'Source Code Pro',
    file: 'SourceCodePro.ttf',
    weight: '200-900',
    category: 'monospace',
    license: 'OFL-1.1'
  },

  // ── PRESTYJ ─────────────────────────────────────────────────────────────
  {
    family: 'Geist',
    label: 'Geist Bold',
    file: 'Geist-Bold.ttf',
    weight: '700',
    category: 'sans-serif',
    license: 'OFL-1.1'
  },
  {
    family: 'Style Script',
    label: 'Style Script',
    file: 'StyleScript-Regular.ttf',
    weight: '400',
    category: 'handwritten',
    license: 'OFL-1.1'
  },

  // ── Decorative ──────────────────────────────────────────────────────────
  {
    family: 'Permanent Marker',
    label: 'Permanent Marker',
    file: 'PermanentMarker-Regular.ttf',
    weight: '400',
    category: 'decorative',
    license: 'Apache-2.0'
  },
  {
    family: 'Bangers',
    label: 'Bangers',
    file: 'Bangers-Regular.ttf',
    weight: '400',
    category: 'decorative',
    license: 'OFL-1.1'
  },
  {
    family: 'Press Start 2P',
    label: 'Press Start 2P',
    file: 'PressStart2P-Regular.ttf',
    weight: '400',
    category: 'decorative',
    license: 'OFL-1.1'
  }
]

// ---------------------------------------------------------------------------
// Font directory resolution (cached)
// ---------------------------------------------------------------------------

let cachedFontsDir: string | undefined

/**
 * Resolve the bundled fonts directory path. Handles both packaged app and
 * dev environments. Result is cached after first successful resolution.
 */
export function resolveFontsDir(): string | undefined {
  if (cachedFontsDir !== undefined) return cachedFontsDir

  try {
    const { app } = require('electron')
    const fontsPath = app.isPackaged
      ? join(process.resourcesPath, 'fonts')
      : join(__dirname, '../../resources/fonts')
    if (existsSync(fontsPath)) {
      cachedFontsDir = fontsPath
      return cachedFontsDir
    }
  } catch {
    const fontsPath = join(__dirname, '../../resources/fonts')
    if (existsSync(fontsPath)) {
      cachedFontsDir = fontsPath
      return cachedFontsDir
    }
  }

  return undefined
}

/**
 * Get the absolute path to a specific bundled font file.
 * Returns undefined if the fonts directory or file doesn't exist.
 */
export function resolveFontPath(filename: string): string | undefined {
  const dir = resolveFontsDir()
  if (!dir) return undefined
  const fullPath = join(dir, filename)
  return existsSync(fullPath) ? fullPath : undefined
}

/**
 * Get unique font families available in the bundle (de-duplicated).
 * Returns family names suitable for use in ASS `fontName` fields.
 */
export function getBundledFontFamilies(): string[] {
  const seen = new Set<string>()
  return BUNDLED_FONTS.filter((f) => {
    if (seen.has(f.family)) return false
    seen.add(f.family)
    return true
  }).map((f) => f.family)
}

/**
 * Build the font manifest for the renderer, including resolved absolute paths.
 * Only includes fonts that actually exist on disk.
 */
export function buildRendererFontManifest(): Array<{
  family: string
  label: string
  file: string
  path: string
  weight: string
  category: string
  license: string
}> {
  const dir = resolveFontsDir()
  if (!dir) return []

  return BUNDLED_FONTS.filter((f) => existsSync(join(dir, f.file))).map((f) => ({
    family: f.family,
    label: f.label,
    file: f.file,
    path: join(dir, f.file),
    weight: f.weight,
    category: f.category,
    license: f.license
  }))
}
