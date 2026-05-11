import type { StateCreator } from 'zustand'
import type {
  AppState,
  ClipCandidate,
  ClipRenderSettings,
  CropRegion,
  CropRegionSource,
  CropTimelineEntry,
  FillerSegmentUI,
  PartInfoUI,
} from './types'
import type { AIEditPlan, ShotSegment, ShotStyleAssignment, VideoSegment } from '@shared/types'
import { updateItemById } from './helpers'
import { _pushUndo, _pushClipUndo } from './history-slice'

// ---------------------------------------------------------------------------
// Clips Slice
// ---------------------------------------------------------------------------

export interface ClipsSlice {
  clips: Record<string, ClipCandidate[]>
  selectedClipIndex: number
  selectedClipIds: Set<string>

  setClips: (sourceId: string, clips: ClipCandidate[]) => void
  updateClipStatus: (sourceId: string, clipId: string, status: ClipCandidate['status']) => void
  updateClipTrim: (sourceId: string, clipId: string, startTime: number, endTime: number) => void
  updateClipThumbnail: (sourceId: string, clipId: string, thumbnail: string) => void
  setClipCustomThumbnail: (sourceId: string, clipId: string, thumbnail: string | null) => void
  updateClipCrop: (
    sourceId: string,
    clipId: string,
    crop: CropRegion,
    opts?: { timeline?: CropTimelineEntry[]; source?: CropRegionSource }
  ) => void
  setClipManualCrop: (sourceId: string, clipId: string, crop: CropRegion) => void
  resetClipCropSource: (sourceId: string, clipId: string) => void
  updateClipHookText: (sourceId: string, clipId: string, hookText: string) => void
  updateClipLoop: (sourceId: string, clipId: string, loopData: { loopScore: number; loopStrategy: string; loopOptimized: boolean; crossfadeDuration?: number }) => void
  setClipPartInfo: (sourceId: string, clipId: string, partInfo: PartInfoUI) => void
  setClipOverride: (sourceId: string, clipId: string, key: keyof ClipRenderSettings, value: ClipRenderSettings[keyof ClipRenderSettings]) => void
  clearClipOverrides: (sourceId: string, clipId: string) => void
  resetClipBoundaries: (sourceId: string, clipId: string) => void
  rescoreClip: (sourceId: string, clipId: string, newScore: number, newReasoning: string, newHookText?: string) => void
  setClipAIEditPlan: (sourceId: string, clipId: string, plan: AIEditPlan) => void
  clearClipAIEditPlan: (sourceId: string, clipId: string) => void
  setClipShots: (sourceId: string, clipId: string, shots: ShotSegment[]) => void
  clearClipShots: (sourceId: string, clipId: string) => void
  setClipSegments: (sourceId: string, clipId: string, segments: VideoSegment[]) => void
  setShotStyle: (sourceId: string, clipId: string, shotIndex: number, presetId: string) => void
  clearShotStyle: (sourceId: string, clipId: string, shotIndex: number) => void
  setClipShotStyles: (sourceId: string, clipId: string, assignments: ShotStyleAssignment[]) => void
  clearAllShotStyles: (sourceId: string, clipId: string) => void
  setClipFillers: (sourceId: string, clipId: string, segments: FillerSegmentUI[], timeSaved: number) => void
  toggleFillerRestore: (sourceId: string, clipId: string, segmentIndex: number) => void
  clearClipFillers: (sourceId: string, clipId: string) => void
  approveAll: (sourceId: string) => void
  approveClipsAboveScore: (sourceId: string, minScore: number) => { approved: number; rejected: number }
  rejectAll: (sourceId: string) => void
  setSelectedClipIndex: (index: number) => void

  toggleClipSelection: (clipId: string) => void
  selectAllVisible: (clipIds: string[]) => void
  clearSelection: () => void
  batchUpdateClips: (sourceId: string, clipIds: string[], updates: Partial<Pick<ClipCandidate, 'status'> & { trimOffsetSeconds: number; overrides: Partial<ClipRenderSettings> }>) => void

  getApprovedClips: (sourceId: string) => ClipCandidate[]
  getActiveClips: () => ClipCandidate[]
}

export const createClipsSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  ClipsSlice
> = (set, get) => ({
  clips: {},
  selectedClipIndex: 0,
  selectedClipIds: new Set<string>(),

  // --- Clips ---

  setClips: (sourceId, clips) =>
    set((state) => {
      const existing = state.clips[sourceId] ?? []
      const existingMap = new Map(existing.map((c) => [c.id, c]))
      const stamped = clips.map((c) => {
        const prev = existingMap.get(c.id)
        return {
          ...c,
          aiStartTime: prev?.aiStartTime ?? c.startTime,
          aiEndTime: prev?.aiEndTime ?? c.endTime
        }
      })
      state.clips[sourceId] = stamped
    }),

  updateClipStatus: (sourceId, clipId, status) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { status })
    })
  },

  updateClipTrim: (sourceId, clipId, startTime, endTime) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { startTime, endTime, duration: endTime - startTime })
    })
  },

  updateClipThumbnail: (sourceId, clipId, thumbnail) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { thumbnail })
    }),

  setClipCustomThumbnail: (sourceId, clipId, thumbnail) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { customThumbnail: thumbnail === null ? undefined : thumbnail })
    }),

  updateClipCrop: (sourceId, clipId, crop, opts) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      const patch: Partial<ClipCandidate> = {
        cropRegion: crop,
        cropTimeline: opts?.timeline,
        cropRegionSource: opts?.source ?? 'auto'
      }
      state.clips[sourceId] = updateItemById(sourceClips, clipId, patch)
    }),

  setClipManualCrop: (sourceId, clipId, crop) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, {
        cropRegion: crop,
        cropTimeline: undefined,
        cropRegionSource: 'manual'
      })
    }),

  resetClipCropSource: (sourceId, clipId) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, {
        cropRegionSource: 'auto'
      })
    }),

  updateClipHookText: (sourceId, clipId, hookText) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { hookText })
    })
  },

  updateClipLoop: (sourceId, clipId, loopData) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, loopData)
    }),

  approveAll: (sourceId) => {
    _pushUndo(get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = sourceClips.map((c) => ({ ...c, status: 'approved' as const }))
    })
  },

  approveClipsAboveScore: (sourceId, minScore) => {
    _pushUndo(get(), set)
    const sourceClips = get().clips[sourceId]
    if (!sourceClips) return { approved: 0, rejected: 0 }
    let approvedCount = 0
    let rejectedCount = 0
    const updated = sourceClips.map((c) => {
      if (c.score >= minScore) {
        if (c.status !== 'approved') approvedCount++
        return { ...c, status: 'approved' as const }
      } else {
        if (c.status !== 'rejected') rejectedCount++
        return { ...c, status: 'rejected' as const }
      }
    })
    set((state) => {
      state.clips[sourceId] = updated
    })
    return { approved: approvedCount, rejected: rejectedCount }
  },

  rejectAll: (sourceId) => {
    _pushUndo(get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = sourceClips.map((c) => ({ ...c, status: 'rejected' as const }))
    })
  },

  setSelectedClipIndex: (index) => set({ selectedClipIndex: index }),

  // --- Batch multi-select ---

  toggleClipSelection: (clipId) =>
    set((state) => {
      const next = new Set(state.selectedClipIds)
      if (next.has(clipId)) {
        next.delete(clipId)
      } else {
        next.add(clipId)
      }
      state.selectedClipIds = next
    }),

  selectAllVisible: (clipIds) =>
    set({ selectedClipIds: new Set(clipIds) }),

  clearSelection: () =>
    set({ selectedClipIds: new Set<string>() }),

  batchUpdateClips: (sourceId, clipIds, updates) => {
    _pushUndo(get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      const idSet = new Set(clipIds)
      const updated = sourceClips.map((c) => {
        if (!idSet.has(c.id)) return c
        let next = { ...c }
        if (updates.status !== undefined) {
          next = { ...next, status: updates.status }
        }
        if (updates.trimOffsetSeconds !== undefined && updates.trimOffsetSeconds !== 0) {
          const offset = updates.trimOffsetSeconds
          const newStart = Math.max(0, c.startTime + offset)
          const newEnd = c.endTime + offset
          if (newEnd > newStart + 0.5) {
            next = { ...next, startTime: newStart, endTime: newEnd, duration: newEnd - newStart }
          }
        }
        if (updates.overrides !== undefined) {
          next = { ...next, overrides: { ...c.overrides, ...updates.overrides } }
        }
        return next
      })
      state.clips[sourceId] = updated
    })
  },

  setClipPartInfo: (sourceId, clipId, partInfo) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { partInfo })
    }),

  setClipOverride: (sourceId, clipId, key, value) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, (c) => ({ overrides: { ...c.overrides, [key]: value } }))
    })
  },

  clearClipOverrides: (sourceId, clipId) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { overrides: undefined })
    })
  },

  resetClipBoundaries: (sourceId, clipId) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, (c) => {
        const start = c.aiStartTime ?? c.startTime
        const end = c.aiEndTime ?? c.endTime
        return { startTime: start, endTime: end, duration: end - start }
      })
    })
  },

  rescoreClip: (sourceId, clipId, newScore, newReasoning, newHookText) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, (c) => ({
        score: newScore,
        reasoning: newReasoning,
        ...(newHookText ? { hookText: newHookText } : {}),
        originalScore: c.originalScore ?? c.score
      }))
    }),

  setClipAIEditPlan: (sourceId, clipId, plan) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { aiEditPlan: plan })
    }),

  clearClipAIEditPlan: (sourceId, clipId) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { aiEditPlan: undefined })
    }),

  setClipShots: (sourceId, clipId, shots) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { shots })
    }),

  clearClipShots: (sourceId, clipId) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { shots: undefined })
    }),

  setClipSegments: (sourceId, clipId, segments) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { segments })
    }),

  setShotStyle: (sourceId, clipId, shotIndex, presetId) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      const clip = sourceClips.find((c) => c.id === clipId)
      if (!clip) return
      const existing = clip.shotStyles ?? []
      const updated = existing.filter((a) => a.shotIndex !== shotIndex)
      updated.push({ shotIndex, presetId })
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { shotStyles: updated })
    })
  },

  clearShotStyle: (sourceId, clipId, shotIndex) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      const clip = sourceClips.find((c) => c.id === clipId)
      if (!clip?.shotStyles) return
      const updated = clip.shotStyles.filter((a) => a.shotIndex !== shotIndex)
      state.clips[sourceId] = updateItemById(sourceClips, clipId, {
        shotStyles: updated.length > 0 ? updated : undefined
      })
    })
  },

  setClipShotStyles: (sourceId, clipId, assignments) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, {
        shotStyles: assignments.length > 0 ? assignments : undefined
      })
    })
  },

  clearAllShotStyles: (sourceId, clipId) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { shotStyles: undefined })
    })
  },

  setClipFillers: (sourceId, clipId, segments, timeSaved) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { fillerSegments: segments, fillerTimeSaved: timeSaved, restoredFillerIndices: [] })
    }),

  toggleFillerRestore: (sourceId, clipId, segmentIndex) => {
    _pushClipUndo(sourceId, clipId, get(), set)
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, (c) => {
        const restored = [...(c.restoredFillerIndices ?? [])]
        const idx = restored.indexOf(segmentIndex)
        if (idx >= 0) restored.splice(idx, 1)
        else restored.push(segmentIndex)
        return { restoredFillerIndices: restored }
      })
    })
  },

  clearClipFillers: (sourceId, clipId) =>
    set((state) => {
      const sourceClips = state.clips[sourceId]
      if (!sourceClips) return
      state.clips[sourceId] = updateItemById(sourceClips, clipId, { fillerSegments: undefined, fillerTimeSaved: undefined, restoredFillerIndices: undefined })
    }),

  // --- Computed ---

  getApprovedClips: (sourceId) => {
    const sourceClips = get().clips[sourceId] ?? []
    return sourceClips.filter((c) => c.status === 'approved')
  },

  getActiveClips: () => {
    const { clips, activeSourceId } = get()
    if (!activeSourceId) return []
    const sourceClips = clips[activeSourceId] ?? []
    return [...sourceClips].sort((a, b) => b.score - a.score)
  },
})
