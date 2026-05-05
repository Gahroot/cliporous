/**
 * Project persistence service — handles save, load, auto-save, and recovery.
 *
 * All IPC calls go through the properly typed `window.api` surface.
 * The Zustand store remains pure state with no IPC knowledge.
 */

import { useStore } from '../store'
import { DEFAULT_SETTINGS, DEFAULT_PIPELINE, DEFAULT_PROCESSING_CONFIG } from '../store/helpers'
import type { ProjectFileData } from '../store/helpers'
import type { AppState } from '../store/types'

// ---------------------------------------------------------------------------
// Serialise current project state
// ---------------------------------------------------------------------------

function getProjectJson(pretty = false): string {
  const state = useStore.getState()
  const project: ProjectFileData = {
    version: 1,
    sources: state.sources,
    transcriptions: state.transcriptions,
    clips: state.clips,
    settings: state.settings,
    processingConfig: state.processingConfig
  }
  return JSON.stringify(project, null, pretty ? 2 : undefined)
}

// ---------------------------------------------------------------------------
// Apply a loaded project to the store
// ---------------------------------------------------------------------------

function applyProject(data: string): boolean {
  const project = JSON.parse(data) as Partial<ProjectFileData>
  const sources = project.sources ?? []
  const clips = project.clips ?? {}
  const hasClips = Object.values(clips).some((arr) => arr.length > 0)

  // If the project has clips, jump straight to the clip grid by setting
  // pipeline to 'ready' and selecting the first source.
  const activeSourceId = hasClips && sources.length > 0 ? sources[0].id : null
  const pipeline = hasClips
    ? { stage: 'ready' as const, message: '', percent: 100 }
    : DEFAULT_PIPELINE

  const nextState: Partial<AppState> = {
    sources,
    transcriptions: project.transcriptions ?? {},
    clips,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(project.settings ?? {})
    },
    pipeline,
    renderProgress: [],
    isRendering: false,
    renderStartedAt: null,
    renderCompletedAt: null,
    clipRenderTimes: {},
    errorLog: [],
    activeSourceId,
    isDirty: false,
    processingConfig: {
      ...DEFAULT_PROCESSING_CONFIG,
      ...(project.processingConfig ?? {})
    }
  }
  useStore.setState(nextState)
  return true
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function saveProject(): Promise<string | null> {
  try {
    const result = await window.api.saveProject(getProjectJson(true))
    if (result) {
      useStore.setState({ isDirty: false })
      window.api.clearRecovery().catch(() => { /* ignore */ })
    }
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useStore.getState().addError({ source: 'project', message: `Failed to save project: ${message}` })
    return null
  }
}

export async function loadProject(): Promise<boolean> {
  try {
    const data = await window.api.loadProject()
    if (!data) return false
    return applyProject(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useStore.getState().addError({ source: 'project', message: `Failed to load project: ${message}` })
    return false
  }
}

export async function loadProjectFromPath(filePath: string): Promise<boolean> {
  try {
    const data = await window.api.loadProjectFromPath(filePath)
    if (!data) return false
    return applyProject(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useStore.getState().addError({ source: 'project', message: `Failed to load project from ${filePath}: ${message}` })
    return false
  }
}

export async function autoSaveProject(): Promise<void> {
  const state = useStore.getState()
  const hasClips = Object.values(state.clips).some((arr) => arr.length > 0)
  if (!hasClips) return
  try {
    await window.api.autoSaveProject(getProjectJson())
    useStore.setState({ isDirty: false, lastSavedAt: Date.now() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useStore.getState().addError({ source: 'project', message: `Auto-save failed: ${message}` })
  }
}

export async function loadRecovery(): Promise<string | null> {
  try {
    return await window.api.loadRecovery()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useStore.getState().addError({ source: 'project', message: `Failed to load recovery data: ${message}` })
    return null
  }
}

export async function clearRecovery(): Promise<void> {
  try {
    await window.api.clearRecovery()
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Debounced auto-save subscriber — saves at most once every 60 s when dirty
// ---------------------------------------------------------------------------

let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null

useStore.subscribe((state, prevState) => {
  const shouldSchedule =
    state.isDirty &&
    (
      !prevState.isDirty ||
      state.clips !== prevState.clips
    )

  // Clear pending auto-save when store is reset (isDirty goes false)
  if (!state.isDirty && _autoSaveTimer) {
    clearTimeout(_autoSaveTimer)
    _autoSaveTimer = null
  }

  if (shouldSchedule && !_autoSaveTimer) {
    _autoSaveTimer = setTimeout(() => {
      _autoSaveTimer = null
      const current = useStore.getState()
      if (current.isDirty) {
        autoSaveProject()
      }
    }, 60_000)
  }
})
