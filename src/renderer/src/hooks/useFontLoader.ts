// ---------------------------------------------------------------------------
// useFontLoader — loads bundled fonts into the renderer via FontFace API
// ---------------------------------------------------------------------------
//
// On mount, fetches the font manifest from the main process, then loads each
// unique font family into the document so canvas-based caption previews and
// UI elements can render text in the correct typeface.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react'

/** Load all bundled fonts into the document once. */
export function useFontLoader(): void {
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true

    loadBundledFonts().catch((err) => {
      console.warn('[FontLoader] Failed to load bundled fonts:', err)
    })
  }, [])
}

async function loadBundledFonts(): Promise<void> {
  const fonts = await window.api.getAvailableFonts()
  const bundled = fonts.filter((f) => f.source === 'bundled')

  // De-duplicate by path — we only need to load each file once
  const seen = new Set<string>()
  const unique = bundled.filter((f) => {
    if (seen.has(f.path)) return false
    seen.add(f.path)
    return true
  })

  const results = await Promise.allSettled(
    unique.map(async (font) => {
      const base64 = await window.api.getFontData(font.path)
      if (!base64) return

      const url = `data:font/ttf;base64,${base64}`
      const face = new FontFace(font.name, `url(${url})`)
      const loaded = await face.load()
      document.fonts.add(loaded)
    })
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length
  console.log(`[FontLoader] Loaded ${succeeded} bundled fonts${failed > 0 ? ` (${failed} failed)` : ''}`)
}
