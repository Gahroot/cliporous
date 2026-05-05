import { createStageReporter } from '../../lib/progress-reporter'
import type { PipelineContext } from './types'

/** Result of the download stage — the resolved local file path. */
export interface DownloadResult {
  sourcePath: string
}

/** YouTube download with progress tracking, or pass-through for local files. */
export async function downloadStage(ctx: PipelineContext): Promise<DownloadResult> {
  const { source, check, setPipeline, shouldSkip, store } = ctx
  const reporter = createStageReporter(setPipeline, 'downloading')
  const isYouTube = source.origin === 'youtube'
  // Intentionally reading latest state at execution time — cachedSourcePath
  // is written during a prior pipeline run and must be fetched live.
  let sourcePath = ctx.shouldSkip('downloading')
    ? (ctx.getState().cachedSourcePath || source.path)
    : source.path

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
    } finally {
      unsubYT()
    }
    check()
  } else if (isYouTube) {
    reporter.done('Video already downloaded')
  }

  store.setCachedSourcePath(sourcePath)
  ctx.markStageCompleted('downloading')

  return { sourcePath }
}
