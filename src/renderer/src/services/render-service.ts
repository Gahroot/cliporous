/**
 * render-service — single entry point for kicking off a batch render of the
 * approved clips on the active source.
 *
 * Both the "Render Approved" button on `ClipGrid` and the "Render All" button
 * on `RenderScreen` call `startApprovedRender()`. Centralizing the logic keeps
 * the two call sites in lockstep:
 *
 *   1. Validate prerequisites (active source, approved clips, output dir).
 *   2. Reset per-batch UI state (errors, progress, summary).
 *   3. Flip pipeline → 'rendering' (which routes the user to RenderScreen)
 *      and set the global `isRendering` flag.
 *   4. Invoke `window.api.startBatchRender` with a job per approved clip and
 *      every render-feature setting from the store (captions, autoZoom,
 *      hook title, re-hook, B-roll, filler removal, API keys).
 *
 * Errors thrown by `startBatchRender` are caught and surfaced via the toast +
 * global error log; the pipeline stage falls back to 'error'. Per-clip
 * progress and completion are delivered through the `render:*` send events
 * which `RenderScreen` already subscribes to.
 */

import { toast } from 'sonner'

import { useStore } from '@/store'
import type { ClipCandidate } from '@/store/types'
import { PRESTYJ_CAPTION_STYLE } from './render-defaults'

interface StartApprovedRenderResult {
  started: boolean
  /** Reason returned when started=false. UI uses this for diagnostics only. */
  reason?: 'no-source' | 'no-clips' | 'no-output-dir' | 'invoke-failed'
}

export async function startApprovedRender(): Promise<StartApprovedRenderResult> {
  const state = useStore.getState()
  const {
    activeSourceId,
    sources,
    clips,
    settings,
    setRenderProgress,
    setIsRendering,
    setPipeline,
    clearRenderErrors,
    addError,
  } = state

  const activeSource = activeSourceId
    ? sources.find((s) => s.id === activeSourceId) ?? null
    : null

  if (!activeSource) {
    toast.error('No active source video')
    return { started: false, reason: 'no-source' }
  }

  const approvedClips: ClipCandidate[] = (clips[activeSource.id] ?? []).filter(
    (c) => c.status === 'approved'
  )

  if (approvedClips.length === 0) {
    toast.error('No approved clips to render')
    return { started: false, reason: 'no-clips' }
  }

  const outputDirectory = settings.outputDirectory
  if (!outputDirectory) {
    toast.error('Set an output directory in Settings before rendering')
    return { started: false, reason: 'no-output-dir' }
  }

  // Reset per-batch UI state before kicking off the next run. RenderScreen
  // also resets `batchSummary` locally; that's fine — this only owns store
  // state.
  clearRenderErrors()
  setRenderProgress(
    approvedClips.map((c) => ({ clipId: c.id, percent: 0, status: 'queued' as const }))
  )
  setIsRendering(true)
  // Flipping to 'rendering' routes the user to RenderScreen via
  // selectScreen() in store/selectors.ts.
  setPipeline({ stage: 'rendering', message: '', percent: 0 })

  // ── Build B-roll options ─────────────────────────────────────────────────
  // Only include the broll block when enabled AND we have a key (or are in
  // ai-generated mode where Pexels isn't required). The main-process render
  // handler short-circuits when neither condition holds, but we mirror the
  // gate here so the toast is meaningful when the user forgets a key.
  const broll = settings.broll
  const brollOptions =
    broll.enabled && (settings.pexelsApiKey || false)
      ? {
          enabled: true,
          pexelsApiKey: settings.pexelsApiKey,
          intervalSeconds: broll.intervalSeconds,
          clipDuration: broll.clipDuration,
          displayMode: broll.displayMode,
          transition: broll.transition,
          pipSize: broll.pipSize,
          pipPosition: broll.pipPosition,
        }
      : undefined

  try {
    await window.api.startBatchRender({
      outputDirectory,
      renderConcurrency: settings.renderConcurrency,
      renderQuality: settings.renderQuality,
      outputAspectRatio: settings.outputAspectRatio,
      filenameTemplate: settings.filenameTemplate,
      developerMode: settings.developerMode,

      // ── Captions (V2: 3 modes, single builder) ─────────────────────────
      // Without captionStyle the captions feature short-circuits and
      // produces no subtitles, so we always send the PRESTYJ defaults.
      captionsEnabled: true,
      captionStyle: PRESTYJ_CAPTION_STYLE,

      // ── Visual features ─────────────────────────────────────────────
      autoZoom: settings.autoZoom,
      hookTitleOverlay: settings.hookTitleOverlay,
      rehookOverlay: settings.rehookOverlay,
      fillerRemoval: settings.fillerRemoval,
      broll: brollOptions,

      // ── Template layout (Template Editor: subtitle + hook position) ─────
      // The render pipeline reads only `subtitles.y` and `titleText.y`; the
      // x coordinates are forwarded for forward-compat. `rehookText` mirrors
      // `titleText` so the mid-clip pattern interrupt sits where the user
      // placed the hook.
      templateLayout: {
        titleText: settings.templateLayout.titleText,
        subtitles: settings.templateLayout.subtitles,
        rehookText: settings.templateLayout.titleText,
      },

      // ── AI / external service keys ─────────────────────────────────────
      // Required for B-roll keyword extraction & AI image generation.
      geminiApiKey: settings.geminiApiKey,

      sourceMeta: {
        name: activeSource.name,
        path: activeSource.path,
        duration: activeSource.duration,
      },
      jobs: approvedClips.map((c) => ({
        clipId: c.id,
        sourceVideoPath: activeSource.path,
        startTime: c.startTime,
        endTime: c.endTime,
        cropRegion: c.cropRegion
          ? {
              x: c.cropRegion.x,
              y: c.cropRegion.y,
              width: c.cropRegion.width,
              height: c.cropRegion.height,
            }
          : undefined,
        cropTimeline: c.cropTimeline,
        wordTimestamps: c.wordTimestamps,
        hookTitleText: c.hookText,
      })),
    })
    return { started: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setIsRendering(false)
    setPipeline({ stage: 'error', message: msg, percent: 0 })
    toast.error(`Couldn't start render: ${msg}`)
    addError({ source: 'render', message: `Couldn't start render: ${msg}` })
    return { started: false, reason: 'invoke-failed' }
  }
}
