import { useEffect, useState } from 'react'
import { useStore } from '../store'
import type { ProjectFileData } from '../store'

/**
 * Manages autosave lifecycle and exposes UI state.
 *
 * - Runs a final autosave on `beforeunload`
 * - Tracks `lastSavedAt` from the store
 * - Returns `justSaved` (true for 2 s after each save) for the autosaved toast
 */
export function useAutosave(): { lastSavedAt: number | null; justSaved: boolean } {
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const [justSaved, setJustSaved] = useState(false)

  // Show the "Autosaved" indicator for 2 seconds after each save
  useEffect(() => {
    if (!lastSavedAt) return
    setJustSaved(true)
    const timer = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [lastSavedAt])

  // Final save attempt on window close / reload
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent): void {
      const state = useStore.getState()
      if (state.isDirty) {
        e.preventDefault()
        void autoSaveProject()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return { lastSavedAt, justSaved }
}

// ---------------------------------------------------------------------------
// Inline minimal autosave — serialises the trimmed project shape and hands it
// to the main process. Mirrors the schema declared in `store/helpers.ts`.
// ---------------------------------------------------------------------------

async function autoSaveProject(): Promise<void> {
  const state = useStore.getState()
  const hasClips = Object.values(state.clips).some((arr) => arr.length > 0)
  if (!hasClips) return

  const project: ProjectFileData = {
    version: 1,
    sources: state.sources,
    transcriptions: state.transcriptions,
    clips: state.clips,
    settings: state.settings,
    processingConfig: state.processingConfig
  }

  try {
    await window.api.autoSaveProject(JSON.stringify(project))
    useStore.setState({ isDirty: false, lastSavedAt: Date.now() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    state.addError({ source: 'project', message: `Auto-save failed: ${message}` })
  }
}
