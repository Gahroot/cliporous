import { createStageReporter } from '../../lib/progress-reporter'
import type { PipelineContext } from './types'

/** Result of the download stage — the resolved local file path. */
export interface DownloadResult {
  sourcePath: string
}

/** YouTube download with progress tracking, or pass-through for local files. */
export async function downloadStage(ctx: PipelineContext): Promise<DownloadResult> {
  const { source, check, setPipeline, shouldSkip, store, getState } = ctx
  const reporter = createStageReporter(setPipeline, 'downloading')
  const isYouTube = source.origin === 'youtube'
  // Intentionally reading latest state at execution time — cachedSourcePath
  // is written during a prior pipeline run and must be fetched live.
  let sourcePath = ctx.shouldSkip('downloading')
    ? (getState().cachedSourcePath || source.path)
    : source.path

  // Track metadata writes back to the source so later stages see real values.
  let resolvedDuration = source.duration
  let resolvedName = source.name

  if (shouldSkip('downloading')) {
    // Already completed — skip
  } else if (isYouTube && source.youtubeUrl && !source.path) {
    reporter.start('Starting download…')
    check()

    const unsubYT = window.api.onYouTubeProgress(({ percent }) => {
      reporter.update(`Downloading… ${Math.round(percent)}%`, Math.round(percent))
    })

    try {
      const result = await window.api.downloadYouTube(source.youtubeUrl)
      sourcePath = result.path
      // The yt-dlp script returns title + duration; persist both so downstream
      // stages (scoring, loop optimization) get a real videoDuration. Without
      // this, source.duration stays 0 and the scoring validator rejects every
      // segment with `start-past-video-end`.
      if (typeof result.duration === 'number' && result.duration > 0) {
        resolvedDuration = result.duration
      }
      if (result.title && result.title.trim()) {
        resolvedName = result.title.trim()
      }
    } finally {
      unsubYT()
    }
    check()
  } else if (isYouTube) {
    reporter.done('Video already downloaded')
  }

  // Backfill duration from ffprobe for any source missing it (local files
  // dropped without metadata, or YouTube downloads where yt-dlp didn't emit a
  // duration line). Non-fatal — if it fails, transcription will still set a
  // fallback at the end of this pipeline stage chain.
  if (sourcePath && (!resolvedDuration || resolvedDuration <= 0)) {
    try {
      const meta = await window.api.getMetadata(sourcePath)
      if (meta && typeof meta.duration === 'number' && meta.duration > 0) {
        resolvedDuration = meta.duration
      }
    } catch {
      // ignore — duration may still be filled in by transcription stage
    }
  }

  // Write the updated source back to the store so source.duration is correct
  // for clip-mapping-stage and loop-optimization-stage. We must read the
  // updateSource action via getState() because the slice was added after
  // PipelineContext.store was designed.
  //
  // NOTE: ctx.source is an immer-frozen object (the store freezes anything
  // passed into addSource()), so we cannot mutate it in place — that throws
  // "Cannot assign to read only property". Instead we write through the
  // store action and then re-point ctx.source at the fresh frozen snapshot
  // so downstream stages see the resolved values.
  if (
    resolvedDuration !== source.duration ||
    sourcePath !== source.path ||
    resolvedName !== source.name
  ) {
    getState().updateSource(source.id, {
      duration: resolvedDuration,
      path: sourcePath,
      name: resolvedName
    })
    const refreshed = getState().sources.find((s) => s.id === source.id)
    if (refreshed) ctx.source = refreshed
  }

  store.setCachedSourcePath(sourcePath)
  ctx.markStageCompleted('downloading')

  return { sourcePath }
}
