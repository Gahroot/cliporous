// ---------------------------------------------------------------------------
// Pipeline orchestrator — composable feature-based batch render
// ---------------------------------------------------------------------------
//
// Replaces the monolithic startBatchRender() in render-pipeline.ts with a
// modular feature pipeline. Each feature hooks into prepare → videoFilter →
// overlayPass → postProcess lifecycle phases.
// ---------------------------------------------------------------------------

import { BrowserWindow } from 'electron'
import { Ch } from '@shared/ipc-channels'
import { basename, dirname, extname } from 'path'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import type { FfmpegCommand } from '../ffmpeg'
import { getEncoder, getVideoMetadata } from '../ffmpeg'
import { OUTPUT_WIDTH, OUTPUT_HEIGHT, OUTPUT_FPS } from '../aspect-ratios'
import type { OutputAspectRatio } from '../aspect-ratios'
import { writeDescriptionFile } from '../ai/description-generator'
import {
  generateRenderManifest,
  writeManifestFiles,
  type ManifestJobMeta
} from '../export-manifest'

import type { RenderClipJob, RenderBatchOptions, RenderStitchedClipJob } from './types'
import type { RenderFeature, FilterContext, OverlayContext, PostProcessContext, OverlayPassResult } from './features/feature'
import { buildVideoFilter, renderClip, activeCommands } from './base-render'
import { assembleStitchedVideo } from './stitched-render'
import { renderSegmentedClip } from './segment-render'
import { tmpdir } from 'os'
import { join } from 'path'
import type { SegmentRenderConfig, ResolvedSegment } from './segment-render'
import { resolveQualityParams } from './quality'
import { buildOutputPath } from './filename'
import { getVariantById } from '../segment-styles'
import { getEditStyleById, resolveTemplate, DEFAULT_EDIT_STYLE_ID } from './../edit-styles/index'
import { ARCHETYPE_DEFAULT_TRANSITION_IN } from './../edit-styles/shared/archetypes'

// Feature imports
import { createFillerRemovalFeature } from './features/filler-removal.feature'
import { createCaptionsFeature } from './features/captions.feature'
import { createHookTitleFeature } from './features/hook-title.feature'
import { createRehookFeature } from './features/rehook.feature'
import { autoZoomFeature } from './features/auto-zoom.feature'
import { wordEmphasisFeature } from './features/word-emphasis.feature'
import { brollFeature } from './features/broll.feature'
import { shotTransitionFeature } from './features/shot-transition.feature'
import { accentColorFeature, restoreBatchOptions } from './features/accent-color.feature'

// ---------------------------------------------------------------------------
// Cancellation state
// ---------------------------------------------------------------------------

let cancelRequested = false

/**
 * Cancel the active render batch. Kills all running FFmpeg processes.
 */
export function cancelRender(): void {
  cancelRequested = true
  for (const cmd of activeCommands) {
    try { (cmd as FfmpegCommand).kill('SIGTERM') } catch { /* ignore */ }
  }
  activeCommands.clear()
}

// ---------------------------------------------------------------------------
// Stitched timeline remapping helpers
// ---------------------------------------------------------------------------

/**
 * Remap a source-video timestamp onto the concatenated stitched timeline.
 * Returns null when the timestamp falls outside every segment (i.e. it was
 * cut from the output).
 */
function remapSourceTime(
  sourceTime: number,
  segments: Array<{ startTime: number; endTime: number }>
): number | null {
  let concatStart = 0
  for (const seg of segments) {
    if (sourceTime >= seg.startTime && sourceTime <= seg.endTime) {
      return concatStart + (sourceTime - seg.startTime)
    }
    concatStart += seg.endTime - seg.startTime
  }
  return null
}

function remapWordTimestamps(
  words: Array<{ text: string; start: number; end: number }> | undefined,
  segments: Array<{ startTime: number; endTime: number }>
): Array<{ text: string; start: number; end: number }> | undefined {
  if (!words || words.length === 0) return words
  const out: Array<{ text: string; start: number; end: number }> = []
  for (const w of words) {
    const s = remapSourceTime(w.start, segments)
    const e = remapSourceTime(w.end, segments)
    if (s !== null && e !== null && e >= s) {
      out.push({ text: w.text, start: s, end: e })
    }
  }
  return out
}

function remapWordEmphasis<T extends { start: number; end: number }>(
  emphasis: T[] | undefined,
  segments: Array<{ startTime: number; endTime: number }>
): T[] | undefined {
  if (!emphasis || emphasis.length === 0) return emphasis
  const out: T[] = []
  for (const e of emphasis) {
    const s = remapSourceTime(e.start, segments)
    const en = remapSourceTime(e.end, segments)
    if (s !== null && en !== null && en >= s) {
      out.push({ ...e, start: s, end: en })
    }
  }
  return out
}


// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Start a batch render of approved clips using the composable feature pipeline.
 *
 * Flow per clip:
 *   1. feature.prepare()     — pre-render setup (generate ASS, detect fillers, etc.)
 *   2. buildVideoFilter()    — base crop + scale
 *   3. feature.videoFilter() — append feature-specific filters (auto-zoom)
 *   4. renderClip()          — base FFmpeg encode (+ logo, sound design, bumpers)
 *   5. feature.overlayPass() — collect overlay passes (captions, hook, rehook, bar)
 *   6. feature.postProcess() — post-processing (B-Roll)
 */
export async function startBatchRender(
  options: RenderBatchOptions,
  window: BrowserWindow
): Promise<void> {
  cancelRequested = false

  const { jobs, outputDirectory } = options
  const total = jobs.length

  // Ensure output directory exists
  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true })
  }

  // ── Create feature instances ──────────────────────────────────────────────
  // Registration order determines prepare() execution order.
  // Data flows via job mutation — earlier features write, later ones read.
  //
  //  1. filler-removal    — mutates job.sourceVideoPath, startTime, endTime, wordTimestamps
  //  2. brand-kit         — writes job.brandKit (consumed by base-render)
  //  3. accent-color      — reads clipOverrides.accentColor, overrides highlight/emphasis
  //                         colors in captionStyle, hookTitleOverlay, and per-shot
  //                         captionStyle — must run before any visual feature
  //  4. word-emphasis     — writes job.wordEmphasis + job.emphasisKeyframes
  //  5. captions          — reads job.wordEmphasis, generates ASS, fallback emphasisKeyframes
  //  6. hook-title        — generates ASS overlay file
  //  7. rehook            — reads hookTitleOverlay.displayDuration + textColor for appear time
  //  8. auto-zoom         — reads job.emphasisKeyframes for reactive zoom (prepare stores settings)
  //  9. broll             — reads job.brollPlacements + shotStyleConfigs.brollMode,
  //                         emits 'broll-transition' editEvents
  // 10. color-grade       — reads shotStyleConfigs, validates + logs color grade configs;
  //                         videoFilter applies per-shot eq/hue — must run BEFORE transitions
  //                         so crossfades blend between properly color-graded shots
  // 11. shot-transition   — reads shotStyleConfigs, emits 'shot-transition' editEvents;
  //                         videoFilter applies crossfade/swipe — runs AFTER color-grade
  //                         so transitions blend between styled shots
  // 12. sound-design      — reads ALL editEvents (broll + shot-transition + jump-cut),
  //                         validates job.soundPlacements
  //
  // Cross-feature data flow:
  //   filler-removal ──wordTimestamps──▸ word-emphasis (remapped timestamps)
  //   accent-color ──captionStyle colors──▸ captions, hook-title (+rehook)
  //   word-emphasis ──wordEmphasis──▸ captions (emphasis tags for ASS styling)
  //   word-emphasis ──emphasisKeyframes──▸ auto-zoom (reactive zoom keyframes)
  //   captions ──emphasisKeyframes (fallback)──▸ auto-zoom (if word-emphasis didn't produce them)
  //   IPC handler ──shotStyleConfigs──▸ captions, auto-zoom, broll, color-grade, shot-transition
  //   IPC handler ──brollPlacements──▸ broll (postProcess + edit event emission)
  //   broll ──editEvents['broll-transition']──▸ sound-design (B-Roll transition SFX sync)
  //   shot-transition ──editEvents['shot-transition']──▸ sound-design (shot boundary SFX sync)
  //   IPC handler ──soundPlacements──▸ sound-design (base render filter_complex)
  const features: RenderFeature[] = [
    createFillerRemovalFeature(),
    accentColorFeature,
    wordEmphasisFeature,
    createCaptionsFeature(),
    createHookTitleFeature(),
    createRehookFeature(),
    autoZoomFeature,
    brollFeature,
    shotTransitionFeature
  ]

  // ── Resolve batch-level config ────────────────────────────────────────────
  const qualityParams = resolveQualityParams(options.renderQuality)
  const outputFormat = options.renderQuality?.outputFormat ?? 'mp4'

  // Output is hard-locked to 720×1280 © 30fps (9:16 vertical).
  // outputAspectRatio and outputResolution are accepted for backward compat
  // but ignored — every clip renders at the locked dimensions.
  const effectiveAspectRatio: OutputAspectRatio = '9:16'
  const effectiveResolution: { width: number; height: number } = {
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT
  }

  // ── Determine effective concurrency ───────────────────────────────────────
  const currentEncoder = getEncoder(qualityParams)
  const encoderIsHardware = currentEncoder.encoder === 'h264_nvenc' || currentEncoder.encoder === 'h264_qsv'
  const requestedConcurrency = Math.max(1, Math.min(4, options.renderConcurrency ?? 1))
  const effectiveConcurrency = encoderIsHardware ? Math.min(2, requestedConcurrency) : requestedConcurrency

  console.log(
    `[Quality] preset=${options.renderQuality?.preset ?? 'normal'}, ` +
    `crf=${qualityParams.crf}, preset=${qualityParams.preset}, ` +
    `format=${outputFormat}, resolution=${effectiveResolution.width}x${effectiveResolution.height}, ` +
    `aspectRatio=${effectiveAspectRatio}`
  )
  console.log(
    `[Concurrency] requested=${requestedConcurrency}, effective=${effectiveConcurrency}, ` +
    `encoder=${currentEncoder.encoder}`
  )

  let completed = 0
  let failed = 0

  // Manifest tracking
  const manifestResults = new Map<string, string | null>()
  const manifestRenderTimes = new Map<string, number>()
  const batchStartTime = Date.now()

  // Cache video metadata per source file to avoid redundant ffprobe calls
  const metadataCache = new Map<string, { width: number; height: number; codec: string; fps: number; audioCodec: string; duration: number }>()

  // ── Per-clip job processor ────────────────────────────────────────────────

  const processJob = async (job: RenderClipJob, i: number): Promise<void> => {
    if (cancelRequested) return

    const outputPath = buildOutputPath(
      outputDirectory,
      job,
      i,
      outputFormat,
      options.filenameTemplate,
      { score: job.manifestMeta?.score ?? 0, quality: options.renderQuality?.preset ?? 'normal' }
    )

    // Safety: ensure output directory exists right before rendering
    const clipOutputDir = dirname(outputPath)
    if (!existsSync(clipOutputDir)) {
      mkdirSync(clipOutputDir, { recursive: true })
    }

    window.webContents.send(Ch.Send.RENDER_CLIP_START, {
      clipId: job.clipId,
      index: i,
      total,
      encoder: currentEncoder.encoder,
      encoderIsHardware
    })

    // Initial prepare-phase progress
    window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
      clipId: job.clipId,
      message: 'Preparing clip…',
      percent: 0
    })

    const clipStartTime = Date.now()
    let capturedCommand: string | undefined
    const allTempFiles: string[] = []

    try {
      // ── Stitched clip assembly pre-pass ──────────────────────────────────
      // Stitched clips are multiple source-video time ranges concatenated into
      // one output. We do ONLY the stitched-specific work here (per-segment
      // crop/layout via the edit-style template + concat into a raw MP4), then
      // rewrite the job to point at the assembled MP4 with remapped timestamps.
      // After this block, the job looks identical to a regular clip and runs
      // through the exact same feature pipeline — captions, hook title,
      // rehook, color grade, accent color, sound design, etc.
      if (job.stitchedSegments && job.stitchedSegments.length > 0) {
        window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
          clipId: job.clipId,
          message: 'Assembling stitched segments…',
          percent: 0
        })

        const stitchedStyleId = job.stylePresetId ?? DEFAULT_EDIT_STYLE_ID
        const styledStitchedSegments = job.stitchedSegments.map((seg) => {
          const archetype: import('@shared/types').Archetype =
            seg.role === 'hook' ? 'tight-punch'
            : seg.overlayText ? 'quote-lower'
            : 'talking-head'
          const resolved = resolveTemplate(archetype, stitchedStyleId)
          return {
            ...seg,
            styleVariant: resolved.variant,
            zoom: { style: resolved.zoomStyle, intensity: resolved.zoomIntensity },
            // Do NOT pass overlayText / accentColor / captionBgOpacity through
            // to the assembly step — text / color treatment belongs to the
            // feature pipeline that runs on the assembled output.
            overlayText: undefined,
            accentColor: undefined,
            captionBgOpacity: undefined
          }
        })

        const assemblyJob: RenderStitchedClipJob = {
          clipId: job.clipId,
          sourceVideoPath: job.sourceVideoPath,
          segments: styledStitchedSegments,
          stylePresetId: stitchedStyleId,
          cropRegion: job.cropRegion,
          outputFileName: job.outputFileName
        }

        const assembledPath = join(tmpdir(), `batchcontent-stitched-${job.clipId}-${Date.now()}.mp4`)
        allTempFiles.push(assembledPath)

        await assembleStitchedVideo(assemblyJob, assembledPath, (percent) => {
          if (!cancelRequested) {
            // Assembly runs in the prepare phase — report under the same
            // prepare channel the feature pipeline will use shortly.
            window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
              clipId: job.clipId,
              message: 'Assembling stitched segments…',
              // Reserve the first half of the prepare percent budget for
              // assembly so feature-prepare can claim 50-100.
              percent: Math.min(49, Math.round(percent * 0.49))
            })
          }
        })

        // ── Rewrite the job to look like a regular clip on the assembled MP4 ──
        // Remap all source-time data (word timestamps, word emphasis, shots)
        // onto the concatenated timeline so captions/sound-design/shot-style
        // see the right times when they run.
        const totalDuration = styledStitchedSegments.reduce(
          (sum, s) => sum + (s.endTime - s.startTime),
          0
        )

        // wordTimestamps / wordEmphasis are in source-video time for stitched
        // clips (same convention the old stitched path used). Remap them onto
        // the concatenated timeline so caption / sound-design / word-emphasis
        // features see clip-local times.
        job.wordTimestamps = remapWordTimestamps(job.wordTimestamps, styledStitchedSegments)
        job.wordEmphasis = remapWordEmphasis(job.wordEmphasis, styledStitchedSegments)
        job.wordEmphasisOverride = remapWordEmphasis(job.wordEmphasisOverride, styledStitchedSegments)

        // Shot-based data is not currently populated for stitched clips; if it
        // shows up in the future, decide the time basis at that point.
        job.shots = undefined
        job.shotStyleConfigs = undefined
        job.shotStyles = undefined

        job.sourceVideoPath = assembledPath
        job.startTime = 0
        job.endTime = totalDuration
        // Assembled video is already at the locked 720×1280 — no further crop needed.
        job.cropRegion = undefined
        // Clear the stitched marker so we don't re-enter this block.
        job.stitchedSegments = undefined
        // Fall through to the regular feature pipeline below.
      }

      // ── Segmented clip shortcut ───────────────────────────────────────────
      // When segmentedSegments are present, delegate to the segment-based render
      // path which encodes each segment with its own layout, zoom, and caption
      // treatment, then concatenates with configurable transitions.
      if (job.segmentedSegments && job.segmentedSegments.length > 0) {
        // Resolve source metadata for the segmented clip
        let segMeta: { width: number; height: number; fps: number }
        const segCached = metadataCache.get(job.sourceVideoPath)
        if (segCached) {
          segMeta = segCached
        } else {
          try {
            const fullMeta = await getVideoMetadata(job.sourceVideoPath)
            metadataCache.set(job.sourceVideoPath, fullMeta)
            segMeta = fullMeta
          } catch (metaErr) {
            const msg = metaErr instanceof Error ? metaErr.message : String(metaErr)
            throw new Error(`Failed to read source video metadata for segmented clip ${job.clipId}: ${msg}`)
          }
        }

        // Resolve edit style (defaults to cinematic if not set)
        const editStyleId = job.stylePresetId ?? DEFAULT_EDIT_STYLE_ID
        const editStyle = getEditStyleById(editStyleId) ?? getEditStyleById(DEFAULT_EDIT_STYLE_ID)!

        // Resolve each segmented segment into a ResolvedSegment via the
        // per-edit-style template resolver. Archetype → variant + zoom +
        // layout param overrides all flow through resolveTemplate().
        const resolvedSegments: ResolvedSegment[] = job.segmentedSegments.map((raw) => {
          const resolved = resolveTemplate(raw.archetype, editStyleId)
          return {
            startTime: raw.startTime,
            endTime: raw.endTime,
            styleVariant: resolved.variant,
            zoom: {
              style: raw.zoomStyle ?? resolved.zoomStyle,
              intensity: raw.zoomIntensity ?? resolved.zoomIntensity
            },
            transitionIn: ARCHETYPE_DEFAULT_TRANSITION_IN[raw.archetype] ?? editStyle.defaultTransition,
            overlayText: raw.overlayText ?? resolved.layoutParamOverrides.overlayText,
            accentColor: raw.accentColor ?? resolved.layoutParamOverrides.accentColor,
            captionBgOpacity: raw.captionBgOpacity ?? resolved.layoutParamOverrides.captionBgOpacity,
            backgroundColor: resolved.layoutParamOverrides.backgroundColor,
            imagePath: raw.imagePath,
            cropRect: raw.cropRect,
            archetype: raw.archetype,
            captionMarginV: resolved.captionMarginV
          }
        })

        const segConfig: SegmentRenderConfig = {
          sourceVideoPath: job.sourceVideoPath,
          segments: resolvedSegments,
          editStyle,
          width: effectiveResolution.width,
          height: effectiveResolution.height,
          fps: OUTPUT_FPS,
          sourceWidth: segMeta.width,
          sourceHeight: segMeta.height,
          defaultCropRect: job.cropRegion,
          defaultCropTimeline: job.cropTimeline,
          wordTimestamps: job.wordTimestamps,
          wordEmphasis: job.wordEmphasis,
          captionStyle: options.captionStyle,
          captionsEnabled: true,
          brandKit: options.brandKit?.enabled ? {
            logoPath: options.brandKit.logoPath,
            logoPosition: options.brandKit.logoPosition,
            logoScale: options.brandKit.logoScale,
            logoOpacity: options.brandKit.logoOpacity,
            introBumperPath: options.brandKit.introBumperPath,
            outroBumperPath: options.brandKit.outroBumperPath
          } : undefined,
          templateLayout: options.templateLayout,
          onFallback: (info) => {
            if (!cancelRequested) {
              window.webContents.send(Ch.Send.SEGMENT_FALLBACK, {
                clipId: job.clipId,
                segmentIndex: info.segmentIndex,
                archetype: info.archetype,
                reason: info.reason
              })
            }
          }
        }

        await renderSegmentedClip(segConfig, outputPath, (percent) => {
          if (!cancelRequested) {
            window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent })
          }
        })

        manifestResults.set(job.clipId, outputPath)
        manifestRenderTimes.set(job.clipId, Date.now() - clipStartTime)
        completed++
        window.webContents.send(Ch.Send.RENDER_CLIP_DONE, { clipId: job.clipId, outputPath })
        return
      }

      // ── Phase 0: Get source metadata ────────────────────────────────────
      let meta: { width: number; height: number; codec: string; fps: number; audioCodec: string; duration: number }
      const cached = metadataCache.get(job.sourceVideoPath)
      if (cached) {
        meta = cached
      } else {
        try {
          meta = await getVideoMetadata(job.sourceVideoPath)
          metadataCache.set(job.sourceVideoPath, meta)
        } catch (metaErr) {
          const msg = metaErr instanceof Error ? metaErr.message : String(metaErr)
          throw new Error(`Failed to read source video metadata for clip ${job.clipId}: ${msg}`)
        }
      }

      // ── Phase 1: Prepare — call feature.prepare() ──────────────────────
      // Each feature is isolated: a failure in one feature does NOT prevent
      // the remaining features from preparing. The clip still renders, just
      // without that one feature's contribution.
      const featureCount = features.length
      for (let fi = 0; fi < featureCount; fi++) {
        const feature = features[fi]
        if (cancelRequested) return
        if (feature.prepare) {
          window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
            clipId: job.clipId,
            message: `Preparing ${feature.name}…`,
            percent: Math.round(((fi + 1) / featureCount) * 50)
          })
          try {
            const result = await feature.prepare(job, options, (message, percent) => {
              window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message,
                percent
              })
            })
            if (result.tempFiles.length > 0) {
              allTempFiles.push(...result.tempFiles)
            }
            if (result.modified) {
              console.log(`[Pipeline] ${feature.name}: prepared clip ${job.clipId}`)
            }
          } catch (featureErr) {
            const msg = featureErr instanceof Error ? featureErr.message : String(featureErr)
            console.error(
              `[Pipeline] ${feature.name} prepare() failed for clip ${job.clipId}, skipping: ${msg}`
            )
            window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
              clipId: job.clipId,
              error: `[${feature.name}] prepare failed (clip will render without this feature): ${msg}`,
              ffmpegCommand: null
            })
          }
        }
      }

      if (cancelRequested) return

      // After filler removal, the job's sourceVideoPath may have changed.
      // Re-fetch metadata if the source path is no longer in the cache.
      if (!metadataCache.has(job.sourceVideoPath)) {
        try {
          meta = await getVideoMetadata(job.sourceVideoPath)
          metadataCache.set(job.sourceVideoPath, meta)
        } catch {
          // If intermediate file can't be probed, use original meta
        }
      } else {
        meta = metadataCache.get(job.sourceVideoPath)!
      }

      // ── Phase 2: Build video filter chain ──────────────────────────────
      // Base: crop + scale
      let videoFilter = buildVideoFilter(
        job,
        meta.width,
        meta.height,
        effectiveResolution,
        effectiveAspectRatio,
        meta.fps
      )

      // Append feature video filters (auto-zoom)
      const clipDuration = job.endTime - job.startTime
      const filterContext: FilterContext = {
        sourceWidth: meta.width,
        sourceHeight: meta.height,
        targetWidth: effectiveResolution.width,
        targetHeight: effectiveResolution.height,
        clipDuration,
        outputAspectRatio: effectiveAspectRatio
      }

      for (const feature of features) {
        if (feature.videoFilter) {
          try {
            const featureFilter = feature.videoFilter(job, filterContext)
            if (featureFilter) {
              videoFilter = videoFilter + ',' + featureFilter
            }
          } catch (featureErr) {
            const msg = featureErr instanceof Error ? featureErr.message : String(featureErr)
            console.error(
              `[Pipeline] ${feature.name} videoFilter() failed for clip ${job.clipId}, skipping: ${msg}`
            )
          }
        }
      }

      // ── Phase 3: Collect overlay passes ────────────────────────────────
      const overlayContext: OverlayContext = {
        clipDuration,
        targetWidth: effectiveResolution.width,
        targetHeight: effectiveResolution.height
      }

      const overlaySteps: OverlayPassResult[] = []
      for (const feature of features) {
        if (feature.overlayPass) {
          try {
            const step = feature.overlayPass(job, overlayContext)
            if (step) {
              overlaySteps.push(step)
            }
          } catch (featureErr) {
            const msg = featureErr instanceof Error ? featureErr.message : String(featureErr)
            console.error(
              `[Pipeline] ${feature.name} overlayPass() failed for clip ${job.clipId}, skipping: ${msg}`
            )
          }
        }
      }

      // ── Phase 4: Base render ───────────────────────────────────────────
      window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
        clipId: job.clipId,
        message: 'Encoding…',
        percent: 50
      })
      await renderClip(
        job,
        outputPath,
        videoFilter,
        (percent) => {
          if (!cancelRequested) {
            window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent })
          }
        },
        (cmd) => {
          capturedCommand = cmd
          if (options.developerMode) {
            console.log(`[DevMode] Clip ${job.clipId} FFmpeg:`, cmd)
            window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
              clipId: `${job.clipId}__devmode`,
              error: `[DevMode] FFmpeg command for clip ${job.clipId}`,
              ffmpegCommand: cmd
            })
          }
        },
        qualityParams,
        outputFormat,
        null, // hookFontPath — no longer needed, features handle their own fonts
        null, // captionFontsDir — features handle their own font dirs
        overlaySteps
      )

      if (cancelRequested) return

      // ── Phase 5: Post-process — call feature.postProcess() ─────────────
      const postContext: PostProcessContext = {
        clipDuration,
        outputPath
      }

      for (const feature of features) {
        if (cancelRequested) return
        if (feature.postProcess) {
          try {
            await feature.postProcess(job, outputPath, postContext)
          } catch (featureErr) {
            const msg = featureErr instanceof Error ? featureErr.message : String(featureErr)
            console.error(
              `[Pipeline] ${feature.name} postProcess() failed for clip ${job.clipId}, skipping: ${msg}`
            )
            window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
              clipId: job.clipId,
              error: `[${feature.name}] postProcess failed (clip may be incomplete): ${msg}`,
              ffmpegCommand: null
            })
          }
        }
      }

      // ── Restore batch options after this clip's overlays are done ──────
      // The accent-color feature mutates shared batchOptions during prepare().
      // Restore now so the next clip doesn't inherit this clip's accent color.
      restoreBatchOptions(job, options)

      // ── Write description file ─────────────────────────────────────────
      if (job.description) {
        try {
          const clipFilename = basename(outputPath)
          writeDescriptionFile(outputDirectory, clipFilename, job.description)
          console.log(`[Description] Written: ${basename(clipFilename, extname(clipFilename))}.txt`)
        } catch (descErr) {
          console.warn(`[Description] Failed to write .txt for clip ${job.clipId}:`, descErr)
        }
      }

      manifestResults.set(job.clipId, outputPath)
      manifestRenderTimes.set(job.clipId, Date.now() - clipStartTime)
      completed++
      window.webContents.send(Ch.Send.RENDER_CLIP_DONE, { clipId: job.clipId, outputPath })
    } catch (err) {
      // Clean up partial output file on failure
      try {
        if (existsSync(outputPath)) unlinkSync(outputPath)
      } catch {
        // Ignore cleanup errors
      }

      if (cancelRequested) return

      // Restore batch options even on failure so the next clip isn't affected
      restoreBatchOptions(job, options)

      manifestResults.set(job.clipId, null)
      manifestRenderTimes.set(job.clipId, Date.now() - clipStartTime)
      failed++
      const message = err instanceof Error ? err.message : String(err)
      window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
        clipId: job.clipId,
        error: message,
        ffmpegCommand: capturedCommand
      })
    } finally {
      // Clean up temp files from all features
      for (const tempFile of allTempFiles) {
        try { unlinkSync(tempFile) } catch { /* ignore */ }
      }
    }
  }

  // ── Concurrent render pool ──────────────────────────────────────────────
  if (effectiveConcurrency <= 1) {
    // Sequential path (no overhead)
    for (let i = 0; i < jobs.length; i++) {
      if (cancelRequested) {
        window.webContents.send(Ch.Send.RENDER_CANCELLED, { completed, failed, total })
        return
      }
      await processJob(jobs[i], i)
    }
  } else {
    // Parallel path — shared queue index advanced atomically (single-threaded JS)
    let nextJobIndex = 0

    const worker = async (): Promise<void> => {
      while (true) {
        if (cancelRequested) return
        const i = nextJobIndex++
        if (i >= jobs.length) return
        await processJob(jobs[i], i)
      }
    }

    // Launch effectiveConcurrency workers and wait for all to drain the queue
    await Promise.all(Array.from({ length: effectiveConcurrency }, worker))

    if (cancelRequested) {
      window.webContents.send(Ch.Send.RENDER_CANCELLED, { completed, failed, total })
      return
    }
  }

  // ── Generate export manifest ────────────────────────────────────────────
  if (options.sourceMeta) {
    try {
      const clipMeta: ManifestJobMeta[] = jobs.map((job) => ({
        clipId: job.clipId,
        score: job.manifestMeta?.score ?? 0,
        hookText: job.hookTitleText ?? '',
        reasoning: job.manifestMeta?.reasoning ?? '',
        transcriptText: job.manifestMeta?.transcriptText ?? '',
        loopScore: job.manifestMeta?.loopScore,
        description: job.description
      }))

      const manifest = generateRenderManifest({
        jobs,
        options,
        clipMeta,
        clipResults: manifestResults,
        clipRenderTimes: manifestRenderTimes,
        totalRenderTimeMs: Date.now() - batchStartTime,
        encoder: getEncoder().encoder,
        sourceName: options.sourceMeta.name,
        sourcePath: options.sourceMeta.path,
        sourceDuration: options.sourceMeta.duration
      })

      const { jsonPath, csvPath } = writeManifestFiles(manifest, outputDirectory)
      console.log(`[Manifest] Written: ${jsonPath}, ${csvPath}`)
    } catch (manifestErr) {
      console.warn('[Manifest] Failed to write manifest files:', manifestErr)
    }
  }

  window.webContents.send(Ch.Send.RENDER_BATCH_DONE, { completed, failed, total })
}
