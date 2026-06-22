import type { StateCreator } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { AppState, ErrorLogEntry } from './types'

// ---------------------------------------------------------------------------
// Errors Slice
// ---------------------------------------------------------------------------

export interface ErrorsSlice {
  errorLog: ErrorLogEntry[]
  addError: (entry: Omit<ErrorLogEntry, 'id' | 'timestamp'>) => void
  clearErrors: () => void
}

export const createErrorsSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  ErrorsSlice
> = (set) => ({
  errorLog: [],

  addError: (entry) => {
    // Forward to the main-process session log so failures are observable in the
    // log file. Renderer ErrorLog entries are otherwise in-memory only, which
    // makes a stalled/failed pipeline run impossible to diagnose from the logs.
    try {
      const detail = entry.details ? `${entry.message}\n${entry.details}` : entry.message
      window.api?.logToMain?.('error', entry.source, detail)
    } catch {
      // never let logging break error reporting
    }
    set((state) => ({
      errorLog: [...state.errorLog, { ...entry, id: uuidv4(), timestamp: Date.now() }]
    }))
  },

  clearErrors: () => set({ errorLog: [] }),
})
