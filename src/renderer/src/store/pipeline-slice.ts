import type { StateCreator } from 'zustand'
import type {
  AppState,
  PipelineProgress,
  PipelineStage,
  PythonSetupState,
} from './types'
import { DEFAULT_PIPELINE } from './helpers'

// ---------------------------------------------------------------------------
// Pipeline Slice
// ---------------------------------------------------------------------------

export interface PipelineSlice {
  pipeline: PipelineProgress
  failedPipelineStage: PipelineStage | null
  completedPipelineStages: Set<PipelineStage>
  cachedSourcePath: string | null
  pythonStatus: PythonSetupState
  pythonSetupError: string | null
  pythonSetupProgress: {
    stage: string
    message: string
    percent: number
    package?: string
    currentPackage?: number
    totalPackages?: number
  } | null

  setPipeline: (progress: PipelineProgress) => void
  setFailedPipelineStage: (stage: PipelineStage) => void
  setCachedSourcePath: (path: string) => void
  markStageCompleted: (stage: PipelineStage) => void
  clearPipelineCache: () => void
  setPythonStatus: (status: PythonSetupState) => void
  setPythonSetupError: (error: string | null) => void
  setPythonSetupProgress: (progress: {
    stage: string
    message: string
    percent: number
    package?: string
    currentPackage?: number
    totalPackages?: number
  } | null) => void
}

export const createPipelineSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  PipelineSlice
> = (set) => ({
  pipeline: { ...DEFAULT_PIPELINE },
  failedPipelineStage: null,
  completedPipelineStages: new Set<PipelineStage>(),
  cachedSourcePath: null,
  pythonStatus: 'checking',
  pythonSetupError: null,
  pythonSetupProgress: null,

  setPipeline: (progress) => set({ pipeline: progress }),

  setFailedPipelineStage: (stage) =>
    set((state) => {
      const completed = new Set(state.completedPipelineStages)
      const stageOrder: PipelineStage[] = [
        'downloading', 'transcribing', 'scoring', 'optimizing-loops',
        'detecting-faces', 'ai-editing', 'segmenting'
      ]
      const failedIdx = stageOrder.indexOf(stage)
      for (const s of stageOrder) {
        if (stageOrder.indexOf(s) < failedIdx) completed.add(s)
      }
      return { failedPipelineStage: stage, completedPipelineStages: completed }
    }),

  setCachedSourcePath: (path) => set({ cachedSourcePath: path }),

  markStageCompleted: (stage) =>
    set((state) => {
      const completed = new Set(state.completedPipelineStages)
      completed.add(stage)
      return { completedPipelineStages: completed }
    }),

  clearPipelineCache: () =>
    set({
      failedPipelineStage: null,
      completedPipelineStages: new Set<PipelineStage>(),
      cachedSourcePath: null
    }),

  setPythonStatus: (status) => set({ pythonStatus: status }),
  setPythonSetupError: (error) => set({ pythonSetupError: error }),
  setPythonSetupProgress: (progress) => set({ pythonSetupProgress: progress }),
})
