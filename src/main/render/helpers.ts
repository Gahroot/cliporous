// ---------------------------------------------------------------------------
// Shared render helpers — extracted from render-pipeline.ts
// ---------------------------------------------------------------------------

/**
 * Convert Windows backslash paths to forward slash paths for FFmpeg compatibility.
 * FFmpeg on Windows requires forward slashes for paths passed as command-line arguments.
 */
export function toFFmpegPath(path: string): string {
  if (process.platform === 'win32') {
    return path.replace(/\\/g, '/')
  }
  return path
}

/**
 * Strip characters that are illegal in filenames on Windows/Linux/Mac.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
}

/** Format seconds to ASS timestamp: H:MM:SS.CC (centiseconds) */
export function formatASSTimestamp(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.round((s % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

/**
 * Convert a CSS hex color (#RRGGBB or #AARRGGBB) to ASS &HAABBGGRR format.
 */
export function cssHexToASS(hex: string): string {
  const h = hex.replace('#', '')
  let r: number, g: number, b: number, a: number

  if (h.length === 8) {
    a = parseInt(h.slice(0, 2), 16)
    r = parseInt(h.slice(2, 4), 16)
    g = parseInt(h.slice(4, 6), 16)
    b = parseInt(h.slice(6, 8), 16)
  } else if (h.length === 6) {
    a = 0
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  } else {
    return '&H00FFFFFF'
  }

  const pad = (n: number) => n.toString(16).toUpperCase().padStart(2, '0')
  return `&H${pad(a)}${pad(b)}${pad(g)}${pad(r)}`
}

/**
 * Build an escaped `ass='...'` filter string from an ASS file path.
 *
 * On Windows, libavfilter chokes on double-backslash escaped paths inside
 * single-quoted filter values (`ass='C\:\\Users\\...'` → "No option name near
 * \Users\...").  The drawtext/fontfile code elsewhere in the app handles this
 * by flipping to forward slashes first — match that pattern here.
 */
export function buildASSFilter(assFilePath: string, fontsDir?: string): string {
  const escape = (p: string): string =>
    p
      .replace(/\\/g, '/')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'")
  const escaped = escape(assFilePath)
  if (fontsDir) {
    return `ass='${escaped}':fontsdir='${escape(fontsDir)}'`
  }
  return `ass='${escaped}'`
}

/**
 * Build an escaped `ass='...'` filter string for use inside `-filter_complex`.
 *
 * Same escaping as `buildASSFilter` — colons must always be escaped as `\:`
 * even inside single-quoted values, because FFmpeg's filter parser does NOT
 * treat single quotes as protecting colons from being parsed as option
 * separators.  Without this, a Windows path like `C:/Users/...` causes
 * "No option name near ..." parse errors.
 */
export function buildASSFilterForComplex(assFilePath: string, fontsDir?: string): string {
  return buildASSFilter(assFilePath, fontsDir)
}
