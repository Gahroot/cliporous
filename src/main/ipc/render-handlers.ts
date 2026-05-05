import { BrowserWindow, ipcMain } from 'electron'
import { Ch } from '@shared/ipc-channels'
import { wrapHandler } from '../ipc-error-handler'
import { startBatchRender, cancelRender } from '../render/pipeline'
import type { RenderBatchOptions } from '../render/types'
import { extractBRollKeywords } from '../broll-keywords'
import { fetchBRollClips, type BRollVideoResult } from '../broll-pexels'
import { buildBRollPlacements } from '../broll-placement'
import { generateBRollImage } from '../broll-image-gen'
import { imageToVideoClip } from '../broll-image-overlay'
import type { BRollSettings as BRollSettingsConfig } from '../broll-placement'
import type { PreviewRenderConfig } from '../render/preview'
import {
  resolveShotStyles,
  buildPresetLookup,
  type StylePresetForResolution
} from '../render/shot-style-resolver'

export function registerRenderHandlers(): void {
  // Render — start a batch render of approved clips
  ipcMain.handle(
    Ch.Invoke.RENDER_START_BATCH,
    wrapHandler(Ch.Invoke.RENDER_START_BATCH, async (event, options: RenderBatchOptions) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) throw new Error('No BrowserWindow found for render request')

      // ── Phase 1: B-Roll placement generation ────────────────────────────────
      // When B-Roll is enabled, generate placements for each clip.
      if (
        options.broll?.enabled &&
        (options.broll.pexelsApiKey || options.broll.sourceMode === 'ai-generated')
      ) {
        for (const job of options.jobs) {
          // Skip clips that already have pre-computed placements
          if (job.brollPlacements && job.brollPlacements.length > 0) continue

          win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
            clipId: job.clipId,
            message: 'Generating B-Roll placements…',
            percent: 5
          })

          const clipDuration = job.endTime - job.startTime
          const clipWords = (job.wordTimestamps ?? []).filter(
            (w) => w.start >= job.startTime && w.end <= job.endTime
          )

          try {
            const sourceMode = options.broll.sourceMode ?? 'auto'
            const geminiApiKey = options.geminiApiKey ?? ''
            const styleCategory = options.styleCategory ?? 'custom'

            // Extract keywords via Gemini (requires transcript text)
            win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
              clipId: job.clipId,
              message: 'Extracting B-Roll keywords…',
              percent: 10
            })
            const localWords = clipWords.map((w) => ({
              text: w.text,
              start: w.start - job.startTime,
              end: w.end - job.startTime
            }))
            const transcriptText = clipWords.map((w) => w.text).join(' ')
            const keywords = await extractBRollKeywords(
              transcriptText,
              localWords,
              0,
              clipDuration,
              options.broll.pexelsApiKey || geminiApiKey
            )

            if (keywords.length === 0) {
              console.log(`[B-Roll] Clip ${job.clipId}: no keywords — skipping`)
              continue
            }

            // ── Route each keyword to stock (Pexels) or AI-generated image ──────
            const uniqueKeywords = Array.from(new Set(keywords.map((k) => k.keyword)))
            const downloadedClips = new Map<string, BRollVideoResult>()

            // Partition keywords into stock vs AI-generated based on sourceMode.
            // 'auto' defaults to stock when no per-keyword suggestion is available.
            const stockKeywords: string[] = []
            const aiKeywords: string[] = []

            for (const kw of uniqueKeywords) {
              if (sourceMode === 'ai-generated') {
                aiKeywords.push(kw)
              } else {
                stockKeywords.push(kw)
              }
            }

            // Fetch Pexels stock footage for stock keywords
            if (stockKeywords.length > 0 && options.broll.pexelsApiKey) {
              win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message: `Downloading stock footage for ${stockKeywords.length} keyword(s)…`,
                percent: 20
              })
              const pexelsClips = await fetchBRollClips(
                stockKeywords,
                options.broll.pexelsApiKey,
                options.broll.clipDuration
              )
              pexelsClips.forEach((clip, kw) => {
                downloadedClips.set(kw, clip)
              })
            }

            // Generate AI images for ai-generated keywords, convert to video clips
            if (aiKeywords.length > 0 && geminiApiKey) {
              const fullTranscriptText = clipWords.map((w) => w.text).join(' ')

              win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message: `Generating ${aiKeywords.length} AI image(s)…`,
                percent: 30
              })

              for (let ki = 0; ki < aiKeywords.length; ki++) {
                const kw = aiKeywords[ki]
                try {
                  // Get a few words of transcript context around the keyword's timestamp
                  const kwEntry = keywords.find((k) => k.keyword === kw)
                  const contextWords = fullTranscriptText
                    .split(/\s+/)
                    .slice(
                      Math.max(0, Math.floor((kwEntry?.timestamp ?? 0) * 3) - 10),
                      Math.floor((kwEntry?.timestamp ?? 0) * 3) + 20
                    )
                    .join(' ')

                  const imageResult = await generateBRollImage(
                    kw,
                    contextWords,
                    styleCategory,
                    geminiApiKey
                  )
                  if (imageResult) {
                    const videoPath = await imageToVideoClip(
                      imageResult.filePath,
                      options.broll.clipDuration
                    )
                    downloadedClips.set(kw, {
                      filePath: videoPath,
                      duration: options.broll.clipDuration,
                      keyword: kw,
                      pexelsId: 0 // Not from Pexels — AI-generated
                    })
                    console.log(`[B-Roll] AI image generated for "${kw}"`)
                    win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                      clipId: job.clipId,
                      message: `Generated B-Roll image: "${kw}"`,
                      percent: 30 + Math.round(((ki + 1) / aiKeywords.length) * 20)
                    })
                  }
                } catch (aiErr) {
                  const aiMsg = aiErr instanceof Error ? aiErr.message : String(aiErr)
                  console.warn(`[B-Roll] AI generation failed for "${kw}": ${aiMsg}`)
                }
              }
            }

            if (downloadedClips.size === 0) {
              console.log(`[B-Roll] Clip ${job.clipId}: no clips downloaded — skipping`)
              continue
            }

            // Build placements from keywords + downloaded footage
            win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
              clipId: job.clipId,
              message: 'Building B-Roll placements…',
              percent: 80
            })

            const brollSettings: BRollSettingsConfig = {
              enabled: true,
              pexelsApiKey: options.broll.pexelsApiKey,
              intervalSeconds: options.broll.intervalSeconds,
              clipDuration: options.broll.clipDuration,
              displayMode: options.broll.displayMode,
              transition: options.broll.transition,
              pipSize: options.broll.pipSize,
              pipPosition: options.broll.pipPosition
            }

            job.brollPlacements = buildBRollPlacements(
              clipDuration,
              keywords,
              downloadedClips,
              brollSettings
            )

            console.log(
              `[B-Roll] Clip ${job.clipId}: generated ${job.brollPlacements.length} placement(s)`
            )

            win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
              clipId: job.clipId,
              message: `B-Roll ready (${job.brollPlacements.length} placement${job.brollPlacements.length !== 1 ? 's' : ''})`,
              percent: 90
            })
          } catch (brollErr) {
            const msg = brollErr instanceof Error ? brollErr.message : String(brollErr)
            console.warn(`[B-Roll] Clip ${job.clipId}: placement generation failed — ${msg}`)
            // Don't abort the whole batch — just skip B-Roll for this clip
          }
        }
      }

      // ── Phase 1.5: Resolve per-shot style assignments ───────────────────────
      // When clips have shotStyles (preset IDs) and shots (time ranges), resolve
      // them into concrete ShotStyleConfig objects that the render features consume.
      if (options.stylePresets && options.stylePresets.length > 0) {
        const presetLookup = buildPresetLookup(
          options.stylePresets as StylePresetForResolution[]
        )

        for (const job of options.jobs) {
          if (
            !job.shotStyles ||
            job.shotStyles.length === 0 ||
            !job.shots ||
            job.shots.length === 0
          ) {
            continue
          }

          try {
            win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
              clipId: job.clipId,
              message: 'Resolving shot styles…',
              percent: 91
            })

            job.shotStyleConfigs = resolveShotStyles(
              job.shotStyles,
              job.shots as import('@shared/types').ShotSegment[],
              presetLookup
            )

            if (job.shotStyleConfigs.length > 0) {
              console.log(
                `[ShotStyles] Clip ${job.clipId}: resolved ${job.shotStyleConfigs.length} per-shot style config(s)`
              )
            }
          } catch (err) {
            console.warn(`[ShotStyles] Clip ${job.clipId}: resolution failed —`, err)
          }
        }
      }

      startBatchRender(options, win).catch((err) => {
        console.error('[render-pipeline] Unhandled error:', err)
        event.sender.send(Ch.Send.RENDER_BATCH_DONE, {
          completed: 0,
          failed: options.jobs.length,
          total: options.jobs.length
        })
      })
      return { started: true }
    })
  )

  // Render — cancel the active batch
  ipcMain.handle(
    Ch.Invoke.RENDER_CANCEL,
    wrapHandler(Ch.Invoke.RENDER_CANCEL, () => {
      cancelRender()
    })
  )

  // Render — fast low-quality preview
  ipcMain.handle(
    Ch.Invoke.RENDER_PREVIEW,
    wrapHandler(Ch.Invoke.RENDER_PREVIEW, async (_event, config: PreviewRenderConfig) => {
      const { renderPreview } = await import('../render/preview')
      const previewPath = await renderPreview(config)
      return { previewPath }
    })
  )

  // Render — clean up a preview temp file
  ipcMain.handle(
    Ch.Invoke.RENDER_CLEANUP_PREVIEW,
    wrapHandler(Ch.Invoke.RENDER_CLEANUP_PREVIEW, async (_event, previewPath: string) => {
      const { cleanupPreviewFile } = await import('../render/preview')
      cleanupPreviewFile(previewPath)
    })
  )
}
