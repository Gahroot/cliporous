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

  addError: (entry) =>
    set((state) => ({
      errorLog: [...state.errorLog, { ...entry, id: uuidv4(), timestamp: Date.now() }]
    })),

  clearErrors: () => set({ errorLog: [] }),
})
