import { useRef, useCallback } from 'react'
import { useStore } from '../store'
import type { SourceVideo, PipelineStage } from '../store'
import type { PipelineContext } from './pipeline-stages/types'
import {
  downloadStage,
  transcriptionStage,
  clipMappingStage,
  thumbnailStage,
  loopOptimizationStage,
  faceDetectionStage,
  segmentingStage,
  notificationStage
} from './pipeline-stages'

/** Ordered list of pipeline stages used to determine skip logic. */
const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  'downloading',
  'transcribing',
  'scoring',
  'optimizing-loops',
  'detecting-faces',
  'ai-editing',
  'segmenting'
]

export function usePipeline(): {
  processVideo: (source: SourceVideo, resumeFrom?: PipelineStage) => Promise<void>
  cancelProcessing: () => void
  isProcessing: () => boolean
} {
  const setPipeline = useStore((s) => s.setPipeline)
  const setTranscription = useStore((s) => s.setTranscription)
  const setClips = useStore((s) => s.setClips)
  const updateClipCrop = useStore((s) => s.updateClipCrop)
  const updateClipLoop = useStore((s) => s.updateClipLoop)
  const updateClipTrim = useStore((s) => s.updateClipTrim)
  const updateClipThumbnail = useStore((s) => s.updateClipThumbnail)
  const addError = useStore((s) => s.addError)
  const setClipPartInfo = useStore((s) => s.setClipPartInfo)
  const setClipSegments = useStore((s) => s.setClipSegments)
  const markStageCompleted = useStore((s) => s.markStageCompleted)
  const setFailedPipelineStage = useStore((s) => s.setFailedPipelineStage)
  const setCachedSourcePath = useStore((s) => s.setCachedSourcePath)
  const clearPipelineCache = useStore((s) => s.clearPipelineCache)

  const cancelledRef = useRef(false)

  const cancelProcessing = useCallback(() => {
    cancelledRef.current = true
    setPipeline({ stage: 'idle', message: '', percent: 0 })
  }, [setPipeline])

  const processVideo = useCallback(
    async (source: SourceVideo, resumeFrom?: PipelineStage): Promise<void> => {
      cancelledRef.current = false

      // Track the last active stage so we know which stage failed
      let currentStage: PipelineStage = 'idle'

      try {
        console.log('[usePipeline] processVideo START', { sourceId: source.id, resumeFrom })
        if (!resumeFrom) {
          clearPipelineCache()
        }

        const shouldSkip = (stage: PipelineStage): boolean => {
          if (!resumeFrom) return false
          const resumeIdx = PIPELINE_STAGE_ORDER.indexOf(resumeFrom)
          const stageIdx = PIPELINE_STAGE_ORDER.indexOf(stage)
          return stageIdx < resumeIdx
        }

        const check = (): void => {
          if (cancelledRef.current) throw new Error('Processing cancelled')
        }

        // Guard: check connectivity before starting any network-dependent work
        if (!navigator.onLine) {
          const msg = 'No internet connection. AI scoring requires an internet connection.'
          setPipeline({ stage: 'error', message: msg, percent: 0 })
          addError({ source: 'pipeline', message: msg })
          return
        }

        // Intentionally reading latest state at execution time — settings and
        // processingConfig are read imperatively via getState() so the callback
        // doesn't need them in its dependency array.  This avoids unnecessary
        // re-creation of processVideo on every settings keystroke while ensuring
        // we always use the values that were current when the user clicked "Run".
        const currentState = useStore.getState()

        const ctx: PipelineContext = {
          source,
          check,
          setPipeline,
          addError,
          markStageCompleted,
          shouldSkip,
          getState: () => useStore.getState(),
          store: {
            setTranscription,
            setClips,
            updateClipCrop,
            updateClipLoop,
            updateClipTrim,
            updateClipThumbnail,
            setClipPartInfo,
            setCachedSourcePath,
            setClipSegments
          },
          geminiApiKey: currentState.settings.geminiApiKey,
          processingConfig: {
            targetDuration: currentState.processingConfig.targetDuration,
            enablePerfectLoop: currentState.processingConfig.enablePerfectLoop,
            clipEndMode: currentState.processingConfig.clipEndMode,
            enableMultiPart: currentState.processingConfig.enableMultiPart,
            enableAiEdit: currentState.processingConfig.enableAiEdit,
            targetAudience: currentState.processingConfig.targetAudience
          }
        }

        // ── Step 1: Download (YouTube only) ──────────────────────────
        currentStage = 'downloading'
        const { sourcePath } = await downloadStage(ctx)

        // ── Step 2: Transcribe ───────────────────────────────────────
        currentStage = 'transcribing'
        const transcription = await transcriptionStage(ctx, sourcePath)

        // ── Step 3: Score + map to clips ─────────────────────────────
        currentStage = 'scoring'
        let clips = await clipMappingStage(ctx, transcription)

        // ── Step 3.1: Generate thumbnails ────────────────────────────
        await thumbnailStage(ctx, sourcePath, clips)

        // ── Step 3.5: Clip boundary optimization ─────────────────────
        currentStage = 'optimizing-loops'
        clips = await loopOptimizationStage(ctx, transcription, clips)

        // ── Step 4: Face detection ───────────────────────────────────
        currentStage = 'detecting-faces'
        await faceDetectionStage(ctx, sourcePath, clips)

        // ── Step 5: Segment & style ──────────────────────────────────
        currentStage = 'segmenting'
        await segmentingStage(ctx, clips)

        // ── Done ─────────────────────────────────────────────────────
        notificationStage(ctx, clips)

        // Pipeline succeeded — clear the failed stage
        clearPipelineCache()
      } catch (err) {
        if (cancelledRef.current) return
        const message = err instanceof Error ? err.message : String(err)
        if (currentStage !== 'idle') {
          setFailedPipelineStage(currentStage)
        }
        setPipeline({ stage: 'error', message, percent: 0 })
        addError({ source: 'pipeline', message })
      }
    },
    // Only stable Zustand action references are listed here.  Reactive values
    // like settings and processingConfig are intentionally omitted — they are
    // read imperatively via useStore.getState() at the start of each run so the
    // callback always sees the latest values without re-creating on every edit.
    [
      setPipeline, setTranscription, setClips, updateClipCrop, updateClipLoop,
      updateClipTrim, updateClipThumbnail, addError, setClipPartInfo,
      setClipSegments, markStageCompleted, setFailedPipelineStage,
      setCachedSourcePath, clearPipelineCache
    ]
  )

  const isProcessing = useCallback((): boolean => {
    const stage = useStore.getState().pipeline.stage
    return (
      stage === 'downloading' ||
      stage === 'transcribing' ||
      stage === 'scoring' ||
      stage === 'optimizing-loops' ||
      stage === 'detecting-faces' ||
      stage === 'ai-editing' ||
      stage === 'segmenting'
    )
  }, [])

  return { processVideo, cancelProcessing, isProcessing }
}
