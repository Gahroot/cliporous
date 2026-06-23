import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useStore } from '../store'
import type { SourceVideo } from '../store'

/**
 * useLongformPipeline — drives the Hormozi long-form (16:9) flow end-to-end:
 *
 *   1. resolve source path (local pass-through / YouTube download)
 *   2. transcribe (Python ASR sidecar)
 *   3. generate the AI long-form edit plan (Gemini)
 *   4. start a single-job batch render with `outputProfile: 'longform'`
 *
 * Progress is driven through the same `pipeline.stage` transitions the
 * short-form flow uses, so the existing ProcessingScreen + RenderScreen
 * routing (selectScreen) displays it without modification. The render itself
 * reports through the standard `render:*` send events that RenderScreen
 * already subscribes to.
 */
export function useLongformPipeline(): {
  processLongform: (source: SourceVideo) => Promise<void>
  cancelLongform: () => void
} {
  const setPipeline = useStore((s) => s.setPipeline)
  const setTranscription = useStore((s) => s.setTranscription)
  const setRenderProgress = useStore((s) => s.setRenderProgress)
  const setIsRendering = useStore((s) => s.setIsRendering)
  const clearRenderErrors = useStore((s) => s.clearRenderErrors)
  const addError = useStore((s) => s.addError)

  const cancelledRef = useRef(false)

  const cancelLongform = useCallback(() => {
    cancelledRef.current = true
    void window.api.cancelRender()
    setIsRendering(false)
    setPipeline({ stage: 'idle', message: '', percent: 0 })
  }, [setIsRendering, setPipeline])

  const processLongform = useCallback(
    async (source: SourceVideo): Promise<void> => {
      cancelledRef.current = false

      const check = (): void => {
        if (cancelledRef.current) throw new Error('Processing cancelled')
      }

      try {
        if (!navigator.onLine) {
          const msg = 'No internet connection. Long-form editing requires Gemini access.'
          setPipeline({ stage: 'error', message: msg, percent: 0 })
          addError({ source: 'pipeline', message: msg })
          return
        }

        const state = useStore.getState()
        const geminiApiKey = state.settings.geminiApiKey
        const outputDirectory = state.settings.outputDirectory

        if (!geminiApiKey) {
          const msg = 'Set a Gemini API key in Settings before running a long-form edit.'
          setPipeline({ stage: 'error', message: msg, percent: 0 })
          addError({ source: 'pipeline', message: msg })
          toast.error(msg)
          return
        }
        if (!outputDirectory) {
          const msg = 'Set an output directory in Settings before rendering.'
          setPipeline({ stage: 'error', message: msg, percent: 0 })
          addError({ source: 'pipeline', message: msg })
          toast.error(msg)
          return
        }

        // ── Step 1: Resolve source path ─────────────────────────────────
        setPipeline({ stage: 'downloading', message: 'Preparing source…', percent: 0 })
        let sourcePath = source.path
        let duration = source.duration
        if (source.origin === 'youtube' && source.youtubeUrl && !sourcePath) {
          const unsub = window.api.onYouTubeProgress(({ percent }) => {
            setPipeline({
              stage: 'downloading',
              message: `Downloading… ${Math.round(percent)}%`,
              percent: Math.round(percent)
            })
          })
          try {
            const result = await window.api.downloadYouTube(source.youtubeUrl)
            sourcePath = result.path
            if (typeof result.duration === 'number' && result.duration > 0) {
              duration = result.duration
            }
          } finally {
            unsub()
          }
        }
        check()
        if (!duration || duration <= 0) {
          try {
            const meta = await window.api.getMetadata(sourcePath)
            if (meta?.duration > 0) duration = meta.duration
          } catch {
            /* duration backfilled from transcript below */
          }
        }

        // ── Step 2: Transcribe ──────────────────────────────────────────
        setPipeline({ stage: 'transcribing', message: 'Extracting audio…', percent: 5 })
        const stagePercents: Record<string, number> = {
          'extracting-audio': 10,
          'downloading-model': 20,
          'loading-model': 50,
          transcribing: 70
        }
        const unsubT = window.api.onTranscribeProgress(({ stage, message, percent }) => {
          let p = stagePercents[stage] ?? 50
          if (stage === 'downloading-model' && typeof percent === 'number') {
            p = Math.round(20 + (percent / 100) * 30)
          }
          setPipeline({ stage: 'transcribing', message, percent: p })
        })
        let transcription: {
          text: string
          words: Array<{ text: string; start: number; end: number }>
          segments: Array<{ text: string; start: number; end: number }>
        }
        try {
          transcription = await window.api.transcribeVideo(sourcePath)
        } finally {
          unsubT()
        }
        check()

        const formattedForAI = await window.api.formatTranscriptForAI(transcription)
        setTranscription(source.id, {
          text: transcription.text,
          words: transcription.words,
          segments: transcription.segments,
          formattedForAI
        })

        if (!duration || duration <= 0) {
          const lastWord = transcription.words[transcription.words.length - 1]
          duration = lastWord?.end ?? 0
        }

        // ── Step 3: AI long-form edit plan ──────────────────────────────
        setPipeline({ stage: 'ai-editing', message: 'Designing the edit…', percent: 30 })
        const plan = await window.api.generateLongformEditPlan(
          geminiApiKey,
          transcription.words,
          duration
        )
        check()
        toast.message(
          `Edit plan: ${plan.phrases.length} phrase${plan.phrases.length === 1 ? '' : 's'}, ` +
            `${plan.blocks.length} block${plan.blocks.length === 1 ? '' : 's'}`
        )

        // ── Step 4: Render ──────────────────────────────────────────────
        clearRenderErrors()
        setRenderProgress([{ clipId: source.id, percent: 0, status: 'queued' }])
        setIsRendering(true)
        setPipeline({ stage: 'rendering', message: '', percent: 0 })

        await window.api.startBatchRender({
          outputDirectory,
          outputProfile: 'longform',
          longformEditPlan: plan,
          renderQuality: state.settings.renderQuality,
          developerMode: state.settings.developerMode,
          geminiApiKey,
          sourceMeta: {
            name: source.name,
            path: sourcePath,
            duration
          },
          jobs: [
            {
              clipId: source.id,
              sourceVideoPath: sourcePath,
              startTime: 0,
              endTime: duration
            }
          ]
        })
        // Completion + per-job progress are delivered via the render:* events
        // that RenderScreen subscribes to (it flips pipeline → 'done').
      } catch (err) {
        if (cancelledRef.current) return
        const message = err instanceof Error ? err.message : String(err)
        setIsRendering(false)
        setPipeline({ stage: 'error', message, percent: 0 })
        addError({ source: 'pipeline', message: `Long-form: ${message}` })
        toast.error(`Long-form failed: ${message}`)
      }
    },
    [setPipeline, setTranscription, setRenderProgress, setIsRendering, clearRenderErrors, addError]
  )

  return { processLongform, cancelLongform }
}
