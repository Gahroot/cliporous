import type { StateCreator } from 'zustand'
import type {
  AppState,
  ClipCandidate,
} from './types'
import { MAX_UNDO, MAX_CLIP_UNDO } from '@shared/constants'

// ---------------------------------------------------------------------------
// Global Undo / Redo infrastructure (batch operations)
// ---------------------------------------------------------------------------

/** Subset of state tracked by global undo/redo. */
export interface UndoableSnapshot {
  clips: Record<string, ClipCandidate[]>
  minScore: number
}

export { MAX_UNDO, MAX_CLIP_UNDO }

export function _captureSnapshot(state: {
  clips: Record<string, ClipCandidate[]>
  settings: { minScore: number }
}): UndoableSnapshot {
  return {
    clips: structuredClone(state.clips),
    minScore: state.settings.minScore
  }
}

// ---------------------------------------------------------------------------
// Per-clip Undo / Redo
// ---------------------------------------------------------------------------

/** A single per-clip undo entry: deep clone of the clip before the change. */
export interface ClipUndoEntry {
  clip: ClipCandidate
}

// ---------------------------------------------------------------------------
// History Slice
// ---------------------------------------------------------------------------

export interface HistorySlice {
  // Global undo/redo (for batch operations)
  _undoStack: UndoableSnapshot[]
  _redoStack: UndoableSnapshot[]
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void

  // Per-clip undo/redo stacks
  _clipUndoStacks: Record<string, ClipUndoEntry[]>
  _clipRedoStacks: Record<string, ClipUndoEntry[]>
  /** ID of the most recently edited clip (set by _pushClipUndo). */
  _lastEditedClipId: string | null
  /** Source ID of the most recently edited clip. */
  _lastEditedSourceId: string | null

  canUndoClip: (clipId: string) => boolean
  canRedoClip: (clipId: string) => boolean
  undoClip: (sourceId: string, clipId: string) => void
  redoClip: (sourceId: string, clipId: string) => void
  /** Clear per-clip history for a specific clip (e.g., when source is removed). */
  clearClipUndoHistory: (clipId: string) => void
}

export const createHistorySlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  HistorySlice
> = (set, get) => ({
  // --- Global undo/redo ---
  _undoStack: [],
  _redoStack: [],
  canUndo: false,
  canRedo: false,

  undo: () => {
    const state = get()
    const stack = [...state._undoStack]
    const snapshot = stack.pop()
    if (!snapshot) return
    const redoStack = [...state._redoStack, _captureSnapshot(state)]
    set({
      _undoStack: stack,
      _redoStack: redoStack,
      clips: snapshot.clips,
      settings: { ...state.settings, minScore: snapshot.minScore },
      canUndo: stack.length > 0,
      canRedo: true
    })
  },

  redo: () => {
    const state = get()
    const stack = [...state._redoStack]
    const snapshot = stack.pop()
    if (!snapshot) return
    const undoStack = [...state._undoStack, _captureSnapshot(state)]
    set({
      _undoStack: undoStack,
      _redoStack: stack,
      clips: snapshot.clips,
      settings: { ...state.settings, minScore: snapshot.minScore },
      canUndo: true,
      canRedo: stack.length > 0
    })
  },

  // --- Per-clip undo/redo ---
  _clipUndoStacks: {},
  _clipRedoStacks: {},
  _lastEditedClipId: null,
  _lastEditedSourceId: null,

  canUndoClip: (clipId) => {
    return (get()._clipUndoStacks[clipId]?.length ?? 0) > 0
  },

  canRedoClip: (clipId) => {
    return (get()._clipRedoStacks[clipId]?.length ?? 0) > 0
  },

  undoClip: (sourceId, clipId) => {
    const state = get()
    const stack = [...(state._clipUndoStacks[clipId] ?? [])]
    const entry = stack.pop()
    if (!entry) return

    // Push current clip state onto redo stack
    const sourceClips = state.clips[sourceId]
    if (!sourceClips) return
    const currentClip = sourceClips.find((c) => c.id === clipId)
    if (!currentClip) return

    const redoStack = [...(state._clipRedoStacks[clipId] ?? []), { clip: structuredClone(currentClip) }]

    // Replace the clip in the source array with the snapshot
    const updated = sourceClips.map((c) => (c.id === clipId ? entry.clip : c))

    set({
      _clipUndoStacks: { ...state._clipUndoStacks, [clipId]: stack },
      _clipRedoStacks: { ...state._clipRedoStacks, [clipId]: redoStack },
      clips: { ...state.clips, [sourceId]: updated }
    })
  },

  redoClip: (sourceId, clipId) => {
    const state = get()
    const stack = [...(state._clipRedoStacks[clipId] ?? [])]
    const entry = stack.pop()
    if (!entry) return

    // Push current clip state onto undo stack
    const sourceClips = state.clips[sourceId]
    if (!sourceClips) return
    const currentClip = sourceClips.find((c) => c.id === clipId)
    if (!currentClip) return

    const undoStack = [...(state._clipUndoStacks[clipId] ?? []), { clip: structuredClone(currentClip) }]

    // Replace the clip with the redo snapshot
    const updated = sourceClips.map((c) => (c.id === clipId ? entry.clip : c))

    set({
      _clipUndoStacks: { ...state._clipUndoStacks, [clipId]: undoStack },
      _clipRedoStacks: { ...state._clipRedoStacks, [clipId]: stack },
      clips: { ...state.clips, [sourceId]: updated }
    })
  },

  clearClipUndoHistory: (clipId) => {
    const state = get()
    const undoStacks = { ...state._clipUndoStacks }
    const redoStacks = { ...state._clipRedoStacks }
    delete undoStacks[clipId]
    delete redoStacks[clipId]
    set({ _clipUndoStacks: undoStacks, _clipRedoStacks: redoStacks })
  },
})

// ---------------------------------------------------------------------------
// Helper: push global undo state (for batch operations)
// ---------------------------------------------------------------------------

type SetFn = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void

export function _pushUndo(
  state: AppState,
  set: SetFn
): void {
  const snapshot = _captureSnapshot(state)
  const undoStack = [...state._undoStack, snapshot]
  if (undoStack.length > MAX_UNDO) undoStack.shift()
  set({
    _undoStack: undoStack,
    _redoStack: [],
    canUndo: true,
    canRedo: false,
  })
}

// ---------------------------------------------------------------------------
// Helper: push per-clip undo state (for individual clip edits)
// ---------------------------------------------------------------------------

export function _pushClipUndo(
  sourceId: string,
  clipId: string,
  state: AppState,
  set: SetFn
): void {
  const sourceClips = state.clips[sourceId]
  if (!sourceClips) return
  const clip = sourceClips.find((c) => c.id === clipId)
  if (!clip) return

  const snapshot = structuredClone(clip)
  const stack = [...(state._clipUndoStacks[clipId] ?? []), { clip: snapshot }]
  if (stack.length > MAX_CLIP_UNDO) stack.shift()

  set({
    _clipUndoStacks: { ...state._clipUndoStacks, [clipId]: stack },
    _clipRedoStacks: { ...state._clipRedoStacks, [clipId]: [] },
    _lastEditedClipId: clipId,
    _lastEditedSourceId: sourceId,
  })
}
