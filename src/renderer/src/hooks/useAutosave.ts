import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { autoSaveProject } from '../services/project-service'

/**
 * Manages autosave lifecycle and exposes UI state.
 *
 * - Runs a final autosave on `beforeunload`
 * - Tracks `lastSavedAt` from the store
 * - Returns `justSaved` (true for 2 s after each save) for the autosaved toast
 *
 * The 60 s debounced autosave timer lives in `services/project-service.ts`.
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
