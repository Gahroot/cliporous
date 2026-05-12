import type { StateCreator } from 'zustand'
import type {
  AppState,
  ClipRenderSettings,
  CropRegion,
  StitchedClipCandidate,
} from './types'
import type { VideoSegment } from '@shared/types'
import { updateItemById } from './helpers'

// ---------------------------------------------------------------------------
// Stitched Clips Slice
//
// Mirrors clips-slice for stitched clip candidates. Stitched clips live in
// their own keyed dict so the scalar startTime / endTime contract on regular
// ClipCandidates stays intact.
// ---------------------------------------------------------------------------

export interface StitchedClipsSlice {
  stitchedClips: Record<string, StitchedClipCandidate[]>

  setStitchedClips: (sourceId: string, clips: StitchedClipCandidate[]) => void
  updateStitchedClipStatus: (
    sourceId: string,
    clipId: string,
    status: StitchedClipCandidate['status']
  ) => void
  updateStitchedClipThumbnail: (sourceId: string, clipId: string, thumbnail: string) => void
  setStitchedClipCustomThumbnail: (
    sourceId: string,
    clipId: string,
    thumbnail: string | null
  ) => void
  updateStitchedClipHookText: (sourceId: string, clipId: string, hookText: string) => void
  setStitchedClipSegments: (
    sourceId: string,
    clipId: string,
    segments: VideoSegment[]
  ) => void
  setStitchedClipFaceCrops: (
    sourceId: string,
    clipId: string,
    cropRegion: CropRegion | undefined,
    rangeCropRects: Array<{ x: number; y: number; width: number; height: number }> | undefined
  ) => void
  setStitchedClipOverride: (
    sourceId: string,
    clipId: string,
    key: keyof ClipRenderSettings,
    value: ClipRenderSettings[keyof ClipRenderSettings]
  ) => void
  approveAllStitched: (sourceId: string) => void
  rejectAllStitched: (sourceId: string) => void

  getApprovedStitchedClips: (sourceId: string) => StitchedClipCandidate[]
  getActiveStitchedClips: () => StitchedClipCandidate[]
}

export const createStitchedClipsSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  StitchedClipsSlice
> = (set, get) => ({
  stitchedClips: {},

  setStitchedClips: (sourceId, clips) =>
    set((state) => {
      const existing = state.stitchedClips[sourceId] ?? []
      const existingMap = new Map(existing.map((c) => [c.id, c]))
      const stamped = clips.map((c) => {
        const prev = existingMap.get(c.id)
        return {
          ...c,
          originalScore: prev?.originalScore ?? c.score,
        }
      })
      state.stitchedClips[sourceId] = stamped
    }),

  updateStitchedClipStatus: (sourceId, clipId, status) =>
    set((state) => {
      const sourceClips = state.stitchedClips[sourceId]
      if (!sourceClips) return
      state.stitchedClips[sourceId] = updateItemById(sourceClips, clipId, { status })
    }),

  updateStitchedClipThumbnail: (sourceId, clipId, thumbnail) =>
    set((state) => {
      const sourceClips = state.stitchedClips[sourceId]
      if (!sourceClips) return
      state.stitchedClips[sourceId] = updateItemById(sourceClips, clipId, { thumbnail })
    }),

  setStitchedClipCustomThumbnail: (sourceId, clipId, thumbnail) =>
    set((state) => {
      const sourceClips = state.stitchedClips[sourceId]
      if (!sourceClips) return
      state.stitchedClips[sourceId] = updateItemById(sourceClips, clipId, {
        customThumbnail: thumbnail === null ? undefined : thumbnail,
      })
    }),

  updateStitchedClipHookText: (sourceId, clipId, hookText) =>
    set((state) => {
      const sourceClips = state.stitchedClips[sourceId]
      if (!sourceClips) return
      state.stitchedClips[sourceId] = updateItemById(sourceClips, clipId, { hookText })
    }),

  setStitchedClipSegments: (sourceId, clipId, segments) =>
    set((state) => {
      const sourceClips = state.stitchedClips[sourceId]
      if (!sourceClips) return
      state.stitchedClips[sourceId] = updateItemById(sourceClips, clipId, { segments })
    }),

  setStitchedClipFaceCrops: (sourceId, clipId, cropRegion, rangeCropRects) =>
    set((state) => {
      const sourceClips = state.stitchedClips[sourceId]
      if (!sourceClips) return
      state.stitchedClips[sourceId] = updateItemById(sourceClips, clipId, {
        cropRegion,
        rangeCropRects,
      })
    }),

  setStitchedClipOverride: (sourceId, clipId, key, value) =>
    set((state) => {
      const sourceClips = state.stitchedClips[sourceId]
      if (!sourceClips) return
      state.stitchedClips[sourceId] = updateItemById(sourceClips, clipId, (c) => ({
        overrides: { ...c.overrides, [key]: value },
      }))
    }),

  approveAllStitched: (sourceId) =>
    set((state) => {
      const sourceClips = state.stitchedClips[sourceId]
      if (!sourceClips) return
      state.stitchedClips[sourceId] = sourceClips.map((c) => ({
        ...c,
        status: 'approved' as const,
      }))
    }),

  rejectAllStitched: (sourceId) =>
    set((state) => {
      const sourceClips = state.stitchedClips[sourceId]
      if (!sourceClips) return
      state.stitchedClips[sourceId] = sourceClips.map((c) => ({
        ...c,
        status: 'rejected' as const,
      }))
    }),

  getApprovedStitchedClips: (sourceId) => {
    const sourceClips = get().stitchedClips[sourceId] ?? []
    return sourceClips.filter((c) => c.status === 'approved')
  },

  getActiveStitchedClips: () => {
    const { stitchedClips, activeSourceId } = get()
    if (!activeSourceId) return []
    const sourceClips = stitchedClips[activeSourceId] ?? []
    return [...sourceClips].sort((a, b) => b.score - a.score)
  },
})
