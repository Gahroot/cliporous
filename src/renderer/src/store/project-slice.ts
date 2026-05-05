import type { StateCreator } from 'zustand'
import type { AppState } from './types'
import { DEFAULT_PIPELINE } from './helpers'

// ---------------------------------------------------------------------------
// Project Slice — pure state only, no IPC
// ---------------------------------------------------------------------------

export interface ProjectSlice {
  isDirty: boolean
  lastSavedAt: number | null
  reset: () => void
}

export const createProjectSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  ProjectSlice
> = (set) => ({
  isDirty: false,
  lastSavedAt: null,

  reset: () =>
    set({
      sources: [],
      activeSourceId: null,
      transcriptions: {},
      clips: {},
      pipeline: DEFAULT_PIPELINE,
      renderProgress: [],
      isRendering: false,
      renderStartedAt: null,
      renderCompletedAt: null,
      clipRenderTimes: {},
      errorLog: [],
      _undoStack: [],
      _redoStack: [],
      canUndo: false,
      canRedo: false,
    }),
})
