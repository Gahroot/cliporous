import { create } from 'zustand'
import { enableMapSet } from 'immer'
import { immer } from 'zustand/middleware/immer'

// Enable Immer's MapSet plugin so Set/Map values work in the store
enableMapSet()

import type {
  AppState,
  SourceVideo,
  TranscriptionData,
  RenderProgress,
} from './types'
import {
  persistSettings,
  persistProcessingConfig,
  loadPersistedSettings,
  loadPersistedProcessingConfig,
} from './helpers'
import { broadcastSettingsChange, listenForSettingsChanges } from './settings-sync'
import { createClipsSlice } from './clips-slice'
import { createSettingsSlice } from './settings-slice'
import { createPipelineSlice } from './pipeline-slice'
import { createProjectSlice } from './project-slice'
import { createHistorySlice } from './history-slice'
import { createErrorsSlice } from './errors-slice'

/** Maximum number of AI usage history entries to keep in memory. */
const MAX_AI_USAGE_HISTORY = 200

const RECOVERY_ACK_KEY = 'batchclip-acknowledged-recovery'

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStore = create<AppState>()(immer((...a) => {
  const [set, get] = a
  return {
    // --- Slices ---
    ...createClipsSlice(...a),
    ...createSettingsSlice(...a),
    ...createPipelineSlice(...a),
    ...createProjectSlice(...a),
    ...createHistorySlice(...a),
    ...createErrorsSlice(...a),

    // --- Sources ---
    sources: [],
    activeSourceId: null,
    transcriptions: {},

    addSource: (source: SourceVideo) =>
      set((state) => { state.sources.push(source) }),

    updateSource: (id: string, updates: Partial<SourceVideo>) =>
      set((state) => {
        const idx = state.sources.findIndex((s) => s.id === id)
        if (idx === -1) return
        state.sources[idx] = { ...state.sources[idx], ...updates, id: state.sources[idx].id }
      }),

    removeSource: (id: string) =>
      set((state) => {
        // Clean up per-clip undo stacks for clips belonging to this source
        const clipIds = (state.clips[id] ?? []).map((c) => c.id)
        const undoStacks = { ...state._clipUndoStacks }
        const redoStacks = { ...state._clipRedoStacks }
        for (const cid of clipIds) {
          delete undoStacks[cid]
          delete redoStacks[cid]
        }
        if (state._lastEditedSourceId === id) {
          state._lastEditedClipId = null
          state._lastEditedSourceId = null
        }

        state.sources = state.sources.filter((s) => s.id !== id)
        delete state.transcriptions[id]
        delete state.clips[id]
        if (state.activeSourceId === id) state.activeSourceId = null
        state._clipUndoStacks = undoStacks
        state._clipRedoStacks = redoStacks
      }),

    setActiveSource: (id: string | null) => set({ activeSourceId: id }),

    setTranscription: (sourceId: string, data: TranscriptionData) =>
      set((state) => { state.transcriptions[sourceId] = data }),

    getActiveSource: () => {
      const { sources, activeSourceId } = get()
      return sources.find((s) => s.id === activeSourceId) ?? null
    },

    getActiveTranscription: () => {
      const { transcriptions, activeSourceId } = get()
      if (!activeSourceId) return null
      return transcriptions[activeSourceId] ?? null
    },

    // --- Render ---
    renderProgress: [],
    isRendering: false,
    activeEncoder: null,
    renderStartedAt: null,
    renderCompletedAt: null,
    clipRenderTimes: {},
    renderErrors: {},
    singleRenderClipId: null,
    singleRenderProgress: 0,
    singleRenderStatus: 'idle' as const,
    singleRenderOutputPath: null,
    singleRenderError: null,

    setRenderProgress: (progress: RenderProgress[]) => set({ renderProgress: progress }),

    setIsRendering: (rendering: boolean) => {
      const now = Date.now()
      if (rendering) {
        set({ isRendering: true, renderStartedAt: now, renderCompletedAt: null, clipRenderTimes: {} })
      } else {
        set({ isRendering: false, renderCompletedAt: now })
      }
    },

    setRenderError: (clipId: string, error: string) =>
      set((state) => { state.renderErrors[clipId] = error }),

    clearRenderErrors: () => set({ renderErrors: {} }),

    setSingleRenderState: (patch) =>
      set((state) => {
        if (patch.clipId !== undefined) state.singleRenderClipId = patch.clipId
        if (patch.progress !== undefined) state.singleRenderProgress = patch.progress
        if (patch.status !== undefined) state.singleRenderStatus = patch.status
        if (patch.outputPath !== undefined) state.singleRenderOutputPath = patch.outputPath
        if (patch.error !== undefined) state.singleRenderError = patch.error
      }),

    // --- Theme — locked to 'dark' ---
    theme: 'dark' as const,

    // --- Network ---
    isOnline: navigator.onLine,
    setIsOnline: (online: boolean) => set({ isOnline: online }),

    // --- Recovery acknowledgement (replaces hasCompletedOnboarding) ---
    acknowledgedRecovery: localStorage.getItem(RECOVERY_ACK_KEY) === 'true',
    acknowledgeRecovery: () => {
      localStorage.setItem(RECOVERY_ACK_KEY, 'true')
      set({ acknowledgedRecovery: true })
    },

    // --- AI Token Usage ---
    aiUsage: {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalCalls: 0,
      callHistory: [],
      sessionStarted: Date.now()
    },

    trackTokenUsage: (event) =>
      set((state) => {
        state.aiUsage.totalPromptTokens += event.promptTokens
        state.aiUsage.totalCompletionTokens += event.completionTokens
        state.aiUsage.totalCalls += 1
        if (state.aiUsage.callHistory.length >= MAX_AI_USAGE_HISTORY) {
          state.aiUsage.callHistory = [...state.aiUsage.callHistory.slice(-(MAX_AI_USAGE_HISTORY - 1)), event]
        } else {
          state.aiUsage.callHistory.push(event)
        }
      }),

    resetAiUsage: () =>
      set({
        aiUsage: {
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalCalls: 0,
          callHistory: [],
          sessionStarted: Date.now()
        }
      }),
  }
}))

// ---------------------------------------------------------------------------
// Auto-persist settings & processing config on change
// ---------------------------------------------------------------------------

useStore.subscribe((state, prevState) => {
  if (state.settings !== prevState.settings) {
    persistSettings(state.settings)
    broadcastSettingsChange()
  }
  if (state.processingConfig !== prevState.processingConfig) {
    persistProcessingConfig(state.processingConfig)
    broadcastSettingsChange()
  }
})

// ---------------------------------------------------------------------------
// Dirty tracking — mark isDirty when meaningful project data changes
// ---------------------------------------------------------------------------

useStore.subscribe((state, prevState) => {
  if (state.isDirty) return
  if (
    state.clips !== prevState.clips ||
    state.transcriptions !== prevState.transcriptions ||
    state.sources !== prevState.sources ||
    state.settings.minScore !== prevState.settings.minScore
  ) {
    queueMicrotask(() => useStore.setState({ isDirty: true }))
  }
})

// ---------------------------------------------------------------------------
// Cross-window settings sync (BroadcastChannel)
// ---------------------------------------------------------------------------

listenForSettingsChanges(() => {
  const freshSettings = loadPersistedSettings()
  const freshConfig = loadPersistedProcessingConfig()
  // loadPersistedSettings() returns empty strings / null for values that live
  // in safeStorage (API keys + outputDirectory). Preserve the current
  // in-memory values so a sibling-window broadcast doesn't visibly wipe them
  // before hydrateSecretsFromMain() refreshes them from the source of truth.
  const current = useStore.getState().settings
  useStore.setState({
    settings: {
      ...freshSettings,
      geminiApiKey: current.geminiApiKey,
      falApiKey: current.falApiKey,
      pexelsApiKey: current.pexelsApiKey,
      outputDirectory: current.outputDirectory,
    },
    processingConfig: freshConfig,
  })
  void useStore.getState().hydrateSecretsFromMain()
})

// ---------------------------------------------------------------------------
// Debounced auto-save — moved to services/project-service.ts
// The service module is imported in App.tsx which activates the subscriber.
// ---------------------------------------------------------------------------
